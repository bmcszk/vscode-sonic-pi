#!/usr/bin/env node
// Link statusbar label: pure formatter from bpm/peers pushes (bean sonic-pi-27kb).
const assert = require('assert')
const { formatLinkLabel } = require('../../out/link-label.js')

const tests = {
	'both values render bpm and peers'() {
		assert.strictEqual(formatLinkLabel(122.4, 3), '♪ 122.4 · ⇄3')
	},
	'bpm alone renders without peers'() {
		assert.strictEqual(formatLinkLabel(120), '♪ 120')
	},
	'peers alone renders without bpm'() {
		assert.strictEqual(formatLinkLabel(undefined, 2), '⇄2')
	},
	'no data hides the item'() {
		assert.strictEqual(formatLinkLabel(undefined, undefined), undefined)
	},
}

;(async () => {
	let failures = 0
	for (const [name, run] of Object.entries(tests)) {
		try {
			await run()
			console.log('ok -', name)
		} catch (error) {
			failures++
			console.error('FAIL -', name, '\n ', error.message)
		}
	}
	process.exit(failures ? 1 : 0)
})()
