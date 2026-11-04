---
# sonic-pi-ui6r
title: '[P2] Snippet pack: ready made Sonic Pi snippets (ll, lls, llb, use_bpm...)'
status: todo
type: feature
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-04T23:29:49Z
parent: sonic-pi-q65q
---

Manifest-only contributes.snippets for language sonic-pi. Templates: live_loop, live_loop+synth, live_loop+sample, use_bpm, with_fx, chord/scale basics. The one thing sonic-pi-helper has that we lack.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [ ] Implemented on a branch with red->green where logic is testable (per repo gates: npm test suites + live e2e + vsce package)
- [ ] README/settings docs updated to match shipped behavior
- [ ] User sign-off obtained before merge

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/vscode-ext-commands/SKILL.md - snippet pack is manifest contributes work
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.
