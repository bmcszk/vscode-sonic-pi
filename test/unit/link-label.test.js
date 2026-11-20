#!/usr/bin/env node
// Link statusbar label: the pure formatter behind the statusbar's tempo item (beans
// sonic-pi-27kb, sonic-pi-o591). Two daemon pushes carry the session tempo and each means
// something different: /link-bpm is the engine's Link timeline tempo, /use-bpm is the tempo
// the last run actually held. /link-num-peers is Link's peer count. No tempo push -> no
// tempo text (undefined), so the item can never show a bpm the session did not report.
const assert = require('assert')
const { formatTempoLabel } = require('../../out/link-label.js')

const tests = {
	'no push at all renders nothing, so the item stays hidden instead of showing a fake 60'() {
		assert.strictEqual(formatTempoLabel({}), undefined)
	},
	'a link bpm push renders the tempo'() {
		assert.strictEqual(formatTempoLabel({ linkBpm: 122.4 }), '$(watch) 122.4 bpm')
	},
	'a use-bpm push renders the tempo the run actually held'() {
		assert.strictEqual(formatTempoLabel({ sessionBpm: 120 }), '$(watch) 120 bpm')
	},
	'the freshest tempo push wins, whichever source it came from'() {
		assert.strictEqual(formatTempoLabel({ sessionBpm: 120, linkBpm: 122.4 }), '$(watch) 122.4 bpm')
	},
	'a link tempo stays shown until the link tempo itself changes'() {
		assert.strictEqual(formatTempoLabel({ linkBpm: 122.4, sessionBpm: 90 }), '$(watch) 122.4 bpm')
	},
	'peers render next to the tempo'() {
		assert.strictEqual(formatTempoLabel({ sessionBpm: 120, peers: 3 }), '$(watch) 120 bpm · ⇄3')
	},
	'zero peers render as a count, not as silence'() {
		assert.strictEqual(formatTempoLabel({ linkBpm: 122.4, peers: 0 }), '$(watch) 122.4 bpm · ⇄0')
	},
	'peers alone name Link as the only live signal'() {
		assert.strictEqual(formatTempoLabel({ peers: 2 }), '⇄2')
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
