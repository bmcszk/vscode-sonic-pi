// Ring buffer of cues pushed by the daemon's /incoming/osc messages. Pure module:
// no vscode import, so unit tests exercise it directly.

export interface Cue {
	time: number
	id: number
	address: string
	args: string
}

export const CUE_STORE_CAPACITY = 500

export class CueStore {
	private buffer: Cue[] = []
	private filterText: string | undefined
	private paused = false

	add(cue: Cue): void {
		// Pausing deliberately DROPS incoming events instead of queueing them: the
		// visible list freezes at the pause point and nothing replays on resume.
		if (this.paused) {
			return
		}
		this.buffer.push(cue)
		if (this.buffer.length > CUE_STORE_CAPACITY) {
			this.buffer.shift()
		}
	}

	// Newest first, filtered by the current address substring if one is set.
	list(): Cue[] {
		if (this.filterText) {
			const needle = this.filterText.toLowerCase()
			return this.buffer.filter((c) => c.address.toLowerCase().includes(needle)).reverse()
		}
		return this.buffer.slice().reverse()
	}

	// Case-insensitive address substring; undefined or empty clears the filter.
	setFilter(substring: string | undefined): void {
		this.filterText = substring ? substring : undefined
	}

	pause(): void {
		this.paused = true
	}

	resume(): void {
		this.paused = false
	}

	clear(): void {
		this.buffer = []
	}
}
