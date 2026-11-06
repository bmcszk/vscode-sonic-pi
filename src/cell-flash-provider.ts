import * as vscode from 'vscode'
import { CellFlashMap, FLASH_TTL_MS } from './cell-flash-map'

const REFRESH_DEBOUNCE_MS = 100
const PLAYING_ITEM_TEXT = '$(sync~spin) playing'
const PLAYING_ITEM_TOOLTIP = 'This cell is currently making sound'

export interface CellFlashStatusBarDeps {
	playingCells: CellFlashMap
	now?: () => number
	schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
	cancel?: (timer: ReturnType<typeof setTimeout>) => void
}

// A notebook editor cannot be decorated from the extension API, so a cell that is making sound
// says so in its own cell status bar while its flash is fresh: the flash handler notes the cell,
// the provider re-asks the map at most once per debounce and once more when the TTL runs out.
export class CellFlashStatusBarProvider implements vscode.NotebookCellStatusBarItemProvider {
	readonly onDidChangeCellStatusBarItems: vscode.Event<void>

	private readonly playingCells: CellFlashMap
	private readonly now: () => number
	private readonly schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
	private readonly cancel: (timer: ReturnType<typeof setTimeout>) => void
	private readonly changed = new vscode.EventEmitter<void>()
	private refreshTimer: ReturnType<typeof setTimeout> | undefined

	constructor(deps: CellFlashStatusBarDeps) {
		this.playingCells = deps.playingCells
		this.now = deps.now ?? (() => Date.now())
		this.schedule = deps.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
		this.cancel = deps.cancel ?? ((timer) => clearTimeout(timer))
		this.onDidChangeCellStatusBarItems = this.changed.event
	}

	noteFlash(cellKey: string): void {
		this.playingCells.noteFlash(cellKey)
		this.scheduleRefresh(REFRESH_DEBOUNCE_MS)
	}

	provideCellStatusBarItems(cell: vscode.NotebookCell): vscode.NotebookCellStatusBarItem[] {
		if (!this.playingCells.activeCells().has(cell.document.uri.toString())) {
			return []
		}
		const item = new vscode.NotebookCellStatusBarItem(
			PLAYING_ITEM_TEXT,
			vscode.NotebookCellStatusBarAlignment.Left,
		)
		item.tooltip = PLAYING_ITEM_TOOLTIP
		return [item]
	}

	dispose(): void {
		if (this.refreshTimer !== undefined) {
			this.cancel(this.refreshTimer)
			this.refreshTimer = undefined
		}
		this.changed.dispose()
	}

	private scheduleRefresh(delayMs: number): void {
		if (this.refreshTimer !== undefined) {
			return
		}
		this.refreshTimer = this.schedule(() => {
			this.refreshTimer = undefined
			this.changed.fire()
			this.scheduleExpiryRefresh()
		}, delayMs)
	}

	private scheduleExpiryRefresh(): void {
		const nextExpiryAt = this.nextExpiryAt()
		if (nextExpiryAt === undefined) {
			return
		}
		this.scheduleRefresh(Math.max(0, nextExpiryAt - this.now()))
	}

	private nextExpiryAt(): number | undefined {
		let earliest: number | undefined
		for (const flashedAt of this.playingCells.activeCells().values()) {
			const expiryAt = flashedAt + FLASH_TTL_MS
			earliest = earliest === undefined ? expiryAt : Math.min(earliest, expiryAt)
		}
		return earliest
	}
}
