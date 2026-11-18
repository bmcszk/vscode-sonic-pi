// Live-loop badges: an alive loop shows '♪ :name' on its live_loop header line.
// Pure renderer — store + document text in, decoration positions out.

import * as vscode from 'vscode'
import type { LiveLoopScopeStore } from './live-loop-scope'

export interface LiveLoopBadge {
	line: number
	text: string
}

// `live_loop :drums`, `live_loop :'bass'` and `live_loop 'bass'` all name a loop.
const LIVE_LOOP_HEADER = /^\s*live_loop\s+:?'?(\w+)/

// The '♪ :name' badge is chrome, not code: a dim colour keeps it readable without competing
// with the syntax highlighting of the header line underneath.
const BADGE_COLOR = 'rgba(150,150,150,0.9)'

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

// A badgeable editor: a Sonic Pi buffer that is a real document (not the read-only docs
// reader, which carries a builtin's text but never a live loop).
export interface BadgeEditor {
	document: { languageId: string; getText(): string; uri: { toString(): string } }
	setDecorations(
		decorationType: vscode.TextEditorDecorationType,
		decorations: vscode.DecorationOptions[],
	): void
}

const BADGE_DOCUMENT_URI = /^sonicpi-docs:/

export interface LiveLoopBadgeDecoratorDeps {
	store: LiveLoopScopeStore
	visibleEditors?: () => readonly BadgeEditor[]
}

// The vscode half of the badges: owns the decoration type, repaints the visible editors from
// the scope store. The daemon pushes scope/scope-ended, the store tracks live loops, and the
// restart path clears everything (a fresh daemon has no loops yet).
export class LiveLoopBadgeDecorator {
	private readonly store: LiveLoopScopeStore
	private readonly visibleEditors: () => readonly BadgeEditor[]
	private readonly decorationType: vscode.TextEditorDecorationType

	constructor(deps: LiveLoopBadgeDecoratorDeps) {
		this.store = deps.store
		this.visibleEditors = deps.visibleEditors ?? (() => vscode.window.visibleTextEditors)
		this.decorationType = vscode.window.createTextEditorDecorationType({
			before: { contentText: '', color: BADGE_COLOR, margin: '0 0.5em 0 0' },
		})
	}

	refresh(): void {
		for (const editor of this.visibleEditors()) {
			this.paint(editor, editor.document.languageId === 'sonic-pi' && !isDocsReader(editor))
		}
	}

	// A server restart starts a fresh generation of loops: every painted badge dies with it.
	clearAll(): void {
		for (const editor of this.visibleEditors()) {
			this.paint(editor, false)
		}
	}

	dispose(): void {
		this.clearAll()
		this.decorationType.dispose()
	}

	private paint(editor: BadgeEditor, badgeable: boolean): void {
		if (!badgeable) {
			editor.setDecorations(this.decorationType, [])
			return
		}
		const badges = badgeDecorations(this.store, editor.document.getText())
		editor.setDecorations(
			this.decorationType,
			badges.map((badge) => ({
				range: new vscode.Range(badge.line - 1, 0, badge.line - 1, 0),
				renderOptions: { before: { contentText: badge.text } },
			})),
		)
	}
}

const isDocsReader = (editor: BadgeEditor): boolean => BADGE_DOCUMENT_URI.test(editor.document.uri.toString())
