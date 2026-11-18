// Docs preview: the code that plays one docs entry, built from the entry's real shape
// (docs-browser.ts DocsEntry). Wave 2 runs it silent under the 'docs-preview' workspace so
// a preview never replaces the session; this module only decides the snippet.
export type PreviewEntry = { name: string; kind: string }

const PREVIEW_NOTE = 'play :c4, release: 2'

const BARE_SYMBOL = /^[a-z_][a-z0-9_]*$/i

export function buildPreviewCode(entry: PreviewEntry): string | undefined {
	if (!BARE_SYMBOL.test(entry.name)) {
		return undefined
	}
	switch (entry.kind) {
		case 'sample':
			return `sample :${entry.name}, sustain: 2`
		case 'synth':
			return `with_synth :${entry.name} do\n  ${PREVIEW_NOTE}\nend`
		case 'fx':
			return `with_fx :${entry.name} do\n  ${PREVIEW_NOTE}\nend`
		default:
			return undefined
	}
}
