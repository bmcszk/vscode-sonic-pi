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

// Detection: any midi_* call in the code opts the run in. Snake case counts:
// use_midi_notes is itself a midi function that needs /midi-start.
assert.strictEqual(shouldAutoStartMidi('midi_note_on 60', false), true)
assert.strictEqual(shouldAutoStartMidi('use_midi_notes :e1', false), true)
assert.strictEqual(shouldAutoStartMidi('sample :bd_haus', false), false)
assert.strictEqual(shouldAutoStartMidi('synth :fmidi_note', false), false, 'fmidi_note is not a midi_ call')
assert.strictEqual(shouldAutoStartMidi('play 60', false), false)

// Once-per-session guard: only the first midi run in a session sends /midi-start.
assert.strictEqual(shouldAutoStartMidi('midi_note 60', true), false, 'already sent this session')

console.log('midi.test.js: all assertions passed')
