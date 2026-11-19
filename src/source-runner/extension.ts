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

// Important!! Note that for now, the code is sent as "workspace_nine", so this will overwrite
// what you have in tab 9 on your Sonic Pi session. This should be smarter in the future, and
// I think there are plans to make this more flexible on Sonic Pi's side

// At the moment this has been tested on Windows... my Linux VM with Linux Mint refuses to
// start Supercollider. Something to do with jackd and pulseaudio. Will investigate later.
// It would be great if someone can check if it works in Linux, and provide a PR if it doesn't.

import * as vscode from 'vscode'

import { Main } from './main'
import { Config } from './config'
import { computeBeautifyEdit } from '../beautify'
import { flashPaintFor, notebookFlashMap } from '../cell-flash-map'
import { cellKeyFor } from '../codelenses'
import { PlayingLineHighlighter } from '../playing-lines'
import { SonicPiStatusBar } from '../statusbar'
import { LspDiagnosticsController } from '../lsp/diagnostics'
import { ensureLspClient, onLspClientReady } from '../lsp/shared-client'
import { shouldStopServerOnLastEditorClose } from '../editor-close'
import { MuteRegistry } from '../loop-mute'
import { LiveRuns } from '../live-runs'
import { CueStore } from '../cue-store'
import { CueInspector } from '../cue-inspector'
import { linkBpmInputValue } from '../link-label'
import { runDevicePicker, DeviceNames } from '../audio-device-picker'
import { runGamepadPicker, runMidiPortPicker } from '../device-ports'
import { LiveLoopBadgeDecorator } from '../live-loop-badges'
import { buildPreviewCode } from '../docs-preview'
import { DOCS_PREVIEW_WORKSPACE } from '../docs-browser'
import { ensureInitFile } from '../init-file'
import { shouldAutoRunOnSave } from './run-on-save'

let main: Main
let config: Config

export const scriptRunEnsuresServer = async (code: string, offset = 0, cells: string[] = []) => {
	// Command-Palette/editor Run must survive a cold window: a play before any boot went
	// to unbound ports and vanished without feedback (user: 'no logs, no feedback').
	if (!main.serverStarted && config.launchSonicPiServerAutomatically() !== 'never') {
		await main.startServer()
	}
	main.runCode(code, offset, cells)
}

export const runScript = (code: string, cells: string[] = []) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.runCode(code, 0, cells)
}

// Live runs by job id -> the cell keys the run plays. The lens renders stop rows from this
// map, and a cell stop kills the job the map names.
const liveRuns = new LiveRuns()

// The daemon's /run/started carries the workspace the run was sent with, and a cell run sends
// its block's key as that workspace - that is how a run maps back to the block that plays it.
const trackLiveRuns = (run: Main) =>
	run.onWorkspaceStarted.event(({ jobId, workspace }) => {
		for (const cellKey of workspace.split('|')) {
			liveRuns.runStarted(jobId, cellKey)
		}
	})

const trackRunEnds = (run: Main) => run.onRunEnded.event((jobId) => liveRuns.runEnded(jobId))

// The live-run map fills from the daemon's pushes, so it is readable without a lens: the
// integration suite waits for a run to land here before it clicks a stop.
export const liveRunsForTest = () => liveRuns

export const onRunStarted = (listener: (num: number) => void) => {
	return main.onRunStarted.event(listener)
}

export const onRunEnded = (listener: (num: number) => void) => {
	return main.onRunEnded.event(listener)
}

export const onServerRestart = (listener: () => void) => {
	return main.onServerRestart.event(listener)
}

export const onCue = (
	listener: (cue: { time: number; id: number; address: string; args: string }) => void,
) => {
	return main.onCue.event(listener)
}

export const onFlash = (listener: (flash: { workspace: string; line: number }) => void) => {
	return main.onFlash.event(listener)
}

export const onMixerSettings = (listener: (settings: { drive: number; volume: number }) => void) => {
	return main.onMixerSettings.event(listener)
}

export const stopAllScripts = () => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.stopAllJobs()
}

