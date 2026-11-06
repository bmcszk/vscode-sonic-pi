#!/usr/bin/env node
// Sonic Pi Docs quick-pick browser: pure filtering/detail formatting over the builtins data.
// vscode is stubbed via Module._load; interactions are tested at the boundary only for showDocsBrowser.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

const vscodeCalls = { outputChannels: [], shown: [] }

const vscodeStub = {
	EventEmitter,
	Uri: { parse: (value) => value },
	workspace: {
		registerTextDocumentContentProvider: (scheme, provider) => {
			vscodeCalls.providers = vscodeCalls.providers || []
			vscodeCalls.providers.push({ scheme, provider })
			return { dispose() {} }
		},
		openTextDocument: async (uri) => {
			const provider = (vscodeCalls.providers || []).find((p) => uri.startsWith(p.scheme + ':'))
			const text = provider ? provider.provider.provideTextDocumentContent(uri) : ''
			const doc = { uri, text }
			vscodeCalls.openedDocs = vscodeCalls.openedDocs || []
			vscodeCalls.openedDocs.push(doc)
			return doc
		},
	},
	window: {
		createOutputChannel: (name) => {
			const channel = {
				name,
				lines: [],
				append(text) {
					this.lines.push(text)
				},
				clear() {
					this.lines = []
				},
				show() {
					vscodeCalls.shown.push(channel)
				},
			}
			vscodeCalls.outputChannels.push(channel)
			return channel
		},
		showInputBox: async () => 'slice',
		showQuickPick: async (items) => items.find((item) => item.label === SLICER),
		showTextDocument: async (doc, opts) => {
			doc.preview = !!(opts && opts.preview)
			return doc
		},
		showInformationMessage: (message) => {
			vscodeCalls.infoMessages = vscodeCalls.infoMessages || []
			vscodeCalls.infoMessages.push(message)
		},
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const {
	allDocsEntries,
	filterDocsEntries,
	formatDocsDetail,
	showDocsBrowser,
} = require('../../out/docs-browser.js')

const { registerDocsView } = require('../../out/docs-browser.js')
registerDocsView({ subscriptions: [] })

const SLICER = 'slicer'

const tests = {
	'all docs entries cover synths, fx, samples and commands'() {
		const kinds = new Set(allDocsEntries.map((entry) => entry.kind))
		assert.deepStrictEqual([...kinds].sort(), ['command', 'fx', 'sample', 'synth'])
		const slicer = allDocsEntries.find((entry) => entry.name === SLICER)
		assert.ok(slicer, 'fx slicer present')
		assert.ok(
			slicer.options.some((option) => option.name === 'amp'),
			'options carried from data',
		)
	},

	'empty query returns every entry'() {
		assert.strictEqual(filterDocsEntries('').length, allDocsEntries.length)
		assert.strictEqual(filterDocsEntries('   ').length, allDocsEntries.length)
	},

	'search filters by name, case-insensitively'() {
		const names = filterDocsEntries('SLICER').map((entry) => entry.name)
		assert.deepStrictEqual(names, ['slicer', 'panslicer'])
		assert.ok(filterDocsEntries('drum_snare').every((entry) => entry.name.includes('drum_snare')))
	},

	'search matches the category word: "synths" and "fx" return only that kind'() {
		assert.ok(filterDocsEntries('synths').length > 0)
		assert.ok(filterDocsEntries('synths').every((entry) => entry.kind === 'synth'))
		assert.ok(filterDocsEntries('fx').every((entry) => entry.kind === 'fx'))
	},

	'search matches description text, not just names'() {
		// A word that appears in a detail string but in no entry name.
		const described = allDocsEntries.find((entry) =>
			entry.detail
				.toLowerCase()
				.split(/\W+/)
				.some(
					(word) =>
						word.length > 6 &&
						allDocsEntries.every((other) => !other.name.toLowerCase().includes(word)),
				),
		)
		const word = described.detail
			.toLowerCase()
			.split(/\W+/)
			.filter(
				(w) => w.length > 6 && allDocsEntries.every((other) => !other.name.toLowerCase().includes(w)),
			)[0]
		assert.ok(word, 'fixture precondition: a detail-only word exists')
		assert.ok(filterDocsEntries(word).includes(described))
	},

	'filter is pure: repeated calls give identical results'() {
		assert.deepStrictEqual(filterDocsEntries('amen'), filterDocsEntries('amen'))
	},

	'detail includes kind, name, docs and options'() {
		const entry = allDocsEntries.find((e) => e.name === SLICER)
		const text = formatDocsDetail(entry)
		assert.ok(text.startsWith('(fx) slicer'))
		assert.ok(text.includes('Options:'))
		assert.ok(text.includes('reps:'), 'fx reps option is appended')
	},

	'detail omits the options section when there are none'() {
		const entry = { kind: 'command', name: 'play', detail: 'Play a note', options: [] }
		const text = formatDocsDetail(entry)
		assert.ok(!text.includes('Options:'))
		assert.ok(text.includes('Play a note'))
	},

	'default values are rendered with the option'() {
		const entry = {
			kind: 'synth',
			name: 'x',
			detail: '',
			options: [{ name: 'amp', detail: 'volume', default: '1' }],
		}
		assert.ok(formatDocsDetail(entry).includes('amp: volume (default: 1)'))
	},

	'showDocsBrowser opens the picked entry as a read-only editor document'() {
		return showDocsBrowser().then(() => {
			const doc = vscodeCalls.openedDocs[0]
			assert.ok(doc, 'a docs document was opened')
			assert.match(doc.uri, /^sonicpi-docs:\//, 'the doc lives on the read-only docs scheme')
			assert.ok(doc.text.includes('(fx) slicer'), 'the doc carries the entry detail')
			assert.strictEqual(doc.preview, true, 'opens as a preview tab')
			assert.strictEqual(
				vscodeCalls.outputChannels.filter((c) => c.name === 'Sonic Pi Docs').length,
				0,
				'the log channel no longer carries docs dumps',
			)
		})
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
			? 'all docs-browser tests passed'
			: `${failures} of ${Object.entries(tests).length} tests failed`,
	)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
