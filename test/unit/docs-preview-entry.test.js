#!/usr/bin/env node
// Docs preview + init.rb open: the docs picker's second step plays a builtin under the
// 'docs-preview' workspace with the daemon's silent, no-replace flags (spider-server.rb:302-316
// honours silent only with a workspace); openInitFile seeds and opens ~/.sonic-pi/config/init.rb
// without needing a server (file I/O only). Both are driven through the runner's exported seams,
// the way the integration suite drives setDriveForTest.
const assert = require('assert')

const Module = require('module')
const { EventEmitter } = require('events')

const oscInstances = []

class FakeOsc {
	constructor() {
		this.handlers = new Map()
		this.sent = []
		oscInstances.push(this)
		const events = new Map()
		this.plugin = {
			socket: {
				connect: () => {},
				on: (name, cb) => {
					events.set(name, cb)
				},
				emit: (name, err) => {
					const cb = events.get(name)
					if (cb) cb(err)
				},
			},
		}
	}
	open() {}
	on(address, callback) {
		if (address === 'error') {
			this.plugin.socket.on('error', callback)
			return
		}
		this.handlers.set(address, callback)
		return this.handlers.size
	}
	send(message) {
		this.sent.push(message)
	}
}
FakeOsc.Message = class {
	constructor(address, ...args) {
		this.address = address
		this.args = args
	}
}
FakeOsc.DatagramPlugin = class {}

const openedDocuments = []
const shownDocuments = []
const quickPicks = []

const vscodeStub = {
	EventEmitter: class extends EventEmitter {
		fire(value) {
			this.emit('event', value)
		}
		event(listener) {
			this.on('event', listener)
			return { dispose: () => this.off('event', listener) }
		}
	},
	Range: class {},
	Selection: class {},
	Position: class {},
	QuickPickItemKind: { Separator: -1, Default: 0 },
	StatusBarAlignment: { Left: 1, Right: 2 },
	Uri: { file: (fsPath) => ({ fsPath, scheme: 'file', toString: () => 'file://' + fsPath }), parse: (v) => v },
	window: {
		createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {}, clear() {} }),
		createTextEditorDecorationType: () => ({ dispose() {} }),
		createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
		createTreeView: () => ({ dispose() {}, title: '' }),
		createStatusBarItem: (alignment, priority) => ({ show() {}, hide() {}, dispose() {}, alignment, priority }),
		showErrorMessage: async () => undefined,
		showWarningMessage: async () => undefined,
		showInformationMessage: async () => undefined,
		showInputBox: async () => undefined,
		showQuickPick: async (items) => {
			quickPicks.push(items)
			return undefined
		},
		showTextDocument: async (document) => {
			shownDocuments.push(document)
			return { document }
		},
		onDidChangeVisibleTextEditors: () => ({ dispose() {} }),
		visibleTextEditors: [],
		tabGroups: { onDidChangeTabs: () => ({ dispose() {} }), all: [] },
	},
	workspace: {
		getConfiguration: () => ({ get: (_key, fallback) => fallback }),
		onDidChangeConfiguration: () => ({ dispose() {} }),
		onDidChangeTextDocument: () => ({ dispose() {} }),
		onDidOpenTextDocument: () => ({ dispose() {} }),
		onDidSaveTextDocument: () => ({ dispose() {} }),
		onDidCloseTextDocument: () => ({ dispose() {} }),
		workspaceFolders: [],
		registerTextDocumentContentProvider: () => ({ dispose() {} }),
		registerNotebookSerializer: () => ({ dispose() {} }),
		openTextDocument: async (uri) => {
			const document = { uri, languageId: 'sonic-pi', getText: () => '' }
			openedDocuments.push(document)
			return document
		},
		notebookDocuments: [],
		onDidOpenNotebookDocument: () => ({ dispose() {} }),
	},
	languages: {
		registerCompletionItemProvider: () => ({ dispose() {} }),
		registerHoverProvider: () => ({ dispose() {} }),
		registerCodeLensProvider: () => ({ dispose() {} }),
		createDiagnosticCollection: () => ({ set() {}, delete() {}, clear() {}, dispose() {} }),
	},
	commands: {
		registerCommand: () => ({ dispose() {} }),
		registerTextEditorCommand: () => ({ dispose() {} }),
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	if (request === 'osc-js') return FakeOsc
	return load.apply(this, arguments)
}

