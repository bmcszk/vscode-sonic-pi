#!/usr/bin/env node
// Flash docks: a /flash names only the workspace that reported a line, and a file run is reported
// under the daemon's default 'eval' workspace, not under its file. The dock remembers the Sonic Pi
// document whose editor was in front when the run was sent, so the flashes paint the right file
// even after the focus moved to a panel, a quick input or another split.
const assert = require('assert')

const { FlashDocks } = require('../../out/flash-docks.js')

const FILE = 'file:///cloud_beat.pi'
const OTHER_FILE = 'file:///other.pi'
const CELL = 'vscode-notebook-cell:/book.pibook#W0sZmlsZQ%3D%3D'

function fakeFront() {
	let shown = FILE
	return {
		shown: () => shown,
		show(uri) {
			shown = uri
		},
	}
}

const runStarted = (docks, jobId = 7) => docks.runStarted(jobId, 'eval')

const tests = {
	'a file run docks the document that was in front when it was sent'() {
		const front = fakeFront()
		const docks = new FlashDocks(front.shown)

		const dock = docks.dockFileRun()
		front.show(OTHER_FILE)

		// then the daemon naming the job resolves to the document the run was sent from
		assert.strictEqual(runStarted(docks), FILE)
		assert.deepStrictEqual(dock, { dock: 'file', document: FILE })
		assert.strictEqual(docks.documentOf('eval'), FILE)
	},

	'a run sent while no Sonic Pi file is in front docks nothing'() {
		const docks = new FlashDocks(() => undefined)

		docks.dockFileRun()

		assert.strictEqual(runStarted(docks), undefined)
		assert.strictEqual(docks.documentOf('eval'), undefined)
	},

	'a job that was never sent by this window docks nothing'() {
		const docks = new FlashDocks(() => FILE)

		assert.strictEqual(runStarted(docks), undefined)
		assert.strictEqual(docks.documentOf('eval'), undefined)
	},

	'one dock serves the single job the daemon announces next'() {
		const front = fakeFront()
		const docks = new FlashDocks(front.shown)

		// given a second play replaces the first while it is still in flight
		docks.dockFileRun()
		front.show(OTHER_FILE)
		docks.dockFileRun()

		// then the job announced lands on the latest send, and the next announcement docks nothing
		assert.strictEqual(runStarted(docks, 1), OTHER_FILE)
		assert.strictEqual(runStarted(docks, 2), undefined)
	},

	'an ended job releases its dock'() {
		const docks = new FlashDocks(() => FILE)
		docks.dockFileRun()
		runStarted(docks)

		const released = docks.runEnded(7)

		assert.deepStrictEqual(released, ['eval'])
		assert.strictEqual(docks.documentOf('eval'), undefined)
	},

	'a joined cell workspace reports every part it named'() {
		const docks = new FlashDocks(() => FILE)
		docks.dockFileRun()

		const document = docks.runStarted(8, `${CELL}|file://3:play 60`)

		// then the run still paints the file it was sent from, and its end names its parts
		assert.strictEqual(document, FILE)
		assert.deepStrictEqual(docks.runEnded(8), [CELL, 'file://3:play 60'])
	},

	'the whole session going quiet releases every dock'() {
		const docks = new FlashDocks(() => FILE)
		docks.dockFileRun()
		runStarted(docks)

		docks.allRunsCompleted()

		assert.strictEqual(docks.documentOf('eval'), undefined)
		assert.strictEqual(runStarted(docks, 9), undefined, 'a send already consumed stays consumed')
	},

	'a fresh server generation drops the docks of the last one'() {
		const docks = new FlashDocks(() => FILE)
		docks.dockFileRun()
		runStarted(docks)

		docks.clear()

		assert.strictEqual(docks.documentOf('eval'), undefined)
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
		console.log(`  ${error.stack || error.message}`)
	}
}

console.log(
	failures === 0
		? 'flash-docks.test.js: all assertions passed'
		: `${failures} flash-docks test(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
