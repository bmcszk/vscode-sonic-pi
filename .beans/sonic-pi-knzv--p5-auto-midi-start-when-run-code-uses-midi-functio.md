---
# sonic-pi-knzv
title: '[P5] Auto /midi-start when run code uses midi_* functions'
status: completed
type: feature
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-05T15:45:36Z
parent: sonic-pi-q65q
---

Before runCode, if code matches /midi_/, send /midi-start once per session (config-gated). Prevents the classic 'MIDI functions silently do nothing'.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [x] Implemented on branch p5-midi (c0cd23b, merged with P1): src/midi.ts pure decision + wiring, red->green, 8 suites + e2e green
- [x] README + docs/SETTINGS.md rows for autoMidiStart
- [x] User pre-authorized P-wave delegation ('delegate all')

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/typescript/SKILL.md - runCode pre-send logic
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.

## Proof of Work

Worker 1fe76100 on p5-midi (c0cd23b): shouldAutoStartMidi pure fn (regex (^|[^a-zA-Z])midi_ - documented deviation from \bmidi_ to cover use_midi_notes, sound reasoning), once-per-session guard, autoMidiStart setting default true. Parent re-verified post-merge (with P1 in same merge): 9 suites green, live e2e gate green. Residual: none.
