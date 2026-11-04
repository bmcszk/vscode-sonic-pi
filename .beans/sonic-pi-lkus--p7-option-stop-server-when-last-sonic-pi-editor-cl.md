---
# sonic-pi-lkus
title: '[P7] Option: stop server when last Sonic Pi editor closes'
status: todo
type: task
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-04T23:29:50Z
parent: sonic-pi-q65q
---

Config-gated hygiene: when the last visible sonic-pi editor closes and no runs are active, stop the daemon. Respect audio-recovery semantics.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [ ] Implemented on a branch with red->green where logic is testable (per repo gates: npm test suites + live e2e + vsce package)
- [ ] README/settings docs updated to match shipped behavior
- [ ] User sign-off obtained before merge

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/typescript/SKILL.md - editor-close lifecycle logic
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.
