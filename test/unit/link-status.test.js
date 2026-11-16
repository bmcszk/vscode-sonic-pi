#!/usr/bin/env node
// Link telemetry: the daemon pushes /link-bpm + /link-num-peers when Link peers sync, and
// setLinkBpm must reach set_link_bpm! through a SILENT no-replace run so it never kills playing jobs.
const assert = require('assert')

const Module = require('module')
const { EventEmitter } = require('events')

const warnings = []
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
		event(listener) {
			this.on('event', listener)
			return { dispose: () => this.off('event', listener) }
		}
	},
	Range: class {},
	Selection: class {},
	TextEditorRevealType: { InCenterIfOutsideViewport: 0 },
	window: {
		createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {} }),
		createTextEditorDecorationType: () => ({}),
		showErrorMessage: async () => undefined,
		showWarningMessage: async (msg) => {
			warnings.push(msg)
		},
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

const wiredMain = () => {
	oscInstances.length = 0
	const main = new Main()
	main.serverStarted = true
	main.guiUuid = 42
	main.setupOscReceiver()
	main.portsInitalizedResolver(fakeOsc())
	return main
}

const tests = {
	async 'link bpm and peer count pushes fire the emitters'() {
		const main = wiredMain()
		const bpms = []
		const peers = []
		main.onLinkBpm.event((v) => bpms.push(v))
		main.onLinkPeers.event((v) => peers.push(v))

		fakeOsc().fire('/link-bpm', { address: '/link-bpm', args: [122.5] })
		fakeOsc().fire('/link-num-peers', { address: '/link-num-peers', args: [3] })
		assert.deepStrictEqual(bpms, [122.5], 'bpm push parses args[0] as a float')
		assert.deepStrictEqual(peers, [3], 'peer push parses args[0] as an int')
	},
	async 'setLinkBpm sends a silent no-replace run and never stops the session'() {
		const main = wiredMain()
		main.runCode('play :c1', 0, ['cell-a'])
		await flush()
		fakeOsc().sent.length = 0

		main.setLinkBpm(124)
		await flush()
		const addresses = fakeOsc().sent.map((m) => m.address)
		assert.ok(addresses.includes('/run-code'), 'a bpm set reaches the daemon as a run')
		const run = fakeOsc().sent.find((m) => m.address === '/run-code')
		assert.deepStrictEqual(
			run.args,
			[42, 'set_link_bpm! 124', 'link-bpm-set', 1],
			'the silent flag (args[3]=1) only takes effect with a workspace argument present',
		)
		assert.ok(
			!addresses.includes('/stop-all-jobs'),
			'a bpm set must not kill the playing session',
		)
	},
	async 'setLinkBpm rejects bpm outside 20..999 client-side'() {
		const main = wiredMain()
		warnings.length = 0
		main.setLinkBpm(1000)
		await flush()
		assert.strictEqual(fakeOsc().sent.length, 0, 'an out-of-range bpm sends nothing')
		assert.ok(warnings.length > 0, 'the user sees a warning about the rejected bpm')
		main.setLinkBpm(19)
		await flush()
		assert.strictEqual(fakeOsc().sent.length, 0, 'the low bound rejects too')
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
	console.log(failures === 0 ? 'all link status tests passed' : `${failures} of ${names.length} tests failed`)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
