---
# sonic-pi-s155
title: Mixer popover UI (QuickPick) on the statusbar (F3)
status: draft
type: task
priority: normal
created_at: 2026-11-16T13:30:04Z
updated_at: 2026-11-16T13:32:15Z
parent: sonic-pi-wcgd
blocked_by:
    - sonic-pi-v3do
---

# Task: Mixer popover UI (QuickPick) on the statusbar (F3)

## Files
- src/statusbar.ts (new mixer item priority 98; click opens the popover - reuse the bridge-constructor pattern; the existing masterVolume command stays but its click target moves to the popover)
- new src/mixer-panel.ts (pure: QuickPick item list from mixer state, label formatting '$(tunnel-horizontal) vol 80% - drive 1.0')
- package.json (SURGICAL: command vscode-sonic-pi.mixer + activation entry; NO new settings - state is live from the push)

## Acceptance criteria (test/unit/mixer-panel.test.js pure + extend statusbar.test.js)
- [ ] popover lists Volume / Drive / LPF / HPF / Mono / Invert entries with live values from the last /mixer/settings push
- [ ] picking Drive -> input box -> sends /mixer-drive; LPF -> frequency -> /mixer-lpf-enable or disable on 0/off; cold-window dispatch of vscode-sonic-pi.mixer does not throw

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/vscode-ext-commands/SKILL.md
