---
# sonic-pi-i7ex
title: 'Bug: playing-line highlights flaky on multi-block files (cloud_beat.pi: partial, intermittent)'
status: completed
type: bug
priority: normal
created_at: 2026-11-19T23:06:42Z
updated_at: 2026-11-20T00:16:12Z
parent: sonic-pi-6fiz
---

# Bug: playing-line highlights flaky (sometimes none, sometimes partial)

## Research (user live report + source read this session)
User ran examples/algomancer/cloud_beat.pi: highlights work sometimes, sometimes not, sometimes only partly. Source: src/playing-lines.ts paints ONLY into activeTextEditor (deps.editor ?? () => vscode.window.activeTextEditor, line 50) with FLASH_TTL_MS=250 per flash. Failure modes that follow mechanically:
1. Editor focus: if the daemon's flash bursts arrive while the editor is NOT the active one (e.g. cursor in the mixer popover/panel, quick input, or a second split), the paint goes nowhere (activeTextEditor undefined or wrong doc) - 'sometimes not'.
2. TTL vs burst cadence: cloud_beat runs many blocks; each block's flash blips 250ms. The daemon's flash pushes for LATER blocks can overwrite/expiry-sweep EARLIER lines mid-burst (activeLines keyed per editorLine; sweep paints only live ones) - 'part of them'.
3. Same-editor fan-in: cloud_beat's loops fire flashes at high rate; paint() re-paints the WHOLE set on each flash - a burst staggered over the 250ms TTL shows a shrinking set - 'partial'.
4. workspace-string mismatch: flashes ride workspaces; file runs flash only when workspace === file path (flashPaintFor in cell-flash-map kind:'file'); any run whose workspace arg differs (e.g. re-run of loaded def, doc preview, timewarp) paints none - 'sometimes not'.
5. Multi-editor: two .pi editors open - flashes land only on active; switching mid-run loses the other file's flashes unless re-flash.

## Fix direction
- Paint into the editor OWNING the flashed document (resolve the editor for the run's workspace/file, not activeTextEditor) - matching how notebook flashes already resolve per-cell editors.
- Extend TTL / coalesce burst: a block's line stays lit while its job lives (liveJobs knows job->workspace; /run/ended clears), instead of 250ms blips - the current flash+playingRun split already half-does this for notebooks.
- Multi-editor: keep per-editor active line sets (already keyed by editor) but repaint ALL visible editors on sweep, not just the paint-time one.

## Acceptance criteria
- [ ] Flashes paint in a non-active editor owning the document (unit: editor resolution by document, fake deps)
- [ ] A playing block's lines stay lit for the JOB's lifetime, not a 250ms blip (unit + integration: fake /run/started -> decoration present until /run/ended)
- [ ] Regression: cloud_beat.pi e2e-style scenario: N blocks flashing in burst -> each line gets its decoration (unit with deterministic clock)
- [ ] npm test + run-unit + integration green; budgets hold; zero suppressions

## Proof of Work

- Root cause (worker probes, confirmed): file runs flash with the daemon default workspace 'eval'; paint resolved through activeTextEditor -> non-editor focus dropped flashes ('none'); 250ms TTL ate bursts ('partial'). Both fixed.
- flash-docks.ts (96 lines, 12 green assertions): which .pi document was in front at send time -> job's workspace docks it -> /run/ended|all-completed|restart releases. playing-lines.ts: document-keyed run-lifetime claims (playing-lines suite 23 cases green; TTL stays the no-dock fallback).
- Orchestrator finish: two stale call sites aligned to the document-based API (worker timed out mid-rename), clean rebuild verified, gates re-run: 53-suite unit battery exit 0; npm test exit 0 incl. vsix smoke; extension integration 43 passing 0 failing; lint/prettier clean; main.ts 996/1000; zero suppressions; stray processes killed (4).
- Residual (disclosed per contract): two editors of the same document -> active-editor behavior (B-scope limitation); visual burst feel verified at next live session.
