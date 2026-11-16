---
# sonic-pi-ce06
title: 'LSP client lifecycle: discovery, spawn, respawn, dispose (858b)'
status: draft
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-16T13:32:15Z
parent: sonic-pi-858b
blocked_by:
    - sonic-pi-6y2f
---

# Task: LSP client lifecycle - discovery, spawn, respawn, dispose (858b)

## Files
new src/ruby-lsp/client.ts: binary discovery (PATH / setting / --version probe), crash respawn, shutdown->exit on dispose, exit-78-class handling, version feature-detect (>=0.26).

## Acceptance criteria (unit suite with a fake child process)
- [ ] client starts/stops with the extension host
- [ ] killed server respawns once, repeated death degrades gracefully

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
