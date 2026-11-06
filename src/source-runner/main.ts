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
import { TextDecoder } from 'util'
const fs = require('fs')
const os = require('os')
const path = require('path')
const child_process = require('child_process')
import { OscSender } from './oscsender'
import { parseDaemonStdout } from './daemonstdout'
const OSC = require('osc-js')
const utf8 = require('utf8')
const { v4: uuidv4 } = require('uuid')
import { Config } from './config'
import { findRunningSpiderServer, SpiderPorts, takeOverRoute, DaemonExitRoute } from '../attach'
import { shouldAutoStartMidi } from '../midi'
import { Range, TextEditor, window } from 'vscode'

export class Main {
	private receiving = true
	rootPath: string
	rubyPath: string
	daemonLauncherPath: string
	samplePath: string
	spUserPath: string
	spUserTmpPath: string
	logPath: string
	serverErrorLogPath: string
	serverOutputLogPath: string
	guiLogPath: string
	processLogPath: string
	scsynthLogPath: string

	onRunStarted = new vscode.EventEmitter<number>()
	onRunEnded = new vscode.EventEmitter<number>()
	onFlash = new vscode.EventEmitter<{ workspace: string; line: number }>()
	onServerRestart = new vscode.EventEmitter<void>()
	onReceiverFailed = new vscode.EventEmitter<void>()
	onServerState = new vscode.EventEmitter<'stopped' | 'starting' | 'running'>()

	// Outstanding /buffer-beautify request: buffer id and the promise resolving with
	// the daemon's /buffer/replace reply. One request at a time (beautify is modal).
	private pendingBeautify:
		| {
				bufferId: string
				resolve: (reply: { content: string; line: number; index: number }) => void
		  }
		| undefined
	onVersion = new vscode.EventEmitter<string>()

	guiSendToServerPort: number
	daemonPort: number
	guiListenToServerPort: number
	serverListenToGuiPort: number
	serverOscCuesPort: number
	serverSendToGuiPort: number
	scsynthPort: number
	scsynthSendPort: number

	portsInitalized: Promise<OscSender>
	portsInitalizedResolver!: (sender: OscSender) => void
	keepAliveTimer: ReturnType<typeof setInterval> | undefined

	logOutput: vscode.OutputChannel
	cuesOutput: vscode.OutputChannel

	serverStarted: boolean
	midiAutoStartSent: boolean = false
	daemonProcess: any
	restartInProgress = false
	// One-shot: the next startServer must skip the attach scanner. A restart just killed the
	// old daemon; while it dies the scanner still sees it, and attaching to a dying server
	// makes every play after Restart Server land on a corpse.
	forceManagedBootOnce = false

	// Timestamp of the last 'connection lost' notification, to debounce
	// the burst of reconnect lines the daemon prints per audio outage.
	lastAudioLossNotifiedAt = 0

	platform: string
	guiUuid: any
	config: any
	spiderServerScanner: () => SpiderPorts | undefined = findRunningSpiderServer

	errorHighlightDecorationType = vscode.window.createTextEditorDecorationType({
		border: '2px solid red',
	})

