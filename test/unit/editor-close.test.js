#!/usr/bin/env node
// Editor-close decision: stop the server only when opted in, the server runs,
// no restart (audio recovery) is in progress, and no Sonic Pi editor remains.
const assert = require('assert')
const { shouldStopServerOnLastEditorClose } = require('../../out/editor-close.js')

const base = {
	settingEnabled: true,
	serverRunning: true,
	restartInProgress: false,
	sonicPiEditorsRemaining: 0,
}

const run = (overrides) => shouldStopServerOnLastEditorClose({ ...base, ...overrides })

const tests = {
	'setting off: never stop'() {
		assert.strictEqual(run({ settingEnabled: false }), false)
	},

	'restart in progress: never stop, even with zero editors left'() {
		assert.strictEqual(run({ restartInProgress: true }), false)
	},

	'server not running: nothing to stop'() {
		assert.strictEqual(run({ serverRunning: false }), false)
	},

	'editors still open: keep playing'() {
		assert.strictEqual(run({ sonicPiEditorsRemaining: 1 }), false)
	},

	'happy path: opted in, running, idle, last editor just closed'() {
		assert.strictEqual(run(), true)
	},
}

let failures = 0
for (const [name, test] of Object.entries(tests)) {
	try {
		test()
		console.log(`ok - ${name}`)
	} catch (error) {
		failures++
		console.log(`not ok - ${name}`)
		console.log(`  ${error.message}`)
	}
}

console.log(
	failures === 0
		? 'editor-close.test.js: all assertions passed'
		: `${failures} editor-close test(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
