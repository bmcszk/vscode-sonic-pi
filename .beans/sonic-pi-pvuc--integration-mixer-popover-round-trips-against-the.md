---
# sonic-pi-pvuc
title: 'Integration: mixer popover round-trips against the fake daemon (F3)'
status: draft
type: task
priority: normal
created_at: 2026-11-16T13:30:04Z
updated_at: 2026-11-16T13:32:15Z
parent: sonic-pi-wcgd
blocked_by:
    - sonic-pi-v3do
    - sonic-pi-s155
    - sonic-pi-r0om
---

# Task: Integration - mixer popover round-trips against the fake daemon (F3)

## Files
- extend test/integration/suite/server-lifecycle.integration.js (the volume-prompt test at 33-57 is the pattern; add the mixer twin)

## Notes
Uses Wave 0 mixer-settings control: push state -> open popover -> accept -> assert /mixer-drive on the wire.

## Acceptance criteria
- [ ] fake push updates the item text
- [ ] popover selection sends the expected route with the token
- [ ] suite time +<=2s

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
