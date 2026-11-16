---
# sonic-pi-8nva
title: 'Mute toggle in the editor: CodeLens + notebook cell command (F2)'
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:29:44Z
updated_at: 2026-11-16T14:35:51Z
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

## Proof of Work (2026-11-16, parent-verified)

Worker branch f2t2-mute-ui (final commit on f2t2-mute-ui), merged to dev2:
- CodeLens: Mute lens ' Mute' / ' Unmute' flipping with registry.isMuted
- Notebook cell command wiring: muteCellByKeys/unmuteCellByKeys using CellWorkingCopy.content
- package.json: surgical addition of muteLoop/unmuteLoop commands + activationEvents
- activation suite: both new commands dispatch cold (no server) without error
- codelens test: mute lens flips after registry.mute()

Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, integration green, suppression grep 0.
Residual: none.
