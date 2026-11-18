#!/usr/bin/env node
// Lifecycle pushes: /spider/ready (spider-server.rb:1102) says the runtime is up before any
// run exists, so the window can flip to running and ask for the version without waiting for a
// log line. /exited (:974) and /exited-with-boot-error (:193, :270) say the runtime is gone:
// the window must stop claiming a live server and name the push that killed it.
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

// A started Main that records server state, log lines and the wire ledger.
const runningMain = () => {
	oscInstances.length = 0
	const main = new Main()
	main.serverStarted = true
	main.guiUuid = 4711
	const states = []
	const logs = []
	main.onServerState.event((state) => states.push(state))
	main.setupOscReceiver()
	main.portsInitalizedResolver(fakeOsc())
	main.log = (line) => logs.push(line)
	return { main, states, logs }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

const tests = {
	async 'a spider-ready push flips the window to running and asks for the version'() {
		// given a window that attached but has not seen a ready push yet
		const { main, states } = runningMain()
		// when the runtime reports it finished booting
		fakeOsc().fire('/spider/ready', { address: '/spider/ready', args: [] })
		await flush()
		// then the server state machine reaches running without waiting for a log line
		assert.deepStrictEqual(states, ['running'])
		// and the version request rides the daemon token
		const version = fakeOsc().sent.find((message) => message.address === '/version')
		assert.deepStrictEqual(version.args, [4711], 'the version request goes out on the ready push')
		assert.strictEqual(main.serverStarted, true)
	},

	async 'a second spider-ready push changes nothing'() {
		// given a window already running
		const { main, states } = runningMain()
		fakeOsc().fire('/spider/ready', { address: '/spider/ready', args: [] })
		// when a duplicate ready push arrives
		fakeOsc().fire('/spider/ready', { address: '/spider/ready', args: [] })
		await flush()
		// then the state does not flap and no second version request is sent
		assert.deepStrictEqual(states, ['running'])
		assert.strictEqual(
			fakeOsc().sent.filter((message) => message.address === '/version').length,
			1,
			'one ready, one version request',
		)
	},

	async 'a fresh generation announces ready again after the previous one exited'() {
		// given a window that saw one runtime boot and exit
		const { main, states } = runningMain()
		fakeOsc().fire('/spider/ready', { address: '/spider/ready', args: [] })
		fakeOsc().fire('/exited', { address: '/exited', args: [] })
		// when a restarted runtime comes up
		main.serverStarted = true
		fakeOsc().fire('/spider/ready', { address: '/spider/ready', args: [] })
		await flush()
		// then the new generation reaches running too
		assert.deepStrictEqual(states, ['running', 'stopped', 'running'])
	},

	async 'an exited push stops the server claim and names the push in the log'() {
		// given
		const { main, states, logs } = runningMain()
		// when the runtime exits
		fakeOsc().fire('/exited', { address: '/exited', args: [] })
		// then the window stops claiming a live server and says which push said so
		assert.strictEqual(main.serverStarted, false, 'a dead runtime cannot stay the live server')
		assert.deepStrictEqual(states, ['stopped'])
		assert.strictEqual(logs.length, 1)
		assert.ok(logs[0].includes('/exited'), `the log names the push, got: ${logs[0]}`)
	},

	async 'an exited-with-boot-error push stops the server claim and carries the daemon message'() {
		// given
		const { main, states, logs } = runningMain()
		// when the runtime dies booting and passes its reason along
		fakeOsc().fire('/exited-with-boot-error', {
			address: '/exited-with-boot-error',
			args: ['Failed to open server port 4560, is another instance already running?'],
		})
		// then
		assert.strictEqual(main.serverStarted, false)
		assert.deepStrictEqual(states, ['stopped'])
		assert.strictEqual(logs.length, 1)
		assert.ok(logs[0].includes('/exited-with-boot-error'), 'the log names the boot-error push')
		assert.ok(
			logs[0].includes('Failed to open server port 4560'),
			`the daemon's own reason survives to the log, got: ${logs[0]}`,
		)
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
		failures === 0
			? 'all lifecycle push tests passed'
			: `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
