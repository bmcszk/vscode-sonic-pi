#!/usr/bin/env node
// The rubyLsp.enabled toggle: off means the shared client never creates, starts, or
// spawns anything, shows no hint message, and reports capability 'off'; default-on
// boots exactly like before.
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

const makeFakeClient = () => {
	const client = {
		state: 'starting',
		isAvailable: true,
		spawnCount: 0,
		starts: 0,
		request: async () => undefined,
		sendNotification: () => {},
		start: async () => {
			client.starts++
			client.state = 'ready'
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
	async 'rubyLsp.enabled=false never creates or starts a client, shows no hint, reports off'() {
		const { ensureLspClient, getLspCapabilityStatus } = require('../../out/lsp/shared-client.js')

		// given: the toggle is off and a factory counting creations
		configOverrides = { 'rubyLsp.enabled': false }
		let created = 0
		const client = makeFakeClient()
		ensureLspClient(makeContext(), { createClient: () => (created++, client) })

		// when: a .pi document opens
		openHandlers[0](makeDocument('/tmp/a.pi'))
		await new Promise((resolve) => setTimeout(resolve, 10))

		// then: zero creation, zero starts, zero spawns, no info message, status off
		assert.strictEqual(created, 0, 'no client created')
		assert.strictEqual(client.starts, 0, 'no client started')
		assert.strictEqual(client.spawnCount, 0, 'zero spawns')
		assert.strictEqual(infoMessages.length, 0, 'no info message')
		assert.strictEqual(getLspCapabilityStatus(), 'off')
	},

	async 'default (no enabled key) boots the shared client as before'() {
		const { ensureLspClient, getLspCapabilityStatus } = require('../../out/lsp/shared-client.js')

		// given: no toggle key set, a working fake client
		const client = makeFakeClient()
		ensureLspClient(makeContext(), { createClient: () => client })

		// when: a .pi document opens
		openHandlers[0](makeDocument('/tmp/b.pi'))
		await new Promise((resolve) => setTimeout(resolve, 10))

		// then: the client started and reached ready
		assert.strictEqual(client.starts, 1, 'client started')
		assert.strictEqual(getLspCapabilityStatus(), 'ready')
	},
}

const main = async () => {
	const only = process.argv[2]
	let failed = 0
	for (const [name, fn] of Object.entries(tests)) {
		if (only && !name.includes(only)) continue
		resetModule()
		try {
			await fn()
			console.log(`ok - ${name}`)
		} catch (err) {
			failed++
			console.log(`FAIL - ${name}`)
			console.log(err.message)
		}
	}
	process.exit(failed ? 1 : 0)
}
main()
