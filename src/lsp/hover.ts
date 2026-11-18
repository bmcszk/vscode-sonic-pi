import * as vscode from 'vscode'
import type { LspClientLike } from './diagnostics'
import { ensureLspClient, onLspClientReady } from './shared-client'

// Ruby LSP hover/definition pass-through: the editor providers forward textDocument/hover
// and textDocument/definition to the client 1:1 and normalize the LSP result to vscode
// shapes. Completions stay client-side (static Sonic Pi builtin lists win) - no completion
// provider is registered here.

export const toVscodeHover = (
	result: {
		contents:
			| string
			| { value: string; language?: string }
			| Array<string | { value: string; language?: string }>
	} | null,
): vscode.Hover | undefined => {
	if (!result) return undefined
	const raw = result.contents
	const items = (Array.isArray(raw) ? raw : [raw]).map((item) => {
		if (typeof item === 'string') return new vscode.MarkdownString(item)
		const markdown = new vscode.MarkdownString(item.value)
		if (item.language) return { ...markdown, language: item.language, value: item.value }
		return markdown
	})
	return new vscode.Hover(items)
}

export const toVscodeLocations = (
	result:
		| {
				uri: string
				range: {
					start: { line: number; character: number }
					end: { line: number; character: number }
				}
		  }
		| Array<{
				uri: string
				range: {
					start: { line: number; character: number }
					end: { line: number; character: number }
				}
		  }>
		| null,
): vscode.Location[] | undefined => {
	if (!result) return undefined
	return (Array.isArray(result) ? result : [result]).map(
		(location) =>
			new vscode.Location(
				vscode.Uri.parse(location.uri),
				new vscode.Range(
					location.range.start.line,
					location.range.start.character,
					location.range.end.line,
					location.range.end.character,
				),
			),
	)
}

const percentEncodeUri = (uri: vscode.Uri): string =>
	encodeURI('file://' + uri.fsPath).replace(/[#?]/g, (c) => encodeURIComponent(c))

export class LspHoverController {
	private client: LspClientLike

	constructor(client: LspClientLike) {
		this.client = client
	}

	swapClient(client: LspClientLike): void {
		this.client = client
	}

	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.Hover | undefined> {
		try {
			const result = (await this.client.request('textDocument/hover', {
				textDocument: { uri: percentEncodeUri(document.uri) },
				position: { line: position.line, character: position.character },
			})) as Parameters<typeof toVscodeHover>[0]
			return toVscodeHover(result)
		} catch {
			// Degraded/not-ready client: hover stays empty until the next invocation, silently.
			return undefined
		}
	}

	async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
	): Promise<vscode.Location[] | undefined> {
		try {
			const result = (await this.client.request('textDocument/definition', {
				textDocument: { uri: percentEncodeUri(document.uri) },
				position: { line: position.line, character: position.character },
			})) as Parameters<typeof toVscodeLocations>[0]
			return toVscodeLocations(result)
		} catch {
			return undefined
		}
	}
}

// A no-op client stand-in until the shared boot resolves and readies the real server:
// requests resolve undefined (providers return null), notifications are dropped.
class NullLspClient {
	request(): Promise<undefined> {
		return Promise.resolve(undefined)
	}
	sendNotification(): void {}
}

export const registerLspLanguageFeatures = (context: vscode.ExtensionContext) => {
	const controller = new LspHoverController(new NullLspClient())
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{ language: 'sonic-pi' },
			{
				provideHover: (document, position) => controller.provideHover(document, position),
			},
		),
		vscode.languages.registerDefinitionProvider(
			{ language: 'sonic-pi' },
			{
				provideDefinition: (document, position) => controller.provideDefinition(document, position),
			},
		),
	)
	// The shared boot owns the single LspClient; once it is ready this controller swaps it in.
	onLspClientReady((client) => controller.swapClient(client))
	ensureLspClient(context)
}
