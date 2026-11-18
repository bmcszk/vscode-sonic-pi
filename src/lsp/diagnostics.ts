import * as vscode from 'vscode'
import { LspClient } from './client'

// Structural seam: the registrar may start the controller against a null client and swap
// in the real one once the server answers initialize.
export type LspClientLike = Pick<LspClient, 'request' | 'sendNotification'>

export interface LspDiagnosticItem {
	range: {
		start: { line: number; character: number }
		end: { line: number; character: number }
	}
	message: string
	severity?: number
	source?: string
	code?: string | number
}

interface ControllerOptions {
	debounceMs?: number
	collection?: vscode.DiagnosticCollection
	timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
}

const severityFor = (serverSeverity: number | undefined): vscode.DiagnosticSeverity => {
	switch (serverSeverity) {
		case 1:
			return vscode.DiagnosticSeverity.Error
		case 2:
			return vscode.DiagnosticSeverity.Warning
		case 3:
			return vscode.DiagnosticSeverity.Information
		case 4:
			return vscode.DiagnosticSeverity.Hint
		default:
			return vscode.DiagnosticSeverity.Error
	}
}

export const toVscodeDiagnostic = (item: LspDiagnosticItem): vscode.Diagnostic => ({
	message: item.message,
	severity: severityFor(item.severity),
	source: item.source,
	code: item.code,
	range: new vscode.Range(
		item.range.start.line,
		item.range.start.character,
		item.range.end.line,
		item.range.end.character,
	),
})

export class LspDiagnosticsController {
	private client: LspClientLike
	private readonly collection: vscode.DiagnosticCollection
	private readonly debounceMs: number
	private readonly timers: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
	private readonly pending = new Map<string, ReturnType<typeof setTimeout>>()
	private readonly closed = new Set<string>()
	private readonly subscriptions: vscode.Disposable[] = []
	private started = false

	constructor(client: LspClientLike, options: ControllerOptions = {}) {
		this.client = client
		this.debounceMs = options.debounceMs ?? 300
		this.timers = options.timers ?? { setTimeout, clearTimeout }
		this.collection = options.collection ?? vscode.languages.createDiagnosticCollection('sonic-pi')
	}

	start(): void {
		if (this.started) return
		this.started = true
		this.subscriptions.push(
			vscode.workspace.onDidOpenTextDocument((document) => this.onDocumentOpened(document)),
			vscode.workspace.onDidChangeTextDocument((event) => this.onDocumentChanged(event)),
			vscode.workspace.onDidCloseTextDocument((document) => this.clearDocument(document)),
			{ dispose: () => this.collection.dispose() },
			{ dispose: () => this.flushAllPending() },
		)
	}

	dispose(): void {
		for (const subscription of this.subscriptions.splice(0)) subscription.dispose()
	}

	swapClient(client: LspClientLike): void {
		this.client = client
	}

	// Public entry for documents opened before start(): the registrar replays already-open
	// editors through it once the client is ready, so the first document squiggles too.
	handleOpenedDocument(document: vscode.TextDocument): void {
		this.onDocumentOpened(document)
	}

	private onDocumentOpened(document: vscode.TextDocument): void {
		if (document.languageId !== 'sonic-pi') return
		this.closed.delete(document.uri.toString())
		this.sendDidOpen(document)
		void this.pullAndPublish(document)
	}

	private onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
		if (event.document.languageId !== 'sonic-pi') return
		const uri = event.document.uri.toString()
		const existing = this.pending.get(uri)
		if (existing) this.timers.clearTimeout(existing)
		this.pending.set(
			uri,
			this.timers.setTimeout(() => {
				this.pending.delete(uri)
				this.sendDidChange(event.document)
				void this.pullAndPublish(event.document)
			}, this.debounceMs),
		)
	}

	private flushAllPending(): void {
		for (const timer of this.pending.values()) this.timers.clearTimeout(timer)
		this.pending.clear()
	}

	private sendDidOpen(document: vscode.TextDocument): void {
		this.client.sendNotification('textDocument/didOpen', {
			textDocument: {
				uri: percentEncodeUri(document.uri),
				languageId: document.languageId,
				version: document.version,
				text: document.getText(),
			},
		})
	}

	private sendDidChange(document: vscode.TextDocument): void {
		this.client.sendNotification('textDocument/didChange', {
			textDocument: { uri: percentEncodeUri(document.uri), version: document.version },
			contentChanges: [{ text: document.getText() }],
		})
	}

	private async pullAndPublish(document: vscode.TextDocument): Promise<void> {
		let result: { items?: LspDiagnosticItem[] } | undefined
		try {
			result = (await this.client.request('textDocument/diagnostic', {
				textDocument: { uri: percentEncodeUri(document.uri) },
			})) as { items?: LspDiagnosticItem[] } | undefined
		} catch {
			// Degraded/not-ready client: the next edit re-pulls; a dead pull is silent by design.
			return
		}
		if (!result) return
		if (this.closed.has(document.uri.toString())) return
		this.collection.set(document.uri, (result.items ?? []).map(toVscodeDiagnostic))
	}

	private clearDocument(document: vscode.TextDocument): void {
		const uri = document.uri.toString()
		const timer = this.pending.get(uri)
		if (timer) {
			this.timers.clearTimeout(timer)
			this.pending.delete(uri)
		}
		this.closed.add(uri)
		this.collection.delete(document.uri)
	}
}

const percentEncodeUri = (uri: vscode.Uri): string =>
	encodeURI('file://' + uri.fsPath).replace(/[#?]/g, (c) => encodeURIComponent(c))
