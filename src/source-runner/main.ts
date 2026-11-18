// MIT License

// Copyright (c) 2020 Luis Lloret

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import * as vscode from 'vscode'
import * as child_process from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import OSC from 'osc-js'
import * as utf8 from 'utf8'
import { OscSender } from './oscsender'
import { CueBenchSender } from '../cue-bench'
import { parseDaemonStdout, resolveOscCuesPort } from './daemonstdout'
import { Config } from './config'
import { findRunningSpiderServer, SpiderPorts, takeOverRoute, DaemonExitRoute } from '../attach'
import { classifyReplyPortHolder, holderSubject } from '../port-holder'
import { shouldAutoStartGamepad, shouldAutoStartMidi } from '../midi'
import { Range, TextEditor, window } from 'vscode'
import { registerOscHandlers } from './osc-handlers'
import { LiveLoopScopeStore } from '../live-loop-scope'
import * as senders from './senders'
import * as events from './main-events'

// OSC payloads from the Sonic Pi daemon: integer fields and text fields.
type OscArg = number | string
type OscMessage = { args: OscArg[] }

export class Main {
	receiving = true
	rootPath!: string
	rubyPath!: string
	daemonLauncherPath!: string
	samplePath!: string
	spUserPath!: string
	spUserTmpPath!: string
	logPath!: string
	serverErrorLogPath!: string
	serverOutputLogPath!: string
	guiLogPath!: string
	processLogPath!: string
	scsynthLogPath!: string

	// Outstanding /buffer-beautify request: buffer id and the promise resolving with
	// the daemon's /buffer/replace reply. One request at a time (beautify is modal).
	pendingBeautify:
		| {
				bufferId: string
				resolve: (reply: { content: string; line: number; index: number }) => void
		  }
		| undefined

	onCue = events.onCue
	onRunStarted = events.onRunStarted
	onRunEnded = events.onRunEnded
	onFlash = events.onFlash
	onMixerSettings = events.onMixerSettings
	onServerState = events.onServerState
	onServerRestart = events.onServerRestart
	onReceiverOpened = events.onReceiverOpened
	onReceiverFailed = events.onReceiverFailed
	onVersion = events.onVersion
	onLinkBpm = events.onLinkBpm
	onLinkPeers = events.onLinkPeers
	onSupersonicDevices = events.onSupersonicDevices
	onLiveLoopScope = events.onLiveLoopScope
	onLiveLoopScopeEnded = events.onLiveLoopScopeEnded

	guiSendToServerPort!: number
	daemonPort!: number
	guiListenToServerPort!: number
	serverListenToGuiPort!: number
	serverOscCuesPort!: number
	serverSendToGuiPort!: number
	scsynthPort!: number
	scsynthSendPort!: number

	portsInitalized: Promise<OscSender>
	portsInitalizedResolver!: (sender: OscSender) => void
	keepAliveTimer: ReturnType<typeof setInterval> | undefined
	private keepAliveFailures = 0
	// The daemon-audio routes need their own socket: the keepalive sender is a lifecycle
	// object (errors there declare the daemon dead) and must never carry audio traffic.
	// Cached per daemon port: a re-boot changes the port, so the cache must not survive it.
	private daemonSender: OscSender | undefined
	private daemonSenderPort = -1
	private cueBenchSender: CueBenchSender | undefined
	// Raw /supersonic/device-table args, kept unparsed: the picker task decides the shape.
	lastDeviceTable: OscArg[] = []
	// The daemon's last device-list pushes, kept as the raw 'enabled<TAB>name' wire strings:
	// the pickers parse them on dispatch (device-ports.ts), not on arrival.
	lastMidiInPorts = ''
	lastMidiOutPorts = ''
	lastGamepads = ''
	// Consecutive keepalive send errors before the daemon is declared dead. One ICMP
	// hiccup is not death; three in a row means the destination port refuses everything.
	private static readonly KEEPALIVE_FAILURE_LIMIT = 3
	// Live daemon runs: jobId -> workspace string. The workspace is how a run maps back
	// to the cells that produced it (we send joined cell keys as the workspace).
	liveJobs = new Map<number, string>()
	// Job ids that already announced their start: a run id fires onRunStarted once, no matter
	// whether the daemon's /run/started push or the /log/info line arrives first.
	announcedRuns = new Set<number>()
	// Job ids the daemon reported as ended: the log-line fallback must not revive them; a
	// daemon generation that reuses an id does so through /run/started, which does revive it.
	endedRuns = new Set<number>()
	// The runtime announced /spider/ready for this generation: a duplicate push changes nothing.
	runtimeReady = false
	// Live-loop pushes: which loops are alive right now and where their headers sit.
	liveLoopScope = new LiveLoopScopeStore()

