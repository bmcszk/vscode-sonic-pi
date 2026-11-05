const assert = require('assert')
const vscode = require('vscode')
const host = require('../harness/host')

async function readExtensionFile(relativePath) {
	const extension = vscode.extensions.getExtension(host.EXTENSION_ID)
	const content = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extension.extensionUri, relativePath))
	return Buffer.from(content).toString('utf8')
}

suite('Media and docs', () => {
	suiteSetup(async () => {
		await host.activateExtension()
		await host.updateSetting('stopServerOnLastEditorClose', false)
	})

	test('the snippet pack ships with the extension and expands in a Sonic Pi editor', async () => {
		const manifest = vscode.extensions.getExtension(host.EXTENSION_ID).packageJSON
		const contribution = manifest.contributes.snippets.find((entry) => entry.language === 'sonic-pi')
		assert.ok(contribution, 'the manifest contributes snippets for the sonic-pi language')

		const pack = JSON.parse(await readExtensionFile(contribution.path.replace(/^\.\//, '')))
		const names = Object.keys(pack)
		assert.ok(names.length >= 9, `the pack offers ready-made sonic pi snippets (${names.length})`)
		for (const name of names) {
			assert.ok(pack[name].prefix.length > 0, `${name} is reachable by a prefix`)
			assert.ok(pack[name].body.length > 0, `${name} has a body`)
		}

		host.writeFixture('snippets.pi', '')
		const editor = await host.showFixture('snippets.pi')
		// The snippet command types into the focused editor, and a suite that ran before this one
		// may have left the notebook editor focused: bring this editor forward first.
		await vscode.window.showTextDocument(editor.document, {
			viewColumn: vscode.ViewColumn.One,
			preview: false,
		})
		await host.delay(300)
		await vscode.commands.executeCommand('editor.action.insertSnippet', { name: 'Live loop' })
		const inserted = await host.waitUntil(
			() => (editor.document.getText().includes('live_loop :name do') ? editor.document.getText() : undefined),
			'the live loop snippet to expand in the editor',
		)
		assert.match(inserted, /sleep 1\nend/, 'the whole snippet body lands, not just its first line')
		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor')
	})

	test('the docs command opens a searchable pick and shows the picked builtin', async () => {
		// The pick is a real quick input: its DOM input cannot be typed into from the host, so the
		// suite drives the data layer the pick is built from and accepts the first entry it offers.
		const docs = host.extensionModule('docs-browser.js')
		const searched = docs.filterDocsEntries('reverb')
		assert.ok(searched.length > 0, 'searching the pick for reverb finds builtins')
		const picked = searched.find((entry) => entry.kind === 'fx' && entry.name === 'reverb')
		assert.ok(picked, 'the builtin the search looks for stays in the pick')
		const detail = docs.formatDocsDetail(picked)
		assert.match(detail, /^\(fx\) reverb/m, 'the picked builtin is shown with its kind and name')

		const running = vscode.commands.executeCommand('vscode-sonic-pi.docs')
		await host.delay(500)
		await vscode.commands.executeCommand('quickInput.accept')
		await running
	})
})
