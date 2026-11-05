// Decides whether closing an editor should shut the Sonic Pi server down:
// only when the user opted in, the server is running, no restart (audio recovery)
// is in progress, and no Sonic Pi editor remains open or visible.
export interface EditorCloseDecisionInput {
	settingEnabled: boolean
	serverRunning: boolean
	restartInProgress: boolean
	sonicPiEditorsRemaining: number
}

export function shouldStopServerOnLastEditorClose(input: EditorCloseDecisionInput): boolean {
	if (!input.settingEnabled) {
		return false
	}
	if (input.restartInProgress) {
		return false
	}
	if (!input.serverRunning) {
		return false
	}
	return input.sonicPiEditorsRemaining === 0
}
