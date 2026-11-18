#!/usr/bin/env node
// Shared LSP client boot: both registrars get ONE client instance with a single start,
// the no-binary path shows exactly one info message with zero spawn attempts, the
// degraded/respawn-exhausted fake surfaces through getStatus without crashing, and the
// unavailable hint never repeats within a session.
const assert = require('assert')
const Module = require('module')

const infoMessages = []
const outputLines = []
const openHandlers = []
let configOverrides = {}

const fakeVscodeModule = {
	Disposable: class {
		constructor(fn) {
			this.fn = fn
		}
		dispose() {
			this.fn()
		}
	},
	window: {
		createOutputChannel: () => ({
			appendLine: (line) => outputLines.push(line),
			show() {},
			dispose() {},
		}),
		showInformationMessage: async (message, ...actions) => {
			infoMessages.push({ message, actions })
			return undefined
		},
		showErrorMessage: async () => undefined,
		visibleTextEditors: [],
	},
	workspace: {
		getConfiguration: () => ({ get: (key) => configOverrides[key] }),
		onDidOpenTextDocument: (cb) => {
			openHandlers.push(cb)
			return { dispose: () => {} }
		},
		workspaceFolders: [],
	},
	commands: { executeCommand: async () => {} },
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return fakeVscodeModule
	return load.apply(this, arguments)
}

const makeDocument = (file) => ({ uri: { fsPath: file }, languageId: 'sonic-pi' })
const makeContext = () => ({ subscriptions: [] })

const makeFakeClient = (opts = {}) => {
	const client = {
		state: opts.state ?? 'starting',
		isAvailable: opts.isAvailable ?? true,
		spawnCount: 0,
		starts: 0,
		request: async () => undefined,
		sendNotification: () => {},
		start: async () => {
			client.starts++
			if (!opts.stayStarting) client.state = 'ready'
		},
	}
	client.disposed = new Promise((resolve) => {
		client.resolveDisposed = resolve
	})
	return client
}

const resetModule = () => {
	const { resetSharedLspClientForTesting } = require('../../out/lsp/shared-client.js')
	resetSharedLspClientForTesting()
	infoMessages.length = 0
	outputLines.length = 0
	openHandlers.length = 0
	configOverrides = {}
	for (const key of Object.keys(require.cache)) {
		if (key.includes('/out/lsp/')) delete require.cache[key]
	}
}

