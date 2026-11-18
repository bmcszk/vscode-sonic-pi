// Device picker (QuickPick) items from the daemon's supersonic device pushes, plus the
// pick dispatch with the running-code restart confirm (bean sonic-pi-z8p8). The item
// builder is pure so the picker shape is testable without vscode.
import * as vscode from 'vscode'

export const RUNNING_CODE_CONFIRM = {
	message: 'Switching the audio device restarts your running code. Continue?',
	confirm: 'Continue',
}

export type DeviceQuickPickItem = vscode.QuickPickItem & {
	action?: 'switch' | 'reopen'
	deviceName?: string
}

export type DeviceNames = { kind: 'output' | 'input' | 'table'; names: string[] }

export type DeviceBridge = {
	requestAudioDevices: () => void
	switchAudioDevice: (key: string) => void
	reopenAudioDevice: () => void
}

export type DevicePrompt = {
	showQuickPick: (
		items: DeviceQuickPickItem[],
		options?: vscode.QuickPickOptions,
	) => Thenable<DeviceQuickPickItem | undefined>
	showWarningMessage: (message: string, ...items: string[]) => Thenable<string | undefined>
}

const SECTION_LABELS: Record<DeviceNames['kind'], string> = {
	output: 'Outputs',
	input: 'Inputs',
	table: 'Devices',
}

export const buildDeviceQuickPickItems = (devices: DeviceNames | DeviceNames[]): DeviceQuickPickItem[] => {
	const deviceGroups = Array.isArray(devices) ? devices : [devices]
	const items: DeviceQuickPickItem[] = []
	let firstSection = true
	for (const group of deviceGroups) {
		if (group.names.length === 0) {
			continue
		}
		if (!firstSection) {
			items.push({ label: SECTION_LABELS[group.kind], kind: vscode.QuickPickItemKind.Separator })
		}
		firstSection = false
		for (const name of group.names) {
			items.push({
				label: name,
				description: SECTION_LABELS[group.kind].replace(/s$/, ''),
				action: 'switch',
				deviceName: name,
			})
		}
	}
	items.push({ label: '', kind: vscode.QuickPickItemKind.Separator })
	items.push({ label: 'Reset audio device', description: 'Reopen the current device', action: 'reopen' })
	return items
}

export const runDevicePicker = async (
	bridge: DeviceBridge,
	deviceGroups: DeviceNames[],
	prompt: DevicePrompt,
) => {
	const items = buildDeviceQuickPickItems(deviceGroups)
	const picked = await prompt.showQuickPick(items, { placeHolder: 'Audio devices' })
	if (!picked) {
		return
	}
	const answer = await prompt.showWarningMessage(RUNNING_CODE_CONFIRM.message, RUNNING_CODE_CONFIRM.confirm)
	if (answer !== RUNNING_CODE_CONFIRM.confirm) {
		return
	}
	if (picked.action === 'switch') {
		bridge.switchAudioDevice(picked.deviceName!)
	} else {
		bridge.reopenAudioDevice()
	}
}