	// Senders take the queued send fn and the daemon token, never Main itself.
	private senderContext(): senders.SenderContext {
		return { send: (message) => this.sendOsc(message), token: this.guiUuid }
	}

	logOutput!: vscode.OutputChannel
	cuesOutput!: vscode.OutputChannel

	serverStarted!: boolean
	midiAutoStartSent: boolean = false
	gamepadAutoStartSent: boolean = false
	daemonProcess: child_process.ChildProcess | undefined
	restartInProgress = false
	// One-shot: the next startServer must skip the attach scanner. A restart just killed the
	// old daemon; while it dies the scanner still sees it, and attaching to a dying server
	// makes every play after Restart Server land on a corpse.
	forceManagedBootOnce = false

	// Timestamp of the last 'connection lost' notification, to debounce
	// the burst of reconnect lines the daemon prints per audio outage.
	lastAudioLossNotifiedAt = 0

	platform!: string
	guiUuid!: number
	config!: Config
	spiderServerScanner: () => SpiderPorts | undefined = findRunningSpiderServer

	errorHighlightDecorationType = vscode.window.createTextEditorDecorationType({
		border: '2px solid red',
	})

	constructor() {
		this.initializePaths()

		this.portsInitalized = new Promise((r) => (this.portsInitalizedResolver = r))

		this.initializeOutputChannels()
		this.registerAutoLaunchWatchers()
	}

	private initializeOutputChannels() {
		this.cuesOutput = vscode.window.createOutputChannel('Sonic Pi Cues')
		this.logOutput = vscode.window.createOutputChannel('Sonic Pi Log')
		this.cuesOutput.show()
		this.logOutput.show()
	}

	private initializePaths() {
		this.platform = os.platform()
		if (this.platform === 'win32') {
			this.rootPath = 'C:/Program Files/Sonic Pi'
			this.rubyPath = this.rootPath + '/app/server/native/ruby/bin/ruby.exe'
		} else if (this.platform === 'darwin') {
			this.rootPath = '/Applications/Sonic Pi.app/Contents/Resources'
			this.rubyPath = '/usr/bin/ruby' // was this.rootPath + '/app/server/native/ruby/bin/ruby'
		} else {
			this.rootPath = '/usr/lib/sonic-pi'
			this.rubyPath = 'ruby'
		}
		this.config = new Config()

		// Override default root path if found in settings
		if (this.config.sonicPiRootDirectory()) {
			this.rootPath = this.config.sonicPiRootDirectory()
		}

		if (this.config.commandPath()) {
			this.rubyPath = this.config.commandPath()
		}

		console.log('Using Sonic Pi root directory: ' + this.rootPath)
		console.log('Using ruby: ' + this.rubyPath)

		this.daemonLauncherPath = this.daemonLauncherPathFor(this.rootPath)

		if (this.platform === 'win32') {
			this.daemonLauncherPath = this.rootPath + '/app/server/ruby/bin/daemon.rb'
		}

		this.spUserPath = this.sonicPiHomePath() + '/.sonic-pi'
		this.samplePath = this.rootPath + '/etc/samples'
		this.spUserTmpPath = this.spUserPath + '/.writableTesterPath'
		this.logPath = this.spUserPath + '/log'

		this.serverErrorLogPath = this.logPath + '/server-errors.log'
		this.serverOutputLogPath = this.logPath + '/server-output.log'

		this.guiLogPath = this.logPath + '/gui.log'

		this.processLogPath = this.logPath + '/processes.log'
		this.scsynthLogPath = this.logPath + '/scsynth.log'

		this.daemonPort = -1
		this.guiSendToServerPort = -1
		this.guiListenToServerPort = -1

		this.serverListenToGuiPort = -1
		this.serverOscCuesPort = -1

		this.serverSendToGuiPort = -1

		this.scsynthPort = -1
		this.scsynthSendPort = -1

		// attempt to create log directory
		if (!fs.existsSync(this.logPath)) {
			fs.mkdirSync(this.logPath, { recursive: true })
		}

		this.serverStarted = false
		this.midiAutoStartSent = false
		this.gamepadAutoStartSent = false
		this.guiUuid = -1
	}

