#!/usr/bin/env node
// Docs preview player: picking a docs entry offers to hear it. The code is built from the
// entry's real shape (docs-browser.ts DocsEntry: kind synth|fx|sample|command, name) and
// runs silent under the 'docs-preview' workspace (wave 2 wires the run).
const assert = require('assert')
const Module = require('module')

const vscodeStub = {}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const { buildPreviewCode } = require('../../out/docs-preview.js')

const entry = (kind, name) => ({ kind, name, detail: '', options: [] })

const tests = {
	'a sample previews itself for two beats'() {
		assert.strictEqual(buildPreviewCode(entry('sample', 'bd_haus')), 'sample :bd_haus, sustain: 2')
	},

	'a synth previews inside with_synth, holding one note for two beats'() {
		assert.strictEqual(
			buildPreviewCode(entry('synth', 'dull_bell')),
			'with_synth :dull_bell do\n  play :c4, release: 2\nend',
		)
	},

	'an fx previews inside with_fx around the same note'() {
		assert.strictEqual(
			buildPreviewCode(entry('fx', 'bitcrusher')),
			'with_fx :bitcrusher do\n  play :c4, release: 2\nend',
		)
	},

	'commands have nothing to hear, and an unknown kind is not guessed at'() {
		assert.strictEqual(buildPreviewCode(entry('command', 'play')), undefined)
		assert.strictEqual(buildPreviewCode(entry('something', 'play')), undefined)
	},

	'a name that is not a bare symbol is skipped rather than sent as broken code'() {
		// given builtin ids are snake_case; anything else would need quoting the builtin
		// lookup does not resolve, so the preview stays undefined instead of erroring
		const names = ['bd haus', ':leading', 'trailing:', 'dash-name', '']
		// when / then
		for (const name of names) {
			assert.strictEqual(buildPreviewCode(entry('sample', name)), undefined, `no preview for "${name}"`)
		}
		assert.strictEqual(buildPreviewCode(entry('sample', 'drum_heavy_kick')), 'sample :drum_heavy_kick, sustain: 2')
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
	console.log(failures === 0 ? 'all docs-preview tests passed' : `${failures} of ${names.length} tests failed`)
	process.exit(failures === 0 ? 0 : 1)
}

void run()
