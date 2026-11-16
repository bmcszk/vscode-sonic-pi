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
		event(listener) {
			return this.on('event', listener) && { dispose: () => this.removeListener('event', listener) }
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
const {
	classifyLogHolder,
	classifyReplyPortHolder,
	holderSubject,
} = require('../../out/port-holder.js')

const tests = {
	async 'a sonic-pi app holder is named as the Sonic Pi app'() {
		assert.strictEqual(classifyLogHolder('/usr/bin/sonic-pi\0', '/usr/share/code/code\0'), 'sonic-pi-app')
		assert.strictEqual(
			holderSubject(classifyLogHolder('/usr/bin/sonic-pi\0', '/usr/share/code/code\0')),
			'The Sonic Pi app',
		)
	},

	async 'a second window holder is named as another VS Code window'() {
		assert.strictEqual(classifyLogHolder('/usr/share/code/code\0', '/usr/share/code/code\0'), 'vscode-window')
		assert.strictEqual(
			holderSubject(classifyLogHolder('/usr/share/code/code\0 --type=extensionHost\0', '/usr/share/code/code\0')),
			'Another VS Code window',
		)
	},

	async 'an unknown holder falls back to another program'() {
		assert.strictEqual(classifyLogHolder('/usr/bin/python3\0', '/usr/share/code/code\0'), 'another-program')
		assert.strictEqual(
			holderSubject(classifyLogHolder('/usr/bin/python3\0', '/usr/share/code/code\0')),
			'Another program',
		)
	},

	async 'unreadable /proc data falls back to another program'() {
		const boom = () => {
			throw new Error('no /proc here')
		}
		assert.strictEqual(
			classifyReplyPortHolder(4557, {
				pid: 1,
				readFile: boom,
				readDir: boom,
				readLink: boom,
			}),
			'another-program',
		)
	},

	async 'the EADDRINUSE message names the actual holder'() {
		oscInstances.length = 0
		const main = new Main()
		const logged = []
		main.logOutput = { appendLine: (line) => logged.push(line) }

		main.setupOscReceiver()
		const osc = oscInstances[oscInstances.length - 1]
		const inuse = new Error('bind EADDRINUSE')
		inuse.code = 'EADDRINUSE'
		osc.handlers.get('error')(inuse)

		const deafLine = logged[0]
		assert.ok(
			/^(The Sonic Pi app|Another VS Code window|Another program) is showing the run logs\./.test(deafLine),
			`the deaf message names a holder class, got: ${deafLine}`,
		)
		assert.ok(deafLine.includes("Your window's Play will still sound"), 'the play-still-sounds reassurance stays')
		assert.ok(deafLine.includes('press Play again'), 'the recovery action is the press-Play-again takeover')
	},

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

	async 'a receiver opening fires the event the deafness indicator listens for'() {
		oscInstances.length = 0
		const main = new Main()
		let opened = 0
		main.onReceiverOpened.event(() => opened++)

		main.setupOscReceiver()
		const osc = oscInstances[oscInstances.length - 1]
		osc.fire('open')
		assert.strictEqual(opened, 1, 'the statusbar hook hears the receiver opening')
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
