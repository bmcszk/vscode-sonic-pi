#!/usr/bin/env node
// LSP hover/definition pass-through controller: providers forward textDocument/hover and
// textDocument/definition to the client (1:1 positions), normalize LSP results to vscode
// shapes, resolve null when the client is not ready or the request rejects, and the
// registrar registers exactly one HoverProvider and one DefinitionProvider per selector
// without adding any completion provider.
const assert = require('assert')
const Module = require('module')

const fakeRegistry = { hovers: [], definitions: [], completions: [] }
const vscodeHandlers = {}

class FakeDisposable {
	constructor(fn) {
		this.fn = fn
	}
	dispose() {
		this.fn()
	}
}

class FakePosition {
	constructor(line, character) {
		this.line = line
		this.character = character
	}
}

class FakeRange {
	constructor(sl, sc, el, ec) {
		this.start = { line: sl, character: sc }
		this.end = { line: el, character: ec }
	}
}

class FakeUri {
	constructor(fsPath) {
		this.scheme = 'file'
		this.fsPath = fsPath
	}
	toString() {
		return 'file://' + encodeURI(this.fsPath)
	}
}

class FakeLocation {
	constructor(uri, range) {
		this.uri = uri
		this.range = range
	}
}

class FakeMarkdownString {
	constructor(value) {
		this.value = value
	}
}

const fakeVscodeModule = {
	Uri: {
		parse: (s) => new FakeUri(s.replace('file://', '')),
	},
	Position: FakePosition,
	Range: FakeRange,
	Location: FakeLocation,
	MarkdownString: FakeMarkdownString,
	Hover: class {
		constructor(contents, range) {
			this.contents = contents
			this.range = range
		}
	},
	Disposable: FakeDisposable,
	languages: {
		registerHoverProvider: (_selector, provider) => {
			fakeRegistry.hovers.push(provider)
			return new FakeDisposable(() => {})
		},
		registerDefinitionProvider: (_selector, provider) => {
			fakeRegistry.definitions.push(provider)
			return new FakeDisposable(() => {})
		},
		registerCompletionItemProvider: (_selector, provider) => {
			fakeRegistry.completions.push(provider)
			return new FakeDisposable(() => {})
		},
	},
	workspace: {
		getConfiguration: () => ({ get: (_key, fallback) => fallback }),
		onDidOpenTextDocument: (cb) => {
			vscodeHandlers.onOpen = cb
			return { dispose: () => {} }
		},
		workspaceFolders: [],
	},
	window: { visibleTextEditors: [] },
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return fakeVscodeModule
	return load.apply(this, arguments)
}

const makeDocument = (file, text) => ({
	uri: new FakeUri(file),
	languageId: 'sonic-pi',
	version: 1,
	getText: () => text,
})

const makeClient = (reply) => {
	const calls = []
	return {
		calls,
		request: async (method, params) => {
			calls.push({ method, params })
			return reply(method, params)
		},
		sendNotification: () => {},
	}
}

const NULL_RESULT = undefined

