---
# sonic-pi-q65q
title: 'Feature gap analysis: reverse-engineer sonic-pi-helper + Sonic Pi, propose extension features/fixes'
status: in-progress
type: epic
priority: normal
created_at: 2026-11-04T20:29:46Z
updated_at: 2026-11-04T20:43:47Z
---

# Feature gap analysis (user directive 2026-11-04)

"Do not do PR against sonic-pi [upstream]. Figure out what our extension is still missing worth adding — reverse-engineer sonic-pi-helper (marketplace) + Sonic Pi itself, propose more features/fixes."

## Phase A - analysis (this bean)
1. Reverse-engineer marketplace extension ZonaGrisDigital.sonic-pi-helper: download vsix, extract manifest (commands/menus/config), compare feature set with ours. Find its repo if any.
2. Reverse-engineer Sonic Pi app itself LOCALLY (/usr/lib/sonic-pi): enumerate the OSC command surface spider-server accepts (run-code space: mixer, volume, recording, clear-rec, external editor, docs, etc.) + GUI features our extension lacks.
3. Gap analysis vs ours (commands registered + shipped: run/stop/runCell/runWithText/codelens/title button/playing-line highlight/audio recovery/restart).
4. Output: docs/research/feature-gaps.md with proposals ranked by value/effort, each with source evidence.

## AC

- [x] helper's full command/feature surface documented (vsix extracted: 2 commands, /proc attach, stale compact dataset, snippets)
- [x] Sonic Pi OSC surface documented (spider-server.rb add_method inventory; unused methods mapped to proposals)
- [x] proposals ranked by value/effort (P1-P7 in docs/research/feature-gaps.md)
- [x] user picked work items -> beans created: sonic-pi-lgv0 (P1), ui6r (P2), kmbo (P3), dmux (P4), knzv (P5), h8vo (P6), lkus (P7)

Stop rule: reads + docs/research/feature-gaps.md only. No code changes.

## Phase A complete (2026-11-04)

Report committed: docs/research/feature-gaps.md. Helper vsix extracted+inspected (2 commands, /proc attach, hover/completions on stale compact data incl. only 11 samples, snippets); ours verified strictly richer everywhere except snippets. Unused OSC surface ranked into proposals P1-P7 (no PR to upstream per user directive). Awaiting user picks -> Phase B beans per accepted proposal.

## coding-rules review of recent feature code (2026-11-04)

Compliant: intent/mechanism separation (codelenses.ts pure block classification; playing-lines.ts pure TTL logic with injected clock/editor), call-order file layout, black-box tests via public API with fake clock+editor only (no mocks of SUT), error-early returns, no narration comments in new modules. Fixed residues (commit on master): /flash emitter type+fire still carried jobid after variant A (dead field), showPlayingLineHighlight used !==false default (lying default; now ===true until manifest default ships), 3 stale comments describing /flash (jobid,...). Gates re-run green (6 suites + e2e).

## Summary of Changes

Phase A analysis delivered: docs/research/feature-gaps.md (helper reverse-engineered from its vsix; Sonic Pi OSC surface inventoried from daemon source; 7 ranked proposals). User picked all 7 -> child requirement beans created (lgv0/ui6r/kmbo/dmux/knzv/h8vo/lkus). Epic closes when those complete; per-session rule this becomes the active epic once dgis/rtvk/kpif wrap.