// Per-run stop: kill the daemon job(s) that belong to the given cells. Unknown or
// finished cells fall back to the whole-session stop inside main.
export const stopCellByKeys = (cellKeys: string[]) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.stopCell(cellKeys)
}

// A playing block's stop: kill only the run that block plays. A job the daemon already ended
// has nothing left to kill, and the session keeps playing - the file-level Stop owns that.
export const stopRun = (jobId: number) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.stopJob(jobId)
}

// Test seam (integration only): the mixer popover's Drive dispatch is unit-covered, so the
// integration suite proves the drive sender reaches the daemon through this direct hook.
export const setDriveForTest = (amp: number) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.setDrive(amp)
}

// Test seam (unit only): the runner module's Main is created by activate, which needs a
// vscode host. A suite that exercises the seams below against a real Main installs it here.
export const setMainForTest = (instance: Main) => {
	main = instance
}

// The docs picker's second step: a builtin's sound plays as a silent, no-replace run under its
// own workspace, so previewing never replaces the session and a stuck preview stops with the
// existing Stop command. Returns false when the entry has no playable snippet.
export const previewEntry = (entry: { kind: string; name: string }): boolean => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	const code = buildPreviewCode(entry)
	if (code === undefined) return false
	main.runCode(code, 0, [DOCS_PREVIEW_WORKSPACE], { replaceSession: false, silent: true })
	return true
}

// Test seam (integration only): the live-loop scope store lives on the Main instance, which
// the host's module graph reaches only through the runner module.
export const liveLoopScopeForTest = () => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	return main.liveLoopScope
}

// Test seam (integration only): the cached raw device-list pushes the pickers parse.
export const deviceListCacheForTest = () => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	return {
		inPorts: main.lastMidiInPorts,
		outPorts: main.lastMidiOutPorts,
		gamepads: main.lastGamepads,
	}
}

// Test seam (integration only): the device pickers' QuickPick cannot be driven headlessly, so
// the suite proves the picked item's outcome - the sender call it makes - through this hook.
// The item shape is the one buildPortQuickPickItems produces (port direction + list index).
export const pickMidiPortForTest = (pick: { port: 'in' | 'out'; index: number; enabled: boolean }) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.midiPortEnable(pick.port, pick.index, !pick.enabled)
}

export const pickGamepadForTest = (pick: { index: number; enabled: boolean }) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.gamepadEnable(pick.index, !pick.enabled)
}

// Test seam (integration only): the timewarp input box cannot be typed into from the host.
export const setTimewarpForTest = (seconds: number) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.setGlobalTimewarp(seconds)
}

// init.rb is the user's silent pre-boot script: opening it is pure file I/O, so a cold window
// needs no server. The daemon evals it on its next boot (spider-server.rb:249-253).
export const openInitFile = async (homedir: string): Promise<void> => {
	const { path } = ensureInitFile(homedir)
	const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path))
	await vscode.window.showTextDocument(doc, { preview: false })
}

// Mute/unmute a cell: mute stops its job and records the last-run code; unmute re-runs
// that code without replacing the session, so other loops keep playing.
const muteRegistry = new MuteRegistry()

export const muteCellByKeys = (cellKeys: string[], code: string) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.stopCell(cellKeys)
	muteRegistry.mute(cellKeys, code)
}

export const unmuteCellByKeys = (cellKeys: string[]) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	const entry = muteRegistry.unmute(cellKeys)
	if (!entry) {
		return undefined
	}
	main.runCode(entry.code, 0, entry.cells, { replaceSession: false })
	return entry
}

// Notebook plays cannot ride on the 'ruby' launch mode: a notebook editor never shows up as a
// sonic-pi text editor, so nothing else boots a server for it. The controller asks these three
// before sending a run, and awaits startServer so the run lands on bound ports.
export const serverIsRunning = () => main.serverStarted
export const isReceiving = () => main.isReceiving()
export const notebookRunsWholeSong = () => config.notebookRunsWholeSong()
export const takeOverConnection = () => main.takeOverConnection()

