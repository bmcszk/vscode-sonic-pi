#!/usr/bin/env node
// Activation smoke gate: loads the REAL built extension (full module graph incl. builtins,
// completions, notebook) under a vscode stub and runs activate(). Exit 0 = activation
// completed and the core commands registered. Catches module-load regressions (e.g. JSON
// import-shape changes) that compile fine but die at extension activation.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

const registeredCommands = []
const handlers = {}
const subscriptions = []

const vscodeStub = {
	EventEmitter: class {
		constructor() {
			this.event = (_listener) => ({ dispose() {} })
		}
		fire() {}
		dispose() {}
	},
	Range: class {},
	Selection: class {},
	StatusBarAlignment: { Left: 1, Right: 2 },
	TextEditorRevealType: { InCenterIfOutsideViewport: 0 },
	Uri: { joinPath: (...parts) => ({ fsPath: parts.join('/') }) },
	workspace: {
		registerTextDocumentContentProvider: () => ({ dispose() {} }),
	},
	window: {
		createOutputChannel: () => ({
			append() {},
			appendLine() {},
			show() {},
			dispose() {},
		}),
		createTextEditorDecorationType: () => ({}),
		createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
		createTreeView: (viewId, options) => ({ dispose() {} }),
		showErrorMessage: async () => undefined,
		showInformationMessage: async () => undefined,
		onDidChangeVisibleTextEditors: () => ({ dispose() {} }),
		tabGroups: { onDidChangeTabs: () => ({ dispose() {} }), all: [] },
		showTextDocument: async () => ({}),
		activeTextEditor: undefined,
	},
	workspace: {
		getConfiguration: () => ({ get: (_key, fallback) => fallback }),
		onDidChangeConfiguration: () => ({ dispose() {} }),
		onDidChangeTextDocument: () => ({ dispose() {} }),
		onDidCloseTextDocument: () => ({ dispose() {} }),
		registerTextDocumentContentProvider: () => ({ dispose() {} }),
		registerNotebookSerializer: (..._a) => ({ dispose() {} }),
		// A controller asks for the notebooks of its type as they open, so the kernel is picked
		// for a book without the user choosing one.
		notebookDocuments: [],
		onDidOpenNotebookDocument: () => ({ dispose() {} }),
	},
	commands: {
		registerCommand: (id, _fn) => {
			registeredCommands.push(id)
			handlers[id] = _fn
			return { dispose() {} }
		},
		registerTextEditorCommand: (id, _fn) => {
			registeredCommands.push(id)
			return { dispose() {} }
		},
		executeCommand: async () => {},
	},
	languages: {
		registerCodeLensProvider: () => ({ dispose() {} }),
		registerCompletionItemProvider: () => ({ dispose() {} }),
		registerHoverProvider: () => ({ dispose() {} }),
	},
	notebooks: {
		registerNotebookSerializer: () => ({ dispose() {} }),
		registerNotebookCellStatusBarItemProvider: () => ({ dispose() {} }),
		createNotebookController: (_id, _label, _kind, _handler) => ({
			dispose() {},
			onDidChangeActiveNotebookEditor: () => ({ dispose() {} }),
			updateNotebookAffinity: () => {},
			createNotebookCellExecution: () => ({}),
		}),
	},
	env: { openExternal: async () => true },
}

const load = Module._load
Module._load = function (request, parent, isMain) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const tests = {
	'every contributed command activates the extension on invocation'() {
		const manifest = require('../../package.json')
		const commands = manifest.contributes.commands.map((entry) => entry.command)
		const activationCommands = manifest.activationEvents
			.filter((event) => event.startsWith('onCommand:'))
			.map((event) => event.replace('onCommand:', ''))
		const missing = commands.filter((command) => !activationCommands.includes(command))
		assert.deepStrictEqual(missing, [], 'every contributed command must appear in activationEvents')
	},


	async 'extension activates without throwing and registers core commands'() {
		const extension = require('../../out/extension.js')
		await extension.activate({
			subscriptions,
			extensionUri: { fsPath: '/tmp' },
			asAbsolutePath: (rel) => '/tmp/' + rel,
		})
		for (const id of [
			'vscode-sonic-pi.run',
			'vscode-sonic-pi.stop',
			'vscode-sonic-pi.startserver',
			'vscode-sonic-pi.restartserver',
			'vscode-sonic-pi.runWithText',
		]) {
			assert.ok(
				registeredCommands.includes(id),
				`command ${id} should be registered at activation (got: ${registeredCommands.join(', ')})`,
			)
		}
		assert.ok(subscriptions.length > 0, 'activate should push disposables')
	},

	async 'setLinkBpm with no server is a silent no-op (no input box)'() {
		const extension = require('../../out/extension.js')
		let inputBoxes = 0
		const originalInputBox = vscodeStub.window.showInputBox
		vscodeStub.window.showInputBox = async () => {
			inputBoxes++
			return undefined
		}
		const handler = handlers['vscode-sonic-pi.setLinkBpm']
		assert.ok(handler, 'setLinkBpm command should be registered')
		await handler()
		assert.strictEqual(inputBoxes, 0, 'cold window must not open a modal')
		vscodeStub.window.showInputBox = originalInputBox
	},

	async 'setLinkBpm with a server opens an input box defaulting to the current bpm'() {
		const extension = require('../../out/extension.js')
		const handler = handlers['vscode-sonic-pi.setLinkBpm']
		let options
		const originalInputBox = vscodeStub.window.showInputBox
		vscodeStub.window.showInputBox = async (opts) => {
			options = opts
			return undefined
		}
		// The daemon's /link-bpm push recorded the current bpm through the statusbar wiring.
		const statusBarPush = extension.onLinkBpm((bpm) => bpm)
		vscodeStub.window.createStatusBarItem = () => ({
			show() {},
			hide() {},
			dispose() {},
			set text(v) {},
		})
		await handler()
		vscodeStub.window.showInputBox = originalInputBox
		assert.strictEqual(options.value, '60', 'input defaults to a number, not an empty field')
	},
}

async function runAll() {
	let failures = 0
	for (const [name, test] of Object.entries(tests)) {
		try {
			await test()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.stack || error.message}`)
		}
	}
	console.log(failures === 0 ? 'activation smoke passed' : `${failures} activation test(s) failed`)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
