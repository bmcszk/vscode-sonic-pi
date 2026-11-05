---
# sonic-pi-7se3
title: 'Notebook: playing highlight wrong/intermittent; add per-cell playing indicator'
status: completed
type: bug
priority: normal
created_at: 2026-11-05T20:10:17Z
updated_at: 2026-11-05T22:12:40Z
---

## Two late findings from user report (2026-11-05 22:4x) - both fixed on dev

1. LAPSE: the 7se3 worker branch merge had silently MISSED dev (worker branch name differed). Notebook per-cell 'playing' indicator never reached any build, explaining 'highlights in Log area but not the pibook section'. Re-merged properly.
2. Cross-contamination: playing flibble while cloud_beat loops were still live kept hearing guitars: daemon semantics stack jobs on /run-code. Fixed with runReplacesSession (default true): runCode sends /stop-all-jobs BEFORE run-code per-cell replace, matching the Sonic Pi app's Run-button semantics; false keeps layering. TDD red->green new suite; live e2e green. 15 suites/125 ok.

## Follow-up: per-cell play (whole-song off default) after 'runs the last section with guitars' (user)

triggerPlay joined all executed cells on every play -> flibble replayed guit too. Changed default: the played cell runs alone (session-defined funcs persist), whole-song replay via notebookRunsWholeSong=true. TDD both modes (red->green), 7se3-era offsets test realigned, 16 suites (127 ok), e2e green, packaged+installed.

## Follow-up 2: steady playing state + Run All semantics (user 23:0x)

(1) Highlight flakiness was the 250ms TTL blink: sparse loops (sleep 8) went dark most of the time; dense ones flickered. Run-state now marks the played cell(s) steadily lit between 'Starting run N' and 'Completed'/Stop/restart (RunResolvers payload carries cells; CellFlashMap markPlaying/endPlaying; provider unchanged). TDD: 4 map cases.
(2) 'Run all' plays every cell top-to-bottom as one run: all cells light together - correct full-song pass; per-cell plays stay per-cell (runReplacesSession).