export const onLinkBpm = (listener: (bpm: number) => void) => {
	return main.onLinkBpm.event(listener)
}
export const onLinkPeers = (listener: (peers: number) => void) => {
	return main.onLinkPeers.event(listener)
}
export const setLinkBpm = (bpm: number) => main.setLinkBpm(bpm)

export const startServer = () => main.startServer()
export const sendTestCue = (address: string, args: string[]) => main.sendTestCue(address, args)

export const launchServerAutomatically = () => config.launchSonicPiServerAutomatically()

export const onSupersonicDevices = (
	listener: (devices: { kind: 'output' | 'input' | 'table'; names: string[] }) => void,
) => main.onSupersonicDevices.event(listener)
export const requestAudioDevices = () => main.requestAudioDevices()
export const switchAudioDevice = (key: string) => main.switchAudioDevice(key)
export const switchAudioDriver = (driver: string) => main.switchAudioDriver(driver)
export const reopenAudioDevice = () => main.reopenAudioDevice()

// The device picker rides on the daemon's device pushes: request them, then gather what
// arrives within a short window (all three pushes land on one request round-trip per the
// daemon-audio spike). A no-server window must not open a modal - callers guard first.
export const showAudioDevicePicker = async () => {
	const received: DeviceNames[] = []
	const subscription = main.onSupersonicDevices.event((devices) => received.push(devices))
	try {
		main.requestAudioDevices()
		await new Promise((resolve) => setTimeout(resolve, 300))
		await runDevicePicker(main, received, {
			showQuickPick: vscode.window.showQuickPick,
			showWarningMessage: vscode.window.showWarningMessage,
		})
	} finally {
		subscription.dispose()
	}
}

export const confirmThenReopenAudioDevice = async () => {
	// Reopen-only path: the picker builder supplies the reopen entry, so reuse its dispatcher
	// with a reopen-only pick and the same running-code confirm.
	await runDevicePicker(
		{
			requestAudioDevices: () => {},
			switchAudioDevice: () => {},
			reopenAudioDevice: () => main.reopenAudioDevice(),
		},
		[],
		{
			showQuickPick: async (items) => items.find((i) => i.action === 'reopen'),
			showWarningMessage: vscode.window.showWarningMessage,
		},
	)
}
let playingLines: PlayingLineHighlighter
let isRecording = false

// A stopped run says nothing more about playing lines or playing cells.
const clearPlaying = () => {
	playingLines.clear()
	notebookFlashMap.clear()
}

// A file run reports the lines of that file, so a notebook's joined-script offsets stop applying.
const runFileCode = (code: string, offset: number = 0) => {
	notebookFlashMap.clear()
	main.runCode(code, offset)
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Ruby detected. Sonic Pi editor extension active!')

	main = new Main()
	config = new Config()

	main.checkSonicPiPath()

	playingLines = new PlayingLineHighlighter({
		config,
		editor: () => vscode.window.activeTextEditor,
		flashTarget: (workspace, line) =>
			flashPaintFor(
				notebookFlashMap,
				workspace,
				vscode.window.activeTextEditor?.document.uri.toString(),
				line,
			),
	})
	context.subscriptions.push(main.onServerRestart.event(() => clearPlaying()))
	// A fresh daemon knows nothing about muted loops; their stored codes could never be
	// soundly re-run, so the mute memory dies with the server generation. The same holds for
	// the live runs: the new generation numbers its jobs from scratch.
	context.subscriptions.push(
		main.onServerRestart.event(() => {
			muteRegistry.clear()
			liveRuns.clear()
		}),
		trackLiveRuns(main),
		trackRunEnds(main),
	)
	if (config.launchSonicPiServerAutomatically() === 'start') {
		main.startServerReported()
	}

	registerStatusBar(context)
	registerCueInspector(context)
	registerLiveLoopBadges(context)
	registerLastEditorClose(context)
	registerEditorCommands(context)
	registerRunOnSave(context)
	registerLspDiagnostics(context)
}

