// Live-loop badges: an alive loop shows '♪ :name' on its live_loop header line.
// Pure renderer — store + document text in, decoration positions out.

import type { LiveLoopScopeStore } from './live-loop-scope'

export interface LiveLoopBadge {
	line: number
	text: string
}

// `live_loop :drums`, `live_loop :'bass'` and `live_loop 'bass'` all name a loop.
const LIVE_LOOP_HEADER = /^\s*live_loop\s+:?'?(\w+)/

export const badgeDecorations = (store: LiveLoopScopeStore, documentText: string): LiveLoopBadge[] => {
	const headerLines = liveLoopHeaderLines(documentText)
	return store
		.list()
		.map((scope) => ({ scope, line: headerLines.get(scope.name) ?? scope.line }))
		.filter(({ line }) => isDocumentLine(documentText, line))
		.map(({ scope, line }) => ({ line, text: `♪ :${scope.name}` }))
}

// Loop name -> the line its `live_loop :name` header sits on in this text; later
// definitions of the same name win, matching which one the daemon re-registered.
const liveLoopHeaderLines = (documentText: string): Map<string, number> => {
	const headerLines = new Map<string, number>()
	documentText.split('\n').forEach((lineText, index) => {
		const match = LIVE_LOOP_HEADER.exec(lineText)
		if (match) headerLines.set(match[1], index + 1)
	})
	return headerLines
}

// The daemon's pushed line is file-absolute; a notebook cell's text is shorter than it.
const isDocumentLine = (documentText: string, line: number): boolean =>
	Number.isInteger(line) && line >= 1 && line <= documentText.split('\n').length
