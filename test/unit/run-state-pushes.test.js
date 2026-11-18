#!/usr/bin/env node
// Run state from the daemon's own pushes: /run/started(id, workspace) and /run/ended(id)
// (spider-server.rb:1078-1082) are the truth; the /log/info "Starting/Completed run N" line
// stays as the fallback. One run id announces its start at most once, whichever source
// arrives first, and /runs/all-completed ends every run that is still open.
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
	TextEditorRevealType: { InCenterIfOutsideViewport: 0 },
	window: {
		createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {}, clear() {} }),
		createTextEditorDecorationType: () => ({}),
		showErrorMessage: async () => undefined,
		onDidChangeVisibleTextEditors() {},
	},
	workspace: {
		getConfiguration: () => ({ get: () => undefined }),
		onDidChangeConfiguration() {},
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	if (request === 'osc-js') return FakeOsc
	return load.apply(this, arguments)
}

const { Main } = require('../../out/source-runner/main.js')

const fakeOsc = () => oscInstances[oscInstances.length - 1]

// A started Main whose run emitters are recorded in arrival order.
const armedMain = () => {
	oscInstances.length = 0
	const main = new Main()
	const fired = []
	main.onRunStarted.event((id) => fired.push({ kind: 'started', id }))
	main.onRunEnded.event((id) => fired.push({ kind: 'ended', id }))
	main.setupOscReceiver()
	return { main, fired }
}

const fireRunStarted = (id, workspace) =>
	fakeOsc().fire('/run/started', { address: '/run/started', args: [id, workspace] })
const fireRunEnded = (id) => fakeOsc().fire('/run/ended', { address: '/run/ended', args: [id] })
const fireLogInfo = (line) =>
	fakeOsc().fire('/log/info', { address: '/log/info', args: [0, line] })

const tests = {
	'a run-started push announces the run once, and the log line that follows stays silent'() {
		// given
		const { fired } = armedMain()
		// when the daemon reports the job, then prints its legacy log line
		fireRunStarted(7, 'cell-a')
		fireLogInfo('Starting run 7')
		// then the notebook sees one start for run 7
		assert.deepStrictEqual(fired, [{ kind: 'started', id: 7 }])
	},

	'a log line cannot re-announce a run the daemon already ended'() {
		// given a run announced by the push and then ended
		const { fired } = armedMain()
		fireRunStarted(3, 'cell-a')
		fireRunEnded(3)
		// when the legacy log line for that same run id arrives late
		fireLogInfo('Starting run 3')
		// then the ended run is not revived as a fresh start
		assert.deepStrictEqual(fired, [
			{ kind: 'started', id: 3 },
			{ kind: 'ended', id: 3 },
		])
	},

	'the log line still announces a run when no push arrives'() {
		// given
		const { fired } = armedMain()
		// when only the legacy log line shows up
		fireLogInfo('Starting run 9')
		fireLogInfo('Completed run 9')
		// then the fallback keeps the notebook working
		assert.deepStrictEqual(fired, [
			{ kind: 'started', id: 9 },
			{ kind: 'ended', id: 9 },
		])
	},

	'a run-ended push ends the run and frees its id for a later generation'() {
		// given
		const { fired } = armedMain()
		// when run 4 starts, ends, and a fresh daemon generation reuses id 4
		fireRunStarted(4, 'cell-a')
		fireRunEnded(4)
		fireRunStarted(4, 'cell-a')
		// then the reused id announces again after its end
		assert.deepStrictEqual(fired, [
			{ kind: 'started', id: 4 },
			{ kind: 'ended', id: 4 },
			{ kind: 'started', id: 4 },
		])
	},

	'runs-all-completed ends every open run exactly once'() {
		// given two runs still open
		const { fired } = armedMain()
		fireRunStarted(1, 'cell-a')
		fireRunStarted(2, 'cell-b')
		// when the daemon reports the session quiet
		fakeOsc().fire('/runs/all-completed', { address: '/runs/all-completed', args: [] })
		// then both runs end, in the order they started
		assert.deepStrictEqual(fired, [
			{ kind: 'started', id: 1 },
			{ kind: 'started', id: 2 },
			{ kind: 'ended', id: 1 },
			{ kind: 'ended', id: 2 },
		])
	},

	'a push without a workspace still announces its start'() {
		// given the daemon reports a job that carries no workspace
		const { fired } = armedMain()
		// when
		fireRunStarted(5, '')
		// then the run is announced even though it cannot be mapped to a cell
		assert.deepStrictEqual(fired, [{ kind: 'started', id: 5 }])
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
		failures === 0 ? 'all run-state push tests passed' : `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
