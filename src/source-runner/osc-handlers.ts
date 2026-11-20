import OSC from 'osc-js'
import { classifyReplyPortHolder, holderSubject } from '../port-holder'
import type { LiveLoopScopeStore, LiveLoopScopePush } from '../live-loop-scope'
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
	onLiveLoopScope: { fire(value: LiveLoopScopePush): void }
	onLiveLoopScopeEnded: { fire(value: { jobid: number; name: string }): void }
	onVersion: { fire(value: string): void }
	onRunStarted: { fire(value: number): void }
	onAllRunsCompleted: { fire(value: void): void }
	onWorkspaceStarted: { fire(value: { jobId: number; workspace: string }): void }
	onRunEnded: { fire(value: number): void }
	onCue: { fire(value: { time: number; id: number; address: string; args: string }): void }
	onFlash: { fire(value: { workspace: string; line: number }): void }
	logOutput: vscode.OutputChannel
	cuesOutput: vscode.OutputChannel
	log(str: string): void
	requestVersion(): void
	serverStarted: boolean
	// Set when the runtime announced /spider/ready; a duplicate ready must be a no-op.
	runtimeReady: boolean
	// A stop or restart already asked this daemon to exit: its /exited push then reports a
	// shutdown the window has accounted for, not a second transition.
	daemonExitRequested: boolean
	// True when nobody has reported this shutdown yet; a state push claims it once.
	consumeShutdownReport(): boolean
	onServerState: { fire(value: 'stopped' | 'starting' | 'running'): void }
	lastDeviceTable: OscArg[]
	lastMidiInPorts: string
	lastMidiOutPorts: string
	lastGamepads: string
	liveJobs: Map<number, string>
	announcedRuns: Set<number>
	endedRuns: Set<number>
	liveLoopScope: LiveLoopScopeStore
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
			if (parse[1] === 'Completed') endRun(host, num)
			else if (parse[1] === 'Starting') announceRunStart(host, num, false)
		}
		host.log(line)
	})

	registerRunTrackingHandlers(host, osc)
	registerDeviceListHandlers(host, osc)
	registerLiveLoopScopeHandlers(host, osc)
	registerLifecycleHandlers(host, osc)
	registerLogErrorHandler(host, osc)
}

