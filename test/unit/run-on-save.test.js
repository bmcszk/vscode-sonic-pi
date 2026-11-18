#!/usr/bin/env node
// Auto-run on save (roadmap F12, upstream issue #1902): vscode-sonic-pi.runOnSave turns a save of
// a sonic-pi document into one whole-file /run-code - the same text the Run lens sends (offset 0,
// no cell keys). Notebook cell saves stay out of it: a notebook executes through its kernel.
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
		showWarningMessage: async () => undefined,
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
const sentAddresses = () => oscInstances[oscInstances.length - 1].sent.map((m) => m.address)
const sentRuns = () =>
	oscInstances[oscInstances.length - 1].sent.filter((m) => m.address === '/run-code')
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

const {
	documentCanAutoRunOnSave,
	shouldAutoRunOnSave,
	runDocumentWholeFileOnSave,
} = require('../../out/source-runner/run-on-save.js')

function liveMain() {
	oscInstances.length = 0
	const main = new Main()
	main.serverStarted = true
	main.guiUuid = 'test-uuid'
	main.setupOscReceiver()
	main.portsInitalizedResolver(oscInstances[oscInstances.length - 1])
	return main
}

const document = (languageId, text) => ({ languageId, getText: () => text })

const tests = {
	'setting off: a save sends nothing'() {
		// given
		const main = liveMain()

		// when
		const handled = shouldAutoRunOnSave({ enabled: false, document: document('sonic-pi', 'play :c4') }, main)

		// then
		assert.strictEqual(handled, false, 'an off setting must report the save as not handled')
		assert.deepStrictEqual(sentAddresses(), [], 'an off setting must not put anything on the wire')
	},

	async 'setting on: one save sends exactly one whole-file run'() {
		// given
		const main = liveMain()

		// when
		const handled = shouldAutoRunOnSave({ enabled: true, document: document('sonic-pi', 'play :c4') }, main)
		await flush()

		// then
		assert.strictEqual(handled, true, 'an on setting reports the save as handled')
		const runs = sentRuns()
		assert.strictEqual(runs.length, 1, 'one save is one run')
		assert.deepStrictEqual(
			runs[0].args,
			['test-uuid', 'play :c4'],
			'the run is the pristine whole document text, no cell workspace argument',
		)
	},

	async 'the run text is the whole file exactly as the Run lens sends it'() {
		// given
		const main = liveMain()
		const text = 'use_bpm 120\nlive_loop :drums do\n  sample :bd_haus\nend\n'

		// when
		shouldAutoRunOnSave({ enabled: true, document: document('sonic-pi', text) }, main)
		await flush()

		// then
		assert.deepStrictEqual(
			sentRuns()[0].args,
			['test-uuid', text],
			'Run lens semantics: offset 0, no padding, no cell keys',
		)
	},

	async 'a notebook cell save is excluded even with the setting on'() {
		// given
		const main = liveMain()
		const cellUri = { scheme: 'vscode-notebook-cell', toString: () => 'vscode-notebook-cell:/x.pibook#c1' }

		// when
		const handled = shouldAutoRunOnSave(
			{ enabled: true, document: { ...document('sonic-pi', 'play :c4'), uri: cellUri } },
			main,
		)
		await flush()

		// then
		assert.strictEqual(handled, false, 'a notebook cell save is not an auto-run')
		assert.deepStrictEqual(sentAddresses(), [], 'no run may leave the editor for a cell save')
	},

	'non sonic-pi documents are never auto-run'() {
		// given / when / then
		assert.strictEqual(documentCanAutoRunOnSave({ languageId: 'markdown', getText: () => '# hi' }), false)
		assert.strictEqual(documentCanAutoRunOnSave({ languageId: 'sonic-pi', getText: () => 'play :c4' }), true)
	},

	async 'runDocumentWholeFileOnSave refuses a notebook cell document'() {
		// given
		const main = liveMain()
		const cellUri = { scheme: 'vscode-notebook-cell', toString: () => 'vscode-notebook-cell:/x.pibook#c1' }

		// when
		const sent = runDocumentWholeFileOnSave(main, {
			...document('sonic-pi', 'play :c4'),
			uri: cellUri,
		})
		await flush()

		// then
		assert.strictEqual(sent, false, 'a cell document is rejected at the sender, not only at the caller')
		assert.deepStrictEqual(sentAddresses(), [])
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
			console.log(`  ${error.stack || error.message}`)
		}
	}
	console.log(failures === 0 ? 'run-on-save.test.js: all assertions passed' : `${failures} run-on-save test(s) failed`)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
