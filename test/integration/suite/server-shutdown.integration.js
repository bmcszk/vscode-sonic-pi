const assert = require('assert')
const vscode = require('vscode')
const host = require('../harness/host')

const isSonicPi = (document) => document.languageId === 'sonic-pi'

function serverIsRunning() {
	return host.extensionModule('source-runner/extension.js').serverIsRunning()
}

function exitsOf(pid) {
	return host.readEvents().filter((entry) => entry.event === 'exit' && entry.pid === pid)
}

// The extension counts open Sonic Pi editor tabs, so the state a suite has to reach is "no Sonic
// Pi tab is open", not "no Sonic Pi document is alive": a document opened by an earlier suite can
// outlive its tab in this host, and a notebook's cell documents have no tab of their own.
function openSonicPiTabs() {
	const cells = new Set(
		vscode.workspace.notebookDocuments.flatMap((notebook) =>
			notebook.getCells().map((cell) => cell.document.uri.toString()),
		),
	)
	return vscode.window.tabGroups.all
		.flatMap((group) => group.tabs)
		.filter((tab) => tab.input instanceof vscode.TabInputText)
		.filter((tab) => !cells.has(tab.input.uri.toString()))
}

async function closeSonicPiDocuments() {
	await host.closeAllEditors()
	await host.delay(200)
}

suite('Server shutdown on the last editor close', () => {
	suiteSetup(async () => {
		await host.activateExtension()
	})

	test('closing the last Sonic Pi editor keeps the daemon alive while the setting is off', async () => {
		await host.updateSetting('stopServerOnLastEditorClose', false)
		assert.strictEqual(serverIsRunning(), true, 'a later suite closed every editor, the daemon must still be up')
		await closeSonicPiDocuments()

		host.writeFixture('shutdown-off.pi', 'play :c4\n')
		await host.showFixture('shutdown-off.pi')
		const boot = host.lastBoot()
		const mark = host.mark()
		await host.closeAllEditors()
		await host.delay(1000)
		assert.deepStrictEqual(exitsOf(boot.pid), [], 'the opted-out window keeps the daemon running')
		assert.strictEqual(serverIsRunning(), true)
	})

	test('closing the last Sonic Pi editor stops the daemon when the setting is on', async () => {
		await host.updateSetting('stopServerOnLastEditorClose', true)
		await closeSonicPiDocuments()
		assert.strictEqual(openSonicPiTabs().length, 0, 'no Sonic Pi editor tab is open')

		host.writeFixture('shutdown-on.pi', 'play :c4\n')
		await host.showFixture('shutdown-on.pi')
		const boot = host.lastBoot()
		await host.closeAllEditors()

		await host.waitUntil(() => exitsOf(boot.pid)[0], 'the daemon of this window to exit')
		assert.strictEqual(exitsOf(boot.pid)[0].reason, 'sigterm', 'the daemon is killed, not left orphaned')
		assert.strictEqual(serverIsRunning(), false, 'the window reports no server once it shut down')
	})
})
