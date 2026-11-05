#!/usr/bin/env node
// Activation smoke gate: loads the REAL built extension (full module graph incl. builtins,
// completions, notebook) under a vscode stub and runs activate(). Exit 0 = activation
// completed and the core commands registered. Catches module-load regressions (e.g. JSON
// import-shape changes) that compile fine but die at extension activation.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

const registeredCommands = []
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
	window: {
		createOutputChannel: () => ({
			append() {},
			appendLine() {},
			show() {},
			dispose() {},
		}),
		createTextEditorDecorationType: () => ({}),
		createStatusBarItem: () => ({
			show() {},
			dispose() {},
		}),
		showErrorMessage: async () => undefined,
		showInformationMessage: async () => undefined,
		onDidChangeVisibleTextEditors: () => ({ dispose() {} }),
		showTextDocument: async () => ({}),
		activeTextEditor: undefined,
	},
	workspace: {
		getConfiguration: () => ({ get: (_key, fallback) => fallback }),
		onDidChangeConfiguration: () => ({ dispose() {} }),
		onDidChangeTextDocument: () => ({ dispose() {} }),
		onDidCloseTextDocument: () => ({ dispose() {} }),
		registerNotebookSerializer: (..._a) => ({ dispose() {} }),
	},
	commands: {
		registerCommand: (id, _fn) => {
			registeredCommands.push(id)
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
