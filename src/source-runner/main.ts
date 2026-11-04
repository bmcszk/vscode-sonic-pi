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
const child_process = require('child_process')
import { OscSender } from './oscsender'
import { parseDaemonStdout } from './daemonstdout'
const OSC = require('osc-js')
const utf8 = require('utf8')
const { v4: uuidv4 } = require('uuid')
import { Config } from './config'
import { Range, TextEditor, window } from 'vscode'

export class Main {
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
	onServerRestart: (() => void) | undefined = undefined

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

	logOutput: vscode.OutputChannel
	cuesOutput: vscode.OutputChannel

	serverStarted: boolean
	daemonProcess: any

	// Timestamp of the last 'connection lost' notification, to debounce
	// the burst of reconnect lines the daemon prints per audio outage.
	lastAudioLossNotifiedAt = 0

	platform: string
	guiUuid: any
	config: any

	// Daemon line numbers are file-absolute - the code of a fragment run is comment-padded up to its
	// editor line before it is sent - so the error and flash paths apply no offset of their own.
	runOffset: number

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

		this.runOffset = 0

		// attempt to create log directory
		if (!fs.existsSync(this.logPath)) {
			fs.mkdirSync(this.logPath, { recursive: true })
		}

		this.cuesOutput = vscode.window.createOutputChannel('Cues')
		this.logOutput = vscode.window.createOutputChannel('Log')
		this.cuesOutput.show()
		this.logOutput.show()

		this.serverStarted = false

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
					this.startServer()
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
						this.startServer()
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

	async startServer() {
		if (this.serverStarted) {
			return
		}
		this.serverStarted = true

		// Initialise the Sonic Pi server
		this.logOutput.appendLine('Will start server')

		try {
			await this.startRubyServer()
		} catch (error: any) {
			this.logOutput.appendLine(`Server start aborted: ${error.message}`)
			void vscode.window.showErrorMessage(error.message)
			return
		}
		this.logOutput.append('Done starting server!')
		this.startKeepAlive()
		this.setupOscReceiver()
	}

	log(str: string) {
		this.logOutput.appendLine(str)
	}

	cueLog(str: string) {
		this.cuesOutput.appendLine(str)
	}

	// This is where the incoming OSC messages are processed.
	// We are processing most of the incoming OSC messages, but not everything yet.
	setupOscReceiver() {
		let osc = new OSC({
			plugin: new OSC.DatagramPlugin({ open: { port: this.guiListenToServerPort, host: '127.0.0.1' } }),
		})
		osc.open()

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

		//osc.on('*', (message: {address: string}) => {
		//    this.logOutput.appendLine("Got message of type: " + message.address);
		//});
	}

	// Show information about the syntax error to the user
	processSyntaxError(message: { args: any }) {
		let job_id = message.args[0]
		let desc = message.args[1]
		let error_line = message.args[2]
		let line = message.args[3] + this.runOffset

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
		let line = message.args[3] + this.runOffset

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
		const daemonSender = new OscSender(this.daemonPort)
		console.log('Sending Keepalive to', this.daemonPort)
		setInterval(() => {
			let message = new OSC.Message('/daemon/keep-alive', parseInt(this.guiUuid))
			daemonSender.send(message)
		}, 1000)
	}

	// This is the main part of launching Sonic Pi's backend
	async startRubyServer(): Promise<void> {
		let args: String[] = [this.daemonLauncherPath] // No need for launch args on the new daemon script

		return new Promise<void>((resolve, reject) => {
			let ruby_server = child_process.spawn(this.rubyPath, args)
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
		if (this.onServerRestart) {
			this.onServerRestart()
		}
		if (this.daemonProcess) {
			this.daemonProcess.kill()
			this.daemonProcess = null
		}
		this.serverStarted = false
		await this.startServer()
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

	// The daemon numbers a fragment run's flashes and errors from the first line it was given, so the
	// code is padded with a comment line per editor line above it: the run then reports file lines.
	runCode(code: string, offset: number = 0) {
		// The offset is the editor line the code starts on, and 0 when the whole buffer goes out.
		// The safe-mode prefix is compensated by the runtime's firstline, so the padding lands
		// one-to-one on the editor lines.
		if (offset > 0) {
			code = '#\n'.repeat(offset) + code
		}
		this.runOffset = 0
		if (this.config.logClearOnRun()) {
			this.logOutput.clear()
		}
		if (this.config.safeMode()) {
			code = 'use_arg_checks true #__nosave__ set by Qt GUI user preferences.\n' + code
		}
		code = utf8.encode(code)
		this.clearErrorHighlight()
		let message = new OSC.Message('/run-code', parseInt(this.guiUuid), code)
		this.sendOsc(message)
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

	// Remove the error highlight
	clearErrorHighlight() {
		vscode.window.activeTextEditor?.setDecorations(this.errorHighlightDecorationType, [])
	}
}
