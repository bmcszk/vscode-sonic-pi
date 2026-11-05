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

// Setting off: never stop.
assert.strictEqual(run({ settingEnabled: false }), false)

// Restart in progress: never stop, even with zero editors left.
assert.strictEqual(run({ restartInProgress: true }), false)

// Server not running: nothing to stop.
assert.strictEqual(run({ serverRunning: false }), false)

// Editors still open: keep playing.
assert.strictEqual(run({ sonicPiEditorsRemaining: 1 }), false)

// The happy path: opted in, running, idle, last editor just closed.
assert.strictEqual(run(), true)

console.log('editor-close.test.js: all assertions passed')
