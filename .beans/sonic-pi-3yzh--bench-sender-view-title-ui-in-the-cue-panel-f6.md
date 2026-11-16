---
# sonic-pi-3yzh
title: Bench sender + view-title UI in the Cue panel (F6)
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:31:24Z
updated_at: 2026-11-16T15:35:32Z
parent: sonic-pi-x8zf
blocked_by:
    - sonic-pi-ho80
    - sonic-pi-u354
    - sonic-pi-r0om
---

# Task: Bench sender + view-title UI in the Cue panel (F6)

## Files
- new src/cue-bench.ts (UDP sender to serverOscCuesPort; argument parser for 'address arg1 arg2' with int/float/string inference - pure part unit-testable)
- F5's panel gets a view/title 'send test cue' command (package.json SURGICAL addition)
- integration with the Wave 0 cue socket for the round-trip

## Acceptance criteria (test/unit/cue-bench.test.js for arg parsing + integration round-trip)
- [ ] sendTestCue('/foo/orca', ['1', '2.5', 'x']) puts /foo/orca [1, 2.5, 'x'] on the cue port (typed i/f/s)
- [ ] the echoed /incoming/osc lands in the Cue Inspector store (round-trip proven)
- [ ] no cue port resolvable -> clear error message, no send

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/vscode-ext-commands/SKILL.md

## Proof of Work (2026-11-16, parent-verified)

Worker branch f6t2-bench-sender (3f10e08), merged to dev2 (2643049):
- cue-bench.ts: UDP sender + parseArgs (int/float/string inference)
- main.ts: cueBenchSender lazy init, sendTestCue(address, args) method
- extension.ts: sendTestCue export + vscode-sonic-pi.cueSendTest command
- package.json: surgical view/title command vscode-sonic-pi.cueSendTest (added in F5 t2)
- test/unit/cue-bench.test.js: 12 unit tests (parseArgs + sendTestCue round-trip)

Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, integration green, suppression grep 0.
Residual: none.
