#!/usr/bin/env node
// Per-run wiring and live-loop scope pushes: /run/started names the workspace a run executes
// under (spider-server.rb:1078), which is how a job maps back to the cell that plays it; the
// scope pushes say where each live loop's header sits - /live_loop/scope (:1002) when the
// loop thread comes alive, /live_loop/scope-ended (:1004) when its ensure block ends it.
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
		event(listener) {
			this.on('event', listener)
			return { dispose: () => this.off('event', listener) }
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

const fakeOsc = () => oscInstances[oscInstances.length - 1]

const startedMain = () => {
	oscInstances.length = 0
	const main = new Main()
	main.setupOscReceiver()
	return main
}

const tests = {
	'the scope push fills the store with the loop identity and its headline'() {
		// given
		const main = startedMain()
		// when the daemon reports a live loop coming alive
		fakeOsc().fire('/live_loop/scope', {
			address: '/live_loop/scope',
			args: [11, 'drums', 'a|b', 0, 2],
		})
		// then the loop is alive at its pushed header line
		const entries = main.liveLoopScope.list()
		assert.strictEqual(entries.length, 1)
		assert.deepStrictEqual(
			{
				name: entries[0].name,
				jobid: entries[0].jobid,
				workspace: entries[0].workspace,
				line: entries[0].line,
				scopeNum: entries[0].scopeNum,
			},
			{ name: 'drums', jobid: 11, workspace: 'a|b', line: 0, scopeNum: 2 },
		)
	},

	'the scope push also fires the emitter for the badge surface'() {
		// given
		const main = startedMain()
		const seen = []
		main.onLiveLoopScope.event((push) => seen.push(push))
		// when
		fakeOsc().fire('/live_loop/scope', { address: '/live_loop/scope', args: [4, 'bass', 'a', 9, 1] })
		// then
		assert.deepStrictEqual(seen, [{ jobid: 4, name: 'bass', workspace: 'a', line: 9, scopeNum: 1 }])
	},

	'scope-ended removes exactly that loop and fires the ended emitter'() {
		// given two loops alive, one of them watched
		const main = startedMain()
		const ended = []
		main.onLiveLoopScopeEnded.event((push) => ended.push(push))
		fakeOsc().fire('/live_loop/scope', { address: '/live_loop/scope', args: [1, 'drums', 'a', 2, 0] })
		fakeOsc().fire('/live_loop/scope', { address: '/live_loop/scope', args: [1, 'bass', 'a', 8, 1] })
		// when the drums loop thread's ensure block reports its end
		fakeOsc().fire('/live_loop/scope-ended', {
			address: '/live_loop/scope-ended',
			args: [1, 'drums'],
		})
		// then only the bass badge survives
		assert.deepStrictEqual(
			main.liveLoopScope.list().map((entry) => entry.name),
			['bass'],
		)
		assert.deepStrictEqual(ended, [{ jobid: 1, name: 'drums' }])
	},

	async 'a run start carries its workspace and a cell stop kills only that job'() {
		// given a started window whose ports sender is connected
		const main = startedMain()
		main.guiUuid = 'test-uuid'
		main.portsInitalizedResolver(fakeOsc())
		const started = []
		main.onWorkspaceStarted.event((push) => started.push(push))
		// when the daemon announces a run sent under a block's cell key
		fakeOsc().fire('/run/started', {
			address: '/run/started',
			args: [12, 'file://0:live_loop :a do\n  play 60\nend'],
		})
		// then the workspace rides the push, and the per-run stop kills just that job
		assert.deepStrictEqual(started, [
			{ jobId: 12, workspace: 'file://0:live_loop :a do\n  play 60\nend' },
		])
		await new Promise((resolve) => setTimeout(resolve, 10))
		fakeOsc().sent.length = 0
		main.stopJob(12)
		await new Promise((resolve) => setTimeout(resolve, 10))
		assert.deepStrictEqual(
			fakeOsc().sent.map((message) => [message.address, message.args]),
			[['/stop-job', ['test-uuid', 12]]],
		)
	},

	'a push without a usable name leaves the store untouched'() {
		// given
		const main = startedMain()
		const seen = []
		main.onLiveLoopScope.event((push) => seen.push(push))
		// when the name slot carries no string
		fakeOsc().fire('/live_loop/scope', { address: '/live_loop/scope', args: [1, '', 'a', 2, 0] })
		// then nothing is registered and nothing is announced
		assert.deepStrictEqual(main.liveLoopScope.list(), [])
		assert.deepStrictEqual(seen, [])
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
			? 'all live-loop handler tests passed'
			: `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
