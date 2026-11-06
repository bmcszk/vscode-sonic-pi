// Manifest-level activation gate: a user typing a contributed command into an Extension
// Development Host that never opened a Sonic Pi file got "command not found". This suite
// therefore never calls host.activateExtension() and runs FIRST in the 'extension' window, so
// the extension is still cold: every command below is reached the way the workbench reaches
// it, and the window has to activate on its own to answer.
//
// The dispatch loop executes the real handlers, so Start Server (and Restart Server) boot the
// fake daemon through the settings seam. The teardown hands the window back exactly as the
// feature suites expect it: server stopped, no editor left open, and an empty daemon wire log,
// because those suites assert the wire of a window that never booted.

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vscode = require('vscode')
const host = require('../harness/host')

// vscode.openFolder replaces the very window the run lives in (empirically: the host exits
// before the next test), so that one command is proven registered rather than dispatched.
const WINDOW_REPLACING = new Set(['vscode-sonic-pi.openExamples'])

// The workbench's own wording when a command is unknown to it, plus the older "no extension
// registered it" error. Anything else is the handler talking, which is what this gate wants.
const COMMAND_UNKNOWN = /command '.*' not found|Unknown command|Unable to find an extension to run/

function extension() {
	return vscode.extensions.getExtension(host.EXTENSION_ID)
}

// Reading packageJSON is static manifest data: it does not activate the extension.
function contributedCommandIds() {
	return extension().packageJSON.contributes.commands.map((entry) => entry.command)
}

suite('Cold-window command activation', () => {
	suiteSetup(() => {
		// Order is the whole point of the cold state: no suite may have activated the extension
		// before this one, hence its position first in the .vscode-test.mjs suites list.
		assert.strictEqual(extension().isActive, false, 'the host must be cold, no earlier suite may have activated')
		assert.ok(contributedCommandIds().length > 0, 'the manifest contributes commands')
	})

	suiteTeardown(async () => {
		const runner = host.extensionModule('source-runner/extension.js')
		if (runner.serverIsRunning()) {
			await host.updateSetting('stopServerOnLastEditorClose', true)
			host.writeFixture('activation-last-editor.pi', 'play :c4\n')
			await host.showFixture('activation-last-editor.pi')
			await host.closeAllEditors()
			await host.waitUntil(() => !runner.serverIsRunning(), 'the dispatched Start Server daemon to stop')
			await host.updateSetting('stopServerOnLastEditorClose', false)
		}
		await host.closeAllEditors()
		// The daemons this suite booted are its own evidence, not the feature window's: the
		// suites after this one assert "no daemon booted before my first run" against this log.
		fs.writeFileSync(path.join(host.controlDir, 'events.ndjson'), '')
	})

	test('a cold window knows none of the contributed commands yet', async () => {
		const registered = await vscode.commands.getCommands(true)
		const known = contributedCommandIds().filter((id) => registered.includes(id))
		assert.deepStrictEqual(known, [], 'the extension host registers contributed commands on activation only')
		assert.strictEqual(extension().isActive, false, 'listing commands must not activate the extension')
	})

	test('every contributed command dispatches without the workbench not knowing it', async () => {
		const ids = contributedCommandIds()
		const unknown = []
		let dispatched = 0
		for (const id of ids) {
			if (WINDOW_REPLACING.has(id)) continue
			try {
				await vscode.commands.executeCommand(id)
				dispatched += 1
			} catch (error) {
				if (COMMAND_UNKNOWN.test(String(error && error.message))) unknown.push(`${id}: ${error.message}`)
			}
			// Each command starts from a quiet window: whatever the handler opened (a notebook, a
			// docs editor) must not change what the next command finds focused.
			await host.closeAllEditors()
			await host.delay(200)
		}
		assert.strictEqual(dispatched, ids.length - WINDOW_REPLACING.size, 'every non-replacing command resolved')
		assert.deepStrictEqual(unknown, [], 'no contributed command may be unknown to the workbench')
	})

	test('the dispatch activated the extension and registered the whole command surface', async () => {
		assert.strictEqual(extension().isActive, true, 'dispatching a contributed command activates the extension')
		const registered = await vscode.commands.getCommands(true)
		const missing = contributedCommandIds().filter((id) => !registered.includes(id))
		assert.deepStrictEqual(missing, [], 'every contributed id is registered once the extension activated')
	})
})
