#!/usr/bin/env node
// Auto /midi-start: run code containing midi_* functions needs one /midi-start
// per server session. Pure detection + once-per-session guard logic.
const assert = require('assert')
const Module = require('module')

const vscodeStub = {
	EventEmitter: require('events').EventEmitter,
	window: {},
	workspace: {
		getConfiguration: () => ({}),
	},
}

const load = Module._load
Module._load = function (request) {
	if (request === 'vscode') return vscodeStub
	return load.apply(this, arguments)
}

const { shouldAutoStartMidi } = require('../../out/midi.js')

const tests = {
	'detects midi_ calls in the run code'() {
		assert.strictEqual(shouldAutoStartMidi('midi_note_on 60', false), true)
	},

	'snake case counts as a midi call: use_midi_notes needs /midi-start'() {
		assert.strictEqual(shouldAutoStartMidi('use_midi_notes :e1', false), true)
	},

	'code without midi calls does not opt in'() {
		assert.strictEqual(shouldAutoStartMidi('sample :bd_haus', false), false)
		assert.strictEqual(shouldAutoStartMidi('play 60', false), false)
	},

	'fmidi_note is not a midi_ call'() {
		assert.strictEqual(shouldAutoStartMidi('synth :fmidi_note', false), false)
	},

	'once-per-session: a second midi run does not resend /midi-start'() {
		assert.strictEqual(shouldAutoStartMidi('midi_note 60', true), false)
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
			console.log(`  ${error.message}`)
		}
	}
	console.log(failures === 0 ? 'midi.test.js: all assertions passed' : `${failures} midi test(s) failed`)
	process.exit(failures === 0 ? 0 : 1)
}

runAll()
