---
# sonic-pi-kmbo
title: '[P3] Completion polish + searchable Sonic Pi Docs quick-pick'
status: completed
type: feature
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-05T15:51:32Z
parent: sonic-pi-q65q
---

Trigger completion on ':' and ',' (helper parity); command 'Sonic Pi: Docs' opens a QuickPick browser over our builtins data (synths/fx/samples with full option docs).

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [x] Implemented on branch p3-docs (bdcc664, merged): triggers [':', ','] on 4 providers, src/docs-browser.ts pure filter/format, Docs quick-pick command
- [x] README Commands section updated
- [x] User pre-authorized P-wave delegation ('delegate all')

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/typescript/SKILL.md - completion provider + quick-pick TS work
- .agents/skills/vscode-ext-commands/SKILL.md - new 'Sonic Pi: Docs' command conventions
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.

## Proof of Work

Worker 56c1267e on p3-docs (bdcc664). Parent re-verified on the branch: 58 test ok lines, live e2e gate green, then merged to master (gates re-run post-merge: 67 ok incl. new docs-browser suite). Residual: none.
