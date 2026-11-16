---
# sonic-pi-z8p8
title: Device picker QuickPick + reopen + running-code warning (F7)
status: draft
type: task
priority: normal
created_at: 2026-11-16T13:31:42Z
updated_at: 2026-11-16T13:32:15Z
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
- [ ] picker lists devices from the push, selection sends switch-device
- [ ] every destructive action shows the 'this restarts your running code' confirm (vscode-supercollider lesson: no accidental destructive clicks)
- [ ] reopen-device command sends the route; cold-window dispatch safe

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/vscode-ext-commands/SKILL.md