// Live-loop badges: a gutter '♪ :name' on every alive loop's header line. The daemon's
// /live_loop/scope and /live_loop/scope-ended pushes (spider-server.rb:1002-1004) update the
// store; the decorator repaints the visible editors. A restart clears every badge, like the
// muted-loop memory: the fresh daemon has no loops yet.
const registerLiveLoopBadges = (context: vscode.ExtensionContext) => {
	const decorator = new LiveLoopBadgeDecorator({
		store: main.liveLoopScope,
		visibleEditors: () =>
			vscode.window.visibleTextEditors.filter((editor) => editor.document.languageId === 'sonic-pi'),
	})
	const repaint = () => decorator.refresh()
	context.subscriptions.push(
		main.onLiveLoopScope.event(repaint),
		main.onLiveLoopScopeEnded.event(repaint),
		vscode.window.onDidChangeVisibleTextEditors(repaint),
		main.onServerRestart.event(() => {
			main.liveLoopScope.clear()
			decorator.clearAll()
		}),
		{ dispose: () => decorator.dispose() },
	)
}

// Status bar wiring: the popover actions dispatch to the runner and the server state,
// version, mixer and Link events update the displayed items. Cold-window dispatch of the
// modal commands stays a silent no-op (a modal there hangs the activation gate).
const registerStatusBar = (context: vscode.ExtensionContext) => {
	const statusBar = new SonicPiStatusBar({
		sendVersionRequest: () => main.requestVersion(),
		sendMasterVolume: (value) => main.setMasterVolume(value),
		setDrive: (value) => main.setDrive(value),
		setLpf: (freq) => main.setLpf(freq),
		setHpf: (freq) => main.setHpf(freq),
		setStereo: (stereo) => (stereo ? main.mixerStereoMode() : main.mixerMonoMode()),
		setInvert: (invert) => (invert ? main.mixerInvertStereo() : main.mixerStandardStereo()),
	})
	statusBar.setServerState('starting')
	if (!main.serverStarted) statusBar.setServerState('stopped')
	context.subscriptions.push(
		main.onServerState.event((state) => statusBar.setServerState(state)),
		main.onVersion.event((version) => statusBar.setVersion(version)),
		// The receiver flips between deaf and receiving outside the server state machine: hook it
		// directly, or the deafness indicator would outlive the takeover that healed the window.
		main.onReceiverFailed.event(() => statusBar.setReceiving(false)),
		main.onReceiverOpened.event(() => statusBar.setReceiving(true)),
		main.onMixerSettings.event((settings) => statusBar.setMixerSettings(settings)),
		vscode.commands.registerCommand('vscode-sonic-pi.logsElsewhere', () =>
			vscode.window.showInformationMessage(
				'Another program or window owns the reply port: it shows the run logs, this window ' +
					"can't. Press Play again to take over the connection and bring the logs here.",
			),
		),
		// Cold-window dispatch: the activation suite fires every command without a server, and
		// a modal (input box or QuickPick) there hangs the dispatch loop. Silent no-op - the
		// statusbar items are hidden when stopped anyway, so this path is unreachable for users.
		vscode.commands.registerCommand('vscode-sonic-pi.masterVolume', () => {
			if (!main.serverStarted) return
			void statusBar.showVolumeQuickPick()
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.mixer', () => {
			if (!main.serverStarted) return
			void statusBar.showMixerQuickPick()
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.audioDevices', () => {
			// Cold-window dispatch: no server -> silent return (a modal there hangs the gate).
			if (!main.serverStarted) return
			void showAudioDevicePicker()
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.reopenAudioDevice', () => {
			if (!main.serverStarted) return
			void confirmThenReopenAudioDevice()
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.midiDevices', () => {
			// Cold-window dispatch: no server -> silent return (a modal there hangs the gate).
			if (!main.serverStarted) return
			void runMidiPortPicker(main, { showQuickPick: (items) => vscode.window.showQuickPick(items) })
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.gamepads', () => {
			if (!main.serverStarted) return
			void runGamepadPicker(main, { showQuickPick: (items) => vscode.window.showQuickPick(items) })
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.setLinkBpm', async () => {
			// Cold-window dispatch: no server -> silent return (a modal there hangs the gate).
			if (!main.serverStarted) return
			const input = await vscode.window.showInputBox({
				prompt: 'Link BPM (20-999)',
				value: linkBpmInputValue(statusBar.getCurrentBpm()),
			})
			if (input === undefined) return
			const bpm = parseFloat(input)
			if (!Number.isFinite(bpm)) {
				void vscode.window.showErrorMessage('Link BPM must be a number from 20 to 999')
				return
			}
			main.setLinkBpm(bpm)
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.setGlobalTimewarp', async () => {
			// Cold-window dispatch: no server -> silent return (a modal there hangs the gate).
			if (!main.serverStarted) return
			await promptThenSetGlobalTimewarp()
		}),
		main.onLinkBpm.event((bpm) => statusBar.setLinkData({ bpm })),
		main.onLinkPeers.event((peers) => statusBar.setLinkData({ peers })),
		{ dispose: () => statusBar.dispose() },
	)
}

