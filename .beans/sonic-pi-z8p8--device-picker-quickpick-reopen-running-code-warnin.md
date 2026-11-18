---
# sonic-pi-z8p8
title: Device picker QuickPick + reopen + running-code warning (F7)
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:31:42Z
updated_at: 2026-11-18T12:16:02Z
parent: sonic-pi-kxiz
blocked_by:
    - sonic-pi-jdhc
---

# Task: Device picker QuickPick + reopen + running-code warning (F7)

## Files
- new src/audio-device-picker.ts (QuickPick from device state; 'Reset audio device' entry)
- package.json (SURGICAL: commands vscode-sonic-pi.audioDevices, vscode-sonic-pi.reopenAudioDevice + activation entries)
- src/source-runner/extension.ts (wiring)

## Acceptance criteria (extend test/unit/audio-devices.test.js + one integration assertion)
- [x] picker lists devices from the push, selection sends switch-device
- [x] every destructive action shows the 'this restarts your running code' confirm (vscode-supercollider lesson: no accidental destructive clicks)
- [x] reopen-device command sends the route; cold-window dispatch safe

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/vscode-ext-commands/SKILL.md

## Proof of Work

- Unit: test/unit/audio-devices.test.js green (13 named cases incl. switch flow confirm modal + port-follow fix), in npm test + test:unit chains (gate repair in sonic-pi-x34b).
- Integration: 'requestAudioDevices reaches the daemon as /daemon/audio/request-devices and the picker shows the pushed devices' passes; full battery 31 passing / 0 failing (was 29/1) after sonic-pi-y71r fixed the stale daemonSender (audio requests went to the dead pre-reboot port - root cause found via wire-level debug, fixed red-first).
- AC audit at dev2 tip 7370186: picker selection -> bridge.switchAudioDevice(picked.deviceName) (audio-device-picker.ts:79); RUNNING_CODE_CONFIRM warning gates destructive picks; reopenAudioDevice command registered + cold-window-safe (manifest gate suite green).
- Shipped on dev2, draft PR dev2->dev: https://github.com/bmcszk/vscode-sonic-pi/pull/2 (CI green).
Residual: none
