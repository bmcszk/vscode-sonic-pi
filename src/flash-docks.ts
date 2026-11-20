// A /flash only names the workspace that reported the line, and a file run is reported under the
// daemon's default workspace ('eval'), not under the file it came from. The dock remembers the
// open Sonic Pi document whose editor was in front when each run was sent, so the flashes of a
// run whose editor lost focus still paint the right document. A notebook cell run sends its own
// cell uri as the workspace and needs no dock: its cell owns the flashes by convention.
export type FlashDock = { dock: 'file'; document: string }

// Workspaces and job ids arrive at the daemon's pace, so a hostile stream must not hold them
// without bound; the oldest dock goes first, like the live-run registry.
const DOCK_CAP = 64
// A workspace separator: a cell run sends 'cell|cell' for the cells it plays.
const CELL_KEY_SEPARATOR = '|'

export class FlashDocks {
	private readonly frontDocument: () => string | undefined
	private readonly docks = new Map<string, FlashDock>()
	private readonly workspacesByJob = new Map<number, string[]>()
	// The run sent but not yet named by the daemon: the next job announced is the one it belongs to.
	private pendingRun: FlashDock | undefined

	constructor(frontDocument: () => string | undefined) {
		this.frontDocument = frontDocument
	}

	// A file run carries no workspace of its own, so the run sent from the front document docks
	// that document. A run sent while no Sonic Pi file is in front docks nothing and its flashes
	// keep the plain flash TTL.
	dockFileRun(): FlashDock | undefined {
		const document = this.frontDocument()
		const dock: FlashDock | undefined = document === undefined ? undefined : { dock: 'file', document }
		this.pendingRun = dock
		return dock
	}

	// The daemon reports a job's workspace once, in send order: the pending run is the one it
	// belongs to. Returns the document that run's flashes paint, undefined when it docked none.
	runStarted(jobId: number, workspace: string): string | undefined {
		this.workspacesByJob.set(jobId, this.partsOf(workspace))
		const dock = this.pendingRun
		this.pendingRun = undefined
		if (dock === undefined) return undefined
		for (const part of this.partsOf(workspace)) this.remember(part, dock)
		return this.documentOf(workspace)
	}

	// Returns the workspaces the finished job named, so the caller can drop their lines.
	runEnded(jobId: number): string[] {
		const released = this.workspacesByJob.get(jobId) ?? []
		this.workspacesByJob.delete(jobId)
		for (const workspace of released) {
			if (this.reportedByLiveJob(workspace)) continue
			this.docks.delete(workspace)
		}
		return released
	}

	// The document whose editor must show a workspace's flashes, undefined when the run docked none.
	// A joined workspace names each of its parts, and any part may carry the dock.
	documentOf(workspace: string): string | undefined {
		for (const part of this.partsOf(workspace)) {
			const dock = this.docks.get(part)
			if (dock !== undefined) return dock.document
		}
		return undefined
	}

	allRunsCompleted(): void {
		this.docks.clear()
		this.workspacesByJob.clear()
		this.pendingRun = undefined
	}

	clear(): void {
		this.allRunsCompleted()
	}

	private partsOf(workspace: string): string[] {
		return workspace.split(CELL_KEY_SEPARATOR)
	}

	private remember(workspace: string, dock: FlashDock): void {
		this.docks.set(workspace, dock)
		while (this.docks.size > DOCK_CAP) {
			const oldest = this.docks.keys().next().value
			if (oldest === undefined) return
			this.docks.delete(oldest)
		}
	}

	private reportedByLiveJob(workspace: string): boolean {
		for (const workspaces of this.workspacesByJob.values()) {
			if (workspaces.includes(workspace)) return true
		}
		return false
	}
}
