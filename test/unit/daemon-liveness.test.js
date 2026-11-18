#!/usr/bin/env node
// Daemon liveness: when the keepalive send socket starts failing (dead daemon), the
// window must stop claiming a live server - otherwise every later play goes to a dead
// port, silently lost, with an empty log channel (user report: plays do nothing, no logs).
const assert = require('assert')

const Module = require('module')
const { EventEmitter } = require('events')

const oscSenders = []

class FakeOscSender {
	constructor(port) {
		this.port = port
		this.sent = []
		oscSenders.push(this)
	}
	onError(callback) {
		this.errorHandlers.push(callback)
	}
	send(message) {
		this.sent.push(message)
	}
}
FakeOscSender.prototype.errorHandlers = []

FakeOscSender.Message = class {
	constructor(address, ...args) {
		this.address = address
		this.args = args
	}
}

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
	if (request === './oscsender') return { OscSender: FakeOscSender }
	return load.apply(this, arguments)
}

const { Main } = require('../../out/source-runner/main.js')

const tests = {
	async 'three consecutive keepalive send failures declare the daemon dead'() {
		oscSenders.length = 0
		const main = new Main()
		main.serverStarted = true
		main.daemonPort = 33355
		main.guiUuid = 'test-uuid'
		main.startKeepAlive()

		const keepaliveSender = oscSenders[oscSenders.length - 1]
		assert.strictEqual(main.serverStarted, true, 'precondition: the window claims a live server')

		// The keepalive socket reports send errors - the daemon is gone.
		for (const handler of keepaliveSender.errorHandlers) handler(new Error('send ECONNREFUSED'))
		for (const handler of keepaliveSender.errorHandlers) handler(new Error('send ECONNREFUSED'))
		for (const handler of keepaliveSender.errorHandlers) handler(new Error('send ECONNREFUSED'))

		assert.strictEqual(main.serverStarted, false, 'a dead daemon must not keep the server-alive claim')
		assert.strictEqual(main.keepAliveTimer, undefined, 'keepalive stops once the daemon is declared dead')
	},
	async 'two failures keep the server claim (a single hiccup is not death)'() {
		oscSenders.length = 0
		const main = new Main()
		main.serverStarted = true
		main.daemonPort = 33355
		main.guiUuid = 'test-uuid'
		main.startKeepAlive()

		const keepaliveSender = oscSenders[oscSenders.length - 1]
		for (const handler of keepaliveSender.errorHandlers) handler(new Error('send ECONNREFUSED'))
		for (const handler of keepaliveSender.errorHandlers) handler(new Error('send ECONNREFUSED'))

		assert.strictEqual(main.serverStarted, true, 'two failures are not yet death')
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
		failures === 0 ? 'all daemon liveness tests passed' : `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
