#!/usr/bin/env node
// Real-server smoke: the ce06 client + pull diagnostics controller against /usr/bin/ruby-lsp.
// A missing-end .pi fixture must yield >=1 Prism diagnostic; a clean live_loop fixture must
// yield zero. Skips when ruby-lsp is absent (CI has none).
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

let rubyLsp = null
try {
	rubyLsp = execFileSync('which', ['ruby-lsp'], { encoding: 'utf8' }).trim()
} catch {
	// fallthrough
}
if (!rubyLsp || !fs.existsSync(rubyLsp)) {
	console.log('skip - ruby-lsp not installed')
	process.exit(0)
}

const fakeDiagnostics = []
class FakeDiagnosticCollection {
	constructor(name) {
		this.name = name
		this.byUri = new Map()
		fakeDiagnostics.push(this)
	}
	set(uriOrEntries, maybeDiags) {
		if (maybeDiags) {
			this.byUri.set(uriOrEntries.toString(), maybeDiags)
			return
		}
		for (const [uri, diags] of uriOrEntries) this.byUri.set(uri.toString(), diags)
	}
	delete(uri) {
		this.byUri.delete(uri.toString())
	}
	clear() {
		this.byUri.clear()
	}
	dispose() {}
	get(uri) {
		return this.byUri.get(uri.toString())
	}
}

const fakeVscodeModule = {
	Diagnostic: class {
		constructor(range, message, severity) {
			this.range = range
			this.message = message
			this.severity = severity
		}
	},
	DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
	languages: { createDiagnosticCollection: (n) => new FakeDiagnosticCollection(n) },
	workspace: {
		onDidOpenTextDocument: (cb) => {
			vscodeHandlers.onOpen = cb
			return { dispose: () => {} }
		},
		onDidChangeTextDocument: (cb) => {
			vscodeHandlers.onChange = cb
			return { dispose: () => {} }
		},
		onDidCloseTextDocument: (cb) => {
			vscodeHandlers.onClose = cb
			return { dispose: () => {} }
		},
	},
	Uri: { file: (p) => ({ scheme: 'file', fsPath: p, toString: () => 'file://' + encodeURI(p) }) },
	Range: class {
		constructor(sl, sc, el, ec) {
			this.start = { line: sl, character: sc }
			this.end = { line: el, character: ec }
		}
	},
}
const vscodeHandlers = {}

const Module = require('module')
const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return fakeVscodeModule
	return load.apply(this, arguments)
}

const { LspClient } = require('../../out/lsp/client.js')
const { LspDiagnosticsController } = require('../../out/lsp/diagnostics.js')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async (predicate, label) => {
	for (let i = 0; i < 400; i++) {
		if (predicate()) return
		await sleep(25)
	}
	assert.fail('timeout waiting for ' + label)
}

const makeDocument = (file, text) => ({
	uri: fakeVscodeModule.Uri.file(file),
	languageId: 'sonic-pi',
	version: 1,
	getText: () => text,
})

const run = async () => {
	// given: a real ruby-lsp server over a temp workspace
	const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-smoke-ws-'))
	const client = new LspClient({ serverPath: rubyLsp, workspaceFolderUri: workspace })
	await client.start()
	const controller = new LspDiagnosticsController(client, { debounceMs: 50 })
	controller.start()

	// when: a missing-end fixture is opened
	const badPath = path.join(workspace, 'missing-end.pi')
	fs.writeFileSync(badPath, 'live_loop :drums do\n  sample :bd_haus\n')
	vscodeHandlers.onOpen(makeDocument(badPath, 'live_loop :drums do\n  sample :bd_haus\n'))
	await waitFor(
		() => fakeDiagnostics[0].byUri.get(fakeVscodeModule.Uri.file(badPath).toString()) !== undefined,
		'pull result for missing-end fixture (Ruby LSP may take a moment on first pull)',
	)

	// then: at least one Prism diagnostic
	const badDiags = fakeDiagnostics[0].byUri.get(fakeVscodeModule.Uri.file(badPath).toString())
	assert.ok(badDiags.length >= 1, 'expected >=1 diagnostic for missing-end, got 0')

	// when: a clean live_loop/sample fixture is opened
	const cleanPath = path.join(workspace, 'clean.pi')
	fs.writeFileSync(cleanPath, 'live_loop :drums do\n  sample :bd_haus\n  sleep 1\nend\n')
	vscodeHandlers.onOpen(makeDocument(cleanPath, 'live_loop :drums do\n  sample :bd_haus\n  sleep 1\nend\n'))
	await waitFor(
		() => fakeDiagnostics[0].byUri.get(fakeVscodeModule.Uri.file(cleanPath).toString()) !== undefined,
		'pull result for clean fixture',
	)

	// then: zero items
	const cleanDiags = fakeDiagnostics[0].byUri.get(fakeVscodeModule.Uri.file(cleanPath).toString())
	assert.equal(cleanDiags.length, 0, 'expected zero diagnostics for clean fixture')

	console.log('real-server smoke ok: missing-end -> ' + badDiags.length + ' Prism item(s); clean -> 0')
	controller.dispose()
	await client.dispose()
}

run().catch((error) => {
	console.error('smoke failed:', error.message)
	process.exit(1)
})
