---
# sonic-pi-h8vo
title: '[P6] Attach-to-running-app mode'
status: completed
type: feature
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-05T16:39:21Z
parent: sonic-pi-q65q
---

Discover a user-run Sonic Pi server via /proc scan for spider-server.rb -u ports+token (sonic-pi-helper pattern, verified in its out/sonicPiConnection.js); use it instead of managing our own daemon. For users who keep GUI app + VS Code side by side.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [x] Implemented on branch p6-attach (afdbd92, merged 73557b2): src/attach.ts pure parser (real-cmdline fixtures), connectionMode auto/managed/attach, constructor-injected discovery hook per supervisor ruling
- [x] README + docs/SETTINGS.md rows for connectionMode
- [x] User pre-authorized P-wave delegation ('delegate all')

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/typescript/SKILL.md - process discovery + attach wiring
- .agents/skills/vscode-ext-commands/SKILL.md - attach/detach command conventions
- .agents/skills/ruby/SKILL.md - reading spider-server.rb cmdline/args and daemon behavior
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.

## Proof of Work

Worker 1ed04e6f on p6-attach (afdbd92): 13 attach tests (real cmdline fixture, token -402713833), two supervisor rounds (stub-only EventEmitter addition; injected discovery hook instead of mutable property). Parent re-verified post master-merge-resolution: 11 suites green (87 ok), live e2e gate green, vsce package DONE. Residual: none.

## Follow-up (2026-11-05): CI caught a machine-dependent test

The P6 suite's live-scan case ('this machine's live server') passed locally and failed CI - the environment-dependence class the CI gate exists for; parent missed it at merge (local run had the live daemon). Fixed a5300e3: same readdir/readFile seam, synthetic pid + the real-cmdline fixture already in the file. CI green post-fix. Lesson recorded: branch gates must be run in a CI-equivalent context (or the suite must be machine-independent by construction) before merge.
