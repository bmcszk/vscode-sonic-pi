#!/usr/bin/env node
// Loop mute: muting a cell stops only its job and records its last-run code; unmute
// re-runs that code WITHOUT the session-replacing stop, so other loops keep playing.
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
	fire(address, message) {
		const callback = this.handlers.get(address)
		if (!callback) throw new Error(`no handler for ${address}`)
		callback(message)
	}
	open() {}
	on(address, callback) {
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

const vscodeStub = {
	EventEmitter: class extends EventEmitter {
		fire(value) {
			this.emit('event', value)
		}
		event() {
			return { dispose() {} }
		}
	},
	StatusBarAlignment: { Left: 1, Right: 2 },
	Range: class {},
	Selection: class {},
	TextEditorRevealType: { InCenterIfOutsideViewport: 0 },
	commands: {
		registerCommand: () => ({ dispose() {} }),
		registerTextEditorCommand: () => ({ dispose() {} }),
		executeCommand: async () => {},
	},
	languages: {
		registerCodeLensProvider: () => ({ dispose() {} }),
		registerCompletionItemProvider: () => ({ dispose() {} }),
		registerHoverProvider: () => ({ dispose() {} }),
		// Ruby LSP diagnostics controller creates one named collection at activate time.
		createDiagnosticCollection: () => ({
			set() {},
			delete() {},
			clear() {},
			dispose() {},
		}),
	},
	notebooks: {
		registerNotebookSerializer: () => ({ dispose() {} }),
		registerNotebookCellStatusBarItemProvider: () => ({ dispose() {} }),
		createNotebookController: () => ({ dispose() {} }),
	},
	env: { openExternal: async () => true },
	window: {
		createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {} }),
		createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
		createTreeView: () => ({ title: '', dispose() {} }),
		createTextEditorDecorationType: () => ({}),
		showInformationMessage: async () => undefined,
		showWarningMessage: async () => undefined,
		activeTextEditor: undefined,
		visibleTextEditors: [],
		onDidChangeVisibleTextEditors: () => ({ dispose() {} }),
		tabGroups: { onDidChangeTabs: () => ({ dispose() {} }), all: [] },
		showTextDocument: async () => ({}),
	},
	workspace: {
		getConfiguration: () => ({ get: (_key, fallback) => fallback }),
		onDidChangeConfiguration: () => ({ dispose() {} }),
		onDidChangeTextDocument: () => ({ dispose() {} }),
		onDidOpenTextDocument: () => ({ dispose() {} }),
		onDidSaveTextDocument: () => ({ dispose() {} }),
		workspaceFolders: [],
		onDidCloseTextDocument: () => ({ dispose() {} }),
		registerTextDocumentContentProvider: () => ({ dispose() {} }),
		registerNotebookSerializer: () => ({ dispose() {} }),
		visibleTextEditors: [],
		notebookDocuments: [],
		onDidOpenNotebookDocument: () => ({ dispose() {} }),
	},
}

// Stands in for src/source-runner/main.ts at the extension bridge: the mute seam must not
// depend on a live daemon, only on the run/stop entry points and the restart event.
class FakeMain {
	constructor() {
		for (const name of [
			'onRunStarted',
			'onWorkspaceStarted',
			'onRunEnded',
			'onFlash',
			'onServerState',
			'onVersion',
			'onServerRestart',
			'onReceiverFailed',
			'onReceiverOpened',
			'onCue',
			'onMixerSettings',
			'onLinkBpm',
			'onLinkPeers',
			'onSupersonicDevices',
			'onLiveLoopScope',
			'onLiveLoopScopeEnded',
		]) {
			this[name] = new StubEmitter()
		}
		this.liveLoopScope = { clear() {}, list: () => [] }
		this.events = []
		this.runCodeCalls = []
		FakeMain.instances.push(this)
	}
	static reset() {
		FakeMain.instances = []
	}
	checkSonicPiPath() {}
	stopCell(cells) {
		this.events.push('stopCell:' + cells.join(','))
	}
	stopAllJobs() {
		this.events.push('stopAll')
	}
	runCode(code, offset, cells, opts) {
		this.runCodeCalls.push({ code, offset, cells, opts })
		this.events.push('runCode')
	}
}
FakeMain.instances = []

