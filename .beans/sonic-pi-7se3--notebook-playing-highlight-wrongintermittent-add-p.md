---
# sonic-pi-7se3
title: 'Notebook: playing highlight wrong/intermittent; add per-cell playing indicator'
status: completed
type: bug
priority: normal
created_at: 2026-11-05T20:10:17Z
updated_at: 2026-11-05T21:50:21Z
---

## Two late findings from user report (2026-11-05 22:4x) - both fixed on dev

1. LAPSE: the 7se3 worker branch merge had silently MISSED dev (worker branch name differed). Notebook per-cell 'playing' indicator never reached any build, explaining 'highlights in Log area but not the pibook section'. Re-merged properly.
2. Cross-contamination: playing flibble while cloud_beat loops were still live kept hearing guitars: daemon semantics stack jobs on /run-code. Fixed with runReplacesSession (default true): runCode sends /stop-all-jobs BEFORE run-code per-cell replace, matching the Sonic Pi app's Run-button semantics; false keeps layering. TDD red->green new suite; live e2e green. 15 suites/125 ok.
