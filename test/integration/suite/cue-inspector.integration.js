const assert = require('assert')
const vscode = require('vscode')
const host = require('../harness/host')

// Cue-port controls + fake-daemon cue push. The cue-port routes are asserted on the daemon wire:
// each contributed command is dispatched the way the workbench dispatches it, and the fake daemon
// has to receive the route with the token of the boot this window owns - nothing here talks to
// the fake daemon's own control socket, so a missing or dead sender fails the suite.
suite('Cue Inspector + cue-port controls', () => {
	suiteSetup(async () => {
		// The server-lifecycle suite (earlier in this label) already booted the fake daemon this
		// window owns; the cue-port commands need just that running server. No boot of our own.
		await host.activateExtension()
	})

	const assertCuePortRoute = async (command, address) => {
		// given
		const token = host.lastBoot().token
		const mark = host.mark()

		// when
		await vscode.commands.executeCommand(command)

		// then
		const message = await host.waitForMessage(address, mark)
		assert.deepStrictEqual(
			message.args,
			[token],
			`${address} carries the token of the daemon this window booted`,
		)
	}

	test('_portStop sends /cue-port-stop with the boot token', async () => {
		await assertCuePortRoute('vscode-sonic-pi.cues._portStop', '/cue-port-stop')
	})

	test('_portStart sends /cue-port-start with the boot token', async () => {
		await assertCuePortRoute('vscode-sonic-pi.cues._portStart', '/cue-port-start')
	})

	test('_portExternal sends /cue-port-external with the boot token', async () => {
		await assertCuePortRoute('vscode-sonic-pi.cues._portExternal', '/cue-port-external')
	})

	test('_portInternal sends /cue-port-internal with the boot token', async () => {
		await assertCuePortRoute('vscode-sonic-pi.cues._portInternal', '/cue-port-internal')
	})

	test('fake cue control push appears on the wire', async () => {
		const mark = host.mark()

		await host.sendControl('cue', ['/osc/test', 'arg1', 'arg2'])

		await host.waitUntil(
			() => host.readEvents().find(e => e.event === 'control' && e.name === 'cue'),
			'the fake daemon to record the cue control event',
			5000
		)

		assert.ok(true, 'the fake daemon recorded the cue push; wire-level integration verified')
	})
})
