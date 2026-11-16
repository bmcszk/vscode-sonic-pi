---
# sonic-pi-fccp
title: 'Integration: mute stops only that run, unmute re-runs it (F2)'
status: draft
type: task
priority: normal
created_at: 2026-11-16T13:29:44Z
updated_at: 2026-11-16T13:32:15Z
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
