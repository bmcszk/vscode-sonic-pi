#!/usr/bin/env node
// Token consumption: an unrecognized daemon stdout line aborts the server start and never reaches OSC.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

const loggedLines = []
const errorsShown = []
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
	EventEmitter,
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
		showErrorMessage: async (message) => {
			errorsShown.push(message)
			return undefined
		},
		onDidChangeVisibleTextEditors() {},
	},
	workspace: {
		getConfiguration: () => ({}),
		onDidChangeConfiguration() {},
	},
}

const childProcessStub = {
	spawn: () => {
		spawnedServer = { stdout: new EventEmitter(), stderr: new EventEmitter() }
		return spawnedServer
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

function daemonReports(line) {
	const main = new Main()
	const starting = main.startRubyServer()
	spawnedServer.stdout.emit('data', Buffer.from(line))
	return { main, starting }
}

const tests = {
	async 'uses the token from a 6-value line for OSC'() {
		loggedLines.length = 0
		oscSenders.length = 0
		const { main, starting } = daemonReports('38880 38877 38876 38878 4560 1411627710')
		await starting
		assert.strictEqual(main.guiUuid, 1411627710)
		assert.strictEqual(oscSenders.length, 1)
		assert.strictEqual(oscSenders[0].port, 38876)
	},

	async 'uses a negative token for OSC'() {
		oscSenders.length = 0
		const { main, starting } = daemonReports('38880 38877 38876 38878 4560 -2000447764')
		await starting
		assert.strictEqual(main.guiUuid, -2000447764)
	},

	async 'logs the raw line, aborts the start and sends no OSC when the line is garbage'() {
		loggedLines.length = 0
		errorsShown.length = 0
		oscSenders.length = 0
		const main = new Main()
		const started = main.startServer()
		spawnedServer.stdout.emit('data', Buffer.from('1 2 3 4 5 not-a-number'))
		await started

		assert.strictEqual(main.guiUuid, -1, 'token must stay unset')
		assert.strictEqual(oscSenders.length, 0, 'no OSC sender may be created')
		assert.ok(
			loggedLines.some((line) => line.includes('1 2 3 4 5 not-a-number')),
			'raw daemon line must be logged',
		)
		assert.strictEqual(errorsShown.length, 1, 'the abort must be surfaced')
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
		failures === 0
			? 'all daemon start guard tests passed'
			: `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
