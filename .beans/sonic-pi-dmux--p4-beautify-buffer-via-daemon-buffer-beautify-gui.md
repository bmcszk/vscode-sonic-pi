---
# sonic-pi-dmux
title: '[P4] Beautify buffer via daemon /buffer-beautify (GUI Align parity)'
status: completed
type: feature
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-05T15:57:57Z
parent: sonic-pi-q65q
---

Send buffer + workspace name; apply returned aligned text as a whole-document edit. Preserve cursor best-effort. GUI Align parity using the app's own RBeautify.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [x] Implemented on branch p4-beautify (f84c7a1, merged c6ac3c7): src/beautify.ts pure computeBeautifyEdit, OSC research mirrored GUI exactly (/save-buffer registration, /buffer-beautify [token,buf_id,code,line,index,first_line], /buffer/replace reply)
- [x] README Commands paragraph updated (Beautify)
- [x] User pre-authorized P-wave delegation ('delegate all')

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/typescript/SKILL.md - beautify command + whole-doc edit TS work
- .agents/skills/vscode-ext-commands/SKILL.md - new command conventions
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.

## Proof of Work

Worker 592ad4e4 on p4-beautify (f84c7a1). Protocol research cited: spider-server.rb:447 (/buffer-beautify args), :1035 + runtime.rb:1308 (/buffer/replace reply). Parent re-verified: branch gates green (10 suites + e2e), master-merge conflict resolved (test-script union, README union), post-merge 11 suites green (87 ok), live e2e gate green, vsce package DONE. Residual: none.
