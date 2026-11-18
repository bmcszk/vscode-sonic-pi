// MIDI ports and gamepads arrive from the daemon as one string of 'enabled<TAB>name'
// lines (runtime.rb:1949-1951, one encoder for both), so one parser and one item
// builder serve both pickers. The item builders are pure so the picker shape is
// testable without vscode (pattern: audio-device-picker.ts buildDeviceQuickPickItems).
import * as vscode from 'vscode'

export type DevicePair = { name: string; enabled: boolean }

export type PortDirection = 'in' | 'out'

export type PortQuickPickItem = vscode.QuickPickItem & {
	port?: PortDirection
	enabled?: boolean
}

export type GamepadQuickPickItem = vscode.QuickPickItem & {
	pad?: number
	enabled?: boolean
}

const DIRECTION_LABELS: Record<PortDirection, string> = { in: 'Inputs', out: 'Outputs' }

const toggleLabel = (enabled: boolean) => (enabled ? '$(check)' : '$(circle-outline)')

export function parseDevicePairs(val: string): DevicePair[] {
	const pairs: DevicePair[] = []
	for (const line of val.split('\n')) {
		if (line.trim() === '') {
			continue
		}
		const tab = line.indexOf('\t')
		if (tab === -1) {
			pairs.push({ name: line.trim(), enabled: false })
			continue
		}
		pairs.push({
			name: line.slice(tab + 1).trim(),
			enabled: line.slice(0, tab).trim().toLowerCase() === 'true',
		})
	}
	return pairs
}

export const buildPortQuickPickItems = (
	inPorts: DevicePair[],
	outPorts: DevicePair[],
): PortQuickPickItem[] => {
	const itemGroups: { direction: PortDirection; pairs: DevicePair[] }[] = [
		{ direction: 'in', pairs: inPorts },
		{ direction: 'out', pairs: outPorts },
	]
	const items: PortQuickPickItem[] = []
	for (const group of itemGroups) {
		if (group.pairs.length === 0) {
			continue
		}
		items.push({ label: DIRECTION_LABELS[group.direction], kind: vscode.QuickPickItemKind.Separator })
		for (const pair of group.pairs) {
			items.push({
				label: `${toggleLabel(pair.enabled)} ${pair.name}`,
				description: DIRECTION_LABELS[group.direction].replace(/s$/, ''),
				port: group.direction,
				enabled: pair.enabled,
			})
		}
	}
	return items
}

export const buildGamepadQuickPickItems = (pads: DevicePair[]): GamepadQuickPickItem[] => {
	if (pads.length === 0) {
		return []
	}
	const items: GamepadQuickPickItem[] = [{ label: 'Gamepads', kind: vscode.QuickPickItemKind.Separator }]
	// /gamepad-enable addresses a pad by its index in this list (spider-server.rb:756).
	pads.forEach((pad, index) => {
		items.push({
			label: `${toggleLabel(pad.enabled)} ${pad.name}`,
			description: 'Gamepad',
			pad: index,
			enabled: pad.enabled,
		})
	})
	return items
}
