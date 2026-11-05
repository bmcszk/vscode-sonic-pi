import { commands, fx, samples, synths } from './builtins/builtins'
import * as vscode from 'vscode'

export type DocsEntry = {
	kind: 'synth' | 'fx' | 'sample' | 'command'
	name: string
	detail: string
	options: { name: string; detail: string; default?: string }[]
}

const synthsDocs: DocsEntry[] = synths.map((s) => ({
	kind: 'synth',
	name: s.id,
	detail: s.detail,
	options: s.options,
}))
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
	// A category word ("synth(s)", "fx", "sample(s)", "command(s)") selects that kind
	// alone; anything else matches names and description text.
	const kinds = ['synth', 'fx', 'sample', 'command']
	const category = kinds.find((kind) => kind.startsWith(q.replace(/s$/, '')) || q === kind + 's')
	if (category) {
		return allDocsEntries.filter((entry) => entry.kind === category)
	}
	return allDocsEntries.filter(
		(entry) => entry.name.toLowerCase().includes(q) || entry.detail.toLowerCase().includes(q),
	)
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
	// Open with everything; the QuickPick's own filter box does the searching. An
	// input-box-first design dead-ends on category words like "synths" that are
	// visible only after you see the entries.
	const picked = await vscode.window.showQuickPick(
		allDocsEntries.map((entry) => ({
			label: entry.name,
			description: entry.kind,
			detail: entry.detail,
			entry,
		})),
		{
			placeHolder: `${allDocsEntries.length} Sonic Pi builtins - type to search (names, kinds, descriptions)`,
		},
	)
	if (!picked) return

	const outputChannel = vscode.window.createOutputChannel('Sonic Pi Docs')
	outputChannel.clear()
	outputChannel.append(formatDocsDetail(picked.entry))
	outputChannel.show(true)
}
