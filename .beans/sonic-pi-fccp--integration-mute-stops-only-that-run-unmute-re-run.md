---
# sonic-pi-fccp
title: 'Integration: mute stops only that run, unmute re-runs it (F2)'
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:29:44Z
updated_at: 2026-11-16T19:33:50Z
parent: sonic-pi-eimm
blocked_by:
    - sonic-pi-hjng
    - sonic-pi-8nva
    - sonic-pi-r0om
---

# Task: Integration - mute stops only that run, unmute re-runs it

## Files
- extend test/integration/suite/editor-controls.integration.js (editor path)
- extend test/integration/suite/notebook-run.integration.js (one cell-mute test)

## Notes
Uses Wave 0 fake (/run/started echo makes liveJobs real). Assert /stop-job on mute, a fresh /run-code with the same workspace on unmute, and that a second cell's run is untouched.

## Acceptance criteria
- [ ] mute cell A while cell B plays: wire shows /stop-job for A's job only, B keeps running (no /stop-all-jobs)
- [ ] unmute A: /run-code carries A's original text and workspace

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md

## Proof of Work (2026-11-16, parent-verified)

Worker branch fccp-mute-integration (8529bd0), merged to dev2 (1e8ff3b):
- editor-controls integration: two cells joined (workspace a|b), muteCellByKeys(['a']) -> /stop-job with the exact /run/started job id + zero stop-all; unmuteCellByKeys -> fresh /run-code with original text + same workspace, no stop-all, exactly one /stop-job overall
- notebook-run integration: cell mute via muteCellByKeys([cellUri], content) -> /stop-job only; unmute re-runs content without session replacement
- no production changes - the seams worked as designed (worker's option-b approach after the 8nva UI void)

Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, suppression grep 0.
Residual: none.
