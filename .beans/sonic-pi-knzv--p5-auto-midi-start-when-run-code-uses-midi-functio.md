---
# sonic-pi-knzv
title: '[P5] Auto /midi-start when run code uses midi_* functions'
status: todo
type: feature
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-04T20:36:14Z
---

Before runCode, if code matches /midi_/, send /midi-start once per session (config-gated). Prevents the classic 'MIDI functions silently do nothing'.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.
