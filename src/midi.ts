// Auto /midi-start: Sonic Pi's midi_* functions silently do nothing until the
// server receives /midi-start. This module holds the pure decision: does this
// run's code need one, given whether the session already sent it?

// A word boundary before midi_ misses snake case like use_midi_notes (an
// underscore is a word character), so the guard only excludes letter prefixes
// such as fmidi_note.
const MIDI_CALL_PATTERN = /(^|[^a-zA-Z])midi_/

export function shouldAutoStartMidi(code: string, midiAlreadyStarted: boolean): boolean {
	return !midiAlreadyStarted && MIDI_CALL_PATTERN.test(code)
}
