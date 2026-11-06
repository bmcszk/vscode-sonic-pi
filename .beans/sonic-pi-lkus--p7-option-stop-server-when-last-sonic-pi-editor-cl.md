---
# sonic-pi-lkus
title: '[P7] Option: stop server when last Sonic Pi editor closes'
status: completed
type: task
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-05T15:45:36Z
parent: sonic-pi-q65q
---

Config-gated hygiene: when the last visible sonic-pi editor closes and no runs are active, stop the daemon. Respect audio-recovery semantics.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [x] Implemented on branch p7-work (8e37f21) after worktree recovery: editor-close.ts pure decision, restart-aware, opt-in setting default false
- [x] README + docs/SETTINGS.md rows for stopServerOnLastEditorClose
- [x] User pre-authorized P-wave delegation ('delegate all')

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/typescript/SKILL.md - editor-close lifecycle logic
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.

## Proof of Work

Worker 742774b4 on p7-work (8e37f21, in dedicated worktree after the shared-checkout collision I caused): shouldStopServerOnLastEditorClose pure decision (opt-in, restart-aware, editors-remaining count), wiring in extension.ts, stopServerOnLastEditorClose default false. Parent resolved the merge conflicts (test script union, extension.ts dual wiring) and re-verified: 9 suites green, e2e gate green. Residual: none.
