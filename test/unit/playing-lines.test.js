#!/usr/bin/env node
// Playing-line highlight: /flash (jobid, workspace, line) renders as a transient whole-line
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

const CONFIG = {
	flashBackgroundColor: () => 'rgba(255,20,147,1.0)',
	flashTextColor: () => 'rgba(255,255,255,1.0)',
	showPlayingLineHighlight: () => true,
}

function fakeTimers() {
	let now = 0
	const timers = []
	return {
		now: () => now,
		schedule: (callback, delayMs) => {
			const timer = { at: now + delayMs, callback, cancelled: false }
			timers.push(timer)
			return timer
		},
		cancel: (timer) => {
			timer.cancelled = true
		},
		advance(ms) {
			now += ms
			for (const timer of timers) {
				if (!timer.cancelled && timer.at <= now) {
					timer.cancelled = true
					timer.callback()
				}
			}
		},
	}
}

function fakeEditor() {
	return {
		calls: [],
		setDecorations(decorationType, ranges) {
			this.calls.push({ decorationType, ranges })
		},
		lastRanges() {
			return this.calls.length === 0 ? undefined : this.calls[this.calls.length - 1].ranges
		},
	}
}

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
		const { instance, timers, editor } = highlighter()

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
		const { instance, timers, editor } = highlighter()

		instance.flash('eval', 4)
		timers.advance(200)
		instance.flash('eval', 5)

		assert.deepStrictEqual(editor.lastRanges(), [new FakeRange(3, 0, 3, 1000), new FakeRange(4, 0, 4, 1000)])

		timers.advance(50)
		assert.deepStrictEqual(editor.lastRanges(), [new FakeRange(4, 0, 4, 1000)])

		timers.advance(200)
		assert.deepStrictEqual(editor.lastRanges(), [])
	},

	'clear removes every active range immediately and cancels the pending sweep'() {
		const { instance, timers, editor } = highlighter()

		instance.flash('eval', 4)
		instance.flash('eval', 5)
		instance.clear()

		assert.deepStrictEqual(editor.lastRanges(), [])
		timers.advance(250)
		assert.strictEqual(editor.calls.length, 3, 'no sweep repaint after clear')
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
