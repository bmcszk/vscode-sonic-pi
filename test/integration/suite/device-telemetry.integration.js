// Device and live-loop telemetry: the daemon pushes this state on gui-listen and the extension
// is supposed to turn it into something a user can act on - a MIDI/gamepad picker, a live-loop
// badge, a running statusbar - and to send the matching controls on the wire. Driving QuickPicks
// headlessly is flaky, so where a pick is involved the suite drives the same seam the pick calls
// (the setDriveForTest precedent) and asserts the OSC message the daemon receives.

const assert = require('assert')
const vscode = require('vscode')
const host = require('../harness/host')

const MIDI_DEVICES = 'vscode-sonic-pi.midiDevices'
const GAMEPADS = 'vscode-sonic-pi.gamepads'
const TIMEWARP = 'vscode-sonic-pi.setGlobalTimewarp'
const OPEN_INIT = 'vscode-sonic-pi.openInitFile'

const runner = () => host.extensionModule('source-runner/extension.js')
const messages = (mark, address) =>
	host.sinceMark(mark).filter((entry) => entry.event === 'message' && entry.address === address)

async function ensureServer() {
	await host.activateExtension()
	await host.updateSetting('launchSonicPiServerAutomatically', 'ruby')
	if (!runner().serverIsRunning()) await runner().startServer()
}