// Global timewarp (/set-global-timewarp, spider-server.rb:806-814): the daemon rejects
// anything outside 0-5, so the prompt validates before the sender ever fires.
const promptThenSetGlobalTimewarp = async () => {
	const input = await vscode.window.showInputBox({
		prompt: 'Global timewarp (0-5): 0.25 quarter speed, 4 four times faster',
		value: '1',
	})
	if (input === undefined) return
	const seconds = parseFloat(input)
	if (!Number.isFinite(seconds)) {
		void vscode.window.showErrorMessage('Global timewarp must be a number from 0 to 5')
		return
	}
	main.setGlobalTimewarp(seconds)
}

// Ruby LSP diagnostics: squiggles as you type on .pi documents. The shared client boot
// (lsp/shared-client) owns the single LspClient; this registrar owns only the editor
// surface, swapping in the shared client when it is ready and replaying already-open
// editors so the first document squiggles too.
class NullLspClient {
	request(): Promise<undefined> {
		return Promise.resolve(undefined)
	}
	sendNotification(): void {}
}

const registerLspDiagnostics = (context: vscode.ExtensionContext) => {
	const controller = new LspDiagnosticsController(new NullLspClient())
	context.subscriptions.push(controller)
	onLspClientReady((client) => {
		controller.swapClient(client)
		controller.start()
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document.languageId === 'sonic-pi') controller.handleOpenedDocument(editor.document)
		}
	})
	ensureLspClient(context)
}

