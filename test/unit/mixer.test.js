#!/usr/bin/env node
// Mixer senders + /mixer/settings push state (bean sonic-pi-v3do).
// Daemon arg orders (spider-server.rb 568-619): /mixer-drive(token, amp, silent),
// /mixer-lpf-enable(token, freq), /mixer-lpf-disable(token),
// /mixer-hpf-enable(token, freq), /mixer-hpf-disable(token).
// The daemon pushes /mixer/settings(drive, output_volume) on every change.
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
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

const setup = async () => {
	oscInstances.length = 0
	const main = new Main()
	main.serverStarted = true
	main.guiUuid = 'test-uuid'
	main.setupOscReceiver()
	main.portsInitalizedResolver(fakeOsc())
	await flush()
	fakeOsc().sent.length = 0
	return main
}

const sent = (address) => fakeOsc().sent.find((m) => m.address === address)

const tests = {
	async 'setDrive emits /mixer-drive with (token, amp, silent=1)'() {
		const main = await setup()
		main.setDrive(1.5)
		await flush()
		const message = sent('/mixer-drive')
		assert.ok(message, 'expected a /mixer-drive message')
		assert.deepStrictEqual(message.args, ['test-uuid', 1.5, 1], 'drive sends token, amp, silent=1')
	},
	async 'setLpf(120) enables and setLpf("off") disables the LPF'() {
		const main = await setup()
		main.setLpf(120)
		await flush()
		assert.deepStrictEqual(sent('/mixer-lpf-enable').args, ['test-uuid', 120])
		main.setLpf('off')
		await flush()
		assert.deepStrictEqual(sent('/mixer-lpf-disable').args, ['test-uuid'])
	},
	async 'setHpf(80) enables and setHpf("off") disables the HPF'() {
		const main = await setup()
		main.setHpf(80)
		await flush()
		assert.deepStrictEqual(sent('/mixer-hpf-enable').args, ['test-uuid', 80])
		main.setHpf('off')
		await flush()
		assert.deepStrictEqual(sent('/mixer-hpf-disable').args, ['test-uuid'])
	},
	async 'setMasterVolume keeps the /100 convention'() {
		const main = await setup()
		main.setMasterVolume(50)
		await flush()
		assert.deepStrictEqual(
			sent('/mixer-output-volume').args,
			['test-uuid', 0.5],
			'volume percent is divided by 100',
		)
	},
	async 'a /mixer/settings push lands in the emitter with parsed floats'() {
		const main = await setup()
		const received = new Promise((resolve) => main.onMixerSettings.event(resolve))
		fakeOsc().fire('/mixer/settings', {
			address: '/mixer/settings',
			args: [1.2, 0.8],
		})
		assert.deepStrictEqual(await received, { drive: 1.2, volume: 0.8 })
	},
}

;(async () => {
	let failures = 0
	for (const [name, run] of Object.entries(tests)) {
		try {
			await run()
			console.log('ok -', name)
		} catch (error) {
			failures++
			console.error('FAIL -', name, '\n ', error.message)
		}
	}
	process.exit(failures ? 1 : 0)
})()
