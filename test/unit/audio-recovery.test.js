#!/usr/bin/env node
// Audio-recovery wiring: the daemon's 'connection lost ... reconnecting' stderr lines surface
// a restart offer (debounced), and the restart command kills the daemon process and boots a
// fresh one. Exit code 0 = all pass.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

class FakeVsCodeEventEmitter {
	constructor() {
		this.event = (_listener) => ({ dispose() {} })
	}
	fire() {}
	dispose() {}
}

const CONNECTION_LOST =
	'Daemon SuperSonic Conn: connection lost (EOFError: connection closed) - reconnecting'

const loggedLines = []
const errorsShown = []
const killCalls = []
let spawnedServer

class FakeOscSender {
	constructor(port) {
		this.port = port
	}
}

const vscodeStub = {
	EventEmitter: FakeVsCodeEventEmitter,
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
		createStatusBarItem: () => ({
			show() {},
			dispose() {},
		}),
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
		const proc = new EventEmitter()
		proc.stdout = new EventEmitter()
		proc.stderr = new EventEmitter()
		proc.kill = () => killCalls.push('kill')
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
	spawnedServer.stdout.emit('data', Buffer.from(`3888${tokenOffset % 10} 38877 38876 38878 4560 73422429${tokenOffset % 10}`))
	return started
}

function reset() {
	loggedLines.length = 0
	errorsShown.length = 0
	killCalls.length = 0
}

const tests = {
	'offers Restart Server when the daemon reports audio connection loss': () => {
		reset()
		const main = new Main()
		booted(main, 3)
		spawnedServer.stderr.emit('data', Buffer.from(CONNECTION_LOST + '\n'))
		assert.deepStrictEqual(errorsShown, ['Sonic Pi: Audio server connection lost'])
		assert.ok(
			loggedLines.some((l) => l.includes('audio server connection lost')),
			'log channel should record the loss',
		)
		assert.strictEqual(main.daemonProcess, spawnedServer)
	},

	'debounces repeated connection-loss lines within the outage window': () => {
		reset()
		const main = new Main()
		booted(main, 3)
		spawnedServer.stderr.emit('data', Buffer.from(CONNECTION_LOST + '\n'))
		spawnedServer.stderr.emit('data', Buffer.from('Daemon SuperSonic Conn: reconnected\n'))
		spawnedServer.stderr.emit(
			'data',
			Buffer.from(CONNECTION_LOST.replace('EOFError', 'ECONNRESET') + '\n'),
		)
		assert.strictEqual(errorsShown.length, 1)
	},

	'no notification for run-completion pause lines or unrelated stderr': () => {
		reset()
		const main = new Main()
		booted(main, 3)
		spawnedServer.stderr.emit('data', Buffer.from('Pausing SuperSonic Audio Server\n'))
		spawnedServer.stderr.emit('data', Buffer.from('some noise\n'))
		assert.deepStrictEqual(errorsShown, [])
		assert.strictEqual(main.lastAudioLossNotifiedAt, 0)
	},

	'restarting kills the current daemon process and boots a fresh one': async () => {
		reset()
		const main = new Main()
		await Promise.all([
			booted(main, 3),
			sleep(0).then(() => {
				spawnedServer.stderr.emit('data', Buffer.from(CONNECTION_LOST))
				return sleep(1)
			}),
		])
		const first = spawnedServer
		const restart = main.restartServer()
		await sleep(0)
		const fresh = spawnedServer
		fresh.stdout.emit('data', Buffer.from('38881 38878 38877 38879 4560 734224294'))
		await restart
		assert.ok(killCalls.length === 1, `old daemon killed exactly once, got ${killCalls.length}`)
		assert.notStrictEqual(fresh, first)
		assert.strictEqual(main.serverStarted, true)
		// The ports/token of the fresh daemon are what the extension now uses.
		assert.strictEqual(main.guiUuid, 734224294)
		assert.deepStrictEqual(errorsShown, ['Sonic Pi: Audio server connection lost'])
	},
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
	console.log(
		failures === 0
			? 'all audio recovery tests passed'
			: `${failures} of ${Object.entries(tests).length} tests failed`,
	)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
