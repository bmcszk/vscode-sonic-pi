// Auto /midi-start and /gamepad-start: Sonic Pi's midi_* and gamepad_* functions silently do
// nothing until the server receives the matching start message. This module holds the pure
// decision: does this run's code need one, given whether the session already sent it?

// A word boundary before midi_ misses snake case like use_midi_notes (an underscore is a
// word character), so the guard only excludes letter prefixes such as fmidi_note.
const MIDI_CALL_PATTERN = /(^|[^a-zA-Z])midi_/
const GAMEPAD_CALL_PATTERN = /(^|[^a-zA-Z])gamepad_/

export function shouldAutoStartMidi(code: string, midiAlreadyStarted: boolean): boolean {
	return !midiAlreadyStarted && MIDI_CALL_PATTERN.test(code)
}

export function shouldAutoStartGamepad(code: string, gamepadAlreadyStarted: boolean): boolean {
	return !gamepadAlreadyStarted && GAMEPAD_CALL_PATTERN.test(code)
}
