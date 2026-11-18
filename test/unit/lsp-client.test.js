#!/usr/bin/env node
// LSP client lifecycle: binary discovery, spawn env/cwd, JSON-RPC handshake, bounded
// respawn then degraded, dispose with SIGTERM-then-SIGKILL and no orphan. The server
// under test is a plain node JSON-RPC echo script spawned for real over stdio.
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync, spawn } = require('child_process')

const vscodeStubModule = {
	workspace: {
		getConfiguration: (section) => ({
			get: (key) => configOverrides[section]?.[key],
		}),
	},
}
let configOverrides = {}

const Module = require('module')
const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStubModule
	return load.apply(this, arguments)
}

const { discoverRubyLsp, resolveRubyLspPathFromConfig, LspClient } = require('../../out/lsp/client.js')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-client-test-'))

let serverSeq = 0

const makeServerScript = (opts = {}) => {
	const dir = fs.mkdtempSync(path.join(tmpRoot, 'server-'))
	const markerDir = fs.mkdtempSync(path.join(tmpRoot, 'markers-'))
	const script = path.join(dir, `fake-ruby-lsp-${++serverSeq}.js`)
	const lines = [
		'#!/usr/bin/env node',
		`const MARKER_DIR = ${JSON.stringify(markerDir)}`,
		`const CAPTURE_RAW = ${opts.captureRaw ? 'true' : 'false'}`,
		`const EXIT_AFTER_INIT = ${JSON.stringify(opts.exitAfterInit || null)}`,
		`const IGNORE_SIGTERM = ${opts.ignoreSigterm ? 'true' : 'false'}`,
		`const BUNDLER_MISSING = ${opts.bundlerMissing ? 'true' : 'false'}`,
		`const FS = require('fs')`,
		'const marker = (name, data) => {',
		'  const tmp = `${MARKER_DIR}/${name}.tmp`',
		'  FS.writeFileSync(tmp, JSON.stringify(data))',
		'  FS.renameSync(tmp, `${MARKER_DIR}/${name}.json`) // atomic: readers never see a truncated file',
		'}',
		'if (BUNDLER_MISSING) {',
		'  process.stderr.write("cannot load such file -- bundler\\n")',
		'  process.exit(1)',
		'}',
		'marker("spawn", { pid: process.pid, cwd: process.cwd(), bundleGemfile: process.env.BUNDLE_GEMFILE })',
		'if (CAPTURE_RAW) process.stdin.once("data", (chunk) => marker("raw", { head: chunk.toString().slice(0, 80) }))',
		'let buffer = Buffer.alloc(0)',
		'const reply = (msg) => {',
		'  if (msg.method === "initialize") {',
		'    marker("initialize", msg.params)',
		'    send({ id: msg.id, result: { capabilities: {} } })',
		'  } else if (msg.method === "initialized") {',
		'    marker("initialized", {})',
		'  }',
		'}',
		// REAL LSP stdio framing (LSP spec base protocol): Content-Length header + \r\n\r\n + body.
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
		'    reply(JSON.parse(body))',
		'  }',
		'})',
		'if (IGNORE_SIGTERM) process.on("SIGTERM", () => marker("sigterm-ignored", {}))',
	]
	// exit-after-init: schedule a delayed exit once the handshake completes
	if (opts.exitAfterInit) {
		lines.splice(
			lines.length - 2,
			0,
			'  if (msg.method === "initialized" && EXIT_AFTER_INIT) {',
			`    setTimeout(() => process.exit(${opts.exitAfterInit}), EXIT_AFTER_INIT_DELAY_MS || 5)`,
			'  }',
		)
		lines.splice(
			lines.length - 4,
			0,
			`const EXIT_AFTER_INIT_DELAY_MS = ${opts.exitAfterInitDelayMs || 5}`,
		)
	}
	fs.writeFileSync(script, lines.join('\n'))
	fs.chmodSync(script, 0o755)
	return { script, markerDir }
}

