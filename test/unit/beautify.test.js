#!/usr/bin/env node
// Beautify apply-edit: map the daemon's /buffer/replace payload (aligned text plus
// server-adjusted line/index) onto a whole-document edit, preserving the cursor
// best-effort (line:character ratio fallback when the server cursor is unusable).
const assert = require('assert')
const { computeBeautifyEdit } = require('../../out/beautify.js')

function fakeDocument(text) {
	return {
		getText: () => text,
		positionAt: (offset) => {
			// minimal positionAt mirroring VS Code semantics for our tests
			const upto = text.slice(0, offset)
			const lines = upto.split('\n')
			return { line: lines.length - 1, character: lines[lines.length - 1].length }
		},
	}
}

function fakeEditor(text, cursorLine, cursorChar) {
	const doc = fakeDocument(text)
	const anchor = { line: cursorLine, character: cursorChar }
	return {
		document: doc,
		selection: { anchor, active: anchor },
		appliedEdits: [],
		applyEdit(editBuilder) {
			const recorded = { replacements: [] }
			const edit = {
				replace: (range, newText) => recorded.replacements.push({ range, newText }),
			}
			editBuilder(edit)
			this.appliedEdits.push(recorded)
			return Promise.resolve(true)
		},
	}
}

const tests = {
	'server cursor applied when within bounds (GUI Align parity via /buffer/replace line+index)'() {
		const result = computeBeautifyEdit(
			'play 50\nsleep 1\n',
			'play 50\nsleep  1\n',
			{ line: 1, character: 4 },
			{ line: 1, index: 6 },
		)
		assert.deepStrictEqual(result, {
			newText: 'play 50\nsleep  1\n',
			cursor: { line: 1, character: 6 },
		})
	},

	'server cursor past EOF falls back to the line ratio of the original cursor'() {
		const oldText = 'l1\nl2\nl3\nl4\nl5\nl6\n'
		const newText = 'l1\n\n\nl2\n\n\nl3\n\n\nl4\n\n\nl5\n\n\nl6\n'
		const result = computeBeautifyEdit(oldText, newText, { line: 2, character: 1 }, undefined)
		assert.strictEqual(result.cursor.line, 6)
		assert.strictEqual(result.cursor.character, 1)
	},

	'ratio fallback clamps character to the mapped line length'() {
		const result = computeBeautifyEdit('abcd\nefgh\n', 'a\nb\n', { line: 0, character: 3 }, undefined)
		assert.strictEqual(result.cursor.line, 0)
		assert.strictEqual(result.cursor.character, 1)
	},

	'empty reply is a no-op: newText undefined so callers skip the edit'() {
		const result = computeBeautifyEdit('play 50\n', '', { line: 0, character: 0 }, undefined)
		assert.strictEqual(result.newText, undefined)
	},

	'out-of-range server cursor clamps to the last line'() {
		const result = computeBeautifyEdit(
			'play 50\n',
			'play 50\n',
			{ line: 0, character: 4 },
			{ line: 9, index: 0 },
		)
		assert.strictEqual(result.newText, 'play 50\n')
		assert.deepStrictEqual(result.cursor, { line: 0, character: 4 })
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

console.log(failures === 0 ? 'beautify.test.js: all assertions passed' : `${failures} beautify test(s) failed`)
process.exit(failures === 0 ? 0 : 1)
