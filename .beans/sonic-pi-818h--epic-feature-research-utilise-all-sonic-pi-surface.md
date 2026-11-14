---
# sonic-pi-818h
title: 'Epic: feature research - utilise ALL Sonic Pi surfaces + killer features (no Sonic Pi changes)'
status: in-progress
type: epic
priority: normal
created_at: 2026-11-14T12:32:51Z
updated_at: 2026-11-14T12:49:39Z
---

# Epic: feature-research wave - 'use ALL of Sonic Pi, and more'

## Goal
User directive (2026-11-08): research what features are planned vs shipped, study comparable projects ('struddle' = Strudel/other live-code editors), and identify useful/valuable/killer features for the extension. CONSTRAINT: do NOT change Sonic Pi itself - consume every OSC surface + log/cue stream the daemon/spider already exposes and add editor-side value on top.

## Local ground truth already harvested (parent)
Full spider-server OSC route list extracted from the installed daemon (/usr/lib/sonic-pi/app/server/ruby/bin/spider-server.rb). Underused routes with feature potential:
- Recording: /start-recording /stop-recording /save-recording /delete-recording (editor-side Record button + filename prompt + insert into workspace)
- Mixer: /mixer-output-volume /mixer-drive /mixer-lpf-*/hpf-* /mixer-invert-stereo /mixer-mono/stereo (statusbar mixer popover)
- Transport/Link: /link-bpm /link-num-peers /set-global-timewarp (BPM display + Link peers indicator)
- Buffer ops: /load-buffer /buffer/replace-idx /buffer/run-idx /buffer-indent-selection /buffer-section-toggle-comment /buffer-section-complete-snippet-or-indent-selection
- Input: /midi/in-ports /midi/out-ports /gamepad/devices-list (device pickers)
- Cue net: /cue-port-external /incoming/osc (external cue visualization!)
- /check-for-updates-now, /version (about pane)

## Phases
- [x] Phase A: docs/research/feature-roadmap.md delivered + parent-verified + merged (170d75c)
- [ ] Phase B: user reviews roadmap; we promote picks into feature beans

## Phase A delivered (2026-11-14, parent-verified): docs/research/feature-roadmap.md merged (170d75c)

24 features mapped to real daemon surfaces, rated value/effort/risk.
Top-5 killers: F1 per-run stop + F2 loop mute (/stop-job + /run/* events), F3 mixer popover (/mixer/settings push), F4 Link BPM+peers statusbar (/link-bpm, /link-num-peers pushes), F5 cue inspector + F6 cue test bench (/incoming/osc, /cue-port-*), F7 audio device hot-swap (/daemon/audio/* with the daemon token we hold).
Single biggest insight: the daemon ALREADY PUSHES telemetry we ignore (/link-bpm, /mixer/settings, /run/started, /live_loop/scope...) - half the roadmap is 'stop ignoring the wire'.
Phase B pending: user reviews roadmap and picks features -> promote to feature beans.
