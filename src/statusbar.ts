import * as vscode from 'vscode'
import { formatTempoLabel } from './link-label'
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

export const deafnessLabel = '$(circle-slash) logs: elsewhere'

export class SonicPiStatusBar {
	private item: vscode.StatusBarItem
	private deafItem: vscode.StatusBarItem
	private mixerItem: vscode.StatusBarItem
	private linkItem: vscode.StatusBarItem
	private linkBpm: number | undefined
	private sessionBpm: number | undefined
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
	private lastSetVolume: number | undefined

	private readonly rememberVolume = (percent: number): void => {
		this.lastSetVolume = percent
	}

	constructor(
		private readonly bridge: MixerBridge & {
			sendVersionRequest: () => void
		},
	) {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
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

	// The mixer item is the window's single volume surface: the master volume box lives in this
	// popover, so the statusbar carries one volume number and one way to change it.
	async showMixerQuickPick(): Promise<void> {
		const items = buildMixerQuickPickItems(this.mixerState)
		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: 'Mixer settings',
		})
		const defaults = { lastSetPercent: this.lastSetVolume, onVolumeSet: this.rememberVolume }
		this.mixerState = await handleMixerQuickPick(picked, this.mixerState, this.bridge, defaults)
		this.renderMixer()
	}

	// The tempo item appears only when the daemon pushes a tempo; each push re-renders live.
	// Tempo and peers arrive on separate events, so the last value of each is kept.
	setLinkData(data: { bpm?: number; sessionBpm?: number; peers?: number }): void {
		if (data.bpm !== undefined) this.linkBpm = data.bpm
		if (data.sessionBpm !== undefined) this.sessionBpm = data.sessionBpm
		if (data.peers !== undefined) this.linkPeers = data.peers
		const label = formatTempoLabel({
			linkBpm: this.linkBpm,
			sessionBpm: this.sessionBpm,
			peers: this.linkPeers,
		})
		if (label === undefined) {
			this.linkItem.hide()
			return
		}
		this.linkItem.text = label
		this.linkItem.show()
	}

	getCurrentBpm(): number | undefined {
		return this.linkBpm ?? this.sessionBpm
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