// Cue Inspector: TreeView over the live cue store plus its view/palette commands.
const registerCueInspector = (context: vscode.ExtensionContext) => {
	// Cue Inspector: TreeView over the cue store
	const cueStore = new CueStore()
	const cueInspector = new CueInspector(cueStore)
	const cueTreeView = vscode.window.createTreeView('sonic-pi.cues', {
		treeDataProvider: cueInspector,
		showCollapseAll: true,
	})
	cueTreeView.title = 'Cues'

	// Wire the daemon's onCue emitter to the store
	context.subscriptions.push(main.onCue.event((cue) => cueStore.add(cue)))

	// View title commands: _filter, _pause, _clear
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.cues._filter', async () => {
			// Cold-window dispatch: a modal there hangs the activation gate; silent no-op.
			if (!main.serverStarted) return
			const filter = await vscode.window.showInputBox({
				prompt: 'Filter cues by address substring (empty to clear)',
				value: cueInspector.getFilter() || '',
			})
			if (filter !== undefined) {
				cueInspector.setFilter(filter || undefined)
				cueTreeView.title = filter ? `Cues (filtered: ${filter})` : 'Cues'
			}
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.cues._pause', () => {
			const paused = !cueInspector.isPaused()
			cueInspector.setPaused(paused)
			cueTreeView.title = paused
				? 'Cues (paused)'
				: cueInspector.getFilter()
					? `Cues (filtered: ${cueInspector.getFilter()})`
					: 'Cues'
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.cues._clear', () => {
			cueInspector.clear()
			cueTreeView.title = 'Cues'
		}),
	)

	// Palette command: insert sync :address at cursor
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.cueInsertSync', async () => {
			const cues = cueInspector.getChildren()
			if (cues.length === 0) {
				void vscode.window.showInformationMessage('No cues to insert')
				return
			}
			// Pick the most recent cue (first in the list is newest)
			const cue = cues[0]
			await cueInspector.insertSync(cue)
		}),
	)

	// The cue-port routes are on the wire (main.cuePort*) but no command reached them: the Cues
	// view title carries the two switches Sonic Pi's own cue-port menu offers. A dispatch without
	// a server is a silent no-op - the queue would swallow the message anyway.
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.cues._portStop', () => {
			if (!main.serverStarted) return
			main.cuePortStop()
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.cues._portStart', () => {
			if (!main.serverStarted) return
			main.cuePortStart()
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.cues._portExternal', () => {
			if (!main.serverStarted) return
			main.cuePortExternal()
		}),
		vscode.commands.registerCommand('vscode-sonic-pi.cues._portInternal', () => {
			if (!main.serverStarted) return
			main.cuePortInternal()
		}),
	)

	// View/title command: send test cue - prompts for address and args
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.cueSendTest', async () => {
			if (!main.serverStarted) return
			const address = await vscode.window.showInputBox({
				prompt: 'OSC address (e.g. /foo/orca)',
				placeHolder: '/foo/orca',
			})
			if (!address) return
			const argsInput = await vscode.window.showInputBox({
				prompt: 'Space-separated arguments (e.g. 1 2.5 x)',
				placeHolder: '1 2.5 x',
				value: '',
			})
			const args = argsInput ? argsInput.trim().split(/\s+/) : []
			try {
				await sendTestCue(address, args)
				void vscode.window.showInformationMessage(`Sent test cue: ${address} ${args.join(' ')}`)
			} catch (error) {
				void vscode.window.showErrorMessage(
					`Failed to send test cue: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}),
	)
}

// When the user opts in, closing the last Sonic Pi editor shuts the server down.
// Only a Sonic Pi editor closing says anything about Sonic Pi editors: closing the
// settings file or a README of an otherwise Sonic Pi-free window must not kill the server.
// The count is sampled after the close event, so it sees the editors that remain: open
// editor tabs, not every document the extension host still holds open (a document can
// outlive its tab) and not a notebook's Sonic Pi cell documents, which have no tab of
// their own - closing a notebook tab closes the notebook, never its cells one by one.
// Tab events, not document events: a closed tab's document can linger in the host, so
// onDidCloseTextDocument either fires late or never for the last editor.
// The decision is debounced: while tabs switch, VS Code can transiently report zero
// open Sonic Pi tabs even though another one is about to activate, and stopping the
// daemon on that transient would kill a session mid-play.
const registerLastEditorClose = (context: vscode.ExtensionContext) => {
	// When the user opts in, closing the last Sonic Pi editor shuts the server down.
	// Only a Sonic Pi editor closing says anything about Sonic Pi editors: closing the
	// settings file or a README of an otherwise Sonic Pi-free window must not kill the server.
	// The count is sampled after the close event, so it sees the editors that remain: open
	// editor tabs, not every document the extension host still holds open (a document can
	// outlive its tab) and not a notebook's Sonic Pi cell documents, which have no tab of
	// their own - closing a notebook tab closes the notebook, never its cells one by one.
	// Tab events, not document events: a closed tab's document can linger in the host, so
	// onDidCloseTextDocument either fires late or never for the last editor.
	// The decision is debounced: while tabs switch, VS Code can transiently report zero
	// open Sonic Pi tabs even though another one is about to activate, and stopping the
	// daemon on that transient would kill a session mid-play.
	let lastEditorCloseTimer: ReturnType<typeof setTimeout> | undefined
	const lastEditorCloseDecision = () => {
		if (lastEditorCloseTimer) {
			clearTimeout(lastEditorCloseTimer)
		}
		lastEditorCloseTimer = setTimeout(stopServerIfLastEditorClosed, 500)
	}
	const stopServerIfLastEditorClosed = () => {
		lastEditorCloseTimer = undefined
		const openSonicPiTabs = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.filter(
				(tab): tab is vscode.Tab & { input: vscode.TabInputText } =>
					tab.input instanceof vscode.TabInputText,
			)
			.filter((tab) => tab.input.uri.scheme === 'file')
			.filter((tab) => tab.input.uri.path.endsWith('.pi'))
		const decision = shouldStopServerOnLastEditorClose({
			settingEnabled: config.stopServerOnLastEditorClose(),
			serverRunning: main.serverStarted,
			restartInProgress: main.restartInProgress,
			sonicPiEditorsRemaining: openSonicPiTabs.length,
		})
		if (decision) {
			void main.stopServer()
			clearPlaying()
		}
	}
	context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(lastEditorCloseDecision), {
		dispose: () => lastEditorCloseTimer && clearTimeout(lastEditorCloseTimer),
	})
	context.subscriptions.push(
		main.onFlash.event(({ workspace, line }) => playingLines.flash(workspace, line)),
		{ dispose: () => playingLines.dispose() },
	)
}

// Auto-run on save (opt-in, default off): a saved sonic-pi file plays whole-file, like the Run
// lens. A save is not a click, so a cold window stays silent instead of booting a daemon the way
// scriptRunEnsuresServer would; the decision itself lives in run-on-save.ts. The setting is read
// per save, so flipping it needs no reload.
const registerRunOnSave = (context: vscode.ExtensionContext) => {
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			if (!main.serverStarted) return
			shouldAutoRunOnSave({ enabled: config.runOnSave(), document }, main)
		}),
	)
}

// Register the editor commands. For now, run, stop and recording. Those should be enough for
// some initial fun...
const registerEditorCommands = (context: vscode.ExtensionContext) => {
	// Register the editor commands. For now, run, stop and recording. Those should be enough for
	// some initial fun...
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.startserver', () => {
			main.startServerReported()
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerTextEditorCommand('vscode-sonic-pi.run', (textEditor) => {
			let doc = textEditor.document
			// If the focus is on something that is not ruby (i.e. something on the output pane),
			// run the first found open ruby editor instead
			if (doc.languageId !== 'sonic-pi') {
				const textEditors = vscode.window.visibleTextEditors
				const rubyEditors = textEditors.filter((editor) => {
					return editor.document.languageId === 'sonic-pi'
				})

				// TODO: if no ruby editors, show a warning to indicate that this will not have effect
				if (!rubyEditors.length) {
					return
				}
				doc = rubyEditors[0].document
			}
			const code = doc.getText()
			void scriptRunEnsuresServer(code).then(() => main.flashCode(textEditor, true))
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.runWithText', (code: string, blockLine?: number) => {
			// A Run cell sends only its block, so pass the block's editor line: runCode pads the text
			// up to that line and the daemon then reports file-absolute flash lines. A cold-window
			// cell play must boot the server first (Option B takeover-on-play).
			// The block's line+text also become its cell key, so the daemon's /run/started workspace
			// maps this run to the block - that is what makes per-run mute/stop-job work for
			// editor Run cells, not just notebook cells.
			const cells = blockLine === undefined ? [] : [cellKeyFor(blockLine, code)]
			void scriptRunEnsuresServer(code, blockLine ?? 0, cells).then(() => notebookFlashMap.clear())
		}),
	)

	registerRunSelectedCommand(context)

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.stop', () => {
			main.stopAllJobs()
			clearPlaying()
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.restartserver', () => {
			void main.restartServer()
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.togglerecording', () => {
			isRecording = !isRecording
			if (isRecording) {
				main.startRecording()
			} else {
				main.stopRecording()
				void vscode.window.showSaveDialog({ filters: { 'Wave file': ['wav'] } }).then((uri) => {
					if (uri) {
						main.saveRecording(uri.fsPath)
					} else {
						main.deleteRecording()
					}
				})
			}
		}),
	)

	registerBeautifyCommand(context)
}

// Beautify: send the active Sonic Pi document to the daemon's /buffer-beautify and
// apply the returned aligned text as a whole-document edit, cursor best-effort.
const registerRunSelectedCommand = (context: vscode.ExtensionContext) => {
	context.subscriptions.push(
		vscode.commands.registerTextEditorCommand('vscode-sonic-pi.runselected', (textEditor) => {
			let doc = textEditor.document
			// If the focus is on something that is not ruby (i.e. something on the output pane),
			// run the first found open ruby editor instead
			if (doc.languageId !== 'sonic-pi') {
				const textEditors = vscode.window.visibleTextEditors
				const rubyEditors = textEditors.filter((editor) => {
					return editor.document.languageId === 'sonic-pi'
				})

				// TODO: if no ruby editors, show a warning to indicate that this will not have effect
				if (!rubyEditors.length) {
					return
				}
				doc = rubyEditors[0].document
			}
			let code = doc.getText(textEditor.selection)
			if (!code) {
				const runFileWhenRunSelectedIsEmpty = config.runFileWhenRunSelectedIsEmpty()
				if (!runFileWhenRunSelectedIsEmpty) {
					void vscode.window
						.showWarningMessage(
							'You tried to Run selected code with no code selected.' +
								'Do you want to run the whole file when this happens?',
							'Yes, once',
							'Yes, always',
							'No, never',
						)
						.then((item) => {
							if (item === 'Yes, once') {
								code = doc.getText()
								main.flashCode(textEditor, true)
								runFileCode(code)
							} else if (item === 'Yes, always') {
								config.updateRunFileWhenRunSelectedIsEmpty('always')
								code = doc.getText()
								main.flashCode(textEditor, true)
								runFileCode(code)
							} else if (item === 'No, never') {
								config.updateRunFileWhenRunSelectedIsEmpty('never')
							}
						})
					return
				} else if (runFileWhenRunSelectedIsEmpty === 'never') {
					return
				} else if (runFileWhenRunSelectedIsEmpty === 'always') {
					code = doc.getText()
					main.flashCode(textEditor, true)
					runFileCode(code)
				}
			}
			main.flashCode(textEditor, false)
			runFileCode(code, textEditor.selection.start.line)
		}),
	)
}

const registerBeautifyCommand = (context: vscode.ExtensionContext) => {
	context.subscriptions.push(
		vscode.commands.registerTextEditorCommand('vscode-sonic-pi.beautify', (textEditor) => {
			const doc = textEditor.document
			if (doc.languageId !== 'sonic-pi') {
				return
			}
			const bufferId = doc.uri.toString()
			const cursor = textEditor.selection.active
			main.beautify(bufferId, doc.getText(), cursor.line, cursor.character)
				.then((reply) => {
					const result = computeBeautifyEdit(
						doc.getText(),
						reply.content,
						{ line: cursor.line, character: cursor.character },
						{ line: reply.line, index: reply.index },
					)
					if (result.newText === undefined) {
						return
					}
					void textEditor
						.edit((editBuilder) => {
							const whole = new vscode.Range(
								doc.positionAt(0),
								doc.positionAt(doc.getText().length),
							)
							editBuilder.replace(whole, result.newText!)
						})
						.then((applied) => {
							if (applied) {
								const lastLine = doc.lineCount - 1
								const line = Math.min(result.cursor.line, lastLine)
								const character = Math.min(
									result.cursor.character,
									doc.lineAt(line).range.end.character,
								)
								const pos = new vscode.Position(line, character)
								textEditor.selection = new vscode.Selection(pos, pos)
							}
						})
				})
				.catch((error: Error) => {
					void vscode.window.showErrorMessage('Beautify failed: ' + error.message)
				})
		}),
	)
}

// this method is called when your extension is deactivated
export function deactivate() {}
