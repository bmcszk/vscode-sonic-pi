#!/usr/bin/env node
// MIDI + gamepad device pickers: the commands read the daemon's device pushes from the
// cache Main keeps (/midi/in-ports, /midi/out-ports, /gamepad/devices-list - one
// 'enabled<TAB>name' string each, runtime.rb:1949-1951) and a picked item flips that
// device through the existing senders (/midi-port-enable, /gamepad-enable). Driving
// QuickPicks headlessly is flaky, so the flow takes an injected picker (the
// runDevicePicker precedent in audio-device-picker.ts) and the tests drive that seam.
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
	QuickPickItemKind: { Separator: -1, Default: 0 },
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
		showWarningMessage: async () => undefined,
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
const {
	runMidiPortPicker,
	runGamepadPicker,
	REFRESH_ACTION,
} = require('../../out/device-ports.js')

const TOKEN = 8123
const SEPARATOR = vscodeStub.QuickPickItemKind.Separator
const sent = () => oscInstances[oscInstances.length - 1].sent
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

const startedMain = () => {
	oscInstances.length = 0
	const main = new Main()
	main.serverStarted = true
	main.guiUuid = TOKEN
	main.setupOscReceiver()
	main.portsInitalizedResolver(oscInstances[oscInstances.length - 1])
	return main
}

// The daemon pushes the device lists on gui-listen; a Main that received them caches them.
const mainWithPorts = (inVal, outVal) => {
	const main = startedMain()
	oscInstances[oscInstances.length - 1].fire('/midi/in-ports', { address: '/midi/in-ports', args: [inVal] })
	oscInstances[oscInstances.length - 1].fire('/midi/out-ports', {
		address: '/midi/out-ports',
		args: [outVal],
	})
	return main
}

const pickFirstDevice = (items) => items.find((item) => item.kind !== SEPARATOR && item.port !== undefined)

const tests = {
	'both port pushes land in the Main cache the picker reads'() {
		// given a booted Main
		const main = startedMain()
		// when the daemon pushes the input and output port lists
		oscInstances[oscInstances.length - 1].fire('/midi/in-ports', {
			address: '/midi/in-ports',
			args: ['true\tLaunchkey Mini'],
		})
		oscInstances[oscInstances.length - 1].fire('/midi/out-ports', {
			address: '/midi/out-ports',
			args: ['false\tIAC Driver Bus 1'],
		})
		// then the raw wire strings are cached, one per direction
		assert.strictEqual(main.lastMidiInPorts, 'true\tLaunchkey Mini')
		assert.strictEqual(main.lastMidiOutPorts, 'false\tIAC Driver Bus 1')
	},

	'a push with a non-string port payload leaves the cache alone'() {
		const main = startedMain()
		oscInstances[oscInstances.length - 1].fire('/midi/in-ports', { address: '/midi/in-ports', args: [7] })
		assert.strictEqual(main.lastMidiInPorts, '')
	},

	async 'picking an input port sends /midi-port-enable with the state flipped on'() {
		// given a daemon that reported one disabled input port and no output ports
		const main = mainWithPorts('false\tLaunchkey Mini', '')
		// when the user picks it
		await runMidiPortPicker(main, { showQuickPick: async (items) => pickFirstDevice(items) })
		await flush()
		// then the enable carries the direction, the port index and the flipped flag
		assert.deepStrictEqual(
			sent().map((message) => [message.address, message.args]),
			[['/midi-port-enable', [TOKEN, 'in', 0, 1]]],
		)
	},

	async 'picking an enabled output port turns it off and keeps its list index'() {
		const main = mainWithPorts('', 'true\tIAC Driver Bus 1\ntrue\tArturia KeyStep 32')
		await runMidiPortPicker(main, {
			showQuickPick: async (items) => items.find((item) => item.label.includes('KeyStep')),
		})
		await flush()
		assert.deepStrictEqual(sent().map((message) => [message.address, message.args]), [
			['/midi-port-enable', [TOKEN, 'out', 1, 0]],
		])
	},

	async 'cancelling the port picker sends nothing'() {
		const main = mainWithPorts('true\tLaunchkey Mini', '')
		await runMidiPortPicker(main, { showQuickPick: async () => undefined })
		await flush()
		assert.deepStrictEqual(sent(), [])
	},

	async 'the refresh entry asks the daemon to re-enumerate instead of toggling a port'() {
		const main = mainWithPorts('true\tLaunchkey Mini', '')
		await runMidiPortPicker(main, {
			showQuickPick: async (items) =>
				items.find((item) => item.action === REFRESH_ACTION) ?? items[0],
		})
		await flush()
		assert.deepStrictEqual(sent().map((message) => message.address), ['/midi-reset'])
	},

	async 'a daemon that reported no ports still offers the refresh entry'() {
		// given no pushes at all
		const main = startedMain()
		// when the picker opens
		const items = []
		await runMidiPortPicker(main, {
			showQuickPick: async (offered) => {
				items.push(...offered)
				return undefined
			},
		})
		// then the only entry is the re-enumeration
		assert.deepStrictEqual(
			items.filter((item) => item.kind !== SEPARATOR).map((item) => item.action),
			[REFRESH_ACTION],
		)
	},

	async 'picking a gamepad sends /gamepad-enable with its list index flipped'() {
		// given a daemon that reported two gamepads, the second one off
		const main = startedMain()
		oscInstances[oscInstances.length - 1].fire('/gamepad/devices-list', {
			address: '/gamepad/devices-list',
			args: ['true\tWireless Controller\nfalse\tXbox 360 Controller'],
		})
		// when the user picks the disabled pad
		await runGamepadPicker(main, {
			showQuickPick: async (items) => items.find((item) => item.label.includes('Xbox')),
		})
		await flush()
		// then the enable carries the index from the daemon's own list order
		assert.deepStrictEqual(sent().map((message) => [message.address, message.args]), [
			['/gamepad-enable', [TOKEN, 1, 1]],
		])
	},

	async 'a daemon that reported no gamepads opens no picker at all'() {
		const main = startedMain()
		let opened = false
		await runGamepadPicker(main, {
			showQuickPick: async () => {
				opened = true
				return undefined
			},
		})
		assert.strictEqual(opened, false)
		assert.deepStrictEqual(sent(), [])
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
		failures === 0 ? 'all device picker tests passed' : `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