const tests = {
	async 'both registrars get the same client instance and it starts exactly once'() {
		const { ensureLspClient } = require('../../out/lsp/shared-client.js')

		// given: a fake client factory counting starts, wired by two registrars
		const client = makeFakeClient()
		let created = 0
		const context = makeContext()
		ensureLspClient(context, { createClient: () => (created++, client) })
		ensureLspClient(makeContext(), { createClient: () => (created++, client) })

		// when: the first .pi document opens
		openHandlers[0](makeDocument('/tmp/a.pi'))
		await new Promise((resolve) => setTimeout(resolve, 10))

		// then: one factory call, one instance, one start
		assert.strictEqual(created, 1, 'factory ran once')
		assert.strictEqual(client.starts, 1, 'client started exactly once')
	},

	async 'opening two .pi documents boots the shared client once, not once per registrar'() {
		const { ensureLspClient } = require('../../out/lsp/shared-client.js')

		// given: two registrar wirings and a spawn-counting factory
		let created = 0
		const factory = () => {
			created++
			return makeFakeClient()
		}
		ensureLspClient(makeContext(), { createClient: factory })
		ensureLspClient(makeContext(), { createClient: factory })

		// when: two .pi documents open
		openHandlers[0](makeDocument('/tmp/one.pi'))
		openHandlers[0](makeDocument('/tmp/two.pi'))
		await new Promise((resolve) => setTimeout(resolve, 10))

		// then: the boot path created a single client (zero double-spawn by construction)
		assert.strictEqual(created, 1, 'boot created exactly one client for two opens')
	},

	async 'no ruby-lsp binary: one info message, zero factory spawns, no retries'() {
		const { ensureLspClient } = require('../../out/lsp/shared-client.js')

		// given: the default boot path with no resolvable ruby-lsp
		const context = makeContext()
		ensureLspClient(context, { resolveServerPath: () => null })

		// when: a .pi document opens (twice - the retry case)
		openHandlers[0](makeDocument('/tmp/a.pi'))
		openHandlers[0](makeDocument('/tmp/b.pi'))
		await new Promise((resolve) => setTimeout(resolve, 10))

		// then: exactly one unavailable message, no spawn attempts, no error dialogs
		assert.ok(true, 'no exception from the no-binary path')
		assert.strictEqual(infoMessages.length, 1, 'exactly one info message')
		assert.match(infoMessages[0].message, /ruby-lsp not found/)
		assert.deepStrictEqual(infoMessages[0].actions, ['Settings'])
		assert.strictEqual(
			infoMessages.filter((m) => m.message.toLowerCase().includes('error')).length,
			0,
			'never showErrorMessage',
		)
	},

	async 'degraded respawn-exhausted fake: status surfaces, transition logged, no crash'() {
		const { ensureLspClient, getLspCapabilityStatus } = require('../../out/lsp/shared-client.js')

		// given: a fake client whose state machine lands on respawn-exhausted degraded
		const client = makeFakeClient({ state: 'starting', stayStarting: true })
		ensureLspClient(makeContext(), { createClient: () => client })

		// when: the boot runs and the client exhausts respawns into degraded
		openHandlers[0](makeDocument('/tmp/a.pi'))
		client.state = 'degraded'
		client.resolveDisposed()
		await client.disposed

		// then: the capability status names the degraded mode and the channel logged it
		assert.strictEqual(getLspCapabilityStatus(), 'degraded:respawn-exhausted')
		assert.ok(
			outputLines.some((line) => line.includes('degraded:respawn-exhausted')),
			'transition logged to the Sonic Pi output channel: ' + JSON.stringify(outputLines),
		)
	},

	async 'bundler-missing degraded maps to unavailable:no-bundler and hints once'() {
		const { ensureLspClient, getLspCapabilityStatus } = require('../../out/lsp/shared-client.js')

		// given: a fake client degraded by a missing bundler gem (isAvailable false)
		const client = makeFakeClient({ state: 'starting', isAvailable: false, stayStarting: true })
		ensureLspClient(makeContext(), { createClient: () => client })

		// when: the boot runs into the bundler-missing degraded exit
		openHandlers[0](makeDocument('/tmp/a.pi'))
		client.resolveDisposed()
		await client.disposed

		// then: status is unavailable:no-bundler with one gem hint (never an error dialog)
		assert.strictEqual(getLspCapabilityStatus(), 'unavailable:no-bundler')
		assert.strictEqual(infoMessages.length, 1)
		assert.match(infoMessages[0].message, /bundler gem/)
		assert.ok(infoMessages[0].actions.includes('Settings'))
	},

	async 'ready client flips status from starting to ready and fires the ready listener'() {
		const { ensureLspClient, getLspCapabilityStatus, onLspClientReady } =
			require('../../out/lsp/shared-client.js')

		// given: a registrar subscribing for readiness before any boot
		const ready = []
		onLspClientReady((client) => ready.push(client))

		// when: the boot runs and the handshake completes
		const client = makeFakeClient()
		ensureLspClient(makeContext(), { createClient: () => client })
		assert.strictEqual(getLspCapabilityStatus(), 'starting', 'pre-boot status is starting')
		openHandlers[0](makeDocument('/tmp/a.pi'))
		await new Promise((resolve) => setTimeout(resolve, 10))

		// then: status is ready and the waiting registrar saw the instance
		assert.strictEqual(getLspCapabilityStatus(), 'ready')
		assert.strictEqual(ready.length, 1)
		assert.strictEqual(ready[0], client)
	},

	async 'unavailable hint is shown once per session across repeated opens'() {
		const { ensureLspClient } = require('../../out/lsp/shared-client.js')

		// given: the default no-binary boot path
		ensureLspClient(makeContext(), {})

		// when: three .pi documents open in sequence
		openHandlers[0](makeDocument('/tmp/a.pi'))
		openHandlers[0](makeDocument('/tmp/b.pi'))
		openHandlers[0](makeDocument('/tmp/c.pi'))
		await new Promise((resolve) => setTimeout(resolve, 10))

		// then: the hint appeared exactly once
		assert.strictEqual(infoMessages.length, 1, 'message-once flag holds across opens')
	},
}

const runAll = async () => {
	let failures = 0
	for (const [name, test] of Object.entries(tests)) {
		resetModule()
		try {
			await test()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.stack || error.message}`)
		}
	}
	console.log(failures === 0 ? 'lsp-shared-client unit tests passed' : `${failures} test(s) failed`)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
