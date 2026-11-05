---
# sonic-pi-dmux
title: '[P4] Beautify buffer via daemon /buffer-beautify (GUI Align parity)'
status: in-progress
type: feature
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-05T15:46:51Z
parent: sonic-pi-q65q
---

Send buffer + workspace name; apply returned aligned text as a whole-document edit. Preserve cursor best-effort. GUI Align parity using the app's own RBeautify.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [ ] Implemented on a branch with red->green where logic is testable (per repo gates: npm test suites + live e2e + vsce package)
- [ ] README/settings docs updated to match shipped behavior
- [ ] User sign-off obtained before merge

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/typescript/SKILL.md - beautify command + whole-doc edit TS work
- .agents/skills/vscode-ext-commands/SKILL.md - new command conventions
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.
