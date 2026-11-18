#!/usr/bin/env node
// Global timewarp: /set-global-timewarp(token, seconds) (spider-server.rb:806-814) rides the
// silent no-replace run path, because no dedicated sender exists and the daemon's own guard
// accepts 0..5 only. Out-of-range values are rejected before anything reaches the wire.
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

const warnings = []

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
	window: {
		createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {}, clear() {} }),
		createTextEditorDecorationType: () => ({}),
		showErrorMessage: async () => undefined,
		showWarningMessage: async (message) => {
			warnings.push(message)
			return undefined
		},
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

const TOKEN = 9001
const sent = () => oscInstances[oscInstances.length - 1].sent
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

const startedMain = () => {
	oscInstances.length = 0
	warnings.length = 0
	const main = new Main()
	main.serverStarted = true
	main.guiUuid = TOKEN
	main.setupOscReceiver()
	main.portsInitalizedResolver(oscInstances[oscInstances.length - 1])
	return main
}

const tests = {
	async 'the timewarp rides the silent no-replace run with its own workspace'() {
		// given a booted Main
		const main = startedMain()
		// when the user sets a timewarp
		main.setGlobalTimewarp(2)
		await flush()
		// then exactly one silent /run-code goes out, and no /stop-all-jobs precedes it
		const runs = sent().filter((message) => message.address === '/run-code')
		assert.strictEqual(runs.length, 1)
		assert.strictEqual(runs[0].args[0], TOKEN)
		assert.match(String(runs[0].args[1]), /set_global_timewarp! 2\b/)
		assert.deepStrictEqual(runs[0].args.slice(2), ['timewarp-set', 1], 'workspace + silent flag')
		assert.deepStrictEqual(sent().map((message) => message.address), ['/run-code'])
	},

	async 'the accepted range bounds are inclusive'() {
		const main = startedMain()
		main.setGlobalTimewarp(0)
		main.setGlobalTimewarp(5)
		await flush()
		assert.strictEqual(sent().filter((message) => message.address === '/run-code').length, 2)
		assert.deepStrictEqual(warnings, [])
	},

	async 'an out-of-range timewarp sends nothing and says why'() {
		// given
		const main = startedMain()
		// when the value falls outside the daemon's 0..5 guard
		main.setGlobalTimewarp(6)
		main.setGlobalTimewarp(-1)
		main.setGlobalTimewarp(Number.NaN)
		await flush()
		// then the wire stays silent and each rejection is reported
		assert.deepStrictEqual(sent(), [])
		assert.strictEqual(warnings.length, 3)
		assert.match(warnings[0], /0.*5/)
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
		failures === 0 ? 'all timewarp tests passed' : `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
