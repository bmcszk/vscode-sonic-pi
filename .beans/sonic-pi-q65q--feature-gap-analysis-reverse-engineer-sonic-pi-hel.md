---
# sonic-pi-q65q
title: 'Feature gap analysis: reverse-engineer sonic-pi-helper + Sonic Pi, propose extension features/fixes'
status: in-progress
type: task
priority: normal
created_at: 2026-11-04T20:29:46Z
updated_at: 2026-11-04T20:31:50Z
---

# Feature gap analysis (user directive 2026-11-04)

"Do not do PR against sonic-pi [upstream]. Figure out what our extension is still missing worth adding — reverse-engineer sonic-pi-helper (marketplace) + Sonic Pi itself, propose more features/fixes."

## Phase A - analysis (this bean)
1. Reverse-engineer marketplace extension ZonaGrisDigital.sonic-pi-helper: download vsix, extract manifest (commands/menus/config), compare feature set with ours. Find its repo if any.
2. Reverse-engineer Sonic Pi app itself LOCALLY (/usr/lib/sonic-pi): enumerate the OSC command surface spider-server accepts (run-code space: mixer, volume, recording, clear-rec, external editor, docs, etc.) + GUI features our extension lacks.
3. Gap analysis vs ours (commands registered + shipped: run/stop/runCell/runWithText/codelens/title button/playing-line highlight/audio recovery/restart).
4. Output: docs/research/feature-gaps.md with proposals ranked by value/effort, each with source evidence.

## AC
- [ ] helper's full command/countable surface documented (evidence: manifest extract)
- [ ] Sonic Pi OSC surface documented (evidence: source paths)
- [ ] proposals ranked, user picks what to implement
Phase B beans created per accepted proposal.

Stop rule: reads + docs/research/feature-gaps.md only. No code changes.

## Phase A complete (2026-11-04)

Report committed: docs/research/feature-gaps.md. Helper vsix extracted+inspected (2 commands, /proc attach, hover/completions on stale compact data incl. only 11 samples, snippets); ours verified strictly richer everywhere except snippets. Unused OSC surface ranked into proposals P1-P7 (no PR to upstream per user directive). Awaiting user picks -> Phase B beans per accepted proposal.
