// A notebook run sends its executed cells joined into one script, so the daemon's /flash lines
// count from the first line of that joined script. This map turns such a line back into the cell
// that owns it, and remembers which cells flashed within the flash TTL.
export const FLASH_TTL_MS = 250

const OUR_RUN_WORKSPACE = 'eval'

export interface ExecutedCell {
	cellKey: string
	content: string
}

export interface ResolvedFlashLine {
	cellKey: string
	localLine: number
}

export type FlashPaint = { kind: 'none' } | { kind: 'file'; line: number } | { kind: 'in-cell'; line: number }

interface FlashCellSpan {
	cellKey: string
	startLine: number
	endLine: number
}

export class CellFlashMap {
	private readonly now: () => number
	private spans: FlashCellSpan[] = []
	private flashedAt = new Map<string, number>()

	constructor(now: () => number = () => Date.now()) {
		this.now = now
	}

	// Joining is `content.join('\n')`, so each cell takes as many joined lines as it has itself and
	// the next cell starts on the line after them.
	recordScript(cells: ExecutedCell[]) {
		this.spans = []
		let nextLine = 1
		for (const cell of cells) {
			const lineCount = cell.content.split('\n').length
			this.spans.push({
				cellKey: cell.cellKey,
				startLine: nextLine,
				endLine: nextLine + lineCount,
			})
			nextLine += lineCount
		}
	}

	isTracking() {
		return this.spans.length > 0
	}

	// Spans are ordered and disjoint, so the owning cell is a binary search away.
	resolve(line: number): ResolvedFlashLine | undefined {
		let low = 0
		let high = this.spans.length - 1
		while (low <= high) {
			const middle = (low + high) >> 1
			const span = this.spans[middle]
			if (line < span.startLine) {
				high = middle - 1
			} else if (line >= span.endLine) {
				low = middle + 1
			} else {
				return { cellKey: span.cellKey, localLine: line - span.startLine + 1 }
			}
		}
		return undefined
	}

	noteFlash(cellKey: string) {
		this.flashedAt.set(cellKey, this.now())
	}

	// A cell stays lit for FLASH_TTL_MS; a repeat flash refreshes its timestamp instead of stacking.
	expire() {
		for (const [cellKey, flashedAt] of this.flashedAt) {
			if (this.now() - flashedAt >= FLASH_TTL_MS) {
				this.flashedAt.delete(cellKey)
			}
		}
	}

	activeCells(): Map<string, number> {
		this.expire()
		return new Map(this.flashedAt)
	}

	clear() {
		this.spans = []
		this.flashedAt.clear()
	}
}

// The extension is one GUI on one 'eval' workspace, so a single map is the truth for the run in
// flight; the pure suite builds its own instances.
export const notebookFlashMap = new CellFlashMap()

// Where a flash may paint: a plain file run reports lines of that file, while a notebook run
// reports joined-script lines that only their own cell editor may paint.
export const flashPaintFor = (
	flashes: CellFlashMap,
	workspace: string,
	activeDocumentUri: string | undefined,
	line: number,
): FlashPaint => {
	if (workspace !== OUR_RUN_WORKSPACE) return { kind: 'none' }
	if (!flashes.isTracking()) return { kind: 'file', line }
	const resolved = flashes.resolve(line)
	if (!resolved || resolved.cellKey !== activeDocumentUri) return { kind: 'none' }
	return { kind: 'in-cell', line: resolved.localLine }
}

// The cell that owns the flashed joined-script line, for the per-cell playing indicator.
export const flashedCellKey = (
	flashes: CellFlashMap,
	workspace: string,
	line: number,
): string | undefined => {
	if (workspace !== OUR_RUN_WORKSPACE) return undefined
	return flashes.resolve(line)?.cellKey
}
