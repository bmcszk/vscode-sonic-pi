#!/usr/bin/env node
// Playing-line highlight: /flash (workspace, line) renders as a transient whole-line
// background. Pure add/refresh/expire/clear logic against a fake editor with a fake clock.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

class FakeRange {
	constructor(startLine, startCharacter, endLine, endCharacter) {
		this.start = { line: startLine, character: startCharacter }
		this.end = { line: endLine, character: endCharacter }
	}
}

const vscodeStub = {
	EventEmitter,
	Range: FakeRange,
	window: {
		createTextEditorDecorationType: (options) => ({
			options,
			dispose() {},
		}),
		activeTextEditor: undefined,
	},
	workspace: {
		getConfiguration: () => ({}),
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const { PlayingLineHighlighter } = require('../../out/playing-lines.js')

const FLASH_TTL_MS = 250
const FILE = 'file:///cloud_beat.pi'

const CONFIG = {
	flashBackgroundColor: () => 'rgba(255,20,147,1.0)',
	flashTextColor: () => 'rgba(255,255,255,1.0)',
	showPlayingLineHighlight: () => true,
}

// A fake clock: a pending timer fires once when its time comes, a cancelled one never fires, and a
// timer a callback schedules while it runs stays pending for the next advance.
function fakeTimers() {
	let now = 0
	const pending = []
	return {
		now: () => now,
		schedule: (callback, delayMs) => {
			const timer = { at: now + delayMs, callback, cancelled: false, fired: false }
			pending.push(timer)
			return timer
		},
		cancel: (timer) => {
			timer.cancelled = true
		},
		advance(ms) {
			now += ms
			const due = pending.filter((timer) => timer.at <= now)
			for (const timer of due) pending.splice(pending.indexOf(timer), 1)
			for (const timer of due) {
				if (timer.cancelled) continue
				timer.fired = true
				timer.callback()
			}
		},
	}
}

function fakeEditor(document = FILE) {
	return {
		document: { uri: { toString: () => document } },
		calls: [],
		setDecorations(decorationType, ranges) {
			this.calls.push({ decorationType, ranges })
		},
		lastRanges() {
			return this.calls.length === 0 ? undefined : this.calls[this.calls.length - 1].ranges
		},
	}
}

// A highlighter of a window with no run in flight: every flash is the plain 250 ms blip.
function highlighterWithoutRun(overrides = {}) {
	const timers = fakeTimers()
	const editor = fakeEditor()
	const config = { ...CONFIG, ...(overrides.config || {}) }
	const instance = new PlayingLineHighlighter({
		config,
		editor: () => editor,
		now: timers.now,
		schedule: timers.schedule,
		cancel: timers.cancel,
	})
	return { instance, timers, editor, config }
}

// A highlighter whose editor shows the file and whose run is already docked to it: a flash paints
// only into the editor showing the document its live run belongs to.
function highlighter(overrides = {}) {
	const timers = fakeTimers()
	const editor = fakeEditor()
	const config = { ...CONFIG, ...(overrides.config || {}) }
	const instance = new PlayingLineHighlighter({
		config,
		editor: () => editor,
		now: timers.now,
		schedule: timers.schedule,
		cancel: timers.cancel,
	})
	instance.runStarted(FILE)
	return { instance, timers, editor, config }
}

const tests = {
	'a flash for the eval workspace paints one whole-line range and uses the flash colors'() {
		const { instance, editor } = highlighter()

		instance.flash('eval', 4)

		const call = editor.calls[0]
		assert.strictEqual(call.decorationType.options.isWholeLine, true)
		assert.strictEqual(call.decorationType.options.backgroundColor, CONFIG.flashBackgroundColor())
		assert.strictEqual(call.decorationType.options.color, CONFIG.flashTextColor())
		assert.deepStrictEqual(call.ranges, [new FakeRange(3, 0, 3, 1000)])
	},

	'only workspace eval and 1-based lines are highlighted'() {
		const { instance, editor } = highlighter()

		instance.flash('buffer-0', 4)
		instance.flash('eval', 0)
		instance.flash('eval', 1.5)

		assert.deepStrictEqual(editor.calls, [])
	},

	'the setting can turn the highlight off'() {
		const { instance, editor } = highlighter({ config: { showPlayingLineHighlight: () => false } })

		instance.flash('eval', 4)

		assert.deepStrictEqual(editor.calls, [])
	},

	'repeated flashes of the same line refresh the TTL instead of stacking ranges'() {
		const { instance, timers, editor } = highlighterWithoutRun()

		instance.flash('eval', 4)
		timers.advance(100)
		instance.flash('eval', 4)

		assert.strictEqual(editor.lastRanges().length, 1)

		timers.advance(150)
		assert.strictEqual(editor.lastRanges().length, 1, 'still lit at 250 ms after the first flash')

		timers.advance(100)
		assert.deepStrictEqual(editor.lastRanges(), [], 'cleared 250 ms after the refreshed flash')
	},

	'each line has its own TTL and ranges accumulate while active'() {
		const { instance, timers, editor } = highlighterWithoutRun()

		instance.flash('eval', 4)
		timers.advance(200)
		instance.flash('eval', 5)

		assert.deepStrictEqual(editor.lastRanges(), [
			new FakeRange(3, 0, 3, 1000),
			new FakeRange(4, 0, 4, 1000),
		])

		timers.advance(50)
		assert.deepStrictEqual(editor.lastRanges(), [new FakeRange(4, 0, 4, 1000)])

		timers.advance(200)
		assert.deepStrictEqual(editor.lastRanges(), [])
	},

	'clear removes every active range immediately and cancels the pending sweep'() {
		const { instance, timers, editor } = highlighterWithoutRun()

		instance.flash('eval', 4)
		instance.flash('eval', 5)
		instance.clear()

		assert.deepStrictEqual(editor.lastRanges(), [])
		timers.advance(250)
		assert.strictEqual(editor.calls.length, 3, 'no sweep repaint after clear')
	},

	'a fragment run needs no arming: the flash line is already file-absolute'() {
		const { instance, timers, editor } = highlighterWithoutRun()

		// A Run cell's code travels with its start line as comment padding, so the daemon numbers
		// its flashes like the whole file: line 61 is editor line 60 from the very first trigger.
		instance.flash('eval', 61)
		assert.deepStrictEqual(editor.lastRanges(), [new FakeRange(60, 0, 60, 1000)])

		timers.advance(100)
		instance.flash('eval', 61)
		assert.strictEqual(editor.lastRanges().length, 1, 'the early repeat refreshes instead of stacking')

		timers.advance(250)
		assert.deepStrictEqual(editor.lastRanges(), [], 'cleared 250 ms after the refreshed flash')
	},

	'flashes without an editor are ignored'() {
		const timers = fakeTimers()
		const instance = new PlayingLineHighlighter({
			config: CONFIG,
			editor: () => undefined,
			now: timers.now,
			schedule: timers.schedule,
			cancel: timers.cancel,
		})

		instance.flash('eval', 4)
		instance.clear()
	},

	'a flash paints only when the dock names the document the editor shows'() {
		const timers = fakeTimers()
		const editor = fakeEditor()
		const instance = new PlayingLineHighlighter({
			config: CONFIG,
			editor: () => editor,
			now: timers.now,
			schedule: timers.schedule,
			cancel: timers.cancel,
		})

		// given a run docked to this editor's document
		instance.runStarted(FILE)

		// when a flash of that workspace arrives while the editor keeps focus
		instance.flash('eval', 4)

		// then it paints
		assert.deepStrictEqual(editor.lastRanges(), [new FakeRange(3, 0, 3, 1000)])
	},

	'a flash docked to another document never paints into the focused editor'() {
		const timers = fakeTimers()
		const focused = fakeEditor('file:///unrelated.pi')
		const instance = new PlayingLineHighlighter({
			config: CONFIG,
			editor: () => focused,
			now: timers.now,
			schedule: timers.schedule,
			cancel: timers.cancel,
		})

		// given the run's document is not the one the focused editor shows
		instance.runStarted(FILE)
		instance.flash('eval', 4)

		assert.deepStrictEqual(focused.calls, [], 'painted a line of a script this editor does not show')
	},

	'a flash with no docked run keeps the plain blip instead of a run mark'() {
		const { instance, timers, editor } = highlighterWithoutRun()

		instance.flash('eval', 4)

		// then it paints in the focused editor...
		assert.deepStrictEqual(editor.lastRanges(), [new FakeRange(3, 0, 3, 1000)])

		// ...and goes out at the flash TTL, never at a run's lifetime
		timers.advance(FLASH_TTL_MS)
		assert.deepStrictEqual(editor.lastRanges(), [])
	},

	'a file run keeps every flashed line lit until the run ends'() {
		const { instance, timers, editor } = highlighter()
		instance.runStarted(FILE)

		// given a burst of six blocks, each flashing inside the 250 ms TTL of the last
		const blockLines = [1, 7, 14, 21, 30, 41]
		for (const line of blockLines) {
			instance.flash('eval', line)
			timers.advance(30)
		}

		// when the burst outlives the single-flash TTL
		timers.advance(600)

		// then every block line is still lit
		assert.deepStrictEqual(
			editor.lastRanges(),
			blockLines.map((line) => new FakeRange(line - 1, 0, line - 1, 1000)),
			'a line of the playing run must not lapse at the 250 ms flash TTL',
		)

		// when the run ends
		instance.runEnded('eval')

		// then the lines go dark
		assert.deepStrictEqual(editor.lastRanges(), [])
	},

	'a single flash without a run push still clears after the race TTL'() {
		const { instance, timers, editor } = highlighter()
		timers.advance(FLASH_TTL_MS)

		instance.runStarted(FILE)
		instance.runEnded('eval')

		// given a lone flash with no run around it
		instance.flash('eval', 4)

		// when the TTL passes
		timers.advance(FLASH_TTL_MS)

		// then it is gone: the long mark needs a live run, not just a dock
		assert.deepStrictEqual(editor.lastRanges(), [])
	},

	'a run that ends clears its lines even though the TTL has not passed'() {
		const { instance, timers, editor } = highlighter()
		instance.runStarted(FILE)
		instance.flash('eval', 4)

		instance.runEnded('eval')

		assert.deepStrictEqual(editor.lastRanges(), [])
		timers.advance(FLASH_TTL_MS)
		assert.deepStrictEqual(editor.lastRanges(), [])
	},

	'a re-run of the same file takes the lines over'() {
		const { instance, timers, editor } = highlighter()

		// given a run playing a line of the file
		instance.runStarted(FILE)
		instance.flash('eval', 4)

		// when the user runs the same file again and it plays another line
		instance.runEnded('eval')
		instance.runStarted(FILE)
		instance.flash('eval', 9)
		timers.advance(600)

		// then only the new run's line is lit
		assert.deepStrictEqual(editor.lastRanges(), [new FakeRange(8, 0, 8, 1000)])
	},

	'a document edit clears the run lines it rewrote until the run reports again'() {
		const { instance, editor } = highlighter()
		instance.runStarted(FILE)
		instance.flash('eval', 4)
		instance.flash('eval', 5)

		// when the user rewrites the fourth line on
		instance.forgetLines(FILE, 4)

		// then the stale lines are dark and the run keeps its other lines lit
		assert.deepStrictEqual(editor.lastRanges(), [])
	},

	'an edit far below the playing lines keeps them lit'() {
		const { instance, editor } = highlighter()
		instance.runStarted(FILE)
		instance.flash('eval', 4)

		instance.forgetLines(FILE, 40)

		assert.deepStrictEqual(editor.lastRanges(), [new FakeRange(3, 0, 3, 1000)])
	},

	'clear drops every mark, dock and pending timer'() {
		const { instance, timers, editor } = highlighter()
		instance.runStarted(FILE)
		instance.flash('eval', 4)

		instance.clear()
		timers.advance(FLASH_TTL_MS)

		// then nothing is lit and the next flash is a plain blip, not the old run's mark
		assert.deepStrictEqual(editor.lastRanges(), [])
		instance.flash('eval', 4)
		timers.advance(FLASH_TTL_MS)
		assert.deepStrictEqual(editor.lastRanges(), [], 'the dock went with the marks')
	},
}

async function runAll() {
	let failures = 0
	for (const [name, test] of Object.entries(tests)) {
		try {
			await test()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.stack || error.message}`)
		}
	}
	console.log(
		failures === 0
			? 'all playing-line tests passed'
			: `${failures} of ${Object.entries(tests).length} tests failed`,
	)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
