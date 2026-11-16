---
# sonic-pi-56gn
title: 'Cue event stream: structured emitter + ring buffer (F5)'
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:30:44Z
updated_at: 2026-11-16T14:06:25Z
parent: sonic-pi-6oka
blocked_by:
    - sonic-pi-r0om
---

# Task: Cue event stream - structured emitter + ring buffer (F5)

## Files
- src/source-runner/main.ts (onCue emitter carrying { time, id, address, args }; keep the existing cueLog line - ADDITIVE)
- new src/cue-store.ts (pure ring buffer, cap ~500, pause flag, filter predicate - all unit testable without vscode)

## Acceptance criteria (test/unit/cue-store.test.js)
- [ ] /incoming/osc push populates the buffer with parsed fields
- [ ] pause freezes the visible list; paused events are DROPPED (simplest honest behavior - document in bean)
- [ ] filter matches address substring case-insensitively

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md

## Proof of Work (2026-11-16, parent-verified)

Worker branch f5t1-cue-store (dece815), merged to dev2: pure cue-store.ts (ring 500, pause-drops documented, case-insensitive filter), onCue emitter + additive /incoming/osc parse (cueLog kept). Unit tests incl. 505->500 eviction.
Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, integration green. Suppressions 0.
Residual: none.
