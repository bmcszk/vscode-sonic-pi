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
import { SonicPiCodeLensProvider } from '../codelenses'
import { PlayingLineHighlighter } from '../playing-lines'
import { SonicPiStatusBar } from '../statusbar'
import { shouldStopServerOnLastEditorClose } from '../editor-close'
import { MuteRegistry } from '../loop-mute'
import { CueStore } from '../cue-store'
import { CueInspector } from '../cue-inspector'

let main: Main
let config: Config

export const scriptRunEnsuresServer = async (code: string, offset = 0) => {
	// Command-Palette/editor Run must survive a cold window: a play before any boot went
	// to unbound ports and vanished without feedback (user: 'no logs, no feedback').
	if (!main.serverStarted && config.launchSonicPiServerAutomatically() !== 'never') {
		await main.startServer()
	}
	main.runCode(code, offset)
}

export const runScript = (code: string, cells: string[] = []) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.runCode(code, 0, cells)
}

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

export function activate(context: vscode.ExtensionContext) {
	console.log('Ruby detected. Sonic Pi editor extension active!')

	main = new Main()
	config = new Config()

	main.checkSonicPiPath()

	const playingLines = new PlayingLineHighlighter({
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
	// A stopped run says nothing more about playing lines or playing cells.
	const clearPlaying = () => {
		playingLines.clear()
		notebookFlashMap.clear()
	}
	context.subscriptions.push(main.onServerRestart.event(() => clearPlaying()))
	// A fresh daemon knows nothing about muted loops; their stored codes could never be
	// soundly re-run, so the mute memory dies with the server generation.
	context.subscriptions.push(main.onServerRestart.event(() => muteRegistry.clear()))
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
		vscode.commands.registerCommand('vscode-sonic-pi.masterVolume', () =>
			statusBar.showVolumeQuickPick(),
		),
		vscode.commands.registerCommand('vscode-sonic-pi.mixer', () => statusBar.showMixerQuickPick()),
		{ dispose: () => statusBar.dispose() },
	)

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

	// View/title command: send test cue - prompts for address and args
	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.cueSendTest', async () => {
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
			main.stopServer()
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

	if (config.launchSonicPiServerAutomatically() === 'start') {
		main.startServerReported()
	}

	let isRecording = false

	// A file run reports the lines of that file, so a notebook's joined-script offsets stop applying.
	const runFileCode = (code: string, offset: number = 0) => {
		notebookFlashMap.clear()
		main.runCode(code, offset)
	}

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
			void scriptRunEnsuresServer(code, blockLine ?? 0).then(() => notebookFlashMap.clear())
		}),
	)

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

	// Beautify: send the active Sonic Pi document to the daemon's /buffer-beautify and
	// apply the returned aligned text as a whole-document edit, cursor best-effort.
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

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider({ language: 'sonic-pi' }, new SonicPiCodeLensProvider()),
	)
}

// this method is called when your extension is deactivated
export function deactivate() {}
