---
# sonic-pi-h5f7
title: 'D0: main.ts sender/emitter extraction (lint-budget headroom)'
status: completed
type: task
priority: normal
created_at: 2026-11-18T17:06:03Z
updated_at: 2026-11-18T17:20:10Z
parent: sonic-pi-6fiz
---

# D0: extract senders/emitters from main.ts (prerequisite for the wave)

main.ts is 963 lines; eslint budget max-lines 1000. Wave-2 tasks add ~8 senders + ~7 emitters - extraction first or the wave busts the budget.

## Scope
Move the pure sender group (cuePort*, recording, mixer) into src/source-runner/senders.ts as functions taking (sendOsc, guiUuid) and/or the emitter declarations into main-events.ts. Zero behavior change.

## Acceptance criteria
- [ ] npm run lint green, main.ts comfortably under 900 lines
- [ ] node test/run-unit.js green with ZERO test edits (the move is invisible at the seams)
- [ ] Only main.ts + new module touched (imports in extension.ts allowed)

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md (pure move: the existing suites are the red/green)
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
