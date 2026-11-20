#!/usr/bin/env node
// Completion-winners regression: activating the extension registers exactly the five
// static Sonic Pi completion providers and one static hover provider; the LSP pass-through
// registrar adds no completion provider and only its own hover/definition registrations
// beyond the static surface.
const assert = require('assert')
const Module = require('module')

const registered = { completions: [], hovers: [], definitions: [], commands: [] }

const vscodeStub = {
	EventEmitter: class {
		constructor() {
			this.event = () => ({ dispose() {} })
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
		createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {} }),
		createTextEditorDecorationType: () => ({}),
		createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
		createTreeView: () => ({ dispose() {} }),
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
		onDidOpenTextDocument: () => ({ dispose() {} }),
		onDidSaveTextDocument: () => ({ dispose() {} }),
		workspaceFolders: [],
		registerTextDocumentContentProvider: () => ({ dispose() {} }),
		registerNotebookSerializer: () => ({ dispose() {} }),
		notebookDocuments: [],
		onDidOpenNotebookDocument: () => ({ dispose() {} }),
	},
	commands: {
		registerCommand: (id) => {
			registered.commands.push(id)
			return { dispose() {} }
		},
		registerTextEditorCommand: (id) => {
			registered.commands.push(id)
			return { dispose() {} }
		},
		executeCommand: async () => {},
	},
	languages: {
		registerCodeLensProvider: () => ({ dispose() {} }),
		registerCompletionItemProvider: (_sel, provider) => {
			registered.completions.push(provider)
			return { dispose() {} }
		},
		registerHoverProvider: (_sel, provider) => {
			registered.hovers.push(provider)
			return { dispose() {} }
		},
		registerDefinitionProvider: (_sel, provider) => {
			registered.definitions.push(provider)
			return { dispose() {} }
		},
		createDiagnosticCollection: () => ({ set() {}, delete() {}, clear() {}, dispose() {} }),
	},
	notebooks: {
		registerNotebookSerializer: () => ({ dispose() {} }),
		registerNotebookCellStatusBarItemProvider: () => ({ dispose() {} }),
		createNotebookController: () => ({
			dispose() {},
			onDidChangeActiveNotebookEditor: () => ({ dispose() {} }),
			updateNotebookAffinity: () => {},
			createNotebookCellExecution: () => ({}),
		}),
	},
	env: { openExternal: async () => true },
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const tests = {
	async 'activation registers exactly 5 completion providers and no LSP completion source'() {
		// given: a fresh module graph
		const extension = require('../../out/extension.js')
		const subscriptions = []

		// when: the extension activates
		await extension.activate({
			subscriptions,
			extensionUri: { fsPath: '/tmp' },
			asAbsolutePath: (rel) => '/tmp/' + rel,
		})

		// then: the five static Sonic Pi completion providers remain the only completion
		// winners; the ruby-lsp client is not registered as a completion source
		assert.strictEqual(
			registered.completions.length,
			5,
			`expected 5 completion providers, got ${registered.completions.length}`,
		)
	},

	async 'activation leaves exactly one static hover provider before any .pi document opens'() {
		// given: the activation from the previous test
		// when: no .pi document has opened (no boot listener fired)

		// then: the static Sonic Pi hover provider is registered exactly once and the LSP
		// registrar has added no definition provider (that happens only on first .pi open)
		assert.strictEqual(
			registered.hovers.length,
			1,
			`expected 1 hover provider, got ${registered.hovers.length}`,
		)
		assert.strictEqual(
			registered.definitions.length,
			0,
			`expected 0 definition providers before boot, got ${registered.definitions.length}`,
		)
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
	console.log(
		failures === 0 ? 'completion-winners regression passed' : `${failures} regression test(s) failed`,
	)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
