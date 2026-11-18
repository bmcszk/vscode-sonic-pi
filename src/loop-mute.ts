// Muted-cell registry: keeps the last-run code of muted cells so an unmute can re-run it
// without replacing the session. Pure state, no daemon dependency.
export interface MutedCell {
	code: string
	cells: string[]
	mutedAt: number
}

const MUTE_REGISTRY_CAP = 64

export class MuteRegistry {
	private entries = new Map<string, MutedCell>()

	// Record the muted cells' last-run code. The last key wins for shared keys.
	mute(cellKeys: string[], code: string): MutedCell {
		const key = cellKeys.join('|')
		const entry: MutedCell = { code, cells: [...cellKeys], mutedAt: Date.now() }
		this.entries.delete(key)
		this.entries.set(key, entry)
		this.enforceCap()
		return entry
	}

	// Return the stored entry and remove it; undefined when the cells were never muted.
	unmute(cellKeys: string[]): MutedCell | undefined {
		const key = cellKeys.join('|')
		const entry = this.entries.get(key)
		this.entries.delete(key)
		return entry
	}

	isMuted(cellKey: string): boolean {
		return this.entries.has(cellKey)
	}

	clear(): void {
		this.entries.clear()
	}

	size(): number {
		return this.entries.size
	}

	// Map insertion order is the mute order; evict from the front once past the cap.
	private enforceCap(): void {
		while (this.entries.size > MUTE_REGISTRY_CAP) {
			const oldest = this.entries.keys().next().value
			if (oldest === undefined) return
			this.entries.delete(oldest)
		}
	}
}
