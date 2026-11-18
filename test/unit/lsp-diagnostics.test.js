#!/usr/bin/env node
// Pull diagnostics controller: didOpen + didChange (debounced) send LSP notifications and a
// textDocument/diagnostic pull, server items map 1:1 to vscode diagnostics in a
// DiagnosticCollection, and closing a document clears its squiggles.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const fakeDiagnostics = []
class FakeDiagnostic {
	constructor(range, message, severity) {
		this.range = range
		this.message = message
		this.severity = severity
	}
}
FakeDiagnostic.Error = 0
FakeDiagnostic.Warning = 1
FakeDiagnostic.Information = 2
FakeDiagnostic.Hint = 3

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
		console.error('FAKE DELETE', uri.toString(), 'had', this.byUri.has(uri.toString()), 'keys', [
			...this.byUri.keys(),
		])
		this.byUri.delete(uri.toString())
	}
	clear() {
		this.byUri.clear()
	}
	dispose() {
		this.disposed = true
	}
	get(uri) {
		return this.byUri.get(uri.toString())
	}
}

const fakeVscodeModule = {
	Diagnostic: FakeDiagnostic,
	DiagnosticCollection: FakeDiagnosticCollection,
	DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
	languages: {
		createDiagnosticCollection: (name) => new FakeDiagnosticCollection(name),
	},
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
	Location: class {},
	Disposable: class {
		constructor(fn) {
			this.fn = fn
		}
		dispose() {
			this.fn()
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

const { LspDiagnosticsController } = require('../../out/lsp/diagnostics.js')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-diag-test-'))

const makeDocument = (file, text, languageId = 'sonic-pi') => {
	let currentText = text
	return {
		uri: fakeVscodeModule.Uri.file(file),
		languageId,
		version: 1,
		getText: () => currentText,
		setText: (next) => {
			currentText = next
		},
	}
}

const makeClient = (serverScriptPath, workspacePath) => {
	const { LspClient } = require('../../out/lsp/client.js')
	return new LspClient({ serverPath: serverScriptPath, workspaceFolderUri: workspacePath })
}

const makeServerScript = (responses) => {
	const dir = fs.mkdtempSync(path.join(tmpRoot, 'server-'))
	const markerDir = fs.mkdtempSync(path.join(tmpRoot, 'markers-'))
	const script = path.join(dir, 'fake-ruby-lsp-diag.js')
	fs.writeFileSync(
		script,
		[
			'#!/usr/bin/env node',
			`const RESPONSES = ${JSON.stringify(responses)}`,
			`const MARKER_DIR = ${JSON.stringify(markerDir)}`,
			'const FS = require("fs")',
			'const marker = (name, data) => {',
		'  const tmp = `${MARKER_DIR}/${name}.tmp`',
		'  FS.writeFileSync(tmp, JSON.stringify(data))',
		'  FS.renameSync(tmp, `${MARKER_DIR}/${name}.json`) // atomic: readers never see a truncated file',
		'}',
			'let buffer = Buffer.alloc(0)',
			// REAL LSP stdio framing: Content-Length header + \r\n\r\n + body.
			'const send = (msg) => {',
			'  const body = JSON.stringify(msg)',
			'  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\\r\\n\\r\\n${body}`)',
			'}',
			'process.stdin.on("data", (chunk) => {',
			'  buffer = Buffer.concat([buffer, chunk])',
			'  for (;;) {',
			'    const sep = buffer.indexOf("\\r\\n\\r\\n")',
			'    if (sep < 0) break',
			'    const header = buffer.slice(0, sep).toString()',
			'    const match = header.match(/Content-Length: (\\d+)/i)',
			'    if (!match) { buffer = buffer.slice(sep + 4); continue }',
			'    const length = parseInt(match[1], 10)',
			'    const bodyStart = sep + 4',
			'    if (buffer.length < bodyStart + length) break',
			'    const body = buffer.slice(bodyStart, bodyStart + length).toString()',
			'    buffer = buffer.slice(bodyStart + length)',
			'    const msg = JSON.parse(body)',
			'    if (msg.method === "initialize") send({ id: msg.id, result: { capabilities: {} } })',
			'    else if (msg.method === "textDocument/diagnostic") {',
			'      FS.appendFileSync(MARKER_DIR + "/pulls.log", JSON.stringify(msg.params) + "\\n")',
			'      send({ id: msg.id, result: { kind: "full", items: RESPONSES.items } })',
			'    } else marker((msg.method || "unknown").replace(/\\//g, "_"), msg.params)',
			'  }',
			'})',
		].join('\n'),
	)
	fs.chmodSync(script, 0o755)
	return { script, markerDir }
}

const readMarker = (markerDir, name) => {
	const file = path.join(markerDir, name + '.json')
	if (!fs.existsSync(file)) return undefined
	return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async (predicate, label) => {
	for (let i = 0; i < 100; i++) {
		if (predicate()) return
		await sleep(25)
	}
	assert.fail('timeout waiting for ' + label)
}

// given: client fake server answers pulls with one error item
const run = async () => {
	const responses = {
		items: [
			{
				range: { start: { line: 1, character: 2 }, end: { line: 1, character: 7 } },
				message: 'unexpected end',
				severity: 1,
				source: 'Ruby LSP',
				code: 'Prism',
			},
		],
	}
	const { script, markerDir } = makeServerScript(responses)
	const workspace = fs.mkdtempSync(path.join(tmpRoot, 'ws-'))
	const client = makeClient(script, workspace)
	await client.start()
	const controller = new LspDiagnosticsController(client, { debounceMs: 50 })
	const document = makeDocument(path.join(workspace, 'missend.pi'), 'live_loop :x do\n  samp')
	controller.start()
	vscodeHandlers.onOpen(document)
	await waitFor(() => fakeDiagnostics[0].byUri.size > 0, 'published diagnostics')

	// then: didOpen reached the server for the open document
	const opened = readMarker(markerDir, 'textDocument_didOpen')
	assert.ok(opened, 'didOpen marker missing')
	assert.equal(opened.textDocument.text, 'live_loop :x do\n  samp')

	// then: pulled diagnostics mapped 1:1 to a vscode.Diagnostic in the collection
	const entry = fakeDiagnostics[0].byUri.get(document.uri.toString())
	assert.ok(entry, 'no diagnostics published for open document')
	assert.equal(entry.length, 1)
	const diag = entry[0]
	assert.equal(typeof diag.range, 'object')
	assert.equal(diag.message, 'unexpected end')
	assert.equal(diag.severity, FakeDiagnostic.Error)
	assert.equal(diag.source, 'Ruby LSP')
	assert.deepEqual(diag.range, {
		start: { line: 1, character: 2 },
		end: { line: 1, character: 7 },
	})

	// when: the document changes
	document.version = 2
	document.setText('live_loop :x do\n  sample :bd')
	vscodeHandlers.onChange({ document, contentChanges: [{ text: 'live_loop :x do\n  sample :bd' }] })
	await waitFor(
		() =>
			fs.existsSync(markerDir + '/pulls.log') &&
			fs
				.readFileSync(markerDir + '/pulls.log', 'utf8')
				.trim()
				.split('\n').length >= 2,
		'debounced pull for version 2',
	)
	// then: didChange carried the new text
	const changed = readMarker(markerDir, 'textDocument_didChange')
	assert.ok(changed, 'didChange marker missing')
	assert.equal(changed.textDocument.version, 2)
	assert.equal(changed.contentChanges[0].text, 'live_loop :x do\n  sample :bd')

	// when: the document closes
	controller.dispose()
	await client.dispose()
}
const main = async () => {
	await run()
	console.log('publish-maps-server-items ok')
	await runCloseClears()
	console.log('close-clears-diagnostics ok')
	await runDebounce()
	console.log('change-debounce-pulls-once ok')
}

const runCloseClears = async () => {
	const { script, markerDir } = makeServerScript({ items: [] })
	const workspace = fs.mkdtempSync(path.join(tmpRoot, 'ws-close-'))
	const client = makeClient(script, workspace)
	await client.start()
	const controller = new LspDiagnosticsController(client, { debounceMs: 10 })
	const document = makeDocument(path.join(workspace, 'bad.pi'), 'end')
	controller.start()
	vscodeHandlers.onOpen(document)
	await waitFor(() => fakeDiagnostics[1].byUri.size > 0, 'initial publication')

	// when: the document closes
	vscodeHandlers.onClose(document)
	// then: its diagnostics are removed from the collection
	assert.equal(fakeDiagnostics[1].byUri.size, 0, 'squiggles survived didClose')

	controller.dispose()
	await client.dispose()
}

const runDebounce = async () => {
	const { script, markerDir } = makeServerScript({ items: [] })
	const workspace = fs.mkdtempSync(path.join(tmpRoot, 'ws-debounce-'))
	const client = makeClient(script, workspace)
	await client.start()
	const controller = new LspDiagnosticsController(client, { debounceMs: 120 })
	const document = makeDocument(path.join(workspace, 'rapid.pi'), 'sample :bd')
	controller.start()
	vscodeHandlers.onOpen(document)
	try {
		await waitFor(() => fakeDiagnostics[2] && fakeDiagnostics[2].byUri.size > 0, 'open pull')
	} catch (e) {
		console.error(
			'COLLECTIONS',
			fakeDiagnostics.length,
			fakeDiagnostics.map((c) => c.name),
		)
		throw e
	}

	// when: three edits land inside the debounce window
	for (let v = 2; v <= 4; v++) {
		document.version = v
		document.setText('sample :bd')
		vscodeHandlers.onChange({ document, contentChanges: [{ text: 'sample :bd' }] })
		await sleep(15)
	}
	await sleep(200)
	// then: one debounced pull after the last edit, at the latest version
	const pullLines = fs
		.readFileSync(markerDir + '/pulls.log', 'utf8')
		.trim()
		.split('\n')
	assert.equal(pullLines.length, 2, 'expected exactly two pulls (open + one debounced change)')
	const changedMarker = readMarker(markerDir, 'textDocument_didChange')
	assert.equal(changedMarker.textDocument.version, 4, 'debounced didChange must carry the latest version')

	controller.dispose()
	await client.dispose()
}

main()