const fs = require('fs')
const os = require('os')
const path = require('path')

const { Main } = require('../../out/source-runner/main.js')
const runner = require('../../out/source-runner/extension.js')
const { buildPreviewCode } = require('../../out/docs-preview.js')
const { resolveInitPath } = require('../../out/init-file.js')
const { DOCS_PREVIEW_WORKSPACE } = require('../../out/docs-browser.js')

const TOKEN = 5555
const sent = () => oscInstances[oscInstances.length - 1].sent
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

const activatedRunner = () => {
	oscInstances.length = 0
	runner.activate({ subscriptions: [], extensionUri: { fsPath: '/tmp' } })
	const main = new Main()
	main.serverStarted = true
	main.guiUuid = TOKEN
	main.setupOscReceiver()
	main.portsInitalizedResolver(oscInstances[oscInstances.length - 1])
	runner.setMainForTest(main)
	return main
}

const tempHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sonic-pi-runner-test-'))

const tests = {
	async 'previewEntry plays the entry silent, no-replace, under the docs-preview workspace'() {
		// given an activated runner with a booted Main
		const main = activatedRunner()
		// when the user picks Preview in the docs second step
		runner.previewEntry({ kind: 'synth', name: 'prophet' })
		await flush()
		// then one silent run goes out with the preview workspace and no session stop first
		assert.deepStrictEqual(sent().map((message) => message.address), ['/run-code'])
		const run = sent()[0]
		assert.strictEqual(run.args[0], TOKEN)
		assert.strictEqual(run.args[1], buildPreviewCode({ kind: 'synth', name: 'prophet' }))
		assert.strictEqual(run.args[2], DOCS_PREVIEW_WORKSPACE)
		assert.strictEqual(run.args[3], 1, 'the silent flag the daemon honours with a workspace')
		assert.ok(!sent().some((message) => message.address === '/stop-all-jobs'))
		assert.strictEqual(main.liveJobs.size, 0)
	},

	async 'previewEntry on a command entry sends nothing (no sound to preview)'() {
		// given a booted Main
		const main = activatedRunner()
		// when the entry has no playable kind
		const played = runner.previewEntry({ kind: 'command', name: 'use_bpm' })
		await flush()
		// then nothing reaches the wire and the caller learns there was no preview
		assert.strictEqual(played, false)
		assert.deepStrictEqual(sent(), [])
		assert.strictEqual(main.liveJobs.size, 0)
	},

	async 'opening init.rb creates it in home and opens it as a sonic-pi document (no server)'() {
		// given a runner that never booted a server
		const home = tempHome()
		openedDocuments.length = 0
		shownDocuments.length = 0
		// when the user runs Open init.rb
		await runner.openInitFile(home)
		// then the file exists with the seeded content and is shown as a Sonic Pi document
		const initPath = resolveInitPath(home)
		assert.ok(fs.existsSync(initPath), 'init.rb was created')
		assert.strictEqual(openedDocuments.length, 1)
		assert.strictEqual(shownDocuments.length, 1)
		assert.strictEqual(openedDocuments[0].uri.fsPath, initPath)
	},

	async 'opening init.rb twice never rewrites what the user wrote'() {
		const home = tempHome()
		const initPath = resolveInitPath(home)
		await runner.openInitFile(home)
		fs.writeFileSync(initPath, 'use_bpm 70\n')
		await runner.openInitFile(home)
		assert.strictEqual(fs.readFileSync(initPath, 'utf8'), 'use_bpm 70\n')
	},
}

let failures = 0
const names = Object.keys(tests)

async function run() {
	for (const name of names) {
		try {
			await tests[name]()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.message}`)
		}
	}
	console.log(
		failures === 0 ? 'all docs preview / init.rb tests passed' : `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
