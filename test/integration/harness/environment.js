// Builds the throwaway Sonic Pi "installation" + workspace a host run is pointed at, before
// the Extension Development Host starts. The extension only learns where its backend lives
// through its public settings seam: sonicPiRootDirectory (daemon.rb launcher) and
// ruby.interpreter.commandPath (the interpreter that runs it -> node + the fake daemon).
// Everything mutable (HOME, control files, fixtures) lives under one temp dir per run, so no
// live Sonic Pi install and no real ~/.sonic-pi is touched.

const fs = require('fs')
const os = require('os')
const path = require('path')

const repoRoot = path.resolve(__dirname, '../../..')
const fakeDaemonPath = path.join(repoRoot, 'test/integration/fake-sonic-pi.js')

function writeJson(file, value) {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, JSON.stringify(value, null, '\t') + '\n')
}

function createEnvironment(label) {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), `sonic-pi-integration-${label}-`))
	const home = path.join(base, 'home')
	const sonicPiRootDirectory = path.join(base, 'sonic-pi')
	const controlDir = path.join(base, 'daemon')
	const workspace = path.join(base, 'workspace')

	for (const dir of [home, controlDir, workspace, path.join(sonicPiRootDirectory, 'server/ruby/bin')]) {
		fs.mkdirSync(dir, { recursive: true })
	}

	// The daemon launcher the extension resolves from sonicPiRootDirectory. It is spawned as
	// `<commandPath> <daemonLauncherPath>`, i.e. `node <this file>`, and re-uses the repo's fake
	// daemon so the suites have one source of truth for the daemon contract.
	fs.writeFileSync(
		path.join(sonicPiRootDirectory, 'server/ruby/bin/daemon.rb'),
		`#!/usr/bin/env node\nrequire(${JSON.stringify(fakeDaemonPath)})\n`,
	)

	writeJson(path.join(controlDir, 'spec.json'), {})
	writeJson(path.join(workspace, '.vscode/settings.json'), {
		'vscode-sonic-pi.sonicPiRootDirectory': sonicPiRootDirectory,
		'ruby.interpreter.commandPath': process.execPath,
		'vscode-sonic-pi.launchSonicPiServerAutomatically': 'never',
		'vscode-sonic-pi.connectionMode': 'managed',
		'vscode-sonic-pi.stopServerOnLastEditorClose': true,
		'vscode-sonic-pi.autoMidiStart': true,
		'vscode-sonic-pi.runReplacesSession': true,
		'vscode-sonic-pi.notebookRunsWholeSong': false,
	})

	return {
		base,
		home,
		workspace,
		controlDir,
		sonicPiRootDirectory,
		env: {
			HOME: home,
			SONIC_PI_FAKE_DIR: controlDir,
			SONIC_PI_IT_WORKSPACE: workspace,
			SONIC_PI_IT_REPO: repoRoot,
		},
	}
}

module.exports = { createEnvironment }
