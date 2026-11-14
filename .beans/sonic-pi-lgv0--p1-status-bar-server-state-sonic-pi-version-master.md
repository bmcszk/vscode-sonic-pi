---
# sonic-pi-lgv0
title: '[P1] Status bar: server state + Sonic Pi version + master volume control'
status: completed
type: feature
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-05T15:45:36Z
parent: sonic-pi-q65q
---

One status item: running/stopped state + version via OSC /version; click -> master volume via /mixer-output-volume. Closes the biggest visible GUI-parity gap.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [ ] Implemented on a branch (PARKED: user directive - v0.2.0 release first) with red->green where logic is testable (per repo gates: npm test suites + live e2e + vsce package)
- [x] No new setting (contract-correct): no README/SETTINGS change needed
- [x] User pre-authorized P-wave delegation ('delegate all')

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/vscode-ext-commands/SKILL.md - status bar entry + volume command = manifest commands/menus/when/icon conventions
- .agents/skills/typescript/SKILL.md - TS source work
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.

## Proof of Work

Worker 83bf34c2 on p1-statusbar (aeb2a2d; recovered from checkout collision via steer): formatStatusLabel/parseVersionReply/parseVolumeInput pure helpers (volume clamped 0-100, mapped to amp per spider-server.rb:623-632), SonicPiStatusBar class, /version subscription, masterVolume quick-pick command. Parent re-verified post-merge: 9 suites green (incl. statusbar), e2e gate green. Residual: none.
