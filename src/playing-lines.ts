import * as vscode from 'vscode'
import { FlashPaint } from './cell-flash-map'

const FLASH_TTL_MS = 250
// A flash whose line no run has reported yet goes out at the TTL above. Once the daemon names the
// run it belongs to, the line is the run's and stays lit until the run ends: a burst of blocks
// would otherwise fade between pushes, leaving half the file lit.
const DECORATION_END_CHARACTER = 1000
// The one workspace a GUI run reports under: the runner sends every script under it.
const OUR_RUN_WORKSPACE = 'eval'

export interface PlayingLineSettings {
	flashBackgroundColor(): string
	flashTextColor(): string
	showPlayingLineHighlight(): boolean
}

export interface PlayingLineEditor {
	document: { uri: { toString(): string } }
	setDecorations(decorationType: vscode.TextEditorDecorationType, ranges: vscode.Range[]): void
}

export interface PlayingLineHighlighterDeps {
	config: PlayingLineSettings
	editor?: () => PlayingLineEditor | undefined
	// Notebook runs flash joined-script lines, which belong to one cell editor rather than a file.
	flashTarget?: (workspace: string, line: number) => FlashPaint
	now?: () => number
	schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
	cancel?: (timer: ReturnType<typeof setTimeout>) => void
}

interface ActiveLine {
	range: vscode.Range
	// Lit until the run that owns it ends; a line no run has claimed yet keeps its own deadline.
	playing: boolean
	expiresAt: number
}

// Turns Sonic Pi's /flash (workspace, line) into the GUI's transient line background: a flashed
// line stays lit for 250 ms, and repeated triggers refresh it instead of stacking. A line of a
// run the daemon reported as playing stays lit until that run ends.
export class PlayingLineHighlighter {
	private readonly config: PlayingLineSettings
	private readonly editor: () => PlayingLineEditor | undefined
	private readonly flashTarget: (workspace: string, line: number) => FlashPaint
	private readonly now: () => number
	private readonly schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
	private readonly cancel: (timer: ReturnType<typeof setTimeout>) => void
	private readonly decorationType: vscode.TextEditorDecorationType
	private readonly activeLines = new Map<number, ActiveLine>()
	// The document the live run's flashes belong to, and the document each lit line belongs to: a
	// flash paints only while its run's document is the one in the editor. One GUI session plays
	// one script at a time, so a new run replaces the previous run's document.
	private readonly runDocument: { document: string | undefined } = { document: undefined }
	private readonly lineDocuments = new Map<number, string>()
	private paintedEditors = new Set<PlayingLineEditor>()
	private sweepTimer: ReturnType<typeof setTimeout> | undefined
	private sweepAt = 0

