---
# sonic-pi-lgv0
title: '[P1] Status bar: server state + Sonic Pi version + master volume control'
status: todo
type: feature
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-04T23:29:49Z
parent: sonic-pi-q65q
---

One status item: running/stopped state + version via OSC /version; click -> master volume via /mixer-output-volume. Closes the biggest visible GUI-parity gap.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [ ] Implemented on a branch with red->green where logic is testable (per repo gates: npm test suites + live e2e + vsce package)
- [ ] README/settings docs updated to match shipped behavior
- [ ] User sign-off obtained before merge

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/vscode-ext-commands/SKILL.md - status bar entry + volume command = manifest commands/menus/when/icon conventions
- .agents/skills/typescript/SKILL.md - TS source work
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.
