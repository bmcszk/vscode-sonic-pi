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

	test('a play after the daemon dies boots a fresh server instead of dying silently', async () => {
		// The user-facing failure: the window stayed 'connected' to a dead daemon and every
		// play went to a dead port with an empty log channel. The keepalive error signal must
		// drop the server-alive claim so the next play takes the cold-boot path.
		const firstBoot = host.lastBoot()
		assert.ok(firstBoot, 'precondition: a daemon is running from the earlier test')

		await host.sendControl('exit')

		// The dead daemon is noticed through keepalive send errors (three strikes at 1s per
		// ping). The loss line is the user-visible half of that; it must land BEFORE the
		// next play so the play takes the cold path.
		await host.waitUntil(
			() =>
				host
					.logLines('Sonic Pi Log')
					.some((line) => line.includes('Lost contact with the Sonic Pi daemon')),
			'the window to declare the daemon dead',
			15000,
		)

		// No background auto-boot: a repeatedly dying daemon must not become a boot loop.
		// The recovery happens on the user's next play, which takes the cold-boot path.
		const deathMark = host.mark()
		await vscode.commands.executeCommand('vscode-sonic-pi.runWithText', 'play :e5')

		await host.waitUntil(
			() => host.boots(deathMark).length >= 1,
			'the play after daemon death to boot a fresh daemon',
			30000,
		)
		const secondBoot = host.lastBoot()
		assert.notStrictEqual(secondBoot.pid, firstBoot.pid, 'the fresh daemon is a new process')
		await host.waitForMessage('/run-code', deathMark, (message) => message.args[1].endsWith('play :e5'))
	})
})
