#!/usr/bin/env node
// Run-replaces-session: with the default (true), a play clears prior jobs before the new
// run-code goes out (per-cell replace semantics, notebook UX). Setting false keeps Sonic Pi's
// stack-and-layer behavior. Mirrors the daemon-start-guard fake-OscSender pattern.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

const loggedLines = []
const oscSenders = []
let spawnedServer

class FakeOscSender {
	constructor(port) {
		this.port = port
		this.sent = []
		oscSenders.push(this)
	}
	send(message) {
		this.sent.push(message)
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
		createOutputChannel: () => ({
			append: (line) => loggedLines.push(line),
			appendLine: (line) => loggedLines.push(line),
			show() {},
			dispose() {},
		}),
		createTextEditorDecorationType: () => ({}),
		showErrorMessage: async () => undefined,
		onDidChangeVisibleTextEditors() {},
	},
	workspace: {
		getConfiguration: () => ({ get: (_k, d) => d }),
		onDidChangeConfiguration() {},
	},
}

const childProcessStub = {
	spawn: () => {
		const proc = new EventEmitter()
		proc.stdout = new EventEmitter()
		proc.stderr = new EventEmitter()
		proc.kill = () => {}
		proc.unref = () => {}
		spawnedServer = proc
		return proc
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	if (request === 'child_process') return childProcessStub
	if (request === './oscsender') return { OscSender: FakeOscSender }
	return load.apply(this, arguments)
}

const { Main } = require('../../out/source-runner/main.js')

function booted(main, tokenOffset) {
	const started = main.startServer()
	spawnedServer.stdout.emit(
		'data',
		Buffer.from(`3888${tokenOffset % 10} 38877 38876 38878 4560 73422429${tokenOffset % 10}`),
	)
	return started
}

let settings = { runReplacesSession: undefined }

// Override the config getter per-test by patching through the runReplacesSession setting being
// read via Config; the fake ws config passes through defaults, so the test toggles the
// manifest-parsed default by intercepting Config's getConfiguration - simpler: drive settings
// through workspace.getConfiguration's captured values.
const tests = {
	async 'a play stops the previous jobs first, then the new run-code goes out (replace semantics)'() {
		const main = new Main()
		main.spiderServerScanner = () => undefined
		booted(main, 3)
		const last = oscSenders.at(-1)
		last.sent.length = 0

		main.runCode('live_loop :flibble do\n  sample :ambi_choir\n  sleep 1\nend')
		await flush()
		await flush()

		const addresses = last.sent.map((m) => m.address)
		const stopIdx = addresses.indexOf('/stop-all-jobs')
		const runIdx = addresses.indexOf('/run-code')
		assert.ok(stopIdx !== -1, 'stop-all-jobs must be sent on play (replace semantics)')
		assert.ok(runIdx !== -1, 'run-code must follow')
		assert.ok(stopIdx < runIdx, 'stop must come BEFORE the new run')
		main.stopAllJobs()
	},

	async 'with runReplacesSession=false the play does not stop stacked jobs (layering kept)'() {
		const main = new Main()
		main.spiderServerScanner = () => undefined
		booted(main, 4)
		const last = oscSenders.at(-1)
		last.sent.length = 0

		main.config.runReplacesSession = () => false
		main.runCode('sample :ambi_choir')
		await flush()
		await flush()

		const addresses = last.sent.map((m) => m.address)
		assert.strictEqual(
			addresses.filter((a) => a === '/stop-all-jobs').length,
			0,
			'no stop when layering is chosen',
		)
		assert.ok(addresses.includes('/run-code'))
		main.stopAllJobs()
	},
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

async function runAll() {
	let failures = 0
	for (const [name, test] of Object.entries(tests)) {
		try {
			loggedLines.length = 0
			oscSenders.length = 0
			await test()
			await flush()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.stack}`)
		}
	}
	console.log(
		failures === 0
			? 'run-replaces.test.js: all assertions passed'
			: `${failures} run-replaces test(s) failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

runAll()