class StubEmitter {
	constructor() {
		this.listeners = []
	}
	event(listener) {
		this.listeners.push(listener)
		return { dispose() {} }
	}
	fire() {
		for (const listener of [...this.listeners]) listener()
	}
}

const load = Module._load
Module._load = function (request, parent) {
	if (request === 'vscode') return vscodeStub
	if (request === 'osc-js') return FakeOsc
	if (request === './main' && parent && /source-runner[\\/]extension\.js$/.test(parent.filename)) {
		return { Main: FakeMain }
	}
	return load.apply(this, arguments)
}

const { MuteRegistry } = require('../../out/loop-mute.js')
const runner = require('../../out/source-runner/extension.js')

const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

function activateRunner() {
	FakeMain.reset()
	runner.activate({ subscriptions: [], extensionUri: { fsPath: '/tmp' } })
	return FakeMain.instances[FakeMain.instances.length - 1]
}

const tests = {
	async 'muting a tracked cell stops only that job and records its last-run code'() {
		const main = activateRunner()
		runner.muteCellByKeys(['cell-a'], 'loop 60')
		assert.deepStrictEqual(main.events, ['stopCell:cell-a'], 'mute stops just that cell')
		const entry = runner.unmuteCellByKeys(['cell-a'])
		assert.deepStrictEqual(
			{ code: entry.code, cells: entry.cells },
			{ code: 'loop 60', cells: ['cell-a'] },
			'the registry kept the cell last-run code and its cells',
		)
	},
	async 'unmute re-sends the code with the same workspace and never stops the session'() {
		activateRunner()
		runner.muteCellByKeys(['cell-a', 'cell-b'], 'live_loop :drums')
		const main = FakeMain.instances[0]
		main.events.length = 0
		runner.unmuteCellByKeys(['cell-a', 'cell-b'])
		await flush()
		assert.ok(!main.events.includes('stopAll'), 'unmute must NOT send /stop-all-jobs')
		assert.strictEqual(main.runCodeCalls.length, 1, 'unmute runs the stored code once')
		const call = main.runCodeCalls[0]
		assert.strictEqual(call.code, 'live_loop :drums')
		assert.deepStrictEqual(call.cells, ['cell-a', 'cell-b'])
		assert.strictEqual(call.offset, 0)
		assert.deepStrictEqual(call.opts, { replaceSession: false })
	},
	async 'unmuting an unknown cell does nothing'() {
		const main = activateRunner()
		runner.unmuteCellByKeys(['never-muted'])
		await flush()
		assert.strictEqual(main.runCodeCalls.length, 0)
		assert.strictEqual(main.events.length, 0)
	},
	async 'the registry clears on server restart'() {
		const main = activateRunner()
		runner.muteCellByKeys(['cell-a'], 'loop 60')
		main.onServerRestart.fire()
		assert.strictEqual(runner.unmuteCellByKeys(['cell-a']), undefined, 'restart wiped the registry')
	},
	async 'a no-replace run skips the session stop on the real sender'() {
		oscInstances.length = 0
		const { Main } = require('../../out/source-runner/main.js')
		const main = new Main()
		main.serverStarted = true
		main.guiUuid = 'test-uuid'
		main.setupOscReceiver()
		main.portsInitalizedResolver(oscInstances[oscInstances.length - 1])
		main.runCode('live_loop :drums', 0, ['cell-a'], { replaceSession: false })
		await flush()
		const addresses = main ? oscInstances[0].sent.map((m) => m.address) : []
		assert.ok(!addresses.includes('/stop-all-jobs'), 'no-replace run must not stop the session')
		assert.ok(addresses.includes('/run-code'), 'the code still runs')
	},
	async 'the registry caps at 64 entries and drops the oldest'() {
		const registry = new MuteRegistry()
		for (let i = 0; i < 64; i++) registry.mute(['cell-' + i], 'code ' + i)
		registry.mute(['cell-late'], 'late code')
		assert.strictEqual(registry.size(), 64, 'cap holds at 64 entries')
		assert.strictEqual(registry.unmute(['cell-0']), undefined, 'the oldest entry was dropped')
		assert.ok(registry.unmute(['cell-late']), 'the newest entry survived')
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
	console.log(failures === 0 ? 'all loop-mute tests passed' : `${failures} of ${names.length} tests failed`)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