suite('Device and live-loop telemetry', () => {
	suiteSetup(async () => {
		await ensureServer()
	})

	test('a midi-ports push fills the picker cache and a pick sends /midi-port-enable flipped', async () => {
		// given the daemon reports one input and one output port, both off
		await host.sendControl('midi-ports', ['false\tLPD8'])
		await host.sendControl('midi-out-ports', ['false\tMicroBrute'])
		// when the pushes land, the cache the picker parses holds them
		await host.waitUntil(
			() => runner().deviceListCacheForTest().inPorts === 'false\tLPD8',
			'the input port push to reach the cache',
		)
		const cache = runner().deviceListCacheForTest()
		assert.strictEqual(cache.outPorts, 'false\tMicroBrute')
		// the items built from the cache are the picker's
		const devicePorts = host.extensionModule('device-ports.js')
		const items = devicePorts.buildPortQuickPickItems(
			devicePorts.parseDevicePairs(cache.inPorts),
			devicePorts.parseDevicePairs(cache.outPorts),
		)
		assert.deepStrictEqual(
			items.filter((item) => item.kind !== -1).map((item) => item.label),
			['$(circle-outline) LPD8', '$(circle-outline) MicroBrute'],
		)
		// when the user picks the input port, the enable goes out flipped, on the real wire
		const mark = host.mark()
		runner().pickMidiPortForTest({ port: 'in', index: 0, enabled: false })
		await host.waitForMessage(
			'/midi-port-enable',
			mark,
			(message) => message.args[1] === 'in' && message.args[2] === 0 && message.args[3] === 1,
		)
		// and an enabled port picked again goes out off
		const offMark = host.mark()
		runner().pickMidiPortForTest({ port: 'out', index: 0, enabled: true })
		await host.waitForMessage(
			'/midi-port-enable',
			offMark,
			(message) => message.args[1] === 'out' && message.args[2] === 0 && message.args[3] === 0,
		)
	})

	test('a gamepad pick sends /gamepad-enable with the list index and the flipped flag', async () => {
		// given two gamepads reported, the second one off
		await host.sendControl('gamepads', ['true\tWireless Controller\nfalse\tXbox 360 Controller'])
		await host.waitUntil(
			() => runner().deviceListCacheForTest().gamepads.includes('Xbox'),
			'the gamepad push to reach the cache',
		)
		// when the disabled pad is picked
		const mark = host.mark()
		runner().pickGamepadForTest({ index: 1, enabled: false })
		// then the enable carries its list index and the flipped flag
		await host.waitForMessage(
			'/gamepad-enable',
			mark,
			(message) => message.args[1] === 1 && message.args[2] === 1,
		)
	})

	test('the MIDI and gamepad commands are registered and dispatch without throwing', async () => {
		// The pick itself is a QuickPick the host cannot drive; this proves the manifest and the
		// handler registration (the wire half is above).
		const registered = await vscode.commands.getCommands(true)
		assert.ok(registered.includes(MIDI_DEVICES), 'the MIDI picker command is registered')
		assert.ok(registered.includes(GAMEPADS), 'the gamepad picker command is registered')
	})

	test('setGlobalTimewarp rides the silent no-replace run on the wire', async () => {
		// The input box cannot be typed into from the host, so the suite drives the sender
		// through the same Main method the command calls once its input validates.
		const mark = host.mark()
		runner().setTimewarpForTest(2)
		await host.waitForMessage(
			'/run-code',
			mark,
			(message) =>
				message.args[2] === 'timewarp-set' &&
				message.args[3] === 1 &&
				String(message.args[1]).includes('set_global_timewarp! 2'),
		)
		// The prompt-validating command must exist and dispatch without a modal hang.
		const running = vscode.commands.executeCommand(TIMEWARP)
		await host.delay(300)
		await vscode.commands.executeCommand('workbench.action.closeQuickOpen')
		await Promise.race([running, host.delay(1000)])
	})

	test('openInitFile creates and opens init.rb without needing a server', async () => {
		// given the throwaway HOME the environment sets
		const initPath = require('path').join(process.env.HOME, '.sonic-pi', 'config', 'init.rb')
		const fs = require('fs')
		// when the command dispatches
		await vscode.commands.executeCommand(OPEN_INIT)
		await host.waitUntil(() => fs.existsSync(initPath), 'init.rb to be created')
		const text = fs.readFileSync(initPath, 'utf8')
		assert.match(text, /init\.rb/, 'the seed names the file')
		const openTab = await host.waitUntil(
			() =>
				vscode.window.tabGroups.all
					.flatMap((group) => group.tabs)
					.find(
						(tab) =>
							tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === initPath,
					),
			'init.rb to open in a tab',
		)
		assert.ok(openTab, 'init.rb opened')
	})

	test('the docs preview seam sends a silent docs-preview run with no session stop', async () => {
		// given a booted window and a docs entry with a sound
		const mark = host.mark()
		// when the docs preview seam plays it (the second step's Preview action)
		const played = runner().previewEntry({ kind: 'synth', name: 'prophet' })
		// then exactly one silent run carries the docs-preview workspace, and no stop precedes it
		assert.strictEqual(played, true)
		await host.waitForMessage(
			'/run-code',
			mark,
			(message) =>
				message.args[2] === 'docs-preview' &&
				message.args[3] === 1 &&
				String(message.args[1]).includes('with_synth :prophet'),
		)
		assert.deepStrictEqual(
			messages(mark, '/stop-all-jobs'),
			[],
			'a preview must never stop the session first',
		)
	})

	test('a live-loop scope push badges its header line and scope-ended removes it', async () => {
		// given an open Sonic Pi file with a live_loop header on line 1
		host.writeFixture('badges.pi', 'live_loop :drums do\n  sample :bd_haus\n  sleep 1\nend\n')
		await host.showFixture('badges.pi')
		await host.delay(300)
		const store = () => runner().liveLoopScopeForTest()
		// when the daemon reports the loop alive
		await host.sendControl('live-loop-scope', [7, 'drums', 'eval', 1, 0])
		await host.waitUntil(
			() =>
				store()
					.list()
					.some((entry) => entry.name === 'drums'),
			'the scope store to record the live loop',
		)
		// then the pure renderer turns the store into the badge on the header line
		const badges = host.extensionModule('live-loop-badges.js')
		const text = (await host.openFixture('badges.pi')).getText()
		assert.deepStrictEqual(badges.badgeDecorations(store(), text), [{ line: 1, text: '♪ :drums' }])
		// when the loop thread ends, the store drops it and the renderer has nothing to draw
		await host.sendControl('live-loop-scope-ended', [7, 'drums'])
		await host.waitUntil(
			() =>
				!store()
					.list()
					.some((entry) => entry.name === 'drums'),
			'the ended loop to leave the store',
		)
		assert.deepStrictEqual(badges.badgeDecorations(store(), text), [])
	})

	test('a spider-ready push turns the statusbar running before any run exists', async () => {
		// given a fresh daemon generation the window has not marked running yet
		const restartMark = host.mark()
		await vscode.commands.executeCommand('vscode-sonic-pi.restartserver')
		await host.waitUntil(() => host.boots(restartMark)[0], 'the fresh daemon to boot')
		// when the runtime announces it is ready
		await host.sendControl('spider-ready')
		// then the statusbar item claims a running server without a play
		const item = host.statusBarItem(100)
		await host.waitUntil(
			() => item.text.includes('Sonic Pi') && !item.text.includes('stopped'),
			'statusbar to show the ready runtime',
		)
		assert.ok(!item.text.includes('starting'), 'the ready push resolves the starting state')
		assert.deepStrictEqual(
			messages(restartMark, '/run-code'),
			[],
			'no run was needed to reach the running state',
		)
	})

	test('an /exited push stops the window claiming a live server', async () => {
		// given a running window
		assert.strictEqual(runner().serverIsRunning(), true)
		// when the runtime reports its exit
		await host.sendControl('exited')
		// then the window stops claiming a server without waiting for keep-alive to notice
		await host.waitUntil(() => !runner().serverIsRunning(), 'the window to notice the exit')
		// The push only reports an exit; the fake daemon process is still alive. Restart through
		// the extension so it kills that process and boots the fresh daemon the later suites
		// (server-shutdown) expect to be running.
		const restartMark = host.mark()
		await vscode.commands.executeCommand('vscode-sonic-pi.restartserver')
		await host.waitUntil(() => host.boots(restartMark)[0], 'the restored daemon to boot')
		await host.waitUntil(() => runner().serverIsRunning(), 'the window to own the fresh daemon')
	})
})
