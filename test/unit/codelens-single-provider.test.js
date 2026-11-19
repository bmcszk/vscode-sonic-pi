#!/usr/bin/env node
// Single lens row set: activating the extension registers exactly ONE CodeLensProvider for
// 'sonic-pi'. A second registrar (root extension + source-runner) doubles every lens row -
// Run/Stop on line 1, Run cell and Mute per block - and each copy would keep its own mute
// registry, so a mute would flip only one of the two rows.
const assert = require('assert')
const Module = require('module')

const registered = { codeLenses: [] }

const disposable = () => ({ dispose() {} })

const vscodeStub = {
	EventEmitter: class {
		constructor() {
			this.event = () => disposable()
		}
		fire() {}
		dispose() {}
	},
	Range: class {
		constructor(startLine, startCharacter, endLine, endCharacter) {
			this.start = { line: startLine, character: startCharacter }
			this.end = { line: endLine, character: endCharacter }
		}
	},
	CodeLens: class {
		constructor(range, command) {
			this.range = range
			this.command = command
		}
	},
	Selection: class {},
	StatusBarAlignment: { Left: 1, Right: 2 },
	TextEditorRevealType: { InCenterOutsideViewport: 0 },
	Uri: { joinPath: (...parts) => ({ fsPath: parts.join('/') }) },
	window: {
		createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {} }),
		createTextEditorDecorationType: () => ({}),
		createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
		createTreeView: () => ({ title: '', dispose() {} }),
		showErrorMessage: async () => undefined,
		showInformationMessage: async () => undefined,
		showWarningMessage: async () => undefined,
		activeTextEditor: undefined,
		visibleTextEditors: [],
		onDidChangeVisibleTextEditors: () => disposable(),
		tabGroups: { onDidChangeTabs: () => disposable(), all: [] },
		showTextDocument: async () => ({}),
	},
	workspace: {
		getConfiguration: () => ({ get: (_key, fallback) => fallback }),
		onDidChangeConfiguration: () => disposable(),
		onDidChangeTextDocument: () => disposable(),
		onDidCloseTextDocument: () => disposable(),
		onDidOpenTextDocument: () => disposable(),
		onDidSaveTextDocument: () => disposable(),
		workspaceFolders: [],
		registerTextDocumentContentProvider: () => disposable(),
		registerNotebookSerializer: () => disposable(),
		notebookDocuments: [],
		onDidOpenNotebookDocument: () => disposable(),
	},
	commands: {
		registerCommand: () => disposable(),
		registerTextEditorCommand: () => disposable(),
		executeCommand: async () => {},
	},
	languages: {
		registerCodeLensProvider: (_selector, provider) => {
			registered.codeLenses.push(provider)
			return disposable()
		},
		registerCompletionItemProvider: () => disposable(),
		registerHoverProvider: () => disposable(),
		registerDefinitionProvider: () => disposable(),
		createDiagnosticCollection: () => ({ set() {}, delete() {}, clear() {}, dispose() {} }),
	},
	notebooks: {
		registerNotebookSerializer: () => disposable(),
		registerNotebookCellStatusBarItemProvider: () => disposable(),
		createNotebookController: () => ({
			dispose() {},
			onDidChangeActiveNotebookEditor: () => disposable(),
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

const THREE_BLOCK_TEXT = ['live_loop :a do', '  play 60', 'end', '', 'play 64'].join('\n')
const FIRST_BLOCK_TEXT = 'live_loop :a do\n  play 60\nend'

const document = { languageId: 'sonic-pi', uri: { scheme: 'file' }, getText: () => THREE_BLOCK_TEXT }

const activateExtension = async () => {
	const extension = require('../../out/extension.js')
	await extension.activate({
		subscriptions: [],
		extensionUri: { fsPath: '/tmp' },
		asAbsolutePath: (rel) => '/tmp/' + rel,
	})
}

const titles = (provider) => provider.provideCodeLenses(document).map((lens) => lens.command.title)

const tests = {
	async 'activation registers exactly one CodeLensProvider for sonic-pi'() {
		// given: a fresh module graph
		// when: the extension activates (its runner activation included)
		await activateExtension()

		// then: only one provider renders lens rows, so Run/Stop and Run cell/Mute appear once
		assert.strictEqual(
			registered.codeLenses.length,
			1,
			`expected 1 CodeLensProvider, got ${registered.codeLenses.length}`,
		)
	},

	async 'the single provider renders one Run/Stop pair and one Run cell plus Mute per block'() {
		// given: the one registered provider
		const provider = registered.codeLenses[0]

		// when: it lenses a two-block document
		// then: every row appears exactly once
		assert.deepStrictEqual(titles(provider), [
			'$(play) Run',
			'$(stop) Stop',
			'$(play) Run cell',
			'$(play) Run cell',
			'$(debug-pause) Mute',
			'$(debug-pause) Mute',
		])
	},

	async 'muting through the provider flips the one rendered mute row'() {
		// given: the one registered provider
		const provider = registered.codeLenses[0]

		// when: the mute lens path records the first block as muted
		provider.mute('file://0:' + FIRST_BLOCK_TEXT, FIRST_BLOCK_TEXT)

		// then: that block's single mute row reads Unmute
		assert.deepStrictEqual(titles(provider).slice(4), ['$(play) Unmute', '$(debug-pause) Mute'])
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
		failures === 0
			? 'single-provider lens tests passed'
			: `${failures} single-provider lens test(s) failed`,
	)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
