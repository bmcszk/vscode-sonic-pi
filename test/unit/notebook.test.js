#!/usr/bin/env node
// Notebook run bookkeeping: the controller maps daemon job ids to the resolver that ends a run.
// Daemon job ids restart at 0 for every daemon generation, so a resolver kept past its own
// generation can swallow the next run's start/end and leave that cell spinning forever.
const assert = require('assert')
const Module = require('module')

class StubEventEmitter {
	constructor() {
		this.listeners = []
	}
	event(listener) {
		this.listeners.push(listener)
		return { dispose: () => (this.listeners = this.listeners.filter((entry) => entry !== listener)) }
	}
	fire(value) {
		for (const listener of [...this.listeners]) listener(value)
	}
}

const executions = new Map()

const vscodeStub = {
	EventEmitter: StubEventEmitter,
	NotebookCellKind: { Markup: 1, Code: 2 },
	Range: class {},
	Position: class {},
	Selection: class {},
	StatusBarAlignment: { Left: 1, Right: 2 },
	TextEditorRevealType: { InCenterIfOutsideViewport: 0 },
	Uri: { joinPath: (...parts) => ({ fsPath: parts.join('/') }) },
	window: {
		createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {} }),
		createTextEditorDecorationType: () => ({}),
		createStatusBarItem: () => ({ show() {}, dispose() {} }),
		showErrorMessage: async () => undefined,
		showInformationMessage: async () => undefined,
		showWarningMessage: async () => undefined,
		activeTextEditor: undefined,
		visibleTextEditors: [],
		onDidChangeVisibleTextEditors: () => ({ dispose() {} }),
	},
	workspace: {
		getConfiguration: () => ({}),
		onDidChangeConfiguration: () => ({ dispose() {} }),
		onDidChangeTextDocument: () => ({ dispose() {} }),
		onDidCloseTextDocument: () => ({ dispose() {} }),
		registerNotebookSerializer: () => ({ dispose() {} }),
		visibleTextEditors: [],
		textDocuments: [],
	},
	commands: {
		registerCommand: () => ({ dispose() {} }),
		registerTextEditorCommand: () => ({ dispose() {} }),
		executeCommand: async () => undefined,
	},
	languages: {
		registerCodeLensProvider: () => ({ dispose() {} }),
		registerCompletionItemProvider: () => ({ dispose() {} }),
		registerHoverProvider: () => ({ dispose() {} }),
	},
	notebooks: {
		registerNotebookSerializer: () => ({ dispose() {} }),
		createNotebookController: (_id, _notebookType, _label, handler) => {
			createdHandlers.push(handler)
			return {
				dispose() {},
				supportedLanguages: [],
				createNotebookCellExecution: (cell) => {
					const execution = {
						started: false,
						ended: false,
						token: { onCancellationRequested: () => ({ dispose() {} }) },
						start() {
							execution.started = true
						},
						end() {
							execution.ended = true
						},
					}
					executions.set(cell.document.uri.toString(), execution)
					return execution
				},
			}
		},
	},
	env: { openExternal: async () => true },
}

const createdHandlers = []

// Stands in for src/source-runner/main.ts: activation only needs the event seams and the
// run/stop entry points, so the controller is exercised without booting a daemon.
class FakeMain {
	constructor() {
		this.onRunStarted = new StubEventEmitter()
		this.onRunEnded = new StubEventEmitter()
		this.onFlash = new StubEventEmitter()
		this.onServerState = new StubEventEmitter()
		this.onVersion = new StubEventEmitter()
		this.onServerRestart = new StubEventEmitter()
		this.serverStarted = false
		this.restartInProgress = false
		this.runs = []
		FakeMain.instances.push(this)
	}
	checkSonicPiPath() {}
	requestVersion() {}
	setMasterVolume() {}
	stopAllJobs() {}
	stopServer() {}
	startServer() {}
	restartServer() {
		this.onServerRestart.fire()
	}
	flashCode() {}
	startRecording() {}
	stopRecording() {}
	saveRecording() {}
	deleteRecording() {}
	runCode(code) {
		this.runs.push(code)
	}
}
FakeMain.instances = []

const load = Module._load
Module._load = function (request, parent) {
	if (request === 'vscode') return vscodeStub
	if (request === './main' && parent && /source-runner[\\/]extension\.js$/.test(parent.filename)) {
		return { Main: FakeMain }
	}
	return load.apply(this, arguments)
}

const runner = require('../../out/source-runner/extension.js')
const { NotebookController, RunResolvers } = require('../../out/notebook.js')

const flush = () => new Promise((resolve) => setImmediate(resolve))

const makeCell = (name, text = 'play 60') => ({
	document: { uri: { toString: () => name }, getText: () => text },
})

