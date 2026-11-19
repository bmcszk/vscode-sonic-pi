import OSC from 'osc-js'

// A sender needs nothing from Main beyond the queued send fn and the daemon's token.
export type SenderContext = {
	send: (message: OSC.Message) => void
	token: number
}

// Ask the daemon to leave on its own terms (spider-server.rb:354-362 -> runtime.rb:1445-1451):
// the runtime stops the jobs scheduler-clean before its at_exit pushes /exited. The token is
// what fences the call to the daemon that booted here.
export const exitGracefully = ({ send, token }: SenderContext) => send(new OSC.Message('/exit', token))

export const cuePortStart = ({ send, token }: SenderContext) =>
	send(new OSC.Message('/cue-port-start', token))

export const cuePortStop = ({ send, token }: SenderContext) => send(new OSC.Message('/cue-port-stop', token))

export const cuePortExternal = ({ send, token }: SenderContext) =>
	send(new OSC.Message('/cue-port-external', token))

export const cuePortInternal = ({ send, token }: SenderContext) =>
	send(new OSC.Message('/cue-port-internal', token))

export const startRecording = ({ send, token }: SenderContext) =>
	send(new OSC.Message('/start-recording', token))

export const stopRecording = ({ send, token }: SenderContext) =>
	send(new OSC.Message('/stop-recording', token))

export const saveRecording = ({ send, token }: SenderContext, path: string) =>
	send(new OSC.Message('/save-recording', token, path))

export const deleteRecording = ({ send, token }: SenderContext) =>
	send(new OSC.Message('/delete-recording', token))

export const mixerInvertStereo = ({ send, token }: SenderContext) =>
	send(new OSC.Message('/mixer-invert-stereo', token))

export const mixerStandardStereo = ({ send, token }: SenderContext) =>
	send(new OSC.Message('/mixer-standard-stereo', token))

export const mixerMonoMode = ({ send, token }: SenderContext) =>
	send(new OSC.Message('/mixer-mono-mode', token))

export const mixerStereoMode = ({ send, token }: SenderContext) =>
	send(new OSC.Message('/mixer-stereo-mode', token))

// Pre-limiter gain. The daemon expects /mixer-drive(token, amp, silent); silent=1
// keeps the level change out of the cue log.
export const setDrive = ({ send, token }: SenderContext, amp: number) =>
	send(new OSC.Message('/mixer-drive', token, amp, 1))

export const setLpf = ({ send, token }: SenderContext, freq: number | 'off') =>
	send(
		freq === 'off'
			? new OSC.Message('/mixer-lpf-disable', token)
			: new OSC.Message('/mixer-lpf-enable', token, freq),
	)

export const setHpf = ({ send, token }: SenderContext, freq: number | 'off') =>
	send(
		freq === 'off'
			? new OSC.Message('/mixer-hpf-disable', token)
			: new OSC.Message('/mixer-hpf-enable', token, freq),
	)

// Master fader after the limiter; the server clamps the passed amp to 0..1.
export const setMasterVolume = ({ send, token }: SenderContext, volumePercent: number) =>
	send(new OSC.Message('/mixer-output-volume', token, volumePercent / 100))

// Per-device MIDI/gamepad enables carry on=1|0, never a boolean: the daemon tests args[3]==1
// (spider-server.rb:746-764). A gamepad is addressed by its index in devices-list.
export const midiPortEnable = (
	{ send, token }: SenderContext,
	direction: 'in' | 'out',
	port: number,
	on: boolean,
) => send(new OSC.Message('/midi-port-enable', token, direction, port, on ? 1 : 0))

// Re-enumeration: the daemon refreshes its device list and pushes it again.
export const midiReset = ({ send, token }: SenderContext) => send(new OSC.Message('/midi-reset', token))

export const gamepadEnable = ({ send, token }: SenderContext, pad: number, on: boolean) =>
	send(new OSC.Message('/gamepad-enable', token, pad, on ? 1 : 0))

export const gamepadStart = ({ send, token }: SenderContext) => send(new OSC.Message('/gamepad-start', token))

export const gamepadStop = ({ send, token }: SenderContext) => send(new OSC.Message('/gamepad-stop', token))
