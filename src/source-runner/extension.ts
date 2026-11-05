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

let main: Main
let config: Config

export const runScript = (code: string) => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.runCode(code)
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

export const onFlash = (listener: (flash: { workspace: string; line: number }) => void) => {
	return main.onFlash.event(listener)
}

export const stopAllScripts = () => {
	if (!main) {
		throw Error('Runner not initialized')
	}
	main.stopAllJobs()
}

// Notebook plays cannot ride on the 'ruby' launch mode: a notebook editor never shows up as a
// sonic-pi text editor, so nothing else boots a server for it. The controller asks these three
// before sending a run, and awaits startServer so the run lands on bound ports.
export const serverIsRunning = () => main.serverStarted

export const startServer = () => main.startServer()

export const launchServerAutomatically = () => config.launchSonicPiServerAutomatically()

export function activate(context: vscode.ExtensionContext) {
	console.log('Ruby detected. Sonic Pi editor extension active!')

	main = new Main()
	config = new Config()

	main.checkSonicPiPath()

	let playingLines = new PlayingLineHighlighter({
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
	const statusBar = new SonicPiStatusBar({
		sendVersionRequest: () => main.requestVersion(),
		sendMasterVolume: (value) => main.setMasterVolume(value),
	})
	statusBar.setServerState('starting')
	if (!main.serverStarted) statusBar.setServerState('stopped')
	context.subscriptions.push(
		main.onServerState.event((state) => statusBar.setServerState(state)),
		main.onVersion.event((version) => statusBar.setVersion(version)),
		vscode.commands.registerCommand('vscode-sonic-pi.masterVolume', () =>
			statusBar.showVolumeQuickPick(),
		),
		{ dispose: () => statusBar.dispose() },
	)

	// When the user opts in, closing the last Sonic Pi editor shuts the server down.
	// The editor list is sampled after the close event, so it counts the editors that remain.
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument(() => {
			const sonicPiEditorsRemaining = [
				...vscode.window.visibleTextEditors.map((editor) => editor.document),
				...vscode.workspace.textDocuments,
			].filter(
				(document, index, all) =>
					document.languageId === 'sonic-pi' && all.indexOf(document) === index,
			).length
			const decision = shouldStopServerOnLastEditorClose({
				settingEnabled: config.stopServerOnLastEditorClose(),
				serverRunning: main.serverStarted,
				restartInProgress: main.restartInProgress,
				sonicPiEditorsRemaining,
			})
			if (decision) {
				main.stopServer()
				clearPlaying()
			}
		}),
	)
	context.subscriptions.push(
		main.onFlash.event(({ workspace, line }) => playingLines.flash(workspace, line)),
		{ dispose: () => playingLines.dispose() },
	)

	if (config.launchSonicPiServerAutomatically() === 'start') {
		main.startServer()
	}

	let isRecording = false

	// A file run reports the lines of that file, so a notebook's joined-script offsets stop applying.
	const runFileCode = (code: string, offset: number = 0) => {
		notebookFlashMap.clear()
		main.runCode(code, offset)
	}

	// Register the editor commands. For now, run, stop and recording. Those should be enough for
	// some initial fun...
	let disposable = vscode.commands.registerCommand('vscode-sonic-pi.startserver', () => {
		main.startServer()
	})

	disposable = vscode.commands.registerTextEditorCommand('vscode-sonic-pi.run', (textEditor) => {
		let doc = textEditor.document
		// If the focus is on something that is not ruby (i.e. something on the output pane),
		// run the first found open ruby editor instead
		if (doc.languageId !== 'sonic-pi') {
			let textEditors = vscode.window.visibleTextEditors
			let rubyEditors = textEditors.filter((editor) => {
				return editor.document.languageId === 'sonic-pi'
			})

			// TODO: if no ruby editors, show a warning to indicate that this will not have effect
			if (!rubyEditors.length) {
				return
			}
			doc = rubyEditors[0].document
		}
		let code = doc.getText()
		main.flashCode(textEditor, true)
		runFileCode(code)
	})

	context.subscriptions.push(
		vscode.commands.registerCommand('vscode-sonic-pi.runWithText', (code: string, blockLine?: number) => {
			// A Run cell sends only its block, so pass the block's editor line: runCode pads the text
			// up to that line and the daemon then reports file-absolute flash lines.
			runFileCode(code, blockLine ?? 0)
		}),
	)

	disposable = vscode.commands.registerTextEditorCommand('vscode-sonic-pi.runselected', (textEditor) => {
		let doc = textEditor.document
		// If the focus is on something that is not ruby (i.e. something on the output pane),
		// run the first found open ruby editor instead
		if (doc.languageId !== 'sonic-pi') {
			let textEditors = vscode.window.visibleTextEditors
			let rubyEditors = textEditors.filter((editor) => {
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
			let runFileWhenRunSelectedIsEmpty = config.runFileWhenRunSelectedIsEmpty()
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
	})

	disposable = vscode.commands.registerCommand('vscode-sonic-pi.stop', () => {
		main.stopAllJobs()
		clearPlaying()
	})

	disposable = vscode.commands.registerCommand('vscode-sonic-pi.restartserver', () => {
		void main.restartServer()
	})

	disposable = vscode.commands.registerCommand('vscode-sonic-pi.togglerecording', () => {
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
	})

	// Beautify: send the active Sonic Pi document to the daemon's /buffer-beautify and
	// apply the returned aligned text as a whole-document edit, cursor best-effort.
	disposable = vscode.commands.registerTextEditorCommand('vscode-sonic-pi.beautify', (textEditor) => {
		const doc = textEditor.document
		if (doc.languageId !== 'sonic-pi') {
			return
		}
		const bufferId = doc.uri.toString()
		const cursor = textEditor.selection.active
		main
			.beautify(bufferId, doc.getText(), cursor.line, cursor.character)
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
				void textEditor.edit((editBuilder) => {
					const whole = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length))
					editBuilder.replace(whole, result.newText!)
				}).then((applied) => {
					if (applied) {
						const lastLine = doc.lineCount - 1
						const line = Math.min(result.cursor.line, lastLine)
						const character = Math.min(result.cursor.character, doc.lineAt(line).range.end.character)
						const pos = new vscode.Position(line, character)
						textEditor.selection = new vscode.Selection(pos, pos)
					}
				})
			})
			.catch((error: Error) => {
				void vscode.window.showErrorMessage('Beautify failed: ' + error.message)
			})
	})

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider({ language: 'sonic-pi' }, new SonicPiCodeLensProvider()),
	)

	context.subscriptions.push(disposable)
}

// this method is called when your extension is deactivated
export function deactivate() {}