	constructor(deps: PlayingLineHighlighterDeps) {
		this.config = deps.config
		this.editor = deps.editor ?? (() => vscode.window.activeTextEditor)
		this.flashTarget = deps.flashTarget ?? sameLineOfFile
		this.now = deps.now ?? (() => Date.now())
		this.schedule = deps.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
		this.cancel = deps.cancel ?? ((timer) => clearTimeout(timer))
		this.decorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: this.config.flashBackgroundColor(),
			color: this.config.flashTextColor(),
			isWholeLine: true,
		})
	}

	// The daemon reports file-absolute lines because a file run is sent with its file position
	// already in place (a fragment is comment-padded up to its start line). A notebook run reports
	// lines of the joined script instead, so the target decides which line of which editor it is.
	// A flash paints into the editor showing the document its run belongs to. A flash no docked run
	// claims falls back to the 250 ms blip in the focused editor: the mark needs a run, the blip
	// does not, so a highlight never disappears for lack of a dock.
	flash(workspace: string, line: number): void {
		if (!this.isPaintable(workspace, line)) return
		const target = this.flashTarget(workspace, line)
		if (target.kind === 'none') return
		const editor = this.editor()
		if (!editor) return
		const document = this.runDocument.document
		if (document === undefined) {
			const focusedDocument = editor.document.uri.toString()
			this.lightLine(target.line, focusedDocument, false)
		} else if (this.paintsForRun(document, editor)) {
			this.lightLine(target.line, document, true)
		}
		this.paint()
		this.scheduleSweep()
	}

	// The daemon named the job that is playing: its lines stay lit until the run ends, whatever
	// the flash TTL would do to them. A notification, not a repaint: the run-start listener runs
	// inside the daemon event, and making the editors update there is the caller's turn to take.
	runStarted(document: string | undefined): void {
		if (document === undefined) return
		this.runDocument.document = document
		this.claimLines(document)
	}

	runEnded(): void {
		const document = this.runDocument.document
		this.runDocument.document = undefined
		if (document === undefined) return
		this.releaseLines(document)
		this.paint()
		this.scheduleSweep()
	}

	// The whole session went quiet: no run is left to keep a line lit.
	endAllRuns(): void {
		this.runDocument.document = undefined
		this.lineDocuments.clear()
		for (const [line, active] of this.activeLines) {
			if (active.playing) this.activeLines.delete(line)
		}
		this.paint()
		this.scheduleSweep()
	}

	// An edit rewrote the document's lines from `firstChangedLine` on: the daemon's lines no longer
	// mean what the user reads, so the stale ones go dark until the run reports again.
	forgetLines(document: string, firstChangedLine: number): void {
		for (const [line, active] of this.activeLines) {
			if (this.lineDocuments.get(line) !== document) continue
			if (active.range.start.line >= firstChangedLine - 1) this.activeLines.delete(line)
		}
		this.paint()
		this.scheduleSweep()
	}

	clear(): void {
		this.activeLines.clear()
		this.lineDocuments.clear()
		this.runDocument.document = undefined
		this.cancelSweep()
		this.paint()
	}

	dispose(): void {
		this.clear()
		this.decorationType.dispose()
	}

	private isPaintable(workspace: string, line: number): boolean {
		const ourRun = workspace === OUR_RUN_WORKSPACE
		const positive = Number.isInteger(line) && line >= 1
		return ourRun && positive && this.config.showPlayingLineHighlight()
	}

	// A flash paints only into the editor showing the document its run belongs to. A run whose
	// dock names another document keeps its lines dark here rather than lighting the wrong file.
	private paintsForRun(document: string, editor: PlayingLineEditor): boolean {
		return editor.document.uri.toString() === document
	}

	// A line flashed while its document's run is the live one is the run's line: it lasts until the
	// run ends, not the flash TTL. A line lit before the run was announced joins it the same way.
	// A line of the docked run lasts until the run ends; a line no run claimed goes out at its TTL.
	// A line already lit keeps the stronger of the two, so the run's claim outlives later blips.
	private lightLine(line: number, document: string, playing: boolean): void {
		const editorLine = line - 1
		const range = new vscode.Range(editorLine, 0, editorLine, DECORATION_END_CHARACTER)
		const active = this.activeLines.get(line)
		if (active) {
			active.expiresAt = this.now() + FLASH_TTL_MS
			active.playing = active.playing || playing
			return
		}
		const lit: ActiveLine = { range, playing, expiresAt: this.now() + FLASH_TTL_MS }
		this.activeLines.set(line, lit)
		this.lineDocuments.set(line, document)
	}

	// The daemon reports the job once its code is already sending flashes, so the lines lit before
	// the announcement are the run's lines too.
	private claimLines(document: string): void {
		for (const [line, active] of this.activeLines) {
			if (this.lineDocuments.get(line) !== document) continue
			active.playing = true
		}
	}

	private releaseLines(document: string): void {
		for (const [line, active] of this.activeLines) {
			const owned = this.lineDocuments.get(line) === document
			if (owned && active.playing) this.activeLines.delete(line)
		}
	}

	// The next sweep is due at the earliest live deadline. A repeat flash moves its line's deadline
	// forward, so a timer armed for the old one is re-armed rather than left to fire early.
	private scheduleSweep(): void {
		if (this.activeLines.size === 0) {
			this.cancelSweep()
			return
		}
		const nextExpiry = this.earliestDeadline()
		if (!Number.isFinite(nextExpiry)) {
			this.cancelSweep()
			return
		}
		if (this.sweepTimer !== undefined && this.sweepAt === nextExpiry) return
		this.cancelSweep()
		this.sweepAt = nextExpiry
		this.sweepTimer = this.schedule(
			() => {
				this.sweepTimer = undefined
				this.sweep()
				this.scheduleSweep()
			},
			Math.max(0, nextExpiry - this.now()),
		)
	}

	private earliestDeadline(): number {
		const deadlines = [...this.activeLines.values()]
			.filter((active) => !active.playing)
			.map((active) => active.expiresAt)
		if (deadlines.length === 0) return Infinity
		return Math.min(...deadlines)
	}

	private cancelSweep(): void {
		if (this.sweepTimer !== undefined) this.cancel(this.sweepTimer)
		this.sweepTimer = undefined
		this.sweepAt = 0
	}

	private sweep(): void {
		const now = this.now()
		for (const [line, active] of this.activeLines) {
			const lapsed = !active.playing && active.expiresAt <= now
			if (lapsed) this.activeLines.delete(line)
		}
		this.paint()
	}

	// Only an editor that shows something of the run receives a decoration: a focused file of another
	// run is left alone rather than swept with empty ranges on every flash.
	private paint(): void {
		const editor = this.editor()
		const ranges = editor === undefined ? [] : this.rangesFor(editor)
		if (editor !== undefined && ranges.length > 0) {
			editor.setDecorations(this.decorationType, ranges)
			this.paintedEditors = new Set([editor])
			return
		}
		for (const painted of this.paintedEditors) {
			painted.setDecorations(this.decorationType, [])
		}
		this.paintedEditors = new Set()
	}

	// Only the lines lit for the document this editor shows: a line of another run's file is dark
	// here instead of lighting a line of the wrong script.
	private rangesFor(editor: PlayingLineEditor): vscode.Range[] {
		const document = editor.document.uri.toString()
		const ranges: vscode.Range[] = []
		for (const [line, active] of this.activeLines) {
			if (this.lineDocuments.get(line) === document) ranges.push(active.range)
		}
		return ranges
	}
}

const sameLineOfFile = (_workspace: string, line: number): FlashPaint => ({ kind: 'file', line })
