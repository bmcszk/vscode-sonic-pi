#!/usr/bin/env node
// Ownership recovery: a window whose reply-port bind failed (another window owned the server)
// must count itself as receiving again once the fresh receiver of its takeover/restart opens.
// Otherwise every later play would try to take the server over again and kill its own daemon.
const assert = require('assert')

const Module = require('module')
const { EventEmitter } = require('events')

const oscInstances = []

class FakeOsc {
	constructor() {
		this.handlers = new Map()
		oscInstances.push(this)
	}
	open() {}
	on(address, callback) {
		this.handlers.set(address, callback)
		return this.handlers.size
	}
	fire(address) {
		const callback = this.handlers.get(address)
		if (!callback) throw new Error(`no handler for ${address}`)
		callback()
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

const tests = {
	async 'a receiver that opens again restores ownership after a failed bind'() {
		oscInstances.length = 0
		const main = new Main()
		// What an EADDRINUSE on another window's reply port leaves behind.
		main.receiving = false

		main.setupOscReceiver()
		const osc = oscInstances[oscInstances.length - 1]
		assert.strictEqual(main.isReceiving(), false, 'a pending bind does not claim ownership')

		osc.fire('open')
		assert.strictEqual(main.isReceiving(), true, 'the window receives again once its receiver opens')
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
	console.log(failures === 0 ? 'all receiver recovery tests passed' : `${failures} of ${names.length} tests failed`)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
