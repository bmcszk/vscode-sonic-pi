---
# sonic-pi-kmbo
title: '[P3] Completion polish + searchable Sonic Pi Docs quick-pick'
status: todo
type: feature
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-04T23:29:49Z
parent: sonic-pi-q65q
---

Trigger completion on ':' and ',' (helper parity); command 'Sonic Pi: Docs' opens a QuickPick browser over our builtins data (synths/fx/samples with full option docs).

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [ ] Implemented on a branch with red->green where logic is testable (per repo gates: npm test suites + live e2e + vsce package)
- [ ] README/settings docs updated to match shipped behavior
- [ ] User sign-off obtained before merge

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/typescript/SKILL.md - completion provider + quick-pick TS work
- .agents/skills/vscode-ext-commands/SKILL.md - new 'Sonic Pi: Docs' command conventions
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.
