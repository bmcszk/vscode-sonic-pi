---
# sonic-pi-jdhc
title: Daemon-audio sender + device-push receivers (F7)
status: todo
type: task
priority: normal
created_at: 2026-11-16T13:31:42Z
updated_at: 2026-11-16T13:58:03Z
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
