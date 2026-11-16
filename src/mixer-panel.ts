import * as vscode from 'vscode'

export type MixerState = {
	volume: number
	drive: number
	lpfFreq: number | 'off'
	hpfFreq: number | 'off'
	stereo: boolean
	invert: boolean
}

export const formatMixerLabel = (state: MixerState): string => {
	const volumePct = Math.round(state.volume * 100)
	const driveStr = state.drive.toFixed(1)
	const lpfStr = state.lpfFreq === 'off' ? 'off' : String(state.lpfFreq)
	const hpfStr = state.hpfFreq === 'off' ? 'off' : String(state.hpfFreq)
	const stereoStr = state.stereo ? 'stereo' : 'mono'
	const invertStr = state.invert ? ' · invert' : ''
	return `$(tunnel-horizontal) vol ${volumePct}% · drive ${driveStr} · LPF ${lpfStr} · HPF ${hpfStr} · ${stereoStr}${invertStr}`
}

export type MixerBridge = {
	setDrive: (value: number) => void
	setLpf: (freq: number | 'off') => void
	setHpf: (freq: number | 'off') => void
	setStereo: (stereo: boolean) => void
	setInvert: (invert: boolean) => void
	sendMasterVolume: (value: number) => void
}

export type MixerQuickPickItem = vscode.QuickPickItem & {
	action: 'volume' | 'drive' | 'lpf' | 'hpf' | 'stereo' | 'invert'
}

export const buildMixerQuickPickItems = (state: MixerState): MixerQuickPickItem[] => {
	const items: MixerQuickPickItem[] = []

	// Volume
	items.push({
		label: `$(pulse) Volume: ${Math.round(state.volume * 100)}%`,
		description: 'Master output volume (0-100%)',
		action: 'volume',
	})

	// Drive
	items.push({
		label: `$(dash) Drive: ${state.drive.toFixed(1)}`,
		description: 'Pre-limiter gain',
		action: 'drive',
	})

	// LPF
	const lpfLabel = state.lpfFreq === 'off' ? 'LPF: off' : `LPF: ${state.lpfFreq} Hz`
	items.push({
		label: `$(filter) ${lpfLabel}`,
		description: 'Low-pass filter frequency (or "off")',
		action: 'lpf',
	})

	// HPF
	const hpfLabel = state.hpfFreq === 'off' ? 'HPF: off' : `HPF: ${state.hpfFreq} Hz`
	items.push({
		label: `$(filter) ${hpfLabel}`,
		description: 'High-pass filter frequency (or "off")',
		action: 'hpf',
	})

	// Stereo/Mono toggle
	items.push({
		label: `$(speaker) ${state.stereo ? 'Stereo' : 'Mono'}`,
		description: state.stereo ? 'Click to switch to Mono' : 'Click to switch to Stereo',
		action: 'stereo',
	})

	// Invert toggle
	items.push({
		label: `$(arrow-swap) Invert: ${state.invert ? 'On' : 'Off'}`,
		description: state.invert ? 'Click to disable stereo invert' : 'Click to enable stereo invert',
		action: 'invert',
	})

	return items
}

export const handleMixerQuickPick = async (
	picked: MixerQuickPickItem | undefined,
	state: MixerState,
	bridge: MixerBridge,
): Promise<void> => {
	if (!picked) return

	switch (picked.action) {
		case 'volume': {
			const input = await vscode.window.showInputBox({
				prompt: 'Master volume (0-100)',
				value: String(Math.round(state.volume * 100)),
			})
			if (input === undefined) return
			const match = /^\s*([+-]?\d+)\s*%?\s*$/.exec(input)
			if (!match) {
				void vscode.window.showErrorMessage('Volume must be a number from 0 to 100')
				return
			}
			const value = Math.min(100, Math.max(0, parseInt(match[1], 10)))
			bridge.sendMasterVolume(value)
			break
		}
		case 'drive': {
			const input = await vscode.window.showInputBox({
				prompt: 'Drive (e.g., 1.0, 1.5, 2.0)',
				value: String(state.drive),
			})
			if (input === undefined) return
			const value = parseFloat(input)
			if (Number.isNaN(value) || value < 0) {
				void vscode.window.showErrorMessage('Drive must be a positive number')
				return
			}
			bridge.setDrive(value)
			break
		}
		case 'lpf': {
			const input = await vscode.window.showInputBox({
				prompt: 'LPF frequency in Hz (or "off" to disable)',
				value: state.lpfFreq === 'off' ? 'off' : String(state.lpfFreq),
			})
			if (input === undefined) return
			const trimmed = input.trim().toLowerCase()
			if (trimmed === 'off' || trimmed === '0') {
				bridge.setLpf('off')
			} else {
				const freq = parseFloat(trimmed)
				if (Number.isNaN(freq) || freq <= 0) {
					void vscode.window.showErrorMessage('LPF frequency must be a positive number or "off"')
					return
				}
				bridge.setLpf(freq)
			}
			break
		}
		case 'hpf': {
			const input = await vscode.window.showInputBox({
				prompt: 'HPF frequency in Hz (or "off" to disable)',
				value: state.hpfFreq === 'off' ? 'off' : String(state.hpfFreq),
			})
			if (input === undefined) return
			const trimmed = input.trim().toLowerCase()
			if (trimmed === 'off' || trimmed === '0') {
				bridge.setHpf('off')
			} else {
				const freq = parseFloat(trimmed)
				if (Number.isNaN(freq) || freq <= 0) {
					void vscode.window.showErrorMessage('HPF frequency must be a positive number or "off"')
					return
				}
				bridge.setHpf(freq)
			}
			break
		}
		case 'stereo': {
			bridge.setStereo(!state.stereo)
			break
		}
		case 'invert': {
			bridge.setInvert(!state.invert)
			break
		}
	}
}
