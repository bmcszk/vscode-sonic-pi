#!/usr/bin/env node
// Daemon-audio senders + supersonic device pushes: /daemon/audio/* routes must go to the
// DAEMON port with the DAEMON token (separate from the spider keepalive sender), and the
// pushes on gui-listen must surface as string-only device names per the verified shapes.
const assert = require('assert')

const Module = require('module')
const { EventEmitter } = require('events')

const oscInstances = []
const oscSenders = []

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

const vscodeStub = {
	QuickPickItemKind: { Separator: 1, Default: 0 },
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
	if (request === './oscsender') return { OscSender: FakeOscSender }
	return load.apply(this, arguments)
}

const { Main } = require('../../out/source-runner/main.js')
const {
	buildDeviceQuickPickItems,
	runDevicePicker,
	RUNNING_CODE_CONFIRM,
} = require('../../out/audio-device-picker.js')

const keepaliveSender = () => oscSenders[oscSenders.length - 1]
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

const tests = {
	async 'audio routes go to the daemon port with the daemon token, not the spider port'() {
		oscSenders.length = 0
		const main = new Main()
		main.daemonPort = 4557
		main.guiUuid = 734224291
		main.setupOscReceiver()
		// Spider run-code traffic resolves to a sender on the server send-to-gui port.
		const spiderSender = new FakeOscSender(51236)
		main.portsInitalizedResolver(spiderSender)
		main.startKeepAlive()
		const keepalive = keepaliveSender()

		main.requestAudioDevices()
		main.switchAudioDevice('system')
		main.switchAudioDriver('ALSA')
		await flush()

		const daemonSender = keepaliveSender()
		assert.strictEqual(daemonSender.port, 4557, 'audio routes target the daemon port')
		assert.notStrictEqual(daemonSender, keepalive, 'audio never rides the keepalive socket')
		assert.notStrictEqual(daemonSender, spiderSender, 'audio never rides the spider run-code socket')
		assert.strictEqual(spiderSender.sent.length, 0, 'no audio traffic on the spider port')
		assert.strictEqual(keepalive.sent.length, 0, 'no audio traffic on the keepalive socket')
		const addresses = daemonSender.sent.map((m) => m.address)
		assert.deepStrictEqual(addresses, [
			'/daemon/audio/request-devices',
			'/daemon/audio/switch-device',
			'/daemon/audio/switch-driver',
		])
		assert.deepStrictEqual(daemonSender.sent[0].args, [734224291], 'request-devices: token only')
		assert.deepStrictEqual(daemonSender.sent[1].args, [734224291, 'system'], 'switch-device: token + key')
		assert.deepStrictEqual(
			daemonSender.sent[2].args,
			[734224291, 'ALSA'],
			'switch-driver: token + driver',
		)
	},
	async 'a lazily-created daemon sender is reused, not re-opened per call'() {
		oscSenders.length = 0
		const main = new Main()
		main.daemonPort = 4557
		main.guiUuid = 1
		main.requestAudioDevices()
		const countBefore = oscSenders.length
		main.requestAudioDevices()
		main.reopenAudioDevice()
		await flush()
		assert.strictEqual(oscSenders.length, countBefore, 'one daemon sender, created once')
		assert.deepStrictEqual(keepaliveSender().sent.at(-1).args, [1], 'reopen: token only')
	},
	async 'after a re-boot the daemon sender follows the new daemon port'() {
		oscSenders.length = 0
		const main = new Main()
		main.daemonPort = 4557
		main.guiUuid = 1
		main.requestAudioDevices()
		const oldSender = keepaliveSender()
		assert.strictEqual(oldSender.port, 4557)

		main.daemonPort = 4567
		main.requestAudioDevices()
		await flush()

		const newSender = keepaliveSender()
		assert.strictEqual(newSender.port, 4567, 'next send comes from a sender bound to the new port')
		assert.notStrictEqual(newSender, oldSender, 'sender must be re-created for the new port')
		assert.strictEqual(oldSender.sent.length, 1, 'old-port sender got only the first send')
		assert.strictEqual(newSender.sent.length, 1, 'new-port sender got the post-reboot send')
		assert.strictEqual(newSender.sent[0].address, '/daemon/audio/request-devices')
	},
	async 'supersonic devices push fires string-only output names'() {
		const main = new Main()
		main.setupOscReceiver()
		const events = []
		main.onSupersonicDevices.on('event', (value) => events.push(value))
		main.fireSupersonicDevices('/supersonic/devices', [
			'system',
			'System Default',
			'System Default',
			'Ryzen HD Audio Controller Speaker',
		])
		assert.deepStrictEqual(events, [
			{
				kind: 'output',
				names: ['system', 'System Default', 'System Default', 'Ryzen HD Audio Controller Speaker'],
			},
		])
	},
	async 'supersonic input-devices push filters non-string entries defensively'() {
		const main = new Main()
		main.setupOscReceiver()
		const events = []
		main.onSupersonicDevices.on('event', (value) => events.push(value))
		main.fireSupersonicDevices('/supersonic/input-devices', [
			'System Default',
			20,
			'System Default',
			'Patchbay (16 ch)',
		])
		assert.deepStrictEqual(events, [
			{ kind: 'input', names: ['System Default', 'System Default', 'Patchbay (16 ch)'] },
		])
	},
	async 'supersonic device-table push is stored raw and fired as a kind'() {
		const main = new Main()
		main.setupOscReceiver()
		const events = []
		main.onSupersonicDevices.on('event', (value) => events.push(value))
		const raw = ['PipeWire', '', 2, 'ALSA', 20, 'System Default', 'follows-default,synthetic', 'desc']
		main.fireSupersonicDevices('/supersonic/device-table', raw)
		assert.deepStrictEqual(events, [{ kind: 'table', names: raw.filter((a) => typeof a === 'string') }])
		assert.deepStrictEqual(main.lastDeviceTable, raw, 'raw table kept for later parsing')
	},

	async 'picker items list outputs, inputs, and the reopen entry'() {
		const items = buildDeviceQuickPickItems({
			kind: 'output',
			names: ['system', 'Dock Audio'],
		})
		assert.deepStrictEqual(
			items.filter((i) => i.kind === vscodeStub.QuickPickItemKind.Separator).length,
			1,
			'one separator',
		)
		const picks = items.filter((i) => i.kind !== vscodeStub.QuickPickItemKind.Separator)
		assert.deepStrictEqual(
			picks.map((i) => i.label),
			['system', 'Dock Audio', 'Reset audio device'],
		)
		assert.deepStrictEqual(
			picks.slice(0, 2).map((i) => i.action),
			['switch', 'switch'],
		)
		assert.strictEqual(picks[2].action, 'reopen')
	},

	async 'switch flow: confirmed modal sends switchAudioDevice with the picked name'() {
		let modalText = ''
		vscodeStub.window.showWarningMessage = async (message) => {
			modalText = message
			return 'Continue'
		}
		const sent = []
		await runDevicePicker(
			{
				requestAudioDevices: () => {},
				switchAudioDevice: (key) => sent.push(key),
				reopenAudioDevice: () => {},
			},
			[{ kind: 'output', names: ['Dock Audio'] }],
			{
				showQuickPick: async (items) => items.find((i) => i.action === 'switch'),
				showWarningMessage: vscodeStub.window.showWarningMessage,
			},
		)
		assert.match(modalText, /restarts your running code/)
		assert.deepStrictEqual(sent, ['Dock Audio'])
	},

	async 'switch flow: cancelled confirm sends nothing'() {
		vscodeStub.window.showWarningMessage = async () => undefined
		const sent = []
		await runDevicePicker(
			{
				requestAudioDevices: () => {},
				switchAudioDevice: (key) => sent.push(key),
				reopenAudioDevice: () => sent.push('reopen'),
			},
			[{ kind: 'output', names: ['Dock Audio'] }],
			{
				showQuickPick: async (items) => items.find((i) => i.action === 'switch'),
				showWarningMessage: vscodeStub.window.showWarningMessage,
			},
		)
		assert.deepStrictEqual(sent, [], 'cancelled confirm must not switch')
	},

	async 'reopen entry: confirmed modal sends reopenAudioDevice'() {
		vscodeStub.window.showWarningMessage = async () => 'Continue'
		const sent = []
		await runDevicePicker(
			{
				requestAudioDevices: () => {},
				switchAudioDevice: () => {},
				reopenAudioDevice: () => sent.push('reopen'),
			},
			[{ kind: 'output', names: ['Dock Audio'] }],
			{
				showQuickPick: async (items) => items.find((i) => i.action === 'reopen'),
				showWarningMessage: vscodeStub.window.showWarningMessage,
			},
		)
		assert.deepStrictEqual(sent, ['reopen'])
	},

	async 'reopen entry: cancelled confirm sends nothing'() {
		vscodeStub.window.showWarningMessage = async () => undefined
		const sent = []
		await runDevicePicker(
			{
				requestAudioDevices: () => {},
				switchAudioDevice: () => {},
				reopenAudioDevice: () => sent.push('reopen'),
			},
			[{ kind: 'output', names: ['Dock Audio'] }],
			{
				showQuickPick: async (items) => items.find((i) => i.action === 'reopen'),
				showWarningMessage: vscodeStub.window.showWarningMessage,
			},
		)
		assert.deepStrictEqual(sent, [], 'cancelled confirm must not reopen')
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
		failures === 0 ? 'all audio devices tests passed' : `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
