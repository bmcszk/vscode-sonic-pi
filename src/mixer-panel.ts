import * as vscode from 'vscode'

export type MixerState = {
	volume: number
	drive: number
	stereo: boolean
	invert: boolean
}

export const formatMixerLabel = (state: MixerState): string => {
	const volumePct = Math.round(state.volume * 100)
	const driveStr = state.drive.toFixed(1)
	const stereoStr = state.stereo ? 'stereo' : 'mono'
	const invertStr = state.invert ? ' · invert' : ''
	return `$(tunnel-horizontal) vol ${volumePct}% · drive ${driveStr} · ${stereoStr}${invertStr}`
}

export type MixerBridge = {
	setDrive: (value: number) => void
	setStereo: (stereo: boolean) => void
	setInvert: (invert: boolean) => void
	sendMasterVolume: (value: number) => void
}

export type MixerAction = 'volume' | 'drive' | 'stereo' | 'invert'

export type MixerQuickPickItem = vscode.QuickPickItem & {
	action?: MixerAction
}

export const buildMixerQuickPickItems = (state: MixerState): MixerQuickPickItem[] => [
	{
		label: `$(pulse) Volume: ${Math.round(state.volume * 100)}%`,
		description: 'Master output volume (0-100%)',
		action: 'volume',
	},
	{
		label: `$(dash) Drive: ${state.drive.toFixed(1)}`,
		description: 'Pre-limiter gain',
		action: 'drive',
	},
	unavailableFilterItem('LPF', 'set_mixer_lpf!'),
	unavailableFilterItem('HPF', 'set_mixer_hpf!'),
	{
		label: `$(speaker) ${state.stereo ? 'Stereo' : 'Mono'}`,
		description: state.stereo ? 'Click to switch to Mono' : 'Click to switch to Stereo',
		action: 'stereo',
	},
	{
		label: `$(arrow-swap) Invert: ${state.invert ? 'On' : 'Off'}`,
		description: state.invert ? 'Click to disable stereo invert' : 'Click to enable stereo invert',
		action: 'invert',
	},
]

// Sonic Pi 5.0.0's /mixer-lpf-* and /mixer-hpf-* handlers call set_mixer_lpf!/set_mixer_hpf!,
// which its Ruby lib does not define: every send raises NoMethodError inside the daemon.
// A separator is VS Code's only non-selectable QuickPickItemKind, so the gap is stated, not clickable.
const unavailableFilterItem = (name: 'LPF' | 'HPF', missingMethod: string): MixerQuickPickItem => ({
	label: `$(filter) ${name} (unavailable in Sonic Pi 5.0.x) — not implemented upstream: ${missingMethod} missing in Sonic Pi 5.0.0 daemon`,
	kind: vscode.QuickPickItemKind.Separator,
})

export const handleMixerQuickPick = async (
	picked: MixerQuickPickItem | undefined,
	state: MixerState,
	bridge: MixerBridge,
): Promise<MixerState> => {
	if (!picked) return state

	switch (picked.action) {
		case 'volume': {
			const input = await vscode.window.showInputBox({
				prompt: 'Master volume (0-100)',
				value: String(Math.round(state.volume * 100)),
			})
			if (input === undefined) return state
			const match = /^\s*([+-]?\d+)\s*%?\s*$/.exec(input)
			if (!match) {
				void vscode.window.showErrorMessage('Volume must be a number from 0 to 100')
				return state
			}
			const value = Math.min(100, Math.max(0, parseInt(match[1], 10)))
			bridge.sendMasterVolume(value)
			return state
		}
		case 'drive': {
			const input = await vscode.window.showInputBox({
				prompt: 'Drive (e.g., 1.0, 1.5, 2.0)',
				value: String(state.drive),
			})
			if (input === undefined) return state
			const value = parseFloat(input)
			if (Number.isNaN(value) || value < 0) {
				void vscode.window.showErrorMessage('Drive must be a positive number')
				return state
			}
			bridge.setDrive(value)
			return state
		}
		case 'stereo': {
			const stereo = !state.stereo
			bridge.setStereo(stereo)
			return { ...state, stereo }
		}
		case 'invert': {
			const invert = !state.invert
			bridge.setInvert(invert)
			return { ...state, invert }
		}
	}
	return state
}
