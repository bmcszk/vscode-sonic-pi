import OSC from 'osc-js'
import { classifyReplyPortHolder, holderSubject } from '../port-holder'
import { showSyntaxError, showError, processMultiMessage } from './daemon-messages'
import type * as vscode from 'vscode'

// OSC payloads from the Sonic Pi daemon: integer fields and text fields.
type OscArg = number | string
type OscMessage = { args: OscArg[] }

// The slice of Main the receiver wiring needs: emitters, ports, log channels and the
// run-tracking state the handlers update.
export interface OscHandlerHost {
	receiving: boolean
	guiListenToServerPort: number
	guiUuid: number
	onReceiverOpened: { fire(): void }
	onReceiverFailed: { fire(): void }
	onMixerSettings: { fire(value: { drive: number; volume: number }): void }
	onSupersonicDevices: { fire(value: { kind: 'output' | 'input' | 'table'; names: string[] }): void }
	onLinkBpm: { fire(value: number): void }
	onLinkPeers: { fire(value: number): void }
	onVersion: { fire(value: string): void }
	onRunStarted: { fire(value: number): void }
	onRunEnded: { fire(value: number): void }
	onCue: { fire(value: { time: number; id: number; address: string; args: string }): void }
	onFlash: { fire(value: { workspace: string; line: number }): void }
	logOutput: vscode.OutputChannel
	cuesOutput: vscode.OutputChannel
	log(str: string): void
	lastDeviceTable: OscArg[]
	liveJobs: Map<number, string>
	errorHighlightDecorationType: vscode.TextEditorDecorationType
	pendingBeautify:
		| {
				bufferId: string
				resolve: (reply: { content: string; line: number; index: number }) => void
		  }
		| undefined
}

export const registerOscHandlers = (host: OscHandlerHost): void => {
	// exclusive: true -> a second window's bind fails with EADDRINUSE instead of
	// (SO_REUSEADDR) both binding and Linux flipping packet delivery between
	// binders mid-session. Ownership becomes deterministic and detectable.
	const pluginOptions = {
		type: 'udp4',
		open: { port: host.guiListenToServerPort, host: '127.0.0.1', exclusive: true },
	}
	const osc = new OSC({ plugin: new OSC.DatagramPlugin(pluginOptions) })
	osc.on('open', () => {
		// A fresh receiver that bound owns the reply port again: a later takeover or restart
		// must clear the deafness an earlier window's bind failure left behind, or every
		// following play would take the server over again and kill this window's own daemon.
		host.receiving = true
		host.onReceiverOpened.fire()
	})
	osc.open()
	// Another VS Code window attached to the same server wins the reply-port bind
	// (EADDRINUSE). This host would send runs that execute but never see replies.
	osc.on('error', (error: Error & { code?: string }) => {
		if (error.code === 'EADDRINUSE') onReplyPortTaken(host)
	})

	osc.on('/mixer/settings', (message: OscMessage) => {
		const drive = Number(message.args[0])
		const volume = Number(message.args[1])
		if (Number.isFinite(drive) && Number.isFinite(volume)) {
			host.onMixerSettings.fire({ drive, volume })
		}
	})
	osc.on('/supersonic/devices', (message: OscMessage) => {
		fireSupersonicDevices(host, '/supersonic/devices', message.args)
	})
	osc.on('/supersonic/input-devices', (message: OscMessage) => {
		fireSupersonicDevices(host, '/supersonic/input-devices', message.args)
	})
	osc.on('/supersonic/device-table', (message: OscMessage) => {
		fireSupersonicDevices(host, '/supersonic/device-table', message.args)
	})

	osc.on('/link-bpm', (message: OscMessage) => {
		const bpm = Number(message.args[0])
		if (Number.isFinite(bpm)) {
			host.onLinkBpm.fire(bpm)
		}
	})

	osc.on('/link-num-peers', (message: OscMessage) => {
		const peers = Number(message.args[0])
		if (Number.isInteger(peers)) {
			host.onLinkPeers.fire(peers)
		}
	})

	osc.on('/version', (message: OscMessage) => {
		const version = message.args[0]
		if (typeof version === 'string' && version) {
			host.onVersion.fire(version)
		}
	})

	osc.on('/log/info', (message: OscMessage) => {
		const line = String(message.args[1])
		const parse = /(Completed|Starting) run (\d+)/.exec(line)
		if (parse) {
			const num = +parse[2]
			if (parse[1] === 'Completed') host.onRunEnded.fire(num)
			else if (parse[1] === 'Starting') host.onRunStarted.fire(num)
		}
		host.log(line)
	})

	registerRunTrackingHandlers(host, osc)
	registerLogErrorHandler(host, osc)
}

