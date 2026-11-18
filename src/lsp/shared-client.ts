import * as vscode from 'vscode'
import { LspClient, resolveRubyLspPathFromConfig } from './client'

export type LspCapability =
	| 'starting'
	| 'ready'
	| 'off'
	| 'unavailable:no-binary'
	| 'unavailable:no-bundler'
	| 'degraded:respawn-exhausted'

export interface SharedLspClientOptions {
	createClient?: () => LspClient
	resolveServerPath?: () => string | null
}

const OUTPUT_CHANNEL_NAME = 'Sonic Pi'
const NO_BINARY_HINT = 'Sonic Pi: ruby-lsp not found - static language features only'
const NO_BUNDLER_HINT = 'Sonic Pi: ruby-lsp needs the bundler gem - static language features only'
const SETTINGS_ACTION = 'Settings'

let capability: LspCapability = 'starting'
let started = false
let hintShown = false
let outputChannel: vscode.OutputChannel | undefined
const readyListeners: Array<(client: LspClient) => void> = []

const logTransition = (next: LspCapability): void => {
	if (next === capability) return
	capability = next
	outputChannel?.appendLine(`[lsp] capability: ${next}`)
}

export const getLspCapabilityStatus = (): LspCapability => capability

export const onLspClientReady = (listener: (client: LspClient) => void): void => {
	readyListeners.push(listener)
}

const showUnavailableHint = (message: string): void => {
	if (hintShown) return
	hintShown = true
	void vscode.window.showInformationMessage(message, SETTINGS_ACTION).then((choice) => {
		if (choice === SETTINGS_ACTION)
			void vscode.commands.executeCommand(
				'workbench.action.openSettings',
				'vscode-sonic-pi.rubyLspPath',
			)
	})
}

// Degraded with isAvailable still true means the respawn budget ran out; a false
// isAvailable is the bundler-missing exit the client classifies from stderr.
const classifyCapability = (client: LspClient): LspCapability => {
	if (client.state === 'ready') return 'ready'
	if (!client.isAvailable) return 'unavailable:no-bundler'
	if (client.state === 'degraded') return 'degraded:respawn-exhausted'
	return 'starting'
}

const settleCapability = (client: LspClient): void => {
	if (capability !== 'starting') return
	const next = classifyCapability(client)
	logTransition(next)
	if (next === 'unavailable:no-binary') showUnavailableHint(NO_BINARY_HINT)
	else if (next === 'unavailable:no-bundler') showUnavailableHint(NO_BUNDLER_HINT)
	else if (next === 'ready') for (const listener of readyListeners.splice(0)) listener(client)
}

const bootSharedClient = (context: vscode.ExtensionContext, client: LspClient): void => {
	logTransition('starting')
	context.subscriptions.push({ dispose: () => void client.dispose() })
	void client.start().then(
		() => settleCapability(client),
		() => settleCapability(client),
	)
	void client.disposed.then(() => settleCapability(client))
}

// One LspClient per window: the first .pi open boots it once; both registrars consume the
// same instance through onLspClientReady and the shared boot listener lives here, so the
// per-registrar listeners from diagnostics/hover are gone.
const rubyLspEnabled = (): boolean =>
	vscode.workspace.getConfiguration('vscode-sonic-pi').get('rubyLsp.enabled') ?? true

export const ensureLspClient = (context: vscode.ExtensionContext, options: SharedLspClientOptions = {}) => {
	if (!outputChannel) outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME)
	const onFirstPiDocument = vscode.workspace.onDidOpenTextDocument((document) => {
		if (started || document.languageId !== 'sonic-pi') return
		if (!rubyLspEnabled()) {
			started = true
			logTransition('off')
			return
		}
		let client: LspClient | undefined
		if (options.createClient) {
			client = options.createClient()
		} else {
			const serverPath = options.resolveServerPath?.() ?? resolveRubyLspPathFromConfig()
			const workspaceFolderUri = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
			if (serverPath && workspaceFolderUri) client = new LspClient({ serverPath, workspaceFolderUri })
		}
		if (!client) {
			started = true
			logTransition('unavailable:no-binary')
			showUnavailableHint(NO_BINARY_HINT)
			return
		}
		started = true
		bootSharedClient(context, client)
	})
	context.subscriptions.push(onFirstPiDocument)
}

export const resetSharedLspClientForTesting = (): void => {
	started = false
	hintShown = false
	capability = 'starting'
	readyListeners.length = 0
}
