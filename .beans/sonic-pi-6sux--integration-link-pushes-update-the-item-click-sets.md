---
# sonic-pi-6sux
title: 'Integration: Link pushes update the item, click sets bpm (F4)'
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:30:27Z
updated_at: 2026-11-17T13:10:17Z
parent: sonic-pi-2fkg
blocked_by:
    - sonic-pi-9x5q
    - sonic-pi-27kb
    - sonic-pi-r0om
---

# Task: Integration - Link pushes update the item, click sets bpm (F4)

## Files
- extend server-lifecycle.integration.js (one test: link-bpm/link-peers controls -> then set -> assert /run-code with the silent flag)

## Acceptance criteria
- [ ] wire shows the silent /run-code with workspace 'link-bpm-set' and args[3]===1
- [ ] suite time +<=2s

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md

## Proof of Work (2026-11-17, parent-verified)

Worker branch 6sux-link-integration (3484af3), merged to dev2:
- integration test: link-bpm 122.5 + link-peers 3 pushes -> statusbar item shows '♪ 122.5 · ⇄3'; click-to-set drives the input (pre-filled with the pushed bpm) -> /run-code asserted on the wire with workspace 'link-bpm-set', silent flag 1, set_link_bpm! 122.5

Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, integration 30+1+1 passing (attach/takeover green, no skips), suppressions 0.
Residual: none.
