#!/usr/bin/env node
// Artifact-level gate: the shipped vsix must load its own module graph. Every other suite runs
// against the checkout, where the repo's node_modules masks a vsix packaged without dependencies
// (`vsce package --no-dependencies` -> `Cannot find module 'osc-js'` at load, because
// `code --install-extension` does not resolve dependencies; only the Marketplace does).
// So: package WITH dependencies, extract the vsix into a temp dir (no repo node_modules in its
// ancestor chain), and require out/extension.js there under a `vscode` stub.
const assert = require('assert')
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, '..')
// Same vsce as .github/workflows/publish.yml, so the gate packages exactly like the publish job.
const VSCE_PACKAGE = '@vscode/vsce@4.1.0'
const RUNTIME_DEPS = ['osc-js', 'utf8', 'uuid']
const NETWORK_FAILURE = /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ECONNRESET|network (error|failure)/i

// Runs in a child node process: stub `vscode`, then require the extracted extension entry point.
const LOADER = `
const Module = require('module')
const { EventEmitter } = require('events')
const stub = { EventEmitter, workspace: {}, window: {}, commands: {}, Uri: {}, env: {} }
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
	if (request === 'vscode') return stub
	return originalLoad.apply(this, arguments)
}
try {
	require(process.argv[1])
} catch (error) {
	console.log(error && error.message ? error.message : String(error))
	process.exit(1)
}
`

function packageVsix(vsixPath) {
	const result = spawnSync('npx', ['--yes', VSCE_PACKAGE, 'package', '--out', vsixPath], {
		cwd: ROOT,
		encoding: 'utf8',
	})
	const output = `${result.stdout || ''}${result.stderr || ''}`
	if (result.error) return { output: result.error.message, failed: true, missingTool: true }
	return { output, failed: result.status !== 0, missingTool: false }
}

function firstLine(text) {
	return text.split('\n').find((line) => line.trim() !== '') || 'no output'
}

function extractVsix(vsixPath, extractDir) {
	const result = spawnSync('unzip', ['-q', vsixPath, '-d', extractDir], { encoding: 'utf8' })
	if (result.error) throw new Error(`unzip is required to extract the vsix: ${result.error.message}`)
	assert.strictEqual(result.status, 0, `unzip failed: ${result.stderr}`)
}

function main() {
	if (!fs.existsSync(path.join(ROOT, 'out', 'extension.js'))) {
		throw new Error('out/extension.js missing - run `npm run build` before this gate')
	}

	const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsix-smoke-'))
	const vsixPath = path.join(workDir, 'ext.vsix')
	const extractDir = path.join(workDir, 'extract')

	const packaged = packageVsix(vsixPath)
	if (packaged.failed && (packaged.missingTool || NETWORK_FAILURE.test(packaged.output))) {
		console.log(
			`skip - vsce unavailable (no local install, no registry access): ${firstLine(packaged.output)}`,
		)
		fs.rmSync(workDir, { recursive: true, force: true })
		return
	}
	assert.ok(!packaged.failed, `vsce package failed: ${packaged.output.trim()}`)
	assert.ok(fs.existsSync(vsixPath), 'vsce produced no vsix')

	extractVsix(vsixPath, extractDir)
	const extensionDir = path.join(extractDir, 'extension')
	const entryPoint = path.join(extensionDir, 'out', 'extension.js')
	assert.ok(fs.existsSync(entryPoint), `vsix has no out/extension.js (extracted to ${extensionDir})`)

	for (const dep of RUNTIME_DEPS) {
		const depDir = path.join(extensionDir, 'node_modules', dep)
		assert.ok(fs.existsSync(depDir), `vsix is missing node_modules/${dep} - package with dependencies`)
	}

	const loaded = spawnSync(process.execPath, ['-e', LOADER, entryPoint], {
		cwd: extensionDir,
		encoding: 'utf8',
	})
	const loadOutput = `${loaded.stdout || ''}${loaded.stderr || ''}`.trim()
	assert.ok(!/Cannot find module/.test(loadOutput), `vsix module graph is incomplete: ${loadOutput}`)
	assert.strictEqual(loaded.status, 0, `vsix entry point failed to load: ${loadOutput}`)

	fs.rmSync(workDir, { recursive: true, force: true })
	console.log('vsix-smoke.test.js: packaged artifact bundles osc-js/utf8/uuid and loads out/extension.js')
}

try {
	main()
} catch (error) {
	console.log(`not ok - vsix packaging smoke`)
	console.log(`  ${error.message}`)
	process.exit(1)
}