const makeNotebook = (cells) => ({
	uri: { toString: () => 'file:///tutorial.pibook' },
	getCells: () => cells,
})

const executionOf = (cell) => executions.get(cell.document.uri.toString())

function openController() {
	runner.activate({
		subscriptions: [],
		extensionUri: { fsPath: '/tmp' },
		asAbsolutePath: (rel) => '/tmp/' + rel,
	})
	const main = FakeMain.instances[FakeMain.instances.length - 1]
	executions.clear()
	createdHandlers.length = 0
	const controller = new NotebookController('test-kernel', 'sonic-pi-book', 'Sonic Pi Player')
	return { main, controller, handler: createdHandlers[0], notebook: makeNotebook([]) }
}

const tests = {
	'a resolved run id is forgotten'() {
		const resolvers = new RunResolvers()
		let resolutions = 0
		resolvers.addPending(() => resolutions++)
		resolvers.startRun(3)

		const resolved = resolvers.endRun(3)
		const resolvedAgain = resolvers.endRun(3)

		assert.deepStrictEqual(
			{ resolved, resolvedAgain, resolutions },
			{ resolved: true, resolvedAgain: false, resolutions: 1 },
			'a job id must resolve once and the entry must be dropped so a recycled id cannot hit it',
		)
	},

	async 'server restart clears pending and sent resolvers'() {
		const { main, handler } = openController()
		const doneCell = makeCell('done-cell')
		const killedCell = makeCell('killed-cell')
		const freshCell = makeCell('fresh-cell')
		const notebook = makeNotebook([doneCell, killedCell, freshCell])

		const doneRun = handler([doneCell], notebook)
		await flush()
		main.onRunStarted.fire(0)
		main.onRunEnded.fire(0)
		await doneRun
		assert.strictEqual(executionOf(doneCell).ended, true, 'the first run should end normally')

		const killedRun = handler([killedCell], notebook)
		await flush()
		main.onRunStarted.fire(1)
		assert.strictEqual(executionOf(killedCell).ended, false, 'run 1 is still playing')

		main.restartServer()
		await flush()
		assert.strictEqual(executionOf(killedCell).ended, true, 'a restart must end a run it abandoned')
		await killedRun

		const freshRun = handler([freshCell], notebook)
		await flush()
		main.onRunStarted.fire(0)
		main.onRunEnded.fire(1)
		await flush()
		assert.strictEqual(
			executionOf(freshCell).ended,
			false,
			'job id 1 belonged to the previous daemon generation and must not end the current run',
		)

		main.onRunEnded.fire(0)
		await freshRun
		assert.strictEqual(executionOf(freshCell).ended, true, 'job id 0 of this generation ends the run')
	},

	async 'a run id from a previous generation does not resolve a pending run from the current one'() {
		const { main, handler } = openController()
		const staleCell = makeCell('stale-cell')
		const freshCell = makeCell('fresh-cell')
		const notebook = makeNotebook([staleCell, freshCell])

		// Generation 1: the daemon never reports a start for this run, so its resolver stays pending.
		const staleRun = handler([staleCell], notebook)
		await flush()

		main.restartServer()
		await flush()

		// Generation 2 recycles job id 0 for our new run; the stale resolver must not eat that id.
		const freshRun = handler([freshCell], notebook)
		await flush()
		main.onRunStarted.fire(0)
		main.onRunEnded.fire(0)
		await freshRun

		assert.strictEqual(executionOf(freshCell).ended, true, 'the current generation run must resolve')
		assert.strictEqual(executionOf(staleCell).ended, true, 'the abandoned run ended at the restart')
		await staleRun
	},

	async 'two pending runs resolving out of dispatch order resolve the right resolvers'() {
		const { main, handler } = openController()
		const firstCell = makeCell('first-cell')
		const secondCell = makeCell('second-cell')
		const notebook = makeNotebook([firstCell, secondCell])

		const firstRun = handler([firstCell], notebook)
		await flush()
		const secondRun = handler([secondCell], notebook)
		await flush()

		main.onRunStarted.fire(0)
		main.onRunStarted.fire(1)

		main.onRunEnded.fire(1)
		await flush()
		assert.strictEqual(executionOf(secondCell).ended, true, 'job id 1 ends the second run')
		assert.strictEqual(executionOf(firstCell).ended, false, 'job id 1 must not end the first run')

		main.onRunEnded.fire(0)
		await firstRun
		await secondRun
		assert.strictEqual(executionOf(firstCell).ended, true, 'job id 0 ends the first run')
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
			console.log(`  ${error.message}`)
		}
	}
	console.log(failures === 0 ? 'notebook.test.js: all assertions passed' : `${failures} notebook test(s) failed`)
	process.exit(failures === 0 ? 0 : 1)
}

runAll()
