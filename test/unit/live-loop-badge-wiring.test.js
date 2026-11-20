#!/usr/bin/env node
// Live-loop badge wiring: the pure renderer (live-loop-badges.ts) decides WHICH lines carry a
// '♪ :name' badge; this class is the vscode half - it owns the decoration type and repaints
// only the visible Sonic Pi editors when the scope store changes. The unit test drives a fake
// vscode so the wiring (not the pure renderer, covered in live-loop-badges.test.js) is what is
// asserted: the badge text reaches the decoration, only matching editors are painted, and a
// restart clears every badge.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

const createdDecorationTypes = []

const vscodeStub = {
	EventEmitter,
	Range: class Range {
		constructor(startLine, startCharacter, endLine, endCharacter) {
			this.start = { line: startLine, character: startCharacter }
			this.end = { line: endLine, character: endCharacter }
		}
	},
	window: {
		createTextEditorDecorationType: (options) => {
			const type = { options, disposed: false, dispose() { this.disposed = true } }
			createdDecorationTypes.push(type)
			return type
		},
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const { LiveLoopScopeStore } = require('../../out/live-loop-scope.js')
const { LiveLoopBadgeDecorator } = require('../../out/live-loop-badges.js')

const CODE = ['live_loop :drums do', '  sample :bd_haus', '  sleep 1', 'end'].join('\n')

const fakeEditor = ({ languageId = 'sonic-pi', text = CODE, uri = 'file:///loop.pi' } = {}) => ({
	calls: [],
	document: { languageId, getText: () => text, uri: { toString: () => uri } },
	setDecorations(decorationType, decorations) {
		this.calls.push({ decorationType, decorations })
	},
	lastDecorations() {
		return this.calls.length === 0 ? undefined : this.calls[this.calls.length - 1].decorations
	},
})

const decoratorWith = (editors) => {
	createdDecorationTypes.length = 0
	const store = new LiveLoopScopeStore()
	const decorator = new LiveLoopBadgeDecorator({ store, visibleEditors: () => editors })
	return { store, decorator }
}

const push = (name, line = 1) => ({ jobid: 1, name, workspace: 'a', line, scopeNum: 0 })

const tests = {
	'a stored live loop paints its badge on the header line of the visible editor'() {
		// given a decorator over one visible Sonic Pi editor
		const editor = fakeEditor()
		const { store, decorator } = decoratorWith([editor])
		// when the daemon reports the loop alive
		store.apply(push('drums', 1))
		decorator.refresh()
		// then the badge sits on the header line with the ♪ label
		const decorations = editor.lastDecorations()
		assert.strictEqual(decorations.length, 1)
		assert.strictEqual(decorations[0].renderOptions.before.contentText, '♪ :drums')
		assert.strictEqual(decorations[0].range.start.line, 0, 'header line 1 is editor line 0')
	},

	'the decoration type carries the badge styling once, not per paint'() {
		const editor = fakeEditor()
		const { store, decorator } = decoratorWith([editor])
		store.apply(push('drums', 1))
		decorator.refresh()
		decorator.refresh()
		assert.strictEqual(createdDecorationTypes.length, 1, 'one decoration type for the lifetime')
		const options = createdDecorationTypes[0].options
		assert.ok(options.before, 'the badge is a before-content decoration')
		assert.match(String(options.before.color ?? ''), /.+/, 'the badge is greyer than the code')
	},

	'only sonic-pi editors and only on-disk/buffer documents are painted'() {
		const ruby = fakeEditor({ languageId: 'ruby' })
		const docs = fakeEditor({ uri: 'sonicpi-docs:/reverb' })
		const pi = fakeEditor()
		const { store, decorator } = decoratorWith([ruby, docs, pi])
		store.apply(push('drums', 1))
		decorator.refresh()
		assert.deepStrictEqual(ruby.lastDecorations(), [], 'a ruby editor is not a Sonic Pi buffer')
		assert.deepStrictEqual(docs.lastDecorations(), [], 'the docs reader never carries badges')
		assert.strictEqual(pi.lastDecorations().length, 1)
	},

	'an ended loop clears its badge'() {
		// given a loop badged on the visible editor
		const editor = fakeEditor()
		const { store, decorator } = decoratorWith([editor])
		store.apply(push('drums', 1))
		decorator.refresh()
		assert.strictEqual(editor.lastDecorations().length, 1)
		// when the loop thread ends
		store.end('drums')
		decorator.refresh()
		// then the badge is gone
		assert.deepStrictEqual(editor.lastDecorations(), [])
	},

	'a restart clears every badge, even ones the store still lists'() {
		// given two badged loops
		const editor = fakeEditor({
			text: ['live_loop :drums do', 'end', 'live_loop :bass do', 'end'].join('\n'),
		})
		const { store, decorator } = decoratorWith([editor])
		store.apply(push('drums', 1))
		store.apply(push('bass', 3))
		decorator.refresh()
		assert.strictEqual(editor.lastDecorations().length, 2)
		// when the server restarts (the store is cleared with it)
		decorator.clearAll()
		// then every painted editor is wiped
		assert.deepStrictEqual(editor.lastDecorations(), [])
	},

	'badges follow the visible set: a newly visible editor is painted on the next refresh'() {
		// given one badged editor and a second Sonic Pi editor that opens later
		const first = fakeEditor()
		const second = fakeEditor({ uri: 'file:///second.pi' })
		const editors = [first]
		const { store, decorator } = decoratorWith(editors)
		store.apply(push('drums', 1))
		decorator.refresh()
		assert.deepStrictEqual(second.calls, [], 'the unopened editor was never painted')
		// when it becomes visible and a repaint happens
		editors.push(second)
		decorator.refresh()
		// then it carries the badge too, without a second decoration type
		assert.strictEqual(second.lastDecorations()[0].renderOptions.before.contentText, '♪ :drums')
		assert.strictEqual(createdDecorationTypes.length, 1)
	},
}

let failures = 0
const names = Object.keys(tests)

async function run() {
	for (const name of names) {
		try {
			await tests[name]()
			console.log(`ok - ${name}`)
		} catch (error) {
			failures++
			console.log(`not ok - ${name}`)
			console.log(`  ${error.message}`)
		}
	}
	console.log(
		failures === 0 ? 'all live-loop badge wiring tests passed' : `${failures} of ${names.length} tests failed`,
	)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
