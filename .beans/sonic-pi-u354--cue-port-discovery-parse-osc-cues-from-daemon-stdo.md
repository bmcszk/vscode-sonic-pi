---
# sonic-pi-u354
title: 'Cue port discovery: parse osc-cues from daemon stdout + setting override (F6)'
status: todo
type: task
priority: normal
created_at: 2026-11-16T13:31:24Z
updated_at: 2026-11-16T13:32:21Z
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
