---
# sonic-pi-zyq8
title: 'Bug: no stop on cell run - Stop lens/button absent or inert while a cell plays'
status: in-progress
type: bug
priority: normal
created_at: 2026-11-19T23:06:12Z
updated_at: 2026-11-19T23:21:48Z
parent: sonic-pi-6fiz
blocked_by:
    - sonic-pi-gqg7
---

# Bug: No stop on cell run

## Research
User report: after running a cell there is no working stop. Evidence in-tree: fileLenses ALWAYS renders a '$(stop) Stop' lens (src/codelenses.ts:84: codeLens(0,'$(stop) Stop', STOP_COMMAND)) - so 'no stop' means either (a) with the duplicate-provider bug (gqg7/03nb) the visible Stop belonged to the DEDUPED row and its command was cold-dispatch-guarded to a no-op (stop with no serverStarted = silent return), or (b) the page-level Stop stops the whole session, not the playing cell (per-cell stop rides /stop-job, only wired for notebook interrupt - the FILE editor's Stop sends /stop-all-jobs), or (c) a playing cell shows no per-cell stop affordance at all.

## Fix direction (after gqg7/03nb dedupe)
The playing-cell affordance: when a cell/block's run is LIVE (liveJobs + /run/started pushes), its lens flips to '$(debug-stop) Stop cell' -> stopCellByKeys([cellKey]) (/stop-job with the pushed job id) instead of session-wide /stop-all-jobs. File-level Stop keeps session semantics. The playing state per block already exists (cell-keyed liveJobs + playingRun flash maps).

## Acceptance criteria
- [ ] A playing block's lens shows a stop affordance; clicking it sends /stop-job with the block's pushed job id (unit-proven via oschandlers FakeOsc fire pattern)
- [ ] Blocks that are mutes/other loops keep playing after a cell stop (integration via fake daemon pushes)
- [ ] npm test + run-unit + integration battery green; budgets hold; zero suppressions
