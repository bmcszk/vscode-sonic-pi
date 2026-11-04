#!/usr/bin/env node
// Editor run controls: file lenses on line 1, per-block lenses only for multi-block documents, and
// the showEditorControls / language / notebook-cell gates.
const assert = require('assert')
const Module = require('module')
const { EventEmitter } = require('events')

const configuration = { showEditorControls: true }

class FakeRange {
	constructor(startLine, startCharacter, endLine, endCharacter) {
		this.start = { line: startLine, character: startCharacter }
		this.end = { line: endLine, character: endCharacter }
	}
}

class FakeCodeLens {
	constructor(range, command) {
		this.range = range
		this.command = command
	}
}

const vscodeStub = {
	EventEmitter,
	Range: FakeRange,
	CodeLens: FakeCodeLens,
	workspace: {
		getConfiguration: () => ({
			get: (key, defaultValue) => (key in configuration ? configuration[key] : defaultValue),
		}),
		onDidChangeConfiguration: () => ({ dispose() {} }),
		onDidChangeTextDocument: () => ({ dispose() {} }),
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const { SonicPiCodeLensProvider } = require('../../out/codelenses.js')

const THREE_BLOCK_TEXT = [
	'live_loop :a do',
	'  play 60',
	'end',
	'',
	'live_loop :b do',
	'  play 62',
	'end',
	'',
	'play 64',
].join('\n')

const SINGLE_BLOCK_TEXT = 'play 60\nsleep 1\nplay 64'

function document(languageId, text, scheme = 'file') {
	return { languageId, uri: { scheme }, getText: () => text }
}

function lensesFor(languageId, text, scheme) {
	return new SonicPiCodeLensProvider().provideCodeLenses(document(languageId, text, scheme))
}

function summary(lens) {
	return {
		title: lens.command.title,
		command: lens.command.command,
		arguments: lens.command.arguments,
		line: lens.range.start.line,
	}
}

const tests = {
	'line 1 carries $(play) Run with the whole document and $(stop) Stop'() {
		const text = THREE_BLOCK_TEXT

		const lenses = lensesFor('sonic-pi', text)

		assert.deepStrictEqual(summary(lenses[0]), {
			title: '$(play) Run',
			command: 'vscode-sonic-pi.run',
			arguments: [text],
			line: 0,
		})
		assert.deepStrictEqual(summary(lenses[1]), {
			title: '$(stop) Stop',
			command: 'vscode-sonic-pi.stop',
			arguments: undefined,
			line: 0,
		})
	},

	'each blank-line block gets a $(play) Run cell lens at its first line when a document has several blocks'() {
		const lenses = lensesFor('sonic-pi', THREE_BLOCK_TEXT)

		assert.deepStrictEqual(lenses.map(summary), [
			{ title: '$(play) Run', command: 'vscode-sonic-pi.run', arguments: [THREE_BLOCK_TEXT], line: 0 },
			{ title: '$(stop) Stop', command: 'vscode-sonic-pi.stop', arguments: undefined, line: 0 },
			{
				title: '$(play) Run cell',
				command: 'vscode-sonic-pi.runWithText',
				arguments: ['live_loop :a do\n  play 60\nend', 0],
				line: 0,
			},
			{
				title: '$(play) Run cell',
				command: 'vscode-sonic-pi.runWithText',
				arguments: ['live_loop :b do\n  play 62\nend', 4],
				line: 4,
			},
			{ title: '$(play) Run cell', command: 'vscode-sonic-pi.runWithText', arguments: ['play 64', 8], line: 8 },
		])
	},

	'a Run cell lens carries the block start line so fragment flashes can be mapped back'() {
		const text = ['# intro', '', 'live_loop :a do', '  play 60', 'end', '', 'play 64'].join('\n')

		const blocked = lensesFor('sonic-pi', text).filter(
			(lens) => lens.command.command === 'vscode-sonic-pi.runWithText',
		)

		assert.deepStrictEqual(
			blocked.map((lens) => [lens.range.start.line, lens.command.arguments[1]]),
			[
				[2, 2],
				[6, 6],
			],
		)
	},

	'a comment-only or settings-only block gets no Run cell lens'() {
		const text = ['# Note: requires a powerful machine to run smoothly.', '', 'use_bpm 120', '', 'play 60'].join('\n')

		const lenses = lensesFor('sonic-pi', text)

		assert.deepStrictEqual(lenses.map(summary), [
			{ title: '$(play) Run', command: 'vscode-sonic-pi.run', arguments: [text], line: 0 },
			{ title: '$(stop) Stop', command: 'vscode-sonic-pi.stop', arguments: undefined, line: 0 },
			{ title: '$(play) Run cell', command: 'vscode-sonic-pi.runWithText', arguments: ['play 60', 4], line: 4 },
		])
	},

	'an assignment-only block gets no Run cell lens because locals do not survive the run'() {
		const text = [
			'chord_low_1 = chord :c2, :maj9',
			'',
			'chord_high_1 = chord :c4, :maj9',
			'',
			'chord_low_1 = chord :c2, :maj7',
		].join('\n')

		const lenses = lensesFor('sonic-pi', text)

		assert.deepStrictEqual(
			lenses.map((lens) => lens.command.title),
			['$(play) Run', '$(stop) Stop'],
		)
	},

	'a define-first block keeps its lens relabeled $(sync) Load def with the same runWithText wiring'() {
		const text = [
			'define :chord_player do',
			'  play chord(:c4, :maj9)',
			'end',
			'',
			'live_loop :a do',
			'  chord_player',
			'  sleep 1',
		'end',
		].join('\n')

		const lenses = lensesFor('sonic-pi', text)

		assert.deepStrictEqual(lenses.map(summary), [
			{ title: '$(play) Run', command: 'vscode-sonic-pi.run', arguments: [text], line: 0 },
			{ title: '$(stop) Stop', command: 'vscode-sonic-pi.stop', arguments: undefined, line: 0 },
			{
				title: '$(sync) Load def',
				command: 'vscode-sonic-pi.runWithText',
				arguments: ['define :chord_player do\n  play chord(:c4, :maj9)\nend', 0],
				line: 0,
			},
			{
				title: '$(play) Run cell',
				command: 'vscode-sonic-pi.runWithText',
				arguments: ['live_loop :a do\n  chord_player\n  sleep 1\nend', 4],
				line: 4,
			},
		])
	},

	'defonce-first blocks are relabeled too'() {
		const text = ['defonce :bass do', '  play 40', 'end', '', 'play 60'].join('\n')

		const blocked = lensesFor('sonic-pi', text).filter(
			(lens) => lens.command.command === 'vscode-sonic-pi.runWithText',
		)

		assert.strictEqual(blocked.length, 2)
		assert.strictEqual(blocked[0].command.title, '$(sync) Load def')
		assert.strictEqual(blocked[0].command.arguments[0], 'defonce :bass do\n  play 40\nend')
		assert.strictEqual(blocked[1].command.title, '$(play) Run cell')
	},

	'an assignment block that also plays keeps its Run cell lens'() {
		const text = ['chord_low_1 = chord :c2, :maj9', 'play chord_low_1', '', 'play 60'].join('\n')

		const lenses = lensesFor('sonic-pi', text)

		assert.deepStrictEqual(
			lenses
				.filter((lens) => lens.command.command === 'vscode-sonic-pi.runWithText')
				.map((lens) => lens.command.arguments[0]),
			['chord_low_1 = chord :c2, :maj9\nplay chord_low_1', 'play 60'],
		)
	},

	'a mixed define/assignment/live_loop file classifies each block separately'() {
		const text = [
			'define :chord_player do',
			'  play chord(:c4, :maj9)',
			'end',
			'',
			'chord_low_1 = chord :c2, :maj9',
			'',
			'live_loop :a do',
			'  chord_player',
			'  sleep 1',
			'end',
		].join('\n')

		const lenses = lensesFor('sonic-pi', text)

		assert.deepStrictEqual(
			lenses.map((lens) => [lens.range.start.line, lens.command.title]),
			[
				[0, '$(play) Run'],
				[0, '$(stop) Stop'],
				[0, '$(sync) Load def'],
				[6, '$(play) Run cell'],
			],
		)
	},

	'comments inside an otherwise playable block do not disqualify its lens'() {
		const text = [
			'live_loop :a do',
			'  # soft',
			'  play 60',
			'end',
			'',
			'play 62',
		].join('\n')

		const lenses = lensesFor('sonic-pi', text)

		assert.deepStrictEqual(
			lenses
				.filter((lens) => lens.command.command === 'vscode-sonic-pi.runWithText')
				.map((lens) => lens.command.arguments[0]),
			['live_loop :a do\n  # soft\n  play 60\nend', 'play 62'],
		)
	},

	'a single-block document gets no Run cell lens'() {
		const lenses = lensesFor('sonic-pi', SINGLE_BLOCK_TEXT)

		assert.strictEqual(lenses.length, 2)
		assert.deepStrictEqual(
			lenses.map((lens) => lens.command.title),
			['$(play) Run', '$(stop) Stop'],
		)
	},

	'showEditorControls false hides every lens'() {
		configuration.showEditorControls = false
		try {
			// given the setting is off, when the provider runs, then nothing is shown
			assert.deepStrictEqual(lensesFor('sonic-pi', THREE_BLOCK_TEXT), [])
		} finally {
			configuration.showEditorControls = true
		}
	},

	'non Sonic Pi documents get no lens'() {
		assert.deepStrictEqual(lensesFor('ruby', THREE_BLOCK_TEXT), [])
	},

	'notebook cell documents get no lens because the cell already has its own run button'() {
		assert.deepStrictEqual(lensesFor('sonic-pi', THREE_BLOCK_TEXT, 'vscode-notebook-cell'), [])
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
			? 'all codelens tests passed'
			: `${failures} of ${Object.entries(tests).length} tests failed`,
	)
	return failures === 0 ? 0 : 1
}

runAll().then((code) => process.exit(code))