	constructor() {
		// Set up path defaults based on platform
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

		this.portsInitalized = new Promise((r) => (this.portsInitalizedResolver = r))

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

		this.cuesOutput = vscode.window.createOutputChannel('Sonic Pi Cues')
		this.logOutput = vscode.window.createOutputChannel('Sonic Pi Log')
		this.cuesOutput.show()
		this.logOutput.show()

		this.serverStarted = false
		this.midiAutoStartSent = false

		// this.oscSender = new OscSender()

		// create an uuid for the editor
		this.guiUuid = -1

		// watch to see if the user opens a ruby or custom file and we need to start the server
		vscode.window.onDidChangeVisibleTextEditors((editors) => {
			let launchAuto = this.config.launchSonicPiServerAutomatically()
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
					let customExtension = this.config.launchSonicPiServerCustomExtension()
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
		} catch (error: any) {
			this.logOutput.appendLine(`Server start aborted: ${error.message}`)
			void vscode.window.showErrorMessage(error.message)
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
		// exclusive: true -> a second window's bind fails with EADDRINUSE instead of
		// (SO_REUSEADDR) both binding and Linux flipping packet delivery between
		// binders mid-session. Ownership becomes deterministic and detectable.
		let osc = new OSC({
			plugin: new OSC.DatagramPlugin({
				open: { port: this.guiListenToServerPort, host: '127.0.0.1', exclusive: true },
			}),
		})
		osc.on('open', () => {
			// A fresh receiver that bound owns the reply port again: a later takeover or restart
			// must clear the deafness an earlier window's bind failure left behind, or every
			// following play would take the server over again and kill this window's own daemon.
			this.receiving = true
		})
		osc.open()
		// Another VS Code window attached to the same server wins the reply-port bind
		// (EADDRINUSE). This host would send runs that execute but never see replies.
		osc.on('error', (error: Error & { code?: string }) => {
			if (error.code !== 'EADDRINUSE') return
			this.receiving = false
			this.logOutput.appendLine(
				'Cannot receive Sonic Pi responses on port ' +
					this.guiListenToServerPort +
					' - another VS Code window is already connected to this server.',
			)
			this.logOutput.appendLine(
				'Runs sent from this window still start on the server, but this window will not show log output. ' +
					'Close the other window and press Restart Server to take over the connection.',
			)
			this.onReceiverFailed.fire()
		})

		osc.on('/version', (message: { args: any }) => {
			const version = message.args[0]
			if (typeof version === 'string' && version) {
				this.onVersion.fire(version)
			}
		})

		osc.on('/log/info', (message: { args: any }) => {
			// this.logOutput.appendLine('Got /log/info' + ' -> ' + message.args[0] + ', ' + message.args[1])
			const parse = /(Completed|Starting) run (\d+)/.exec(message.args[1])
			if (parse) {
				const num = +parse[2]
				if (parse[1] === 'Completed') this.onRunEnded.fire(num)
				else if (parse[1] === 'Starting') this.onRunStarted.fire(num)
			}
			this.log(message.args[1])
		})

		osc.on('/incoming/osc', (message: { args: any }) => {
			// console.log(
			//  	'Got /incoming/osc' +
			//  		' -> ' +
			//  		message.args[0] +
			//  		', ' +
			//  		message.args[1] +
			//  		', ' +
			//  		message.args[2] +
			//  		', ' +
			//  		message.args[3],
			//  )
			this.cueLog(message.args[2] + ': ' + message.args[3])
		})

		osc.on('/log/multi_message', (message: any) => {
			// console.log('Got /log/multi_message')
			this.processMultiMessage(message)
		})

		osc.on('/syntax_error', (message: { args: any }) => {
			// console.log(
			// 	'Got /syntax_error' +
			// 		message.args[0] +
			// 		', ' +
			// 		message.args[1] +
			// 		', ' +
			// 		message.args[2] +
			// 		', ' +
			// 		message.args[3] +
			// 		', ' +
			// 		message.args[4],
			// )
			this.processSyntaxError(message)
		})

		osc.on('/error', (message: any) => {
			// console.log('Got /error')
			this.processError(message)
		})

		osc.on('/flash', (message: { args: any }) => {
			this.onFlash.fire({ workspace: message.args[1], line: message.args[2] })
		})

		// Reply to /buffer-beautify: the daemon drains its message queue and answers with
		// gui.send("/buffer/replace", buf_id, content, line, index, first_line) — same
		// address the Qt GUI consumes for buffer replacements (spider-server.rb:1035).
		osc.on('/buffer/replace', (message: { args: any }) => {
			const bufferId = message.args[0]
			const pending = this.pendingBeautify
			if (!pending || bufferId !== pending.bufferId) {
				return
			}
			this.pendingBeautify = undefined
			pending.resolve({
				content: message.args[1],
				line: message.args[2],
				index: message.args[3],
			})
		})

		//osc.on('*', (message: {address: string}) => {
		//    this.logOutput.appendLine("Got message of type: " + message.address);
		//});
	}

	// Show information about the syntax error to the user
	processSyntaxError(message: { args: any }) {
		let job_id = message.args[0]
		let desc = message.args[1]
		let error_line = message.args[2]
		let line = message.args[3]

		void vscode.window
			.showErrorMessage(
				'Syntax error on Ajob ' + job_id + ': ' + desc + '\nLine ' + line + ': ' + error_line,
				'Goto error',
			)
			.then((item) => {
				if (item) {
					let errorHighlight: vscode.DecorationOptions[] = []
					let editor = vscode.window.activeTextEditor!
					let range = editor.document.lineAt(line - 1).range
					editor.selection = new vscode.Selection(range.start, range.end)
					editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
					errorHighlight.push({ range })
					editor.setDecorations(this.errorHighlightDecorationType, errorHighlight)
				}
			})
	}

	// Show information about the error to the user
	processError(message: { args: any }) {
		let job_id = message.args[0]
		let desc = message.args[1]
		let backtrace = message.args[2]
		let line = message.args[3]

		this.logOutput.appendLine(
			'Error on job ' + job_id + ': ' + desc + '\nLine ' + line + ': ' + backtrace,
		)
		//void vscode.window
		//	.showErrorMessage(
		//		'Error on job ' + job_id + ': ' + desc + '\nLine ' + line + ': ' + backtrace,
		//		'Goto error',
		//	)
		//	.then((item) => {
		//		if (item) {
		let errorHighlight: vscode.DecorationOptions[] = []
		let editor = vscode.window.activeTextEditor!
		let range = editor.document.lineAt(line - 1).range
		editor.selection = new vscode.Selection(range.start, range.end)
		editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
		errorHighlight.push({ range })
		editor.setDecorations(this.errorHighlightDecorationType, errorHighlight)
		//		}
		//	})
	}

	// Process an incoming multi-message
	processMultiMessage(message: { args: any }) {
		let job_id = message.args[0]
		let thread_name = message.args[1]
		let runtime = message.args[2]
		let count = message.args[3]

		let toShow = '{run: ' + job_id + ', time: ' + runtime
		if (thread_name) {
			toShow += ', thread: ' + thread_name
		}
		toShow += '}'
		this.logOutput.appendLine(toShow)

		toShow = ''
		for (let i = 0; i < count; i++) {
			//let type = message.args[4 + (2*i)];
			let str = message.args[4 + 1 + 2 * i]
			let lines = str.split(/\r?\n/)
			if (!str) {
				toShow = ' |'
			} else if (i === count - 1) {
				toShow = ' └─ '
			} else {
				toShow = ' ├─ '
			}
			this.logOutput.append(toShow)

			lines.forEach((line: string) => {
				this.logOutput.appendLine(line)
			})
		}
	}

	startKeepAlive() {
		this.clearKeepAlive()
		const daemonSender = new OscSender(this.daemonPort)
		this.log(`Keep-alive started: pinging daemon port ${this.daemonPort} with /daemon/keep-alive`)
		this.keepAliveTimer = setInterval(() => {
			let message = new OSC.Message('/daemon/keep-alive', parseInt(this.guiUuid))
			daemonSender.send(message)
		}, 1000)
	}

	private clearKeepAlive(): boolean {
		if (!this.keepAliveTimer) {
			return false
		}
		clearInterval(this.keepAliveTimer)
		this.keepAliveTimer = undefined
		return true
	}

	// This is the main part of launching Sonic Pi's backend
	async startRubyServer(): Promise<void> {
		let args: String[] = [this.daemonLauncherPath] // No need for launch args on the new daemon script

		return new Promise<void>((resolve, reject) => {
			// detached + unref: the daemon outlives window reloads. A reloading window
			// stops pinging keep-alive, but a re-activating host adopts the still-running
			// server through the attach path instead of booting a competing generation.
			let ruby_server = child_process.spawn(this.rubyPath, args, {
				detached: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
			ruby_server.unref?.()
			this.daemonProcess = ruby_server
			ruby_server.stdout.on('data', (data: any) => {
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
				this.guiUuid = ports.token
				this.portsInitalizedResolver(new OscSender(this.serverSendToGuiPort))

				resolve() // Assume stuff is ok instantly....

				//if (data.toString().match(/.*Sonic Pi Server successfully booted.*/)) { // TODO: Fix mixer setting stuff
				//	this.updateMixerSettings()
				//}
			})

			ruby_server.stderr.on('data', (data: any) => {
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
				this.daemonProcess = null
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
			this.daemonProcess = null
		}
		this.serverStarted = false
		// The stopped daemon's ports are dead. Re-arm the send queue like a restart does, or
		// an already-resolved queue keeps shipping runs to the previous generation's port.
		this.portsInitalized = new Promise((r) => (this.portsInitalizedResolver = r))
		this.onServerState.fire('stopped')
		this.midiAutoStartSent = false
		this.logOutput.appendLine('Sonic Pi server stopped (last Sonic Pi editor closed)')
	}

	updateMixerSettings() {
		let invert_stereo = this.config.invertStereo()
		let force_mono = this.config.forceMono()
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

	sendOsc(message: any) {
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
			return { daemonPort: this.daemonPort, token: parseInt(this.guiUuid, 10) }
		}
		const logPath = this.spUserTmpPath ? this.daemonLogPath() : this.daemonLogPath()
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

	// The daemon numbers a fragment run's flashes and errors from the first line it was given, so the
	// code is padded with a comment line per editor line above it: the run then reports file lines.
	runCode(code: string, offset: number = 0) {
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
		if (this.config.runReplacesSession()) {
			this.stopAllJobs()
		}
		if (this.config.safeMode()) {
			code = 'use_arg_checks true #__nosave__ set by Qt GUI user preferences.\n' + code
		}
		code = utf8.encode(code)
		if (this.config.autoMidiStart() && shouldAutoStartMidi(code, this.midiAutoStartSent)) {
			this.sendOsc(new OSC.Message('/midi-start', parseInt(this.guiUuid)))
			this.midiAutoStartSent = true
		}
		this.clearErrorHighlight()
		let message = new OSC.Message('/run-code', parseInt(this.guiUuid), code)
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
			this.sendOsc(new OSC.Message('/save-buffer', parseInt(this.guiUuid), bufferId, utf8.encode(code)))
			this.sendOsc(
				new OSC.Message(
					'/buffer-beautify',
					parseInt(this.guiUuid),
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
		let startPos = editor.document.positionAt(0)
		let endPos = editor.document.positionAt(editor.document.getText().length - 1)
		return new Range(startPos, endPos)
	}

	private getSelectedRange(editor: TextEditor): Range {
		return new Range(editor.selection.anchor, editor.selection.active)
	}

	stopAllJobs() {
		let message = new OSC.Message('/stop-all-jobs', this.guiUuid)
		this.sendOsc(message)
	}

	startRecording() {
		let message = new OSC.Message('/start-recording', this.guiUuid)
		this.sendOsc(message)
	}

	stopRecording() {
		let message = new OSC.Message('/stop-recording', this.guiUuid)
		this.sendOsc(message)
	}

	saveRecording(path: string) {
		let message = new OSC.Message('/save-recording', this.guiUuid, path)
		this.sendOsc(message)
	}

	deleteRecording() {
		let message = new OSC.Message('/delete-recording', this.guiUuid)
		this.sendOsc(message)
	}

	mixerInvertStereo() {
		let message = new OSC.Message('/mixer-invert-stereo', this.guiUuid)
		this.sendOsc(message)
	}

	mixerStandardStereo() {
		let message = new OSC.Message('/mixer-standard-stereo', this.guiUuid)
		this.sendOsc(message)
	}

	mixerMonoMode() {
		let message = new OSC.Message('/mixer-mono-mode', this.guiUuid)
		this.sendOsc(message)
	}

	mixerStereoMode() {
		let message = new OSC.Message('/mixer-stereo-mode', this.guiUuid)
		this.sendOsc(message)
	}

	// Master fader after the limiter; the server clamps the passed amp to 0..1.
	setMasterVolume(volumePercent: number) {
		let message = new OSC.Message('/mixer-output-volume', parseInt(this.guiUuid), volumePercent / 100)
		this.sendOsc(message)
	}

	requestVersion() {
		let message = new OSC.Message('/version', parseInt(this.guiUuid))
		this.sendOsc(message)
	}

	// Remove the error highlight
	clearErrorHighlight() {
		vscode.window.activeTextEditor?.setDecorations(this.errorHighlightDecorationType, [])
	}
}
