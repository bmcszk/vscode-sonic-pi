import * as vscode from 'vscode'

const FLASH_TTL_MS = 250
const DECORATION_END_CHARACTER = 1000
const OUR_RUN_WORKSPACE = 'eval'

export interface PlayingLineSettings {
	flashBackgroundColor(): string
	flashTextColor(): string
	showPlayingLineHighlight(): boolean
}

export interface PlayingLineEditor {
	setDecorations(decorationType: vscode.TextEditorDecorationType, ranges: vscode.Range[]): void
}

export interface PlayingLineHighlighterDeps {
	config: PlayingLineSettings
	editor?: () => PlayingLineEditor | undefined
	now?: () => number
	schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
	cancel?: (timer: ReturnType<typeof setTimeout>) => void
}

interface ActiveLine {
	editor: PlayingLineEditor
	range: vscode.Range
	expiresAt: number
}

// Turns Sonic Pi's /flash (jobid, workspace, line) into the GUI's transient line background:
// a flashed line stays lit for 250 ms, and repeated triggers refresh it instead of stacking.
export class PlayingLineHighlighter {
	private readonly config: PlayingLineSettings
	private readonly editor: () => PlayingLineEditor | undefined
	private readonly now: () => number
	private readonly schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
	private readonly cancel: (timer: ReturnType<typeof setTimeout>) => void
	private readonly decorationType: vscode.TextEditorDecorationType
	private readonly activeLines = new Map<number, ActiveLine>()
	private paintedEditors = new Set<PlayingLineEditor>()
	private sweepTimer: ReturnType<typeof setTimeout> | undefined

	constructor(deps: PlayingLineHighlighterDeps) {
		this.config = deps.config
		this.editor = deps.editor ?? (() => vscode.window.activeTextEditor)
		this.now = deps.now ?? (() => Date.now())
		this.schedule = deps.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
		this.cancel = deps.cancel ?? ((timer) => clearTimeout(timer))
		this.decorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: this.config.flashBackgroundColor(),
			color: this.config.flashTextColor(),
			isWholeLine: true,
		})
	}

	// The daemon reports file-absolute lines because every run is sent with its file position
	// already in place (a fragment is comment-padded up to its start line), so no run state is kept.
	flash(workspace: string, line: number): void {
		if (workspace !== OUR_RUN_WORKSPACE || !this.config.showPlayingLineHighlight()) {
			return
		}
		if (!Number.isInteger(line) || line < 1) {
			return
		}
		const editor = this.editor()
		if (!editor) {
			return
		}
		const editorLine = line - 1
		const expiresAt = this.now() + FLASH_TTL_MS
		const active = this.activeLines.get(editorLine)
		if (active) {
			active.expiresAt = expiresAt
		} else {
			this.activeLines.set(editorLine, {
				editor,
				range: new vscode.Range(editorLine, 0, editorLine, DECORATION_END_CHARACTER),
				expiresAt,
			})
		}
		this.paint()
		this.scheduleSweep()
	}

	clear(): void {
		this.activeLines.clear()
		if (this.sweepTimer !== undefined) {
			this.cancel(this.sweepTimer)
			this.sweepTimer = undefined
		}
		this.paint()
	}

	dispose(): void {
		this.clear()
		this.decorationType.dispose()
	}

	private scheduleSweep(): void {
		if (this.sweepTimer !== undefined || this.activeLines.size === 0) {
			return
		}
		const nextExpiry = Math.min(...[...this.activeLines.values()].map((active) => active.expiresAt))
		this.sweepTimer = this.schedule(() => {
			this.sweepTimer = undefined
			this.sweep()
			this.scheduleSweep()
		}, Math.max(0, nextExpiry - this.now()))
	}

	private sweep(): void {
		const now = this.now()
		for (const [line, active] of this.activeLines) {
			if (active.expiresAt <= now) {
				this.activeLines.delete(line)
			}
		}
		this.paint()
	}

	private paint(): void {
		const rangesByEditor = new Map<PlayingLineEditor, vscode.Range[]>()
		for (const active of this.activeLines.values()) {
			const ranges = rangesByEditor.get(active.editor) ?? []
			ranges.push(active.range)
			rangesByEditor.set(active.editor, ranges)
		}
		for (const [editor, ranges] of rangesByEditor) {
			editor.setDecorations(this.decorationType, ranges)
		}
		for (const editor of this.paintedEditors) {
			if (!rangesByEditor.has(editor)) {
				editor.setDecorations(this.decorationType, [])
			}
		}
		this.paintedEditors = new Set(rangesByEditor.keys())
	}
}
