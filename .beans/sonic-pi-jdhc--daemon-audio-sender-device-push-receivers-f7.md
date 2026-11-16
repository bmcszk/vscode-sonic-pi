---
# sonic-pi-jdhc
title: Daemon-audio sender + device-push receivers (F7)
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:31:42Z
updated_at: 2026-11-16T14:10:49Z
parent: sonic-pi-kxiz
blocked_by:
    - sonic-pi-1zc3
    - sonic-pi-r0om
---

# Task: Daemon-audio sender + device-push receivers (F7)

## Files
- src/source-runner/main.ts (a daemonSender() accessor separate from keepalive; requestAudioDevices, switchAudioDevice, switchAudioDriver, reopenAudioDevice; onSupersonicDevices emitter + handlers for the push addresses in setupOscReceiver)

## Acceptance criteria (test/unit/audio-devices.test.js, FakeOsc harness)
- [ ] audio routes go to the daemon port with the daemon token, never the spider port
- [ ] device push populates the emitter with the spike-verified shape

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/.agents/skills/ruby/SKILL.md

## Proof of Work (2026-11-16, parent-verified)

Worker branch f7t2-audio-senders (d1dc049), merged to dev2 (baf4607, parent resolved an additive-vs-additive conflict in main.ts keeping both /mixer/settings and /supersonic handlers):
- daemonSender (separate OscSender on daemonPort, lazy, keepalive untouched)
- senders token-first per daemon.rb:239; requestAudioDevices/switchAudioDevice/switchAudioDriver/reopenAudioDevice
- onSupersonicDevices emitter + handlers for devices/input-devices/device-table, non-strings filtered defensively, raw device-table stored for task 3
- 5 unit tests (routes + token + port separation + spike shapes)

Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, vscode-test 21+1+1 passing. Suppressions 0.
Residual: switch-device arg shape confirmed live in task 3 (z8p8).
