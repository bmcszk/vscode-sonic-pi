---
# sonic-pi-6sux
title: 'Integration: Link pushes update the item, click sets bpm (F4)'
status: draft
type: task
priority: normal
created_at: 2026-11-16T13:30:27Z
updated_at: 2026-11-16T13:32:15Z
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