// Live daemon runs: jobId -> workspace string. The workspace is how a run maps back
// to the cells that produced it (we send joined cell keys as the workspace).
const registerRunTrackingHandlers = (host: OscHandlerHost, osc: OSC): void => {
	osc.on('/run/started', (message: OscMessage) => {
		const jobId = Number(message.args[0])
		const workspace = typeof message.args[1] === 'string' ? message.args[1] : ''
		if (Number.isFinite(jobId) && workspace) {
			host.liveJobs.set(jobId, workspace)
		}
	})

	osc.on('/run/ended', (message: OscMessage) => {
		const jobId = Number(message.args[0])
		host.liveJobs.delete(jobId)
	})

	osc.on('/runs/all-completed', () => {
		host.liveJobs.clear()
	})

	osc.on('/incoming/osc', (message: OscMessage) => {
		const time = Number(message.args[0])
		const id = Number(message.args[1])
		const address = typeof message.args[2] === 'string' ? message.args[2] : ''
		const args = typeof message.args[3] === 'string' ? message.args[3] : ''
		host.onCue.fire({ time, id, address, args })
		host.cuesOutput.appendLine(message.args[2] + ': ' + message.args[3])
	})
}

const registerLogErrorHandler = (host: OscHandlerHost, osc: OSC): void => {
	osc.on('/log/multi_message', (message: OscMessage) => {
		processMultiMessage(message, host.logOutput)
	})

	osc.on('/syntax_error', (message: OscMessage) => {
		showSyntaxError(message, host.errorHighlightDecorationType)
	})

	osc.on('/error', (message: OscMessage) => {
		showError(message, host.logOutput, host.errorHighlightDecorationType)
	})

	osc.on('/flash', (message: OscMessage) => {
		const workspace = message.args[1]
		const line = message.args[2]
		if (typeof workspace !== 'string' || typeof line !== 'number') return
		host.onFlash.fire({ workspace, line })
	})

	// Reply to /buffer-beautify: the daemon drains its message queue and answers with
	// gui.send("/buffer/replace", buf_id, content, line, index, first_line) — same
	// address the Qt GUI consumes for buffer replacements (spider-server.rb:1035).
	osc.on('/buffer/replace', (message: OscMessage) => {
		const bufferId = message.args[0]
		const pending = host.pendingBeautify
		if (!pending || bufferId !== pending.bufferId) {
			return
		}
		const content = message.args[1]
		const line = message.args[2]
		const index = message.args[3]
		if (typeof content !== 'string' || typeof line !== 'number' || typeof index !== 'number') {
			return
		}
		host.pendingBeautify = undefined
		pending.resolve({ content, line, index })
	})
}

// Another VS Code window attached to the same server wins the reply-port bind
// (EADDRINUSE). This host would send runs that execute but never see replies.
const onReplyPortTaken = (host: OscHandlerHost) => {
	host.receiving = false
	const subject = holderSubject(classifyReplyPortHolder(host.guiListenToServerPort))
	host.logOutput.appendLine(
		subject +
			" is showing the run logs. Your window's Play will still sound. To bring the logs here: " +
			'press Play again - it takes over the connection.',
	)
	host.logOutput.appendLine(
		'To move the logs to THIS window: close ' +
			(subject === 'The Sonic Pi app'
				? 'the Sonic Pi app (or restart its connection)'
				: 'the other ' +
					(subject === 'Another VS Code window' ? 'window (or its Sonic Pi tab)' : 'program') +
					', then press Play to take over the connection.'),
	)
	host.logOutput.appendLine(
		'(technical detail: reply port ' + host.guiListenToServerPort + ' was already bound)',
	)
	host.onReceiverFailed.fire()
}

// The daemon forwards the engine's device pushes to gui-listen (daemon.rb device
// forwarding). Payloads are flat arrays; non-strings (a stray leading number in
// /supersonic/input-devices) are filtered so consumers only see display names.
const fireSupersonicDevices = (host: OscHandlerHost, address: string, args: OscArg[]) => {
	if (address === '/supersonic/device-table') {
		host.lastDeviceTable = args
	}
	const kind =
		address === '/supersonic/devices'
			? 'output'
			: address === '/supersonic/input-devices'
				? 'input'
				: 'table'
	host.onSupersonicDevices.fire({ kind, names: args.filter((a) => typeof a === 'string') })
}
