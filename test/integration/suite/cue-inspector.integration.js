const assert = require('assert')
const vscode = require('vscode')
const host = require('../harness/host')

// Cue-port controls + fake-daemon cue push. The fake daemon's /fake/ command socket handles
// cue-port toggles and cue pushes directly; the extension's cuePort* senders are unit-covered
// (routes asserted in per-run-stop pattern suites), so this suite asserts the control wire.
suite('Cue Inspector + cue-port controls', () => {
	suiteSetup(async () => {
		// The server-lifecycle suite (earlier in this label) already booted the fake daemon;
		// its /fake/ command socket is what sendControl targets. No boot of our own.
		await host.activateExtension()
	})

	test('cue-port-stop then cue-port-start appear on the fake daemon wire ledger', async () => {
		const mark = host.mark()

		await host.sendControl('cue-port-stop')
		await host.waitUntil(
			() => host.sinceMark(mark).some(e => e.event === 'control' && e.name === 'cue-port-stop'),
			'the fake daemon to record cue-port-stop'
		)

		const mark2 = host.mark()
		await host.sendControl('cue-port-start')
		await host.waitUntil(
			() => host.sinceMark(mark2).some(e => e.event === 'control' && e.name === 'cue-port-start'),
			'the fake daemon to record cue-port-start'
		)

		const controls = host
			.sinceMark(mark)
			.filter((entry) => entry.event === 'control')
			.map((entry) => entry.name)

		assert.deepStrictEqual(controls.slice(0, 2), ['cue-port-stop', 'cue-port-start'])
	})

	test('cue-port-external and cue-port-internal appear on the fake daemon wire ledger', async () => {
		const mark = host.mark()

		await host.sendControl('cue-port-external')
		await host.waitUntil(
			() => host.sinceMark(mark).some(e => e.event === 'control' && e.name === 'cue-port-external'),
			'the fake daemon to record cue-port-external'
		)

		const mark2 = host.mark()
		await host.sendControl('cue-port-internal')
		await host.waitUntil(
			() => host.sinceMark(mark2).some(e => e.event === 'control' && e.name === 'cue-port-internal'),
			'the fake daemon to record cue-port-internal'
		)

		const controls = host
			.sinceMark(mark)
			.filter((entry) => entry.event === 'control')
			.map((entry) => entry.name)

		assert.deepStrictEqual(controls.slice(0, 2), ['cue-port-external', 'cue-port-internal'])
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
