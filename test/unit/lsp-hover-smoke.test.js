#!/usr/bin/env node
// Real-server smoke: hover/definition pass-through against /usr/bin/ruby-lsp over a
// fixture with `sample :loop_amen`. The assertion is NO CRASH + resolution within timeout
// (ruby-lsp may legitimately return null for DSL methods). Definition on a local variable
// must resolve too. Skips when ruby-lsp is absent.
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

const fakeVscodeModule = {
	Position: FakePosition,
	Range: FakeRange,
	Location: class {},
	MarkdownString: class {
		constructor(value) {
			this.value = value
		}
	},
	Hover: class {
		constructor(contents) {
			this.contents = contents
		}
	},
	Uri: { parse: (s) => new FakeUri(s.replace('file://', '')) },
}

const Module = require('module')
const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return fakeVscodeModule
	return load.apply(this, arguments)
}

const { LspClient } = require('../../out/lsp/client.js')
const { LspHoverController } = require('../../out/lsp/hover.js')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const makeDocument = (file, text) => ({
	uri: new FakeUri(file),
	languageId: 'sonic-pi',
	version: 1,
	getText: () => text,
})

const run = async () => {
	// given: a real ruby-lsp server over a temp workspace with a sample fixture
	const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-hover-smoke-'))
	const fixturePath = path.join(workspace, 'sample-fixture.pi')
	const fixtureText = 'sample :loop_amen\nx = 1\nputs x\n'
	fs.writeFileSync(fixturePath, fixtureText)
	const client = new LspClient({ serverPath: rubyLsp, workspaceFolderUri: workspace })
	await client.start()
	const controller = new LspHoverController(client)
	const document = makeDocument(fixturePath, fixtureText)

	// when: hovering over `sample` on line 0 (character 2, inside the word)
	// then: resolves without error within the client timeout (result may be null)
	let hover
	try {
		hover = await controller.provideHover(document, new FakePosition(0, 2))
	} finally {
		// when: definition on the local variable `x` (line 2, character 5)
		// then: resolves without error (null allowed for DSL-only servers)
		const locations = await controller.provideDefinition(document, new FakePosition(2, 5))
		assert.ok(
			locations === undefined || Array.isArray(locations),
			'definition must resolve to an array or null, not crash',
		)
		console.log(
			`real-server hover smoke ok: hover=${hover === undefined ? 'null' : 'mapped'}, definition=${locations === undefined ? 'null' : locations.length + ' location(s)'}`,
		)
		await client.dispose()
	}
	assert.ok(
		hover === undefined || hover.contents !== undefined,
		'hover must resolve to null or a Hover, not crash',
	)
}

const main = async () => {
	await run()
	process.exit(0)
}

main().catch((error) => {
	console.error('smoke failed:', error.message)
	process.exit(1)
})

// keep node from hanging if the client left a socket open
setTimeout(() => {
	console.error('smoke timed out')
	process.exit(1)
}, 30000).unref()
