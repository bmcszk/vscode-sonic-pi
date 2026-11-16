---
# sonic-pi-ho80
title: 'TreeView: cues panel with filter/pause/clear + insert sync path (F5)'
status: todo
type: task
priority: normal
created_at: 2026-11-16T13:30:44Z
updated_at: 2026-11-16T14:06:44Z
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
