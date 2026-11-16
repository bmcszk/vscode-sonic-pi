---
# sonic-pi-hjng
title: Muted-cell registry + no-replace run path in the runner (F2)
status: todo
type: task
priority: normal
created_at: 2026-11-16T13:29:44Z
updated_at: 2026-11-16T13:58:03Z
parent: sonic-pi-eimm
blocked_by:
    - sonic-pi-r0om
---

# Task: Muted-cell registry + no-replace run path in the runner

## Files
- new src/loop-mute.ts (pure state: cellKey -> { code, cells, mutedAt }, cap + clear-on-server-restart)
- src/source-runner/main.ts (extend runCode with options object { replaceSession?: boolean; silent?: boolean } defaulting to current behavior - SURGICAL: existing callers unchanged)
- src/source-runner/extension.ts (export muteCellByKeys / unmuteCellByKeys bridging registry <-> main, mirroring stopCellByKeys)

## OSC
mute = existing stopCell(cells) (/stop-job); unmute = /run-code with the stored workspace (joined | cell keys), replaceSession:false.

## Acceptance criteria (TDD red-first, test/unit/loop-mute.test.js, pattern of per-run-stop.test.js)
- [ ] muting a tracked cell sends /stop-job for exactly that job and records the cell's last-run code
- [ ] unmute re-sends that code via /run-code with the same workspace string and does NOT send /stop-all-jobs first (red today: no such path exists)
- [ ] registry clears on server restart (reuse onServerRestart)

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
