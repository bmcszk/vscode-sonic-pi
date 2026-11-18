#!/usr/bin/env node
// Per-run stop: the daemon pushes /run/started(jobId, workspace) + /run/ended(jobId).
// A cell Stop must kill THAT run's job (/stop-job) - not the whole session (/stop-all-jobs).
// The link between cell and job is the workspace string we send with /run-code.
const assert = require('assert')

const Module = require('module')
const { EventEmitter } = require('events')

const oscInstances = []

class FakeOsc {
	constructor() {
		this.handlers = new Map()
		this.sent = []
		oscInstances.push(this)
		// The real DatagramPlugin carries a dgram socket that OscSender connects so send
		// errors surface; the stub mirrors the shape OscSender reads.
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
	sendError(error) {
		this.plugin.socket.emit('error', error)
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
		event() {
			return { dispose() {} }
		}
	},
	Range: class {},
	Selection: class {},
	TextEditorRevealType: { InCenterIfOutsideViewport: 0 },
	window: {
		createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {} }),
		createTextEditorDecorationType: () => ({}),
		showErrorMessage: async () => undefined,
		onDidChangeVisibleTextEditors() {},
	},
	workspace: {
		getConfiguration: () => ({}),
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
// The ports sender resolves to the receiver's fake osc, so one instance carries both.
const sentAddresses = () => fakeOsc().sent.map((m) => m.address)
// sendOsc resolves the ports promise on a microtask; give it a tick.
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

const runStarted = (main, jobId, workspace) =>
	fakeOsc().fire('/run/started', {
		address: '/run/started',
		args: [jobId, workspace],
	})

const tests = {
	async 'a cell stop kills that cell run and leaves other jobs playing'() {
		oscInstances.length = 0
		const main = new Main()
		main.serverStarted = true
		main.guiUuid = 'test-uuid'
		main.setupOscReceiver()
		// Resolve the ports sender so sendOsc actually delivers to the fake osc.
		main.portsInitalizedResolver(fakeOsc())

		// Two cells play in one joined run under workspace 'cell-a|cell-b'.
		main.runCode('play :c1', 0, ['cell-a', 'cell-b'])
		await flush()
		runStarted(main, 11, 'cell-a|cell-b')
		// The run itself begins with a session stop (a play replaces the session); only
		// what the CELL STOP sends is under test.
		fakeOsc().sent.length = 0

		main.stopCell(['cell-a'])
		await flush()
		const addresses = sentAddresses()
		assert.ok(
			addresses.includes('/stop-job'),
			'the cell stop sends /stop-job, got: ' + addresses.join(','),
		)
		const stopJob = fakeOsc().sent.find((m) => m.address === '/stop-job')
		assert.deepStrictEqual(stopJob.args, ['test-uuid', 11], 'stop-job carries the token and that job id')
		assert.ok(
			!addresses.includes('/stop-all-jobs'),
			'a tracked cell stop must NOT kill the whole session',
		)
	},
	async 'a stop for an untracked cell falls back to stop-all'() {
		oscInstances.length = 0
		const main = new Main()
		main.serverStarted = true
		main.guiUuid = 'test-uuid'
		main.setupOscReceiver()
		main.portsInitalizedResolver(fakeOsc())

		main.stopCell(['cell-never-run'])
		await flush()
		assert.ok(sentAddresses().includes('/stop-all-jobs'), 'unknown cells keep the whole-session fallback')
	},
	async 'a finished job is removed so its cell stop falls back to stop-all'() {
		oscInstances.length = 0
		const main = new Main()
		main.serverStarted = true
		main.guiUuid = 'test-uuid'
		main.setupOscReceiver()
		main.portsInitalizedResolver(fakeOsc())

		main.runCode('play :c1', 0, ['cell-a'])
		await flush()
		runStarted(main, 7, 'cell-a')
		fakeOsc().fire('/run/ended', { address: '/run/ended', args: [7] })

		main.stopCell(['cell-a'])
		await flush()
		assert.ok(sentAddresses().includes('/stop-all-jobs'), 'a dead job cannot be stop-jobbed again')
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
		failures === 0 ? 'all per-run stop tests passed' : `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