const tests = {
	async 'hover forwards method and 1:1 position to the client and maps string contents'() {
		const { LspHoverController } = require('../../out/lsp/hover.js')
		const client = makeClient((method) =>
			method === 'textDocument/hover' ? { contents: 'sample docs' } : null,
		)
		const controller = new LspHoverController(client)
		const document = makeDocument('/tmp/a.pi', 'sample :loop_amen\n')

		// when: provideHover at line 0, character 2
		const hover = await controller.provideHover(document, new FakePosition(0, 2), undefined)

		// then: the client saw the LSP request with the exact position
		assert.strictEqual(client.calls.length, 1)
		assert.strictEqual(client.calls[0].method, 'textDocument/hover')
		assert.deepStrictEqual(client.calls[0].params.position, { line: 0, character: 2 })
		assert.ok(client.calls[0].params.textDocument.uri.includes('/tmp/a.pi'))
		assert.ok(hover instanceof FakeMarkdownString === false)
		assert.strictEqual(hover.contents[0].value, 'sample docs')
	},

	async 'hover maps {value,language} contents form to MarkdownString'() {
		const { LspHoverController } = require('../../out/lsp/hover.js')
		const client = makeClient(() => ({ contents: { value: 'x = 1', language: 'ruby' } }))
		const controller = new LspHoverController(client)
		const hover = await controller.provideHover(
			makeDocument('/tmp/b.pi', 'x = 1\n'),
			new FakePosition(0, 0),
			undefined,
		)
		assert.strictEqual(hover.contents[0].value, 'x = 1')
		assert.strictEqual(hover.contents[0].language, 'ruby')
	},

	async 'hover on plain ruby with a markedstring array maps each element'() {
		const { LspHoverController } = require('../../out/lsp/hover.js')
		const client = makeClient(() => ({
			contents: ['plain text', { value: 'puts 1', language: 'ruby' }],
		}))
		const controller = new LspHoverController(client)
		const hover = await controller.provideHover(
			makeDocument('/tmp/c.pi', 'puts 1\n'),
			new FakePosition(0, 1),
			undefined,
		)
		assert.strictEqual(hover.contents.length, 2)
		assert.strictEqual(hover.contents[0].value, 'plain text')
		assert.strictEqual(hover.contents[1].value, 'puts 1')
	},

	async 'hover with no client request reply (null result) resolves null'() {
		const { LspHoverController } = require('../../out/lsp/hover.js')
		const client = makeClient(() => null)
		const controller = new LspHoverController(client)
		const hover = await controller.provideHover(
			makeDocument('/tmp/d.pi', 'puts 1\n'),
			new FakePosition(0, 0),
			undefined,
		)
		assert.strictEqual(hover, undefined)
	},

	async 'not-ready client (request rejects) -> hover resolves null with no unhandled rejection'() {
		const { LspHoverController } = require('../../out/lsp/hover.js')
		const unhandled = []
		process.on('unhandledRejection', (e) => unhandled.push(e))
		const client = {
			request: () => Promise.reject(new Error('request timed out')),
			sendNotification: () => {},
		}
		const controller = new LspHoverController(client)
		const hover = await controller.provideHover(
			makeDocument('/tmp/e.pi', 'puts 1\n'),
			new FakePosition(0, 0),
			undefined,
		)
		assert.strictEqual(hover, undefined)
		assert.strictEqual(unhandled.length, 0)
	},

	async 'definition forwards to the client and maps Location result'() {
		const { LspHoverController } = require('../../out/lsp/hover.js')
		const client = makeClient((method) =>
			method === 'textDocument/definition'
				? {
						uri: 'file:///tmp/def.pi',
						range: { start: { line: 3, character: 0 }, end: { line: 3, character: 5 } },
					}
				: null,
		)
		const controller = new LspHoverController(client)
		const locations = await controller.provideDefinition(
			makeDocument('/tmp/f.pi', 'x = 1\n'),
			new FakePosition(0, 0),
			undefined,
		)
		assert.strictEqual(client.calls[0].method, 'textDocument/definition')
		assert.deepStrictEqual(client.calls[0].params.position, { line: 0, character: 0 })
		assert.strictEqual(locations.length, 1)
		assert.ok(locations[0] instanceof FakeLocation)
		assert.strictEqual(locations[0].uri.fsPath, '/tmp/def.pi')
		assert.deepStrictEqual(locations[0].range.start, { line: 3, character: 0 })
	},

	async 'definition maps a Location[] result to vscode locations'() {
		const { LspHoverController } = require('../../out/lsp/hover.js')
		const client = makeClient(() => [
			{
				uri: 'file:///tmp/one.pi',
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
			},
			{
				uri: 'file:///tmp/two.pi',
				range: { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } },
			},
		])
		const controller = new LspHoverController(client)
		const locations = await controller.provideDefinition(
			makeDocument('/tmp/g.pi', 'x = 1\n'),
			new FakePosition(0, 0),
			undefined,
		)
		assert.strictEqual(locations.length, 2)
		assert.strictEqual(locations[1].uri.fsPath, '/tmp/two.pi')
	},

	async 'not-ready client -> definition resolves null, no crash'() {
		const { LspHoverController } = require('../../out/lsp/hover.js')
		const client = { request: () => Promise.reject(new Error('not ready')), sendNotification: () => {} }
		const controller = new LspHoverController(client)
		const locations = await controller.provideDefinition(
			makeDocument('/tmp/h.pi', 'x = 1\n'),
			new FakePosition(0, 0),
			undefined,
		)
		assert.strictEqual(locations, undefined)
	},

	async 'registrar registers exactly one hover and one definition provider, zero completions'() {
		const beforeHovers = fakeRegistry.hovers.length
		const beforeCompletions = fakeRegistry.completions.length
		const { registerLspLanguageFeatures } = require('../../out/lsp/hover.js')

		// given: a fresh context, no .pi document opened yet
		const subscriptions = []
		const context = { subscriptions, asAbsolutePath: (rel) => '/tmp/' + rel }

		// when: the registrar runs
		registerLspLanguageFeatures(context)

		// then: exactly one hover + one definition provider on top of existing registrations,
		// and no completion provider was added anywhere
		assert.strictEqual(fakeRegistry.hovers.length - beforeHovers, 1)
		assert.strictEqual(fakeRegistry.definitions.length, 1)
		assert.strictEqual(fakeRegistry.completions.length, beforeCompletions)
		assert.ok(subscriptions.length >= 2, 'registrar pushes disposables')
	},

	async 'no double hover: opening the same .pi document twice does not re-register providers'() {
		const beforeHovers = fakeRegistry.hovers.length
		const { registerLspLanguageFeatures, bootLspClientForTesting } = require('../../out/lsp/hover.js')

		// given: a registrar context
		const context = { subscriptions: [], asAbsolutePath: (rel) => '/tmp/' + rel }
		registerLspLanguageFeatures(context)

		// when: two .pi documents open (each triggers the boot listener)
		vscodeHandlers.onOpen(makeDocument('/tmp/one.pi', 'puts 1\n'))
		vscodeHandlers.onOpen(makeDocument('/tmp/two.pi', 'puts 2\n'))

		// then: provider count unchanged; the boot ran once (single client build)
		assert.strictEqual(fakeRegistry.hovers.length - beforeHovers, 1)
		const booted = bootLspClientForTesting()
		assert.strictEqual(booted, undefined, 'no client without a configured ruby-lsp path')
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
	console.log(failures === 0 ? 'lsp-hover unit tests passed' : `${failures} lsp-hover test(s) failed`)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
