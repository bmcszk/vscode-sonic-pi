import * as vscode from 'vscode'
import { formatLinkLabel } from './link-label'
import {
	formatMixerLabel,
	type MixerState,
	type MixerBridge,
	buildMixerQuickPickItems,
	handleMixerQuickPick,
} from './mixer-panel'

export type ServerState = 'stopped' | 'starting' | 'running'

export const formatStatusLabel = (state: ServerState, version?: string): string => {
	if (state === 'starting') return '$(sync~spin) Sonic Pi: starting'
	if (state === 'running') {
		return version ? '$(radio-tower) Sonic Pi ' + version : '$(radio-tower) Sonic Pi'
	}
	return '$(circle-slash) Sonic Pi: stopped'
}

export const parseVersionReply = (args: unknown[]): string | undefined => {
	const version = args[0]
	return typeof version === 'string' && version.length > 0 ? version : undefined
}

export const parseVolumeInput = (input: string): number | undefined => {
	const match = /^\s*([+-]?\d+)\s*%?\s*$/.exec(input)
	if (!match) return undefined
	const value = parseInt(match[1], 10)
	return Math.min(100, Math.max(0, value))
}

export const deafnessLabel = '$(circle-slash) logs: elsewhere'

export class SonicPiStatusBar {
	private item: vscode.StatusBarItem
	private deafItem: vscode.StatusBarItem
	private mixerItem: vscode.StatusBarItem
	private linkItem: vscode.StatusBarItem
	private linkBpm: number | undefined
	private linkPeers: number | undefined
	private state: ServerState = 'stopped'
	private version: string | undefined
	private mixerState: MixerState = {
		volume: 1.0,
		drive: 1.0,
		stereo: true,
		invert: false,
	}
	// The box opens at the volume this window last set, so Enter is never an error on an
	// empty field and a half-typed volume is not silently replaced by a full one.
	private volume = 100

	constructor(
		private readonly bridge: MixerBridge & {
			sendVersionRequest: () => void
		},
	) {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
		this.item.command = 'vscode-sonic-pi.masterVolume'
		this.deafItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99)
		this.deafItem.text = deafnessLabel
		this.deafItem.command = 'vscode-sonic-pi.logsElsewhere'
		this.mixerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98)
		this.mixerItem.command = 'vscode-sonic-pi.mixer'
		this.linkItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97)
		this.linkItem.command = 'vscode-sonic-pi.setLinkBpm'
		this.render()
		this.item.show()
		this.mixerItem.hide()
		this.linkItem.hide()
	}

	setServerState(state: ServerState): void {
		this.state = state
		this.render()
		if (state !== 'running') {
			this.deafItem.hide()
			this.mixerItem.hide()
		}
		if (state === 'running') {
			this.bridge.sendVersionRequest()
			this.mixerItem.show()
		}
	}

	setVersion(version: string): void {
		this.version = version
		this.render()
	}

	setMixerSettings(settings: { drive: number; volume: number }): void {
		this.mixerState = {
			...this.mixerState,
			drive: settings.drive,
			volume: settings.volume,
		}
		this.renderMixer()
		if (this.state === 'running') {
			this.mixerItem.show()
		}
	}

	async showVolumeQuickPick(): Promise<void> {
		const input = await vscode.window.showInputBox({
			prompt: 'Master volume (0-100)',
			value: String(this.volume),
		})
		if (input === undefined) return
		const value = parseVolumeInput(input)
		if (value === undefined) {
			void vscode.window.showErrorMessage('Master volume must be a number from 0 to 100')
			return
		}
		this.volume = value
		this.bridge.sendMasterVolume(value)
	}

	async showMixerQuickPick(): Promise<void> {
		const items = buildMixerQuickPickItems(this.mixerState)
		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: 'Mixer settings',
		})
		this.mixerState = await handleMixerQuickPick(picked, this.mixerState, this.bridge)
		this.renderMixer()
	}

	// The Link item appears only when the daemon pushes telemetry; each push re-renders live.
	// Bpm and peers arrive on separate events, so the last value of each is kept.
	setLinkData(data: { bpm?: number; peers?: number }): void {
		if (data.bpm !== undefined) this.linkBpm = data.bpm
		if (data.peers !== undefined) this.linkPeers = data.peers
		const label = formatLinkLabel(this.linkBpm, this.linkPeers)
		if (label === undefined) {
			this.linkItem.hide()
			return
		}
		this.linkItem.text = label
		this.linkItem.show()
	}

	getCurrentBpm(): number | undefined {
		return this.linkBpm
	}

	// Deafness is only visible where the user looks: a server this window started but cannot
	// hear replies from must show in the statusbar, not only in a log channel nobody reads.
	setReceiving(receiving: boolean): void {
		if (this.state === 'running' && !receiving) this.deafItem.show()
		else this.deafItem.hide()
	}

	private render(): void {
		this.item.text = formatStatusLabel(this.state, this.version)
		this.renderMixer()
	}

	private renderMixer(): void {
		this.mixerItem.text = formatMixerLabel(this.mixerState)
	}

	dispose(): void {
		this.item.dispose()
		this.deafItem.dispose()
		this.mixerItem.dispose()
		this.linkItem.dispose()
	}
}
