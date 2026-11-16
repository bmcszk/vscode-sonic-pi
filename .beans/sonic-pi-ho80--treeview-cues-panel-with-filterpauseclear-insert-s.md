---
# sonic-pi-ho80
title: 'TreeView: cues panel with filter/pause/clear + insert sync path (F5)'
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:30:44Z
updated_at: 2026-11-16T15:06:34Z
parent: sonic-pi-6oka
blocked_by:
    - sonic-pi-56gn
---

# Task: TreeView cues panel with filter/pause/clear + insert sync path (F5)

## Files
- new src/cue-inspector.ts (TreeDataProvider over the store)
- package.json (SURGICAL: viewsContainers.activitybar 'sonic-pi' + views entry 'sonic-pi.cues'; view title commands _filter, _pause, _clear following the #sideBar underscore+icon rules; palette command vscode-sonic-pi.cueInsertSync inserting sync "<address>" at the cursor)
- src/source-runner/extension.ts (wire store <-> provider <-> emitter)

## Acceptance criteria (test/unit/cue-inspector.test.js, provider getTreeItems with stubbed TreeItem - docs-browser.test.js pattern)
- [ ] panel lists recent cues (time, address, args) newest-first
- [ ] filter command narrows the list; pause/clear commands work
- [ ] insert-sync writes sync :path-style text into the active editor at the cursor

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/vscode-ext-commands/SKILL.md (side-bar command pattern)

## Proof of Work (2026-11-16, parent-verified)

Worker branch f5t2-cue-panel (final commit), merged to dev2 (76bfda8):
- cue-inspector.ts: TreeDataProvider over cue-store (list newest-first, filter case-insensitive, pause-drops, clear, insert-sync)
- extension.ts: TreeView 'sonic-pi.cues' wired, view title commands _filter/_pause/_clear, palette command cueInsertSync
- package.json: viewsContainers.activitybar 'sonic-pi', views 'sonic-pi.cues', title commands _filter/_pause/_clear, palette command cueInsertSync
- cue-inspector.test.js: 7 unit tests (populate, filter, pause/clear, insert-sync)

Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, integration green, suppression grep 0.
Residual: none.
