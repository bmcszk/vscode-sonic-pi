// Live-loop scope registry: /live_loop/scope says a loop's thread came alive and where its
// header sits, /live_loop/scope-ended says it died. Pure state, no daemon dependency.

export interface LiveLoopScopePush {
	jobid: number
	name: string
	workspace: string
	line: number
	scopeNum: number
}

export interface LiveLoopScope extends LiveLoopScopePush {
	at: number
}

// Live loops are bounded by running jobs; the cap only guards a hostile stream.
const LIVE_LOOP_SCOPE_CAP = 256

export class LiveLoopScopeStore {
	private entries = new Map<string, LiveLoopScope>()

	// Record a live loop's current header position. A re-registered name keeps its slot in
	// insertion order but refreshes jobid, workspace, line and scope slot.
	apply(push: LiveLoopScopePush): LiveLoopScope {
		const entry: LiveLoopScope = { ...push, at: Date.now() }
		this.entries.delete(push.name)
		this.entries.set(push.name, entry)
		this.enforceCap()
		return entry
	}

	// The daemon fires scope-ended from the loop thread's ensure block; an unknown name
	// means the loop already ended (or a restart cleared it).
	end(name: string): void {
		this.entries.delete(name)
	}

	clear(): void {
		this.entries.clear()
	}

	// Map insertion order is the registration order; evict from the front past the cap.
	list(): LiveLoopScope[] {
		return [...this.entries.values()]
	}

	private enforceCap(): void {
		while (this.entries.size > LIVE_LOOP_SCOPE_CAP) {
			const oldest = this.entries.keys().next().value
			if (oldest === undefined) return
			this.entries.delete(oldest)
		}
	}
}