	private registerAutoLaunchWatchers() {
		// watch to see if the user opens a ruby or custom file and we need to start the server
		vscode.window.onDidChangeVisibleTextEditors((editors) => {
			const launchAuto = this.config.launchSonicPiServerAutomatically()
			for (let i = 0; i < editors.length; i++) {
				if (
					launchAuto === 'ruby' &&
					editors[i].document.languageId === 'sonic-pi' &&
					!this.serverStarted
				) {
					this.startServerReported()
					break
				}
				if (launchAuto === 'custom') {
					const customExtension = this.config.launchSonicPiServerCustomExtension()
					if (!customExtension) {
						void vscode.window
							.showErrorMessage(
								'Launch is set to custom, but custom extension is empty.',
								'Go to settings',
							)
							.then((item) => {
								if (item) {
									void vscode.commands.executeCommand(
										'workbench.action.openSettings',
										'sonicpieditor.launchSonicPiServerCustomExtension',
									)
								}
							})
					} else if (
						editors[i].document.fileName.endsWith(customExtension) &&
						!this.serverStarted
					) {
						this.startServerReported()
						break
					}
				}
			}
		})

		// Update the mixer on the server if there are configuration changes
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('sonicpieditor')) {
				this.updateMixerSettings()
			}
		})
	}

	// Some installs nest the ruby server under app/ (pacman, Windows); others keep it at the root.
	daemonLauncherPathFor(rootPath: string): string {
		const appLayoutPath = rootPath + '/app/server/ruby/bin/daemon.rb'
		return fs.existsSync(appLayoutPath) ? appLayoutPath : rootPath + '/server/ruby/bin/daemon.rb'
	}

	checkSonicPiPath() {
		if (!fs.existsSync(this.daemonLauncherPath)) {
			void vscode.window
				.showErrorMessage('The Sonic Pi root path is not properly configured.', 'Go to settings')
				.then((item) => {
					if (item) {
						void vscode.commands.executeCommand(
							'workbench.action.openSettings',
							'vscode-sonic-pi.sonicPiRootDirectory',
						)
					}
				})
		}
	}

	sonicPiHomePath() {
		return os.homedir()
	}

	// Fire-and-forget boot with its failure surfaced: an auto-boot that fails must show in
	// the Server log via the standard restart flow, not die as an unhandled rejection.
	startServerReported(): void {
		void this.startServer().catch((error: Error) => {
			this.logOutput.appendLine('Server start failed: ' + error.message)
			void window.showErrorMessage('Sonic Pi: server start failed - ' + error.message)
		})
	}

	async startServer() {
		if (this.serverStarted) {
			return
		}
		this.serverStarted = true

		// Initialise the Sonic Pi server
		this.logOutput.appendLine('Will start server')

		try {
			await this.connectToServer()
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.logOutput.appendLine(`Server start aborted: ${message}`)
			void vscode.window.showErrorMessage(message)
			return
		}
		this.logOutput.append('Done starting server!')
		if (this.daemonPort !== -1) {
			this.startKeepAlive()
		}
		this.setupOscReceiver()
		this.onServerState.fire('running')
	}

	// Business order: attach to a user-run Sonic Pi when allowed, otherwise boot our own daemon
	async connectToServer(): Promise<void> {
		const forceManaged = this.forceManagedBootOnce
		this.forceManagedBootOnce = false
		const mode = forceManaged ? 'managed' : this.config.connectionMode()
		if (mode !== 'managed') {
			const ports = this.spiderServerScanner()
			if (ports) {
				this.logOutput.appendLine(
					`Attaching to running Sonic Pi server (ports ${ports.sendToServerPort}/${ports.listenFromServerPort})`,
				)
				this.applySpiderPorts(ports)
				return
			}
			if (mode === 'attach') {
				throw new Error('No running Sonic Pi server found in /proc (connectionMode: attach)')
			}
			this.logOutput.appendLine('No running Sonic Pi server found, falling back to managed daemon')
		}
		await this.startRubyServer()
	}

	applySpiderPorts(ports: SpiderPorts) {
		this.guiSendToServerPort = ports.sendToServerPort
		this.guiListenToServerPort = ports.listenFromServerPort
		this.serverOscCuesPort = ports.oscCuesPort
		this.guiUuid = ports.token
		this.portsInitalizedResolver(new OscSender(ports.sendToServerPort))
		if (this.serverOscCuesPort > 0) {
			this.cueBenchSender = new CueBenchSender(this.serverOscCuesPort)
		}
		// An adopted daemon has no child process here, so the booter log is the only place its
		// keep-alive port can come from. Without it no keep-alive is sent and the daemon's kill
		// switch stops the audio of a playing set a hundred seconds after attaching.
		const route = this.daemonExitRoute()
		if (route) {
			this.daemonPort = route.daemonPort
			this.log(`Adopted the running Sonic Pi daemon: keep-alive goes to its port ${route.daemonPort}`)
			return
		}
		this.log(
			'Adopted the running Sonic Pi app, but its booter log carries no daemon port: ' +
				'no keep-alive will be sent and its kill switch may stop the audio.',
		)
	}

	log(str: string) {
		this.logOutput.appendLine(str)
	}

	isReceiving(): boolean {
		return this.receiving
	}

	cueLog(str: string) {
		this.cuesOutput.appendLine(str)
	}

	// This is where the incoming OSC messages are processed.
	// We are processing most of the incoming OSC messages, but not everything yet.
	setupOscReceiver() {
		registerOscHandlers(this)
	}

	private getDaemonSender() {
		if (!this.daemonSender || this.daemonSenderPort !== this.daemonPort) {
			this.daemonSenderPort = this.daemonPort
			this.daemonSender = new OscSender(this.daemonPort)
		}
		return this.daemonSender
	}

	private sendDaemonAudio(address: string, ...args: OscArg[]) {
		this.getDaemonSender().send(new OSC.Message(address, this.guiUuid, ...args))
	}

	requestAudioDevices() {
		this.sendDaemonAudio('/daemon/audio/request-devices')
	}

	switchAudioDevice(key: string) {
		this.sendDaemonAudio('/daemon/audio/switch-device', key)
	}

	switchAudioDriver(driver: string) {
		this.sendDaemonAudio('/daemon/audio/switch-driver', driver)
	}

	reopenAudioDevice() {
		this.sendDaemonAudio('/daemon/audio/reopen-device')
	}

	// The daemon forwards the engine's device pushes to gui-listen (daemon.rb device
	// forwarding). Payloads are flat arrays; non-strings (a stray leading number in
	// /supersonic/input-devices) are filtered so consumers only see display names.
	fireSupersonicDevices(address: string, args: OscArg[]) {
		if (address === '/supersonic/device-table') {
			this.lastDeviceTable = args
		}
		const kind =
			address === '/supersonic/devices'
				? 'output'
				: address === '/supersonic/input-devices'
					? 'input'
					: 'table'
		this.onSupersonicDevices.fire({ kind, names: args.filter((a) => typeof a === 'string') })
	}

	startKeepAlive() {
		this.clearKeepAlive()
		this.keepAliveFailures = 0
		const daemonSender = new OscSender(this.daemonPort)
		daemonSender.onError(() => {
			this.keepAliveFailures++
			if (this.keepAliveFailures >= Main.KEEPALIVE_FAILURE_LIMIT) {
				this.daemonDied()
			}
		})
		this.log(`Keep-alive started: pinging daemon port ${this.daemonPort} with /daemon/keep-alive`)
		this.keepAliveTimer = setInterval(() => {
			const message = new OSC.Message('/daemon/keep-alive', this.guiUuid)
			daemonSender.send(message)
		}, 1000)
	}

	// The daemon is gone (kill switch, crash, machine sleep). Without this the window keeps
	// claiming a live server and every later play lands on a dead port: silently lost, empty
	// log channel (user report: 'plays do nothing, no logs'). Reset so the next play takes
	// the cold path: the server-alive claim drops, scanner finds nothing, managed boot
	// brings a fresh daemon up. No auto-reboot here: a daemon that dies repeatedly must not
	// become a boot loop in the background.
	private daemonDied() {
		if (!this.serverStarted && !this.keepAliveTimer) {
			return
		}
		this.clearKeepAlive()
		this.serverStarted = false
		this.liveJobs.clear()
		this.portsInitalized = new Promise((r) => (this.portsInitalizedResolver = r))
		this.log('Lost contact with the Sonic Pi daemon - the next play boots a fresh server.')
	}

	private clearKeepAlive(): boolean {
		if (!this.keepAliveTimer) {
			return false
		}
		clearInterval(this.keepAliveTimer)
		this.keepAliveTimer = undefined
		return true
	}

	// Live daemon runs: jobId -> workspace string. The workspace is how a run maps back
	// to the cells that produced it (we send joined cell keys as the workspace).
	private registerRunTrackingHandlers(osc: OSC) {
		osc.on('/run/started', (message: OscMessage) => {
			const jobId = Number(message.args[0])
			const workspace = typeof message.args[1] === 'string' ? message.args[1] : ''
			if (Number.isFinite(jobId) && workspace) {
				this.liveJobs.set(jobId, workspace)
			}
		})

		osc.on('/run/ended', (message: OscMessage) => {
			const jobId = Number(message.args[0])
			this.liveJobs.delete(jobId)
		})

		osc.on('/runs/all-completed', () => {
			this.liveJobs.clear()
		})
	}

	// This is the main part of launching Sonic Pi's backend
	async startRubyServer(): Promise<void> {
		const args: string[] = [this.daemonLauncherPath] // No need for launch args on the new daemon script

		return new Promise<void>((resolve, reject) => {
			// detached + unref: the daemon outlives window reloads. A reloading window
			// stops pinging keep-alive, but a re-activating host adopts the still-running
			// server through the attach path instead of booting a competing generation.
			const ruby_server = child_process.spawn(this.rubyPath, args, {
				detached: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
			ruby_server.unref?.()
			this.daemonProcess = ruby_server
			ruby_server.stdout.on('data', (data: Buffer) => {
				// console.log(`stdout: ${data}`)
				this.logOutput.appendLine(`Daemon Out: ${data}`)
				const ports = parseDaemonStdout(data.toString())
				if (!ports) {
					this.logOutput.appendLine('Daemon did not report a numeric token, aborting server start')
					reject(new Error('Unrecognized daemon stdout line: ' + data))
					return
				}

				this.daemonPort = ports.daemonPort
				this.guiListenToServerPort = ports.guiListenToServerPort
				this.serverSendToGuiPort = ports.serverSendToGuiPort
				this.serverOscCuesPort = resolveOscCuesPort(
					this.config.oscCuesPortOverride(),
					ports.oscCuesPort,
				)
				this.guiUuid = ports.token
				this.portsInitalizedResolver(new OscSender(this.serverSendToGuiPort))
				if (this.serverOscCuesPort > 0) {
					this.cueBenchSender = new CueBenchSender(this.serverOscCuesPort)
				}

				resolve() // Assume stuff is ok instantly....

				//if (data.toString().match(/.*Sonic Pi Server successfully booted.*/)) { // TODO: Fix mixer setting stuff
				//	this.updateMixerSettings()
				//}
			})

			ruby_server.stderr.on('data', (data: Buffer) => {
				// console.log(`stdserr: ${data}`)
				this.onDaemonStderr(data.toString())
			})
		})
	}

	onDaemonStderr(line: string): void {
		this.logOutput.appendLine(`Daemon Err: ${line}`)
		this.detectAudioServerLoss(line)
	}

	// SuperSonic dies with the environment (suspend/resume, output-device switch); the daemon
	// reconnects but audio may stay dead. Offer a full server restart, once per outage window.
	detectAudioServerLoss(line: string): void {
		if (!/connection lost/.test(line) || !/reconnect/.test(line)) return
		const now = Date.now()
		if (now - this.lastAudioLossNotifiedAt < 30000) return
		this.lastAudioLossNotifiedAt = now
		this.logOutput.appendLine('Sonic Pi: audio server connection lost - offering Restart Server')
		void vscode.window
			.showErrorMessage('Sonic Pi: Audio server connection lost', 'Restart Server')
			.then((action) => {
				if (action === 'Restart Server') void this.restartServer()
			})
	}

	// Kill the current daemon and boot a fresh one, bringing back a dead audio server.
	async restartServer(): Promise<void> {
		this.logOutput.appendLine('Restarting Sonic Pi server...')
		this.restartInProgress = true
		try {
			this.onServerRestart.fire()
			if (this.daemonProcess) {
				this.daemonProcess.kill()
				this.daemonProcess = undefined
			}
			this.serverStarted = false
			// The old daemon's ports die with it. Re-arm the send queue: a resolved send queue
			// would keep shipping runs to the previous generation's dead port (cells then spin
			// forever with no /run-code on the wire).
			this.portsInitalized = new Promise((r) => (this.portsInitalizedResolver = r))
			// While the killed daemon dies, the scanner still sees its spider process: attaching
			// to it would route plays to a corpse. Force the fresh managed boot.
			this.forceManagedBootOnce = true
			this.onServerState.fire('stopped')
			this.midiAutoStartSent = false
			this.gamepadAutoStartSent = false
			this.runtimeReady = false
			await this.startServer()
		} finally {
			this.restartInProgress = false
		}
	}

	// Shut the whole backend down: stop playing runs, then kill the daemon like restartServer
	// does, but without booting a fresh one.
	stopServer() {
		this.stopAllJobs()
		if (this.daemonProcess) {
			this.daemonProcess.kill()
			this.daemonProcess = undefined
		}
		this.serverStarted = false
		// The stopped daemon's ports are dead. Re-arm the send queue like a restart does, or
		// an already-resolved queue keeps shipping runs to the previous generation's port.
		this.portsInitalized = new Promise((r) => (this.portsInitalizedResolver = r))
		this.onServerState.fire('stopped')
		this.midiAutoStartSent = false
		this.gamepadAutoStartSent = false
		this.runtimeReady = false
		this.logOutput.appendLine('Sonic Pi server stopped (last Sonic Pi editor closed)')
	}

	updateMixerSettings() {
		const invert_stereo = this.config.invertStereo()
		const force_mono = this.config.forceMono()
		if (invert_stereo) {
			this.mixerInvertStereo()
		} else {
			this.mixerStandardStereo()
		}

		if (force_mono) {
			this.mixerMonoMode()
		} else {
			this.mixerStereoMode()
		}
	}

	sendOsc(message: OSC.Message) {
		void this.portsInitalized.then((sender) => {
			sender.send(message)
		})
	}

	// Another window won the reply-port bind. Take the daemon over for this window: ask its
	// daemon to exit cleanly (audio server included) and boot a fresh one here. Use the
	// daemon's own port+token; both live in the daemon booter's log when not managed here.
	async takeOverConnection(): Promise<boolean> {
		const route = this.daemonExitRoute()
		if (!route) {
			return false
		}
		const sender = new OscSender(route.daemonPort)
		sender.send(new OSC.Message('/daemon/exit', route.token))
		this.logOutput.appendLine(
			'Taking over the Sonic Pi server: asked the daemon in another window to exit (token-matched /daemon/exit).',
		)
		// The old bindings die with the daemon. startServer() sees serverStarted=true from
		// the attach that preceded this, so reset the ownership state first: flag down,
		// send queue re-armed (a resolved sender would keep shipping to dead ports), then
		// boot a fresh generation owned by this window.
		this.serverStarted = false
		this.portsInitalized = new Promise((r) => (this.portsInitalizedResolver = r))
		this.daemonPort = -1
		this.stopKeepAlive()
		await this.startServer()
		return true
	}

	private stopKeepAlive() {
		if (this.clearKeepAlive()) {
			this.log('Keep-alive stopped: this window no longer owns the daemon it was pinging')
		}
	}

	// Managed mode already knows its daemon port; otherwise the booter log carries it
	// (Selected ports => "daemon" => n, then Token: t - the same token spider validates).
	private daemonExitRoute(): DaemonExitRoute | undefined {
		if (this.daemonPort !== -1 && this.guiUuid !== -1) {
			return { daemonPort: this.daemonPort, token: this.guiUuid }
		}
		try {
			const bootLog = fs.readFileSync(this.daemonLogPath(), 'utf8')
			const route = takeOverRoute(bootLog)
			if (route) {
				return route
			}
		} catch {
			return undefined
		}
		return undefined
	}

	// The daemon booter writes to the shared log under the user's home; the extension
	// already knows the log directory root from sonic pi's paths.
	private daemonLogPath(): string {
		return path.join(os.homedir(), '.sonic-pi', 'log', 'daemon.log')
	}

	// Another VS Code window attached to the same server wins the reply-port bind
	// (EADDRINUSE). This host would send runs that execute but never see replies.
	private onReplyPortTaken() {
		this.receiving = false
		const subject = holderSubject(classifyReplyPortHolder(this.guiListenToServerPort))
		this.logOutput.appendLine(
			subject +
				" is showing the run logs. Your window's Play will still sound. To bring the logs here: " +
				'press Play again - it takes over the connection.',
		)
		this.logOutput.appendLine(
			'To move the logs to THIS window: close ' +
				(subject === 'The Sonic Pi app'
					? 'the Sonic Pi app (or restart its connection)'
					: 'the other ' +
						(subject === 'Another VS Code window' ? 'window (or its Sonic Pi tab)' : 'program') +
						', then press Play to take over the connection.'),
		)
		this.logOutput.appendLine(
			'(technical detail: reply port ' + this.guiListenToServerPort + ' was already bound)',
		)
		this.onReceiverFailed.fire()
	}

	// The daemon numbers a fragment run's flashes and errors from the first line it was given, so the
	// code is padded with a comment line per editor line above it: the run then reports file lines.
	runCode(
		code: string,
		offset: number = 0,
		cells: string[] = [],
		opts: { replaceSession?: boolean; silent?: boolean } = {},
	) {
		const replaceSession = opts.replaceSession !== false
		// The offset is the editor line the code starts on, and 0 when the whole buffer goes out.
		// The safe-mode prefix is compensated by the runtime's firstline, so the padding lands
		// one-to-one on the editor lines.
		if (offset > 0) {
			code = '#\n'.repeat(offset) + code
		}
		if (this.config.logClearOnRun()) {
			this.logOutput.clear()
		}
		// Per-cell mental model: a play replaces the session's sound (matching the Sonic Pi
		// app's Run button). testReplacesSession=false keeps Sonic Pi's stack-and-layer
		// semantics for users who want overlapping runs.
		if (replaceSession && this.config.runReplacesSession()) {
			this.stopAllJobs()
		}
		if (this.config.safeMode()) {
			code = 'use_arg_checks true #__nosave__ set by Qt GUI user preferences.\n' + code
		}
		code = utf8.encode(code)
		this.startDeviceCuesFor(code)
		this.clearErrorHighlight()
		// The workspace argument rides the run through the daemon and comes back on
		// /run/started, which is how a job id maps back to the cells that own it.
		// Omitted entirely for plain editor runs (the daemon defaults the workspace).
		// A 4th /run-code arg of 1 asks the daemon to run silently (no log/flash echo) - it is
		// only honored when a workspace argument is also present.
		const message =
			cells.length > 0
				? new OSC.Message(
						'/run-code',
						this.guiUuid,
						code,
						cells.join('|'),
						...(opts.silent ? [1] : []),
					)
				: new OSC.Message('/run-code', this.guiUuid, code)
		this.sendOsc(message)
	}

	// Beautify the given buffer via the daemon (GUI Align parity). Sends /buffer-beautify
	// with (token, buffer id, code, cursor line, cursor index, first_line) exactly as the
	// daemon's add_method handler expects (spider-server.rb:447) and resolves with the
	// aligned text and server-adjusted cursor from the /buffer/replace reply. The buffer
	// is registered first with /save-buffer so the daemon knows its id, mirroring the Qt
	// GUI's save-and-run buffer handling. Rejects if no reply arrives.
	beautify(
		bufferId: string,
		code: string,
		line: number,
		index: number,
	): Promise<{ content: string; line: number; index: number }> {
		return new Promise((resolve, reject) => {
			this.pendingBeautify = { bufferId, resolve }
			const timeout = setTimeout(() => {
				if (this.pendingBeautify && this.pendingBeautify.bufferId === bufferId) {
					this.pendingBeautify = undefined
					reject(new Error('Sonic Pi daemon did not reply to /buffer-beautify'))
				}
			}, 5000)
			this.pendingBeautify.resolve = (reply) => {
				clearTimeout(timeout)
				resolve(reply)
			}
			this.sendOsc(new OSC.Message('/save-buffer', this.guiUuid, bufferId, utf8.encode(code)))
			this.sendOsc(
				new OSC.Message(
					'/buffer-beautify',
					this.guiUuid,
					bufferId,
					utf8.encode(code),
					line,
					index,
					0,
				),
			)
		})
	}

	flashCode(editor: TextEditor, isWhole: boolean) {
		const range = isWhole ? this.getWholeRange(editor) : this.getSelectedRange(editor)
		const flashDecorationType = window.createTextEditorDecorationType({
			backgroundColor: this.config.flashBackgroundColor(),
			color: this.config.flashTextColor(),
		})
		editor.setDecorations(flashDecorationType, [range])
		setTimeout(function () {
			flashDecorationType.dispose()
		}, 250)
	}

	private getWholeRange(editor: TextEditor): Range {
		const startPos = editor.document.positionAt(0)
		const endPos = editor.document.positionAt(editor.document.getText().length - 1)
		return new Range(startPos, endPos)
	}

	private getSelectedRange(editor: TextEditor): Range {
		return new Range(editor.selection.anchor, editor.selection.active)
	}

	// set_link_bpm! only touches Link's tempo: the run must NOT replace the session. The
	// daemon honors the silent flag (args[3]=1) only when a workspace argument is present,
	// so the run always carries the 'link-bpm-set' workspace - it suppresses the log flash.
	setLinkBpm(bpm: number) {
		const MIN_BPM = 20
		const MAX_BPM = 999
		if (!Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) {
			void vscode.window.showWarningMessage(
				`Sonic Pi: Link BPM ${bpm} is outside the daemon's accepted range ${MIN_BPM}-${MAX_BPM}. Nothing was sent.`,
			)
			this.log('Rejected set_link_bpm out of range: ' + bpm)
			return
		}
		this.runCode(`set_link_bpm! ${bpm}`, 0, ['link-bpm-set'], { replaceSession: false, silent: true })
	}

	// set_global_timewarp! rescales every running sleep (spider-server.rb:806-814). Like the Link
	// tempo it must NOT replace the session, so it rides the silent no-replace run.
	setGlobalTimewarp(seconds: number) {
		const MIN = 0
		const MAX = 5
		if (!Number.isFinite(seconds) || seconds < MIN || seconds > MAX) {
			void vscode.window.showWarningMessage(
				`Sonic Pi: timewarp ${seconds} is outside the daemon's accepted range ${MIN}-${MAX}. Nothing was sent.`,
			)
			this.log('Rejected set_global_timewarp out of range: ' + seconds)
			return
		}
		this.runCode(`set_global_timewarp! ${seconds}`, 0, ['timewarp-set'], {
			replaceSession: false,
			silent: true,
		})
	}

	stopAllJobs() {
		this.sendOsc(new OSC.Message('/stop-all-jobs', this.guiUuid))
	}

	startRecording = () => senders.startRecording(this.senderContext())
	stopRecording = () => senders.stopRecording(this.senderContext())
	saveRecording = (path: string) => senders.saveRecording(this.senderContext(), path)
	deleteRecording = () => senders.deleteRecording(this.senderContext())
	mixerInvertStereo = () => senders.mixerInvertStereo(this.senderContext())
	mixerStandardStereo = () => senders.mixerStandardStereo(this.senderContext())
	mixerMonoMode = () => senders.mixerMonoMode(this.senderContext())
	mixerStereoMode = () => senders.mixerStereoMode(this.senderContext())
	setDrive = (amp: number) => senders.setDrive(this.senderContext(), amp)
	setLpf = (freq: number | 'off') => senders.setLpf(this.senderContext(), freq)
	setHpf = (freq: number | 'off') => senders.setHpf(this.senderContext(), freq)
	setMasterVolume = (volumePercent: number) => senders.setMasterVolume(this.senderContext(), volumePercent)
	midiPortEnable = (direction: 'in' | 'out', port: number, on: boolean) =>
		senders.midiPortEnable(this.senderContext(), direction, port, on)
	// Re-enumeration: the daemon refreshes its device list and pushes the new one.
	midiReset = () => senders.midiReset(this.senderContext())
	gamepadEnable = (pad: number, on: boolean) => senders.gamepadEnable(this.senderContext(), pad, on)
	gamepadStart = () => senders.gamepadStart(this.senderContext())
	gamepadStop = () => senders.gamepadStop(this.senderContext())

	requestVersion() {
		this.sendOsc(new OSC.Message('/version', this.guiUuid))
	}

	// midi_*/gamepad_* are silent until the daemon gets its start message. Both device families
	// follow the same rule here: at most once per server session.
	private startDeviceCuesFor(code: string) {
		if (!this.config.autoMidiStart()) return
		if (shouldAutoStartMidi(code, this.midiAutoStartSent)) {
			this.sendOsc(new OSC.Message('/midi-start', this.guiUuid))
			this.midiAutoStartSent = true
		}
		if (shouldAutoStartGamepad(code, this.gamepadAutoStartSent)) {
			this.gamepadStart()
			this.gamepadAutoStartSent = true
		}
	}

	// Per-run stop: kill only the job(s) a cell belongs to. Falls back to the whole-session
	// stop when the cell's run is unknown or already finished - that keeps the notebook
	// interrupt path correct even without run tracking.
	// Read-only peek at the tracked runs: the integration suite waits for the workspace of a
	// run to appear here before muting, so the mute deterministically maps to the job.
	liveJobWorkspaceFor(cellKey: string): string | undefined {
		for (const [, workspace] of this.liveJobs) {
			if (workspace.split('|').includes(cellKey)) {
				return workspace
			}
		}
		return undefined
	}

	stopCell(cells: string[]) {
		const wanted = new Set(cells)
		const matching = [...this.liveJobs.entries()].filter(([, workspace]) =>
			workspace.split('|').some((key) => wanted.has(key)),
		)
		if (matching.length === 0) {
			this.stopAllJobs()
			return
		}
		for (const [jobId] of matching) {
			const message = new OSC.Message('/stop-job', this.guiUuid, jobId)
			this.sendOsc(message)
		}
	}

	async sendTestCue(address: string, args: string[]): Promise<void> {
		if (!this.cueBenchSender) {
			throw new Error('Cue bench sender not initialized (no cue port)')
		}
		await this.cueBenchSender.sendTestCue(address, args)
	}

	cuePortStart = () => senders.cuePortStart(this.senderContext())

	cuePortStop = () => senders.cuePortStop(this.senderContext())

	cuePortExternal = () => senders.cuePortExternal(this.senderContext())

	cuePortInternal = () => senders.cuePortInternal(this.senderContext())

	// Remove the error highlight
	clearErrorHighlight() {
		vscode.window.activeTextEditor?.setDecorations(this.errorHighlightDecorationType, [])
	}
}
