// Live-run registry: the daemon's /run/started push names the workspace a run executes under,
// and a cell run sends the block's key as that workspace. The runner fills this map, so the
// block's lens can offer a stop for exactly the job that block is playing.
export interface LiveRunCells {
	get(jobId: number): string[] | undefined
	keys(): IterableIterator<number>
	runStarted(jobId: number, cellKey: string): void
	runEnded(jobId: number): boolean
}

// A hostile or half-broken daemon must not grow this map without bound.
const LIVE_RUNS_CAP = 64

export class LiveRuns implements LiveRunCells {
	private runs = new Map<number, string[]>()

	// A run's workspace names the cells that own it ('key' or 'key|key'); the caller splits it.
	// The daemon numbers a job once, so a duplicate start for an id replaces its entry.
	runStarted(jobId: number, cellKey: string): void {
		const cellKeys = this.runs.get(jobId) ?? []
		this.runs.delete(jobId)
		this.runs.set(jobId, cellKeys.includes(cellKey) ? cellKeys : [...cellKeys, cellKey])
		this.enforceCap()
	}

	runEnded(jobId: number): boolean {
		return this.runs.delete(jobId)
	}

	get(jobId: number): string[] | undefined {
		return this.runs.get(jobId)
	}

	hasCellKey(cellKey: string): boolean {
		return [...this.runs.values()].some((cellKeys) => cellKeys.includes(cellKey))
	}

	keys(): IterableIterator<number> {
		return this.runs.keys()
	}

	clear(): void {
		this.runs.clear()
	}

	size(): number {
		return this.runs.size
	}

	// Map insertion order is the run order; evict from the front once past the cap.
	private enforceCap(): void {
		while (this.runs.size > LIVE_RUNS_CAP) {
			const oldest = this.runs.keys().next().value
			if (oldest === undefined) return
			this.runs.delete(oldest)
		}
	}
}
