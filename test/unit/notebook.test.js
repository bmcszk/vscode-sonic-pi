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

// The launch mode the controller reads before deciding to boot a server.
const settings = { launchSonicPiServerAutomatically: 'ruby' }

const informationMessages = []
const errorMessages = []

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
		showErrorMessage: async (message) => {
			errorMessages.push(message)
		},
		showInformationMessage: async (message) => {
			informationMessages.push(message)
		},
		showWarningMessage: async () => undefined,
		activeTextEditor: undefined,
		visibleTextEditors: [],
		onDidChangeVisibleTextEditors: () => ({ dispose() {} }),
	},
	workspace: {
		getConfiguration: () => settings,
		onDidChangeConfiguration: () => ({ dispose() {} }),
		onDidChangeTextDocument: () => ({ dispose() {} }),
		onDidCloseTextDocument: () => ({ dispose() {} }),
		registerNotebookSerializer: () => ({ dispose() {} }),
		visibleTextEditors: [],
		textDocuments: [],
		// The controller prefers itself for every notebook of its type as the notebook opens.
		notebookDocuments: [],
		onDidOpenNotebookDocument: () => ({ dispose() {} }),
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
			const controllerObject = {
				dispose() {},
				updateNotebookAffinity: () => {},
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
			createdControllers.push(controllerObject)
			return controllerObject
		},
	},
	env: { openExternal: async () => true },
}

const createdHandlers = []
const createdControllers = []

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
		this.onReceiverFailed = new StubEventEmitter()
		this.receiving = true
		this.serverStarted = false
		this.restartInProgress = false
		this.runs = []
		// One ordered log of what the controller did, so a test can assert the boot came first.
		this.events = []
		FakeMain.instances.push(this)
	}
	checkSonicPiPath() {}
	requestVersion() {}
	setMasterVolume() {}
	stopAllJobs() {
		this.events.push('stopAll')
	}
	stopServer() {}
	// Boots asynchronously like the real one, which only resolves once the daemon is ready.
	startServer() {
		this.events.push('startServer:begin')
		return new Promise((resolve) =>
			setImmediate(() => {
				this.serverStarted = true
				this.events.push('startServer:ready')
				resolve()
			}),
		)
	}
	restartServer() {
		this.onServerRestart.fire()
	}
	isReceiving() {
		return this.receiving
	}
	takeOverConnection() {
		this.events.push('takeOver')
		this.events.push('startServer:begin')
		this.receiving = true
		this.serverStarted = true
		this.events.push('startServer:ready')
		return Promise.resolve(true)
	}
	flashCode() {}
	startRecording() {}
	stopRecording() {}
	saveRecording() {}
	deleteRecording() {}
	runCode(code) {
		this.runs.push(code)
		this.events.push('runCode')
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
const { CellFlashMap } = require('../../out/cell-flash-map.js')
const { NotebookController, RunResolvers } = require('../../out/notebook.js')

const flush = () => new Promise((resolve) => setImmediate(resolve))
const awaitFlushing = async () => {
	await flush()
	await flush()
	await flush()
}

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
	const cellFlashes = new CellFlashMap()
	const controller = new NotebookController('test-kernel', 'sonic-pi-book', 'Sonic Pi Player', cellFlashes)
	return { main, controller, cellFlashes, handler: createdHandlers[0], notebook: makeNotebook([]) }
}

