import { commands, fx, samples, synths } from './builtins/builtins'
import * as vscode from 'vscode'

export type DocsEntry = {
	kind: 'synth' | 'fx' | 'sample' | 'command'
	name: string
	detail: string
	options: { name: string; detail: string; default?: string }[]
}

const synthsDocs: DocsEntry[] = synths.map((s) => ({ kind: 'synth', name: s.id, detail: s.detail, options: s.options }))
const fxsDocs: DocsEntry[] = fx.map((f) => ({ kind: 'fx', name: f.id, detail: f.detail, options: f.options }))
const samplesDocs: DocsEntry[] = samples.map((s) => ({
	kind: 'sample',
	name: s.id,
	detail: s.name || s.detail,
	options: s.options,
}))
const commandsDocs: DocsEntry[] = commands.map((c) => ({
	kind: 'command',
	name: c.token,
	detail: c.description ?? '',
	options: [],
}))

export const allDocsEntries: DocsEntry[] = [...commandsDocs, ...synthsDocs, ...fxsDocs, ...samplesDocs]

export function filterDocsEntries(query: string): DocsEntry[] {
	const q = query.toLowerCase().trim()
	if (q === '') return allDocsEntries
	return allDocsEntries.filter((entry) => entry.name.toLowerCase().includes(q))
}

export function formatDocsDetail(entry: DocsEntry): string {
	const lines = [`(${entry.kind}) ${entry.name}`, '', entry.detail]
	if (entry.options.length > 0) {
		lines.push('', 'Options:')
		for (const option of entry.options) {
			const defaults = option.default ? ` (default: ${option.default})` : ''
			lines.push(`  ${option.name}: ${option.detail}${defaults}`)
		}
	}
	return lines.join('\n')
}

export async function showDocsBrowser(): Promise<void> {
	const query = await vscode.window.showInputBox({
		prompt: 'Search Sonic Pi docs (synths, FX, samples, commands)',
		placeHolder: 'e.g. slice, wrongbass, play',
	})
	if (query === undefined) return

	const matches = filterDocsEntries(query)
	if (matches.length === 0) {
		void vscode.window.showInformationMessage(`No Sonic Pi docs match "${query}"`)
		return
	}

	const picked = await vscode.window.showQuickPick(
		matches.map((entry) => ({ label: entry.name, description: entry.kind, entry })),
		{ placeHolder: `${matches.length} matching Sonic Pi builtins` },
	)
	if (!picked) return

	const outputChannel = vscode.window.createOutputChannel('Sonic Pi Docs')
	outputChannel.clear()
	outputChannel.append(formatDocsDetail(picked.entry))
	outputChannel.show(true)
}
