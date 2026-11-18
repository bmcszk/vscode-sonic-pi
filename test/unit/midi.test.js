#!/usr/bin/env node
// Auto /midi-start: run code containing midi_* functions needs one /midi-start
// per server session. Pure detection + once-per-session guard logic. The device senders
// (/midi-port-enable, /midi-reset, /gamepad-enable, /gamepad-start|stop) keep the daemon's
// arg orders (spider-server.rb:701-764); the gamepad_ prefix gets its own once-per-session
// auto-start, mirroring the midi_ heuristic.
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
	on() {}
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
		createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {}, clear() {} }),
		createTextEditorDecorationType: () => ({}),
		showErrorMessage: async () => undefined,
		onDidChangeVisibleTextEditors() {},
	},
	workspace: {
		getConfiguration: () => ({ get: () => undefined, autoMidiStart: true }),
		onDidChangeConfiguration() {},
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	if (request === 'osc-js') return FakeOsc
	return load.apply(this, arguments)
}

const { shouldAutoStartMidi, shouldAutoStartGamepad } = require('../../out/midi.js')
const { Main } = require('../../out/source-runner/main.js')

// The daemon token the senders put first in every message.
const TOKEN = 4711
const sentAddresses = () => oscInstances[oscInstances.length - 1].sent.map((m) => m.address)
const sentMessage = (address) =>
	oscInstances[oscInstances.length - 1].sent.find((m) => m.address === address)
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

// A Main whose send queue resolves to the fake osc, so sendOsc reaches the wire ledger.
const startedMain = () => {
	oscInstances.length = 0
	const main = new Main()
	main.serverStarted = true
	main.guiUuid = TOKEN
	main.setupOscReceiver()
	main.portsInitalizedResolver(oscInstances[oscInstances.length - 1])
	return main
}

const tests = {
	'detects midi_ calls in the run code'() {
		assert.strictEqual(shouldAutoStartMidi('midi_note_on 60', false), true)
	},

	'snake case counts as a midi call: use_midi_notes needs /midi-start'() {
		assert.strictEqual(shouldAutoStartMidi('use_midi_notes :e1', false), true)
	},

	'code without midi calls does not opt in'() {
		assert.strictEqual(shouldAutoStartMidi('sample :bd_haus', false), false)
		assert.strictEqual(shouldAutoStartMidi('play 60', false), false)
	},

	'fmidi_note is not a midi_ call'() {
		assert.strictEqual(shouldAutoStartMidi('synth :fmidi_note', false), false)
	},

	'once-per-session: a second midi run does not resend /midi-start'() {
		assert.strictEqual(shouldAutoStartMidi('midi_note 60', true), false)
	},

	'detects gamepad_ calls in the run code'() {
		assert.strictEqual(shouldAutoStartGamepad('gamepad_button :a', false), true)
		assert.strictEqual(shouldAutoStartGamepad('use_gamepad_buttons :dpad', false), true)
		assert.strictEqual(shouldAutoStartGamepad('play 60', false), false)
		assert.strictEqual(shouldAutoStartGamepad('fgamepad_button :a', false), false)
		assert.strictEqual(shouldAutoStartGamepad('gamepad_button :a', true), false)
	},

	async 'midi-port-enable sends (token, direction, port, 1|0)'() {
		// when the user toggles an output port on and an input port off
		const main = startedMain()
		main.midiPortEnable('out', 2, true)
		main.midiPortEnable('in', 0, false)
		await flush()
		// then each message keeps the daemon's arg order (spider-server.rb:746-754)
		assert.deepStrictEqual(
			oscInstances[oscInstances.length - 1].sent.map((m) => [m.address, m.args]),
			[
				['/midi-port-enable', [TOKEN, 'out', 2, 1]],
				['/midi-port-enable', [TOKEN, 'in', 0, 0]],
			],
		)
	},

	async 'midi-reset asks the daemon to re-enumerate devices'() {
		const main = startedMain()
		main.midiReset()
		await flush()
		assert.deepStrictEqual(sentMessage('/midi-reset').args, [TOKEN])
	},

	async 'gamepad-enable addresses the pad by its list index and flips the flag'() {
		const main = startedMain()
		main.gamepadEnable(1, true)
		await flush()
		assert.deepStrictEqual(sentMessage('/gamepad-enable').args, [TOKEN, 1, 1])
	},

	async 'gamepad-start and gamepad-stop ride the daemon token alone'() {
		const main = startedMain()
		main.gamepadStart()
		main.gamepadStop()
		await flush()
		assert.deepStrictEqual(sentMessage('/gamepad-start').args, [TOKEN])
		assert.deepStrictEqual(sentMessage('/gamepad-stop').args, [TOKEN])
	},

	async 'a gamepad run sends /gamepad-start once per session'() {
		// given
		const main = startedMain()
		// when two runs use gamepad functions in the same server session
		main.runCode('gamepad_button :a', 0, ['cell-a'])
		await flush()
		main.runCode('gamepad_button :b', 0, ['cell-b'])
		await flush()
		// then the daemon is only enabled once
		assert.deepStrictEqual(
			sentAddresses().filter((address) => address === '/gamepad-start').length,
			1,
		)
	},

	async 'a run without gamepad calls never starts gamepads'() {
		const main = startedMain()
		main.runCode('midi_note 60', 0, ['cell-a'])
		await flush()
		assert.ok(!sentAddresses().includes('/gamepad-start'))
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
	console.log(failures === 0 ? 'midi.test.js: all assertions passed' : `${failures} midi test(s) failed`)
	process.exit(failures === 0 ? 0 : 1)
}

runAll()