// Live daemon runs: jobId -> workspace string. The workspace is how a run maps back
// to the cells that produced it (we send joined cell keys as the workspace).
const registerRunTrackingHandlers = (host: OscHandlerHost, osc: OSC): void => {
	osc.on('/run/started', (message: OscMessage) => {
		const jobId = Number(message.args[0])
		const workspace = typeof message.args[1] === 'string' ? message.args[1] : ''
		if (!Number.isFinite(jobId)) return
		if (workspace) {
			host.liveJobs.set(jobId, workspace)
			host.onWorkspaceStarted.fire({ jobId, workspace })
		}
		announceRunStart(host, jobId, true)
	})

	osc.on('/run/ended', (message: OscMessage) => {
		endRun(host, Number(message.args[0]))
	})

	// The session went quiet: every run still open ends here, and a later daemon generation
	// that numbers its jobs from 0 again announces its starts afresh.
	osc.on('/runs/all-completed', () => {
		const open = new Set([...host.announcedRuns, ...host.liveJobs.keys()])
		host.liveJobs.clear()
		host.announcedRuns.clear()
		host.endedRuns.clear()
		for (const jobId of open) host.onRunEnded.fire(jobId)
		host.onAllRunsCompleted.fire()
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

// Two sources report a run's start: the daemon's /run/started push (spider-server.rb:1078) and
// the /log/info "Starting run N" line. One id announces once, whichever source arrives first;
// the log line is only a fallback for a push that never arrives, so it must not revive a run
// the daemon already ended (a late log line would fake a fresh start).
const announceRunStart = (host: OscHandlerHost, jobId: number, fromPush: boolean): void => {
	if (host.announcedRuns.has(jobId)) return
	if (!fromPush && host.endedRuns.has(jobId)) return
	host.announcedRuns.add(jobId)
	host.endedRuns.delete(jobId)
	host.onRunStarted.fire(jobId)
}

// A run ends once, whichever source reports it: the /run/ended push, the legacy
// "Completed run N" log line, or /runs/all-completed for everything still open.
const endRun = (host: OscHandlerHost, jobId: number): void => {
	if (!host.announcedRuns.has(jobId) && !host.liveJobs.has(jobId)) return
	host.announcedRuns.delete(jobId)
	host.endedRuns.add(jobId)
	host.liveJobs.delete(jobId)
	host.onRunEnded.fire(jobId)
}

// Lifecycle pushes: /spider/ready says the runtime finished booting (spider-server.rb:1102), so
// the window can be told it is running before a run exists. /exited (:974) and
// /exited-with-boot-error (:193, :270) say it is gone: the window must stop claiming a live
// server instead of waiting for keep-alive to notice, and the log must name the push.
const registerLifecycleHandlers = (host: OscHandlerHost, osc: OSC): void => {
	osc.on('/spider/ready', () => announceRuntimeReady(host))

	osc.on('/exited', () => stopForRuntimeExit(host, '/exited', ''))

	osc.on('/exited-with-boot-error', (message: OscMessage) => {
		const reason = message.args.length > 0 ? String(message.args[0]) : ''
		stopForRuntimeExit(host, '/exited-with-boot-error', reason)
	})
}

// Ready is worth announcing once: the runtime sends it per boot, but a duplicate push must not
// flap the status bar or re-ask the version. serverStarted doubles as the "already running" mark
// because startServer sets it before the receiver exists and the exit pushes clear it.
const announceRuntimeReady = (host: OscHandlerHost): void => {
	if (host.runtimeReady) return
	host.runtimeReady = true
	host.log('The Sonic Pi runtime reported /spider/ready')
	host.onServerState.fire('running')
	host.requestVersion()
}

// One place for both exit pushes: the daemon's own reason (when it sent one) survives to the
// log, and a stop already in flight keeps its own bookkeeping: the graceful /exit we sent is
// followed by this push, so the window would otherwise report a second, later 'stopped'.
const stopForRuntimeExit = (host: OscHandlerHost, push: string, reason: string): void => {
	if (!host.serverStarted) return
	host.serverStarted = false
	// The generation the receiver belongs to is gone; a duplicate ready must not report it back.
	host.runtimeReady = false
	host.liveJobs.clear()
	host.announcedRuns.clear()
	host.endedRuns.clear()
	host.log('Sonic Pi runtime left (' + push + ')' + (reason ? ': ' + reason : ''))
	if (host.consumeShutdownReport()) host.onServerState.fire('stopped')
}

// Device lists: the daemon pushes one 'enabled<TAB>name' string per list (runtime.rb:1949-1951)
// after it enumerates, so each push replaces the previous one. Main keeps the raw string; the
// pickers parse the cache on dispatch (device-ports.ts).
const registerDeviceListHandlers = (host: OscHandlerHost, osc: OSC): void => {
	osc.on('/midi/in-ports', (message: OscMessage) => {
		host.lastMidiInPorts = deviceListPayload(message.args)
	})

	osc.on('/midi/out-ports', (message: OscMessage) => {
		host.lastMidiOutPorts = deviceListPayload(message.args)
	})

	osc.on('/gamepad/devices-list', (message: OscMessage) => {
		host.lastGamepads = deviceListPayload(message.args)
	})
}

const deviceListPayload = (args: OscArg[]): string => (typeof args[0] === 'string' ? args[0] : '')

// Live loops: /live_loop/scope(jobid, name, workspace, line, scope_num) fires when the loop
// thread comes alive and /live_loop/scope-ended(jobid, name) from its ensure block
// (spider-server.rb:1002-1004). The store is the badge source; the emitters announce it.
const registerLiveLoopScopeHandlers = (host: OscHandlerHost, osc: OSC): void => {
	osc.on('/live_loop/scope', (message: OscMessage) => {
		const push = liveLoopScopePush(message.args)
		if (!push) return
		host.liveLoopScope.apply(push)
		host.onLiveLoopScope.fire(push)
	})

	osc.on('/live_loop/scope-ended', (message: OscMessage) => {
		const jobid = Number(message.args[0])
		const name = message.args[1]
		if (typeof name !== 'string' || !name) return
		host.liveLoopScope.end(name)
		host.onLiveLoopScopeEnded.fire({ jobid, name })
	})
}

const liveLoopScopePush = (args: OscArg[]): LiveLoopScopePush | undefined => {
	const [jobid, name, workspace, line, scopeNum] = args
	if (typeof name !== 'string' || !name) return undefined
	return {
		jobid: Number(jobid),
		name,
		workspace: typeof workspace === 'string' ? workspace : '',
		line: Number(line),
		scopeNum: Number(scopeNum),
	}
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
