---
# sonic-pi-8nva
title: 'Mute toggle in the editor: CodeLens + notebook cell command (F2)'
status: in-progress
type: task
priority: normal
created_at: 2026-11-16T13:29:44Z
updated_at: 2026-11-16T14:11:58Z
parent: sonic-pi-eimm
blocked_by:
    - sonic-pi-hjng
---

# Task: Mute toggle in the editor - CodeLens + notebook cell command

## Files
- src/codelenses.ts (per-block $(debug-pause)/$(play) Mute lens for playable blocks, reusing blocksOf/lensTitle machinery)
- src/notebook.ts (cell toolbar mute via existing execution history + CellWorkingCopy.content)
- package.json (SURGICAL: commands vscode-sonic-pi.muteLoop, vscode-sonic-pi.unmuteLoop + their onCommand: activation entries; NOTE the activation suite dispatches every command cold - handlers must no-op gracefully without a server)

## Acceptance criteria (extend test/unit/codelenses.test.js)
- [ ] a playable block shows a Mute lens; after muting it flips to Unmute
- [ ] npm test chain green; activation suite still dispatches both new commands cold

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/vscode-ext-commands/SKILL.md (title/category rules for palette commands)