const readMarker = (markerDir, name) => {
	const file = path.join(markerDir, `${name}.json`)
	if (!fs.existsSync(file)) return undefined
	return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const waitFor = async (predicate, what, timeoutMs = 3000) => {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		const value = predicate()
		if (value) return value
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error(`timed out waiting for ${what}`)
}

const mkdirWithRubyLsp = () => {
	const dir = fs.mkdtempSync(path.join(tmpRoot, 'bin-'))
	const bin = path.join(dir, 'ruby-lsp')
	fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n')
	fs.chmodSync(bin, 0o755)
	return dir
}

const tests = {
	async 'requests carry the Content-Length header the LSP spec requires'() {
		const { script, markerDir } = makeServerScript({ captureRaw: true })
		const client = new LspClient({ serverPath: script, workspaceFolderUri: tmpRoot })
		await client.start()
		const raw = readMarker(markerDir, 'raw')
		assert.ok(raw, 'server received bytes')
		assert.match(raw.head, /Content-Length: \d+\r\n\r\n/, 'request bytes are header-framed')
		await client.dispose()
	},
	async 'parses Content-Length-framed replies from a spec-conformant server'() {
		// The harness send() speaks real framing; reaching ready proves the parser reads it.
		const { script, markerDir } = makeServerScript()
		const client = new LspClient({ serverPath: script, workspaceFolderUri: tmpRoot })
		await client.start()
		assert.ok(readMarker(markerDir, 'initialize'), 'initialize completed under real framing')
		await client.dispose()
	},
	async 'discovery honors the rubyLspPath setting override'() {
		const binDir = mkdirWithRubyLsp()
		const override = path.join(binDir, 'ruby-lsp')
		assert.strictEqual(discoverRubyLsp(override, ''), override)
	},

	async 'discovery falls back to a PATH scan when no override is set'() {
		const binDir = mkdirWithRubyLsp()
		assert.strictEqual(discoverRubyLsp(undefined, binDir), path.join(binDir, 'ruby-lsp'))
	},

	async 'discovery returns null when ruby-lsp is nowhere on PATH'() {
		const emptyDir = fs.mkdtempSync(path.join(tmpRoot, 'empty-bin-'))
		assert.strictEqual(discoverRubyLsp(undefined, emptyDir), null)
	},

	async 'resolveRubyLspPathFromConfig reads vscode-sonic-pi.rubyLspPath and falls back to PATH scan'() {
		const binDir = mkdirWithRubyLsp()
		configOverrides = { 'vscode-sonic-pi': { rubyLspPath: path.join(binDir, 'ruby-lsp') } }
		try {
			assert.strictEqual(resolveRubyLspPathFromConfig(), path.join(binDir, 'ruby-lsp'))
		} finally {
			configOverrides = {}
		}
	},

	async 'spawn sets BUNDLE_GEMFILE to a dummy path and cwd to the workspace folder'() {
		const { script, markerDir } = makeServerScript()
		const workspace = fs.mkdtempSync(path.join(tmpRoot, 'ws-'))
		const client = new LspClient({ serverPath: script, workspaceFolderUri: workspace })
		await client.start()
		await waitFor(() => client.state === 'ready', 'ready state')
		const spawned = readMarker(markerDir, 'spawn')
		assert.ok(spawned, 'fake server was spawned')
		assert.strictEqual(spawned.cwd, workspace, 'cwd is the workspace folder')
		assert.ok(spawned.bundleGemfile, 'BUNDLE_GEMFILE is set')
		await client.dispose()
	},

	async 'handshake carries workspaceFolders and the sonic-pi documentSelector'() {
		const { script, markerDir } = makeServerScript()
		const workspace = fs.mkdtempSync(path.join(tmpRoot, 'handshake-'))
		const client = new LspClient({ serverPath: script, workspaceFolderUri: workspace })
		await client.start()
		await waitFor(() => client.state === 'ready', 'ready state')
		const params = readMarker(markerDir, 'initialize')
		assert.ok(params, 'initialize reached the server')
		assert.strictEqual(params.workspaceFolders[0].uri, 'file://' + encodeUriPath(workspace))
		assert.deepStrictEqual(params.documentSelector, [{ language: 'sonic-pi', scheme: 'file' }])
		assert.ok(
			fs.existsSync(path.join(markerDir, 'initialized.json')),
			'initialized notification followed the reply',
		)
		await client.dispose()
	},

	async 'percent-encodes special characters in the workspace folder uri'() {
		const base = fs.mkdtempSync(path.join(tmpRoot, 'uri-'))
		const workspace = path.join(base, 'my dir')
		fs.mkdirSync(workspace)
		const { script, markerDir } = makeServerScript()
		const client = new LspClient({ serverPath: script, workspaceFolderUri: workspace })
		await client.start()
		await waitFor(() => client.state === 'ready', 'ready state')
		const params = readMarker(markerDir, 'initialize')
		assert.strictEqual(params.workspaceFolders[0].uri, 'file://' + encodeUriPath(workspace))
		assert.ok(!params.workspaceFolders[0].uri.includes(' '), 'spaces are percent-encoded')
		await client.dispose()
	},

	async 'crashing server respawns with backoff up to 3 attempts then goes degraded'() {
		const { script, markerDir } = makeServerScript({ exitAfterInit: 1, exitAfterInitDelayMs: 10 })
		const workspace = fs.mkdtempSync(path.join(tmpRoot, 'respawn-'))
		const spawnTimes = []
		const client = new LspClient({
			serverPath: script,
			workspaceFolderUri: workspace,
			respawnBackoffMs: 10,
			onSpawn: () => spawnTimes.push(Date.now()),
		})
		await client.start()
		await client.disposed
		assert.strictEqual(client.state, 'degraded', 'degraded after respawn budget is exhausted')
		assert.strictEqual(client.spawnCount, 4, 'initial spawn + 3 respawn attempts')
		assert.ok(spawnTimes.length >= 4, 'onSpawn observed every attempt')
		for (let i = 1; i < spawnTimes.length; i++) {
			assert.ok(spawnTimes[i] - spawnTimes[i - 1] >= 5, `backoff before respawn ${i}`)
		}
	},

	async 'bundler-missing crash goes straight to degraded without respawn and never installs'() {
		const { script, markerDir } = makeServerScript({ bundlerMissing: true })
		const workspace = fs.mkdtempSync(path.join(tmpRoot, 'bundler-'))
		const client = new LspClient({
			serverPath: script,
			workspaceFolderUri: workspace,
			respawnBackoffMs: 10,
		})
		await client.start()
		await waitFor(() => client.state === 'degraded', 'degraded state')
		assert.strictEqual(client.spawnCount, 1, 'bundler-missing never respawns')
		assert.strictEqual(client.isAvailable, false, 'capability is unavailable')
	},

	async 'dispose SIGTERMs a well-behaved server and leaves no orphan'() {
		const { script, markerDir } = makeServerScript()
		const workspace = fs.mkdtempSync(path.join(tmpRoot, 'dispose-'))
		const client = new LspClient({ serverPath: script, workspaceFolderUri: workspace })
		await client.start()
		await waitFor(() => client.state === 'ready', 'ready state')
		const pid = client.serverPid
		assert.ok(Number.isInteger(pid), 'server pid is known')
		await client.dispose()
		assert.strictEqual(client.state, 'stopped')
		await waitFor(() => !pidAlive(pid), 'process exit')
		assert.ok(!fs.existsSync(path.join(markerDir, 'sigterm-ignored.json')), 'SIGTERM was sent')
		assert.strictEqual(client.spawnCount, 1, 'dispose never respawns')
	},

	async 'dispose escalates to SIGKILL when the server ignores SIGTERM'() {
		const { script, markerDir } = makeServerScript({ ignoreSigterm: true })
		const workspace = fs.mkdtempSync(path.join(tmpRoot, 'kill-'))
		const client = new LspClient({
			serverPath: script,
			workspaceFolderUri: workspace,
			killGraceMs: 100,
		})
		await client.start()
		await waitFor(() => client.state === 'ready', 'ready state')
		const pid = client.serverPid
		await client.dispose()
		await waitFor(() => !pidAlive(pid), 'SIGKILL', 3000)
		assert.ok(fs.existsSync(path.join(markerDir, 'sigterm-ignored.json')), 'SIGTERM was tried first')
	},

	async 'dispose while starting still kills the spawned server'() {
		const { script } = makeServerScript()
		const workspace = fs.mkdtempSync(path.join(tmpRoot, 'starting-'))
		const client = new LspClient({ serverPath: script, workspaceFolderUri: workspace })
		const starting = client.start()
		await client.dispose()
		await starting
		assert.strictEqual(client.state, 'stopped')
		await waitFor(() => !pidAlive(client.serverPid), 'process exit')
	},
}

const encodeUriPath = (p) => encodeURI(p).replace(/[#?]/g, (c) => encodeURIComponent(c))
const pidAlive = (pid) => {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

const cleanup = () => {
	fs.rmSync(tmpRoot, { recursive: true, force: true })
}

const run = async () => {
	const requested = process.argv[2]
	let passed = 0
	for (const [name, fn] of Object.entries(tests)) {
		if (requested && !name.includes(requested)) continue
		try {
			await fn()
			passed++
			console.log(`ok - ${name}`)
		} catch (err) {
			console.error(`FAIL - ${name}`)
			console.error(err)
			cleanup()
			process.exit(1)
		}
	}
	cleanup()
	console.log(`${passed} passed`)
}
run()