const tests = {
	async 'playing a cell runs ONLY that cell (whole-song join off by default): earlier cells stay silent'() {
		const { main, handler } = openController()
		const cells = [
			makeCell('guit', 'live_loop :guit do\n  sample :guit_em9\n  sleep 8\nend'),
			makeCell('flibble', 'live_loop :flibble do\n  sample :bd_haus\n  sleep 0.5\nend'),
		]
		const notebook = makeNotebook(cells)
		main.serverStarted = true

		handler([cells[0]], notebook).catch(() => {})
		await flush()
		main.onRunStarted.fire(0)
		main.onRunEnded.fire(0)
		await flush()

		const second = handler([cells[1]], notebook).catch(() => {})
		await flush()

		assert.deepStrictEqual(main.runs.length, 2, 'two plays, two sends')
		assert.ok(
			!main.runs.at(-1).includes('guit_em9'),
			'the flibble play must not re-send the guit cell content: only that cell plays',
		)
		main.onRunStarted.fire(1)
		main.onRunEnded.fire(1)
		await second
	},

	async 'whole-song mode (setting on) still joins executed cells'() {
		const { main, handler } = openController()
		const cells = [
			makeCell('guit', 'live_loop :guit do\n  sample :guit_em9\n  sleep 8\nend'),
			makeCell('flibble', 'live_loop :flibble do\n  sample :bd_haus\n  sleep 0.5\nend'),
		]
		const notebook = makeNotebook(cells)
		settings.notebookRunsWholeSong = true
		main.serverStarted = true

		const first = handler([cells[0]], notebook).catch(() => {})
		await flush()
		main.onRunStarted.fire(0)
		main.onRunEnded.fire(0)
		await flush()

		const second = handler([cells[1]], notebook).catch(() => {})
		await flush()

		assert.ok(main.runs.at(-1).includes('guit_em9'), 'whole-song mode joins the earlier cell')
		settings.notebookRunsWholeSong = undefined
		main.onRunStarted.fire(1)
		main.onRunEnded.fire(1)
		await second
	},

	async 'play while another window owns the reply port: this window takes over and plays'() {
		const { main, handler, notebook } = openController()
		const cells = [makeCell('c1', 'play 61')]
		main.receiving = false
		main.serverStarted = true

		const run = handler(cells, notebook).catch(() => {})
		await flush()
		await flush()

		assert.ok(main.events.includes('takeOver'), 'the play takes over the connection')
		assert.ok(main.events.includes('startServer:begin'), 'a fresh server boots for this window')
		assert.ok(main.events.includes('runCode'), 'the play then proceeds on the taken-over server')
		main.onRunStarted.fire(0)
		main.onRunEnded.fire(0)
		await run
	},

	async 'the taken-over window keeps owning: further plays need no second takeover'() {
		const { main, handler, notebook } = openController()
		const cells = [makeCell('c1', 'play 61'), makeCell('c2', 'play 62')]
		main.receiving = false
		main.serverStarted = true

		const first = handler([cells[0]], notebook).catch(() => {})
		await flush()
		main.onRunStarted.fire(0)
		main.onRunEnded.fire(0)
		await first

		const second = handler([cells[1]], notebook).catch(() => {})
		await flush()
		main.onRunStarted.fire(1)
		main.onRunEnded.fire(1)
		await second

		assert.deepStrictEqual(main.events.filter((e) => e === 'takeOver').length, 1, 'one takeover')
		assert.deepStrictEqual(main.events.filter((e) => e === 'runCode').length, 2, 'both plays ran')
	},

	'a resolved run id is forgotten'() {
		const resolvers = new RunResolvers()
		let resolutions = 0
		resolvers.addPending(() => resolutions++)
		resolvers.startRun(3)

		const firstEntry = resolvers.endRun(3)
		const resolvedAgain = resolvers.endRun(3)

		assert.deepStrictEqual(
			{
				resolved: Boolean(firstEntry.resolve),
				resolvedAgain: Boolean(resolvedAgain.resolve),
				resolutions,
			},
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

	async 'a play records which joined-script lines belong to each executed cell'() {
		const { main, cellFlashes, handler } = openController()
		const firstCell = makeCell('first-cell', 'play 60\nsleep 1')
		const secondCell = makeCell('second-cell', 'sample :bd_haus\nsleep 0.5\nplay 72')
		const notebook = makeNotebook([firstCell, secondCell])

		const run = handler([firstCell, secondCell], notebook)
		await flush()
		main.onRunStarted.fire(0)
		main.onRunEnded.fire(0)
		await run

		assert.deepStrictEqual(
			[
				cellFlashes.resolve(1),
				cellFlashes.resolve(2),
				cellFlashes.resolve(3),
				cellFlashes.resolve(5),
				cellFlashes.resolve(6),
			],
			[
				{ cellKey: 'first-cell', localLine: 1 },
				{ cellKey: 'first-cell', localLine: 2 },
				{ cellKey: 'second-cell', localLine: 1 },
				{ cellKey: 'second-cell', localLine: 3 },
				undefined,
			],
			'the daemon flashes lines of the joined script, so each cell must own its slice of them',
		)
		assert.deepStrictEqual(
			main.runs,
			['play 60\nsleep 1\nsample :bd_haus\nsleep 0.5\nplay 72'],
			'the run and the recorded offsets must describe the same joined script',
		)
	},

	async 'a later play re-records the offsets of the whole joined script'() {
		const { main, cellFlashes, handler } = openController()
		const firstCell = makeCell('first-cell', 'play 60\nsleep 1')
		const secondCell = makeCell('second-cell', 'play 72')
		const notebook = makeNotebook([firstCell, secondCell])

		const firstRun = handler([firstCell], notebook)
		await flush()
		main.onRunStarted.fire(0)
		main.onRunEnded.fire(0)
		await firstRun
		assert.deepStrictEqual(cellFlashes.resolve(1), { cellKey: 'first-cell', localLine: 1 })

		// Per-cell join: the second play records only the second cell's own lines.
		const secondRun = handler([secondCell], notebook)
		await flush()
		main.onRunStarted.fire(1)
		main.onRunEnded.fire(1)
		await secondRun

		assert.deepStrictEqual(cellFlashes.resolve(1), { cellKey: 'second-cell', localLine: 1 })
		assert.strictEqual(cellFlashes.resolve(2), undefined, 'the map covers only the played cell')
	},

	async 'a played cell is marked playing for the whole run, not just for the flash TTL'() {
		const { main, cellFlashes, handler } = openController()
		const cell = makeCell('playing-cell', 'play 60\nsleep 1')
		const notebook = makeNotebook([cell])

		const run = handler([cell], notebook)
		await flush()
		main.onRunStarted.fire(0)

		assert.ok(
			cellFlashes.activeCells().has('playing-cell'),
			'the played cell must carry the steady playing mark while its job runs',
		)

		main.onRunEnded.fire(0)
		await run
		assert.strictEqual(
			cellFlashes.activeCells().has('playing-cell'),
			false,
			'ending the job must clear the playing mark',
		)
	},

	async 'playing a notebook cell boots the server when launch mode is ruby and no server is running'() {
		informationMessages.length = 0
		settings.launchSonicPiServerAutomatically = 'ruby'
		const { main, handler } = openController()
		const cell = makeCell('boot-cell')
		const notebook = makeNotebook([cell])

		const run = handler([cell], notebook)
		await flush()
		main.onRunStarted.fire(0)
		main.onRunEnded.fire(0)
		await run

		assert.deepStrictEqual(
			main.events,
			['startServer:begin', 'startServer:ready', 'runCode'],
			'the run must be sent only after the boot resolved; unbound ports swallow it silently',
		)
		assert.strictEqual(main.serverStarted, true, 'the boot must leave the server running')

		// Launch mode never is a deliberate 'I start the server myself': no boot, one notice.
		settings.launchSonicPiServerAutomatically = 'never'
		const never = openController()
		const neverCell = makeCell('never-cell')
		const secondNeverCell = makeCell('second-never-cell')
		const neverNotebook = makeNotebook([neverCell, secondNeverCell])

		void never.handler([neverCell], neverNotebook)
		await flush()
		void never.handler([secondNeverCell], neverNotebook)
		await flush()

		assert.ok(
			!never.main.events.includes('startServer:begin'),
			'launch mode never must not boot a server from a notebook play',
		)
		assert.deepStrictEqual(
			informationMessages,
			['Sonic Pi server not running - launch mode is set to never'],
			'the notice must appear once per session, not once per play',
		)
		settings.launchSonicPiServerAutomatically = 'ruby'
	},
	async 'stopping a cell stops the sound: interrupt handler ends executions and stops all jobs'() {
		const { main, handler, notebook } = openController()
		const cells = [makeCell('c1', 'live_loop :probe do\n  play 60\n  sleep 1\nend')]
		main.serverStarted = true

		handler(cells, notebook).catch(() => {})
		await flush()
		main.onRunStarted.fire(0)
		await flush()

		const controllerObject = createdControllers.at(-1)
		assert.ok(controllerObject.interruptHandler, 'the controller registers a cell-stop handler')

		await controllerObject.interruptHandler(notebook)

		assert.ok(
			main.events.includes('stopAll'),
			'interrupt must stop all running jobs - otherwise the sound continues',
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
			console.log(`  ${error.message}`)
		}
	}
	console.log(
		failures === 0 ? 'notebook.test.js: all assertions passed' : `${failures} notebook test(s) failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

runAll()
