import * as vscode from 'vscode'

// Pushes the daemon sends and the editor reacts to. Each is a re-bindable field so Main
// decides when a subscription is wired up; nothing here holds behavior.
export const onCue = new vscode.EventEmitter<{
	time: number
	id: number
	address: string
	args: string
}>()
export const onRunStarted = new vscode.EventEmitter<number>()
// The same start plus the workspace the run was sent under: a cell run sends its block's key
// there, which is how a run maps back to the block that plays it.
export const onWorkspaceStarted = new vscode.EventEmitter<{ jobId: number; workspace: string }>()
export const onRunEnded = new vscode.EventEmitter<number>()
export const onFlash = new vscode.EventEmitter<{ workspace: string; line: number }>()
export const onServerRestart = new vscode.EventEmitter<void>()
export const onReceiverFailed = new vscode.EventEmitter<void>()
export const onReceiverOpened = new vscode.EventEmitter<void>()
export const onServerState = new vscode.EventEmitter<'stopped' | 'starting' | 'running'>()
export const onVersion = new vscode.EventEmitter<string>()
export const onMixerSettings = new vscode.EventEmitter<{ drive: number; volume: number }>()
export const onSupersonicDevices = new vscode.EventEmitter<{
	kind: 'output' | 'input' | 'table'
	names: string[]
}>()
export const onLinkBpm = new vscode.EventEmitter<number>()
export const onLinkPeers = new vscode.EventEmitter<number>()
export const onLiveLoopScope = new vscode.EventEmitter<{
	jobid: number
	name: string
	workspace: string
	line: number
	scopeNum: number
}>()
export const onLiveLoopScopeEnded = new vscode.EventEmitter<{ jobid: number; name: string }>()
