---
# sonic-pi-u354
title: 'Cue port discovery: parse osc-cues from daemon stdout + setting override (F6)'
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:31:24Z
updated_at: 2026-11-16T13:37:49Z
parent: sonic-pi-x8zf
---

# Task: Cue port discovery - parse osc-cues from daemon stdout + setting override (F6)

## Files
- src/source-runner/daemonstdout.ts (extend the returned type with oscCuesPort from parts[4] - keep the one-line stdout contract untouched; the fake already prints 4562 there)
- src/source-runner/main.ts (set serverOscCuesPort in startRubyServer)
- src/source-runner/config.ts + package.json (SURGICAL: setting vscode-sonic-pi.oscCuesPort, number, default 0 = auto)

## Acceptance criteria (extend test/unit/token-parse.test.js)
- [ ] parseDaemonStdout returns oscCuesPort=4562 for the fake's line shape
- [ ] setting override wins over the parsed port; -1/0 fallback never used as a send target

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md

## Proof of Work (2026-11-16, parent-verified)

Worker branch f6t1-cue-port (a8a99f5), merged to dev2:
- daemonstdout.ts: oscCuesPort from parts[4] (5.x + 4.x shapes) + pure resolveOscCuesPort(setting, parsed)
- main.ts sets serverOscCuesPort in the managed-boot stdout handler
- setting vscode-sonic-pi.oscCuesPort (0 = auto), surgical package.json edit
- token-parse.test.js: 7 new tests (shapes + override-wins + both-unavailable -1)

Gates parent-verified: lint 0, prettier clean, npm test exit 0 / 0 not ok, vscode-test 20 passing (attach/takeover skipped: real server on machine), suppression grep 0, package.json diff surgical.

Residual: none.
