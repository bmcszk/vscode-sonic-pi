import * as vscode from 'vscode'

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
	private state: ServerState = 'stopped'
	private version: string | undefined
	// The box opens at the volume this window last set, so Enter is never an error on an
	// empty field and a half-typed volume is not silently replaced by a full one.
	private volume = 100

	constructor(
		private readonly bridge: {
			sendVersionRequest: () => void
			sendMasterVolume: (value: number) => void
		},
	) {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
		this.item.command = 'vscode-sonic-pi.masterVolume'
		this.deafItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99)
		this.deafItem.text = deafnessLabel
		this.deafItem.command = 'vscode-sonic-pi.logsElsewhere'
		this.render()
		this.item.show()
	}

	setServerState(state: ServerState): void {
		this.state = state
		this.render()
		if (state !== 'running') this.deafItem.hide()
		if (state === 'running') {
			this.bridge.sendVersionRequest()
		}
	}

	setVersion(version: string): void {
		this.version = version
		this.render()
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

	// Deafness is only visible where the user looks: a server this window started but cannot
	// hear replies from must show in the statusbar, not only in a log channel nobody reads.
	setReceiving(receiving: boolean): void {
		if (this.state === 'running' && !receiving) this.deafItem.show()
		else this.deafItem.hide()
	}

	private render(): void {
		this.item.text = formatStatusLabel(this.state, this.version)
	}

	dispose(): void {
		this.item.dispose()
		this.deafItem.dispose()
	}
}
