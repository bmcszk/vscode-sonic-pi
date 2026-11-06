const assert = require('assert')
const vscode = require('vscode')
const host = require('../harness/host')

suite('Server lifecycle', () => {
	suiteSetup(async () => {
		await host.activateExtension()
	})

	test('Run boots a cold window automatically and a warm window reuses that daemon', async () => {
		host.writeFixture('cold-window.pi', 'use_bpm 120\nplay :c4\n')
		// The suite points at explicit play, so the launch mode starts as 'never': opening the
		// editor must not boot anything by itself.
		await host.showFixture('cold-window.pi')
		assert.deepStrictEqual(host.boots(), [], 'no daemon may boot before the first run')

		await host.updateSetting('launchSonicPiServerAutomatically', 'ruby')
		const coldMark = host.mark()
		await vscode.commands.executeCommand('vscode-sonic-pi.run')

		await host.waitUntil(() => host.boots(coldMark)[0], 'the cold window to boot its daemon')
		const run = await host.waitForMessage('/run-code', coldMark, (message) =>
			message.args[1].includes('play :c4'),
		)
		assert.match(run.args[1], /use_arg_checks true/, 'safe mode still prefixes the cold run')

		const warmMark = host.mark()
		await vscode.commands.executeCommand('vscode-sonic-pi.runWithText', 'play :d4')
		await host.waitForMessage('/run-code', warmMark, (message) => message.args[1].endsWith('play :d4'))
		assert.deepStrictEqual(host.boots(warmMark), [], 'a warm window must not boot a second daemon')
	})

	test('status bar asks the running daemon for its version and sends the volume from its prompt', async () => {
		assert.ok(
			host.messages('/version').length >= 1,
			'the running state must request the version (that request is the status bar version bridge)',
		)
		const mark = host.mark()
		await host.sendControl('version', ['5.0.2'])
		await host.waitUntil(() => host.readEvents().length > mark, 'the version reply control')

		const volumeMark = host.mark()
		const prompted = vscode.commands.executeCommand('vscode-sonic-pi.masterVolume')
		// The prompt opens at the volume the window last set, so accepting it is one keystroke and
		// the suite never has to type into a DOM input box.
		await host.delay(500)
		await vscode.commands.executeCommand('quickInput.accept')
		await prompted
		// A closing quick input restores focus asynchronously; a suite that opens an editor before
		// that settles loses the activation to whatever had focus (the panel, not the editor).
		await host.delay(200)
		await host.waitForMessage(
			'/mixer-output-volume',
			volumeMark,
			(message) => Math.abs(message.args[1] - 1) < 1e-6,
		)
	})
})
