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

	test('a mixer settings push shows in the item and the popover drive sends /mixer-drive', async () => {
		const mixerItem = host.statusBarItem(98)
		assert.ok(mixerItem, 'the mixer statusbar item exists')

		const pushMark = host.mark()
		await host.sendControl('mixer-settings', ['1.5', '0.6'])
		await host.waitUntil(
			() => mixerItem.text.includes('drive 1.5') && mixerItem.text.includes('vol 60%'),
			'the mixer item to show the pushed drive and volume',
		)

		const driveMark = host.mark()
		const picking = vscode.commands.executeCommand('vscode-sonic-pi.mixer')
		// quickInput.accept picks the default-focused entry (Drive, the item under Volume in
		// buildMixerQuickPickItems); that opens the pre-filled drive input box and a second
		// Enter accepts the pushed 1.5 - the same keystroke pattern the volume prompt uses.
		await host.delay(500)
		await vscode.commands.executeCommand('quickInput.accept')
		await host.delay(700)
		await vscode.commands.executeCommand('quickInput.accept')
		await picking
		await host.delay(200)
		await host.waitForMessage(
			'/mixer-drive',
			driveMark,
			(message) =>
				typeof message.args[0] === 'string' &&
				message.args[0].length > 0 &&
				Math.abs(message.args[1] - 1.5) < 1e-6 &&
				message.args[2] === 1,
		)
		await host.waitForMessage('/mixer-drive', driveMark, (message) =>
			message.args.every((arg, index) =>
				index === 0 ? typeof arg === 'string' && arg.length > 0 : index === 1 ? Math.abs(arg - 1.5) < 1e-6 : arg === 1,
			),
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

	test('a cell interrupt stops the exact daemon job the run started announced', async () => {
		// The notebook's kernel interrupt must map back to the daemon job id the fake announced
		// on /run/started; liveJobs stays empty without that push and the window falls back to
		// the job-blind /stop-all-jobs.
		host.writeSpec({ holdRuns: true })
		const restartMark = host.mark()
		await vscode.commands.executeCommand('vscode-sonic-pi.restartserver')
		await host.waitUntil(() => host.boots(restartMark)[0], 'the held-run daemon to boot')
		try {
			host.writeFixture('lifecycle.pibook', ['# Held', '', '```', 'play :c4', '```'].join('\n'))
			const notebook = await host.openNotebook('lifecycle.pibook')
			const cell = notebook.getCells().find((c) => c.kind === vscode.NotebookCellKind.Code)

			const runMark = host.mark()
			void vscode.commands.executeCommand('notebook.cell.execute', {
				ranges: [
					{ start: notebook.getCells().indexOf(cell), end: notebook.getCells().indexOf(cell) + 1 },
				],
				document: notebook.uri,
			})
			await host.waitForMessage('/run-code', runMark, (message) => message.args[1].includes('play :c4'))
			const started = await host.waitUntil(
				() =>
					host
						.sinceMark(runMark)
						.find((entry) => entry.event === 'push' && entry.address === '/run/started'),
				'the fake to push /run/started with the workspace',
			)
			assert.ok(
				typeof started.args[1] === 'string' && started.args[1].length > 0,
				'the /run/started push carries the workspace the run was sent with',
			)
			const jobId = started.args[0]

			const stopMark = host.mark()
			await vscode.commands.executeCommand('notebook.interruptExecution')
			await host.waitForMessage('/stop-job', stopMark, (message) => message.args[1] === jobId)
			assert.deepStrictEqual(
				host
					.sinceMark(stopMark)
					.filter((entry) => entry.event === 'message' && entry.address === '/stop-all-jobs'),
				[],
				'a single-cell interrupt must not fall back to the job-blind stop',
			)
		} finally {
			await host.sendControl('stop-all')
			host.writeSpec({})
			const restoreMark = host.mark()
			await vscode.commands.executeCommand('vscode-sonic-pi.restartserver')
			await host.waitUntil(() => host.boots(restoreMark)[0], 'the restored daemon to boot')
		}
	})
})
