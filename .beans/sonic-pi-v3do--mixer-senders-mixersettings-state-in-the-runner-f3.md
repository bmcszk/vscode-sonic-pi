---
# sonic-pi-v3do
title: Mixer senders + /mixer/settings state in the runner (F3)
status: draft
type: task
priority: normal
created_at: 2026-11-16T13:30:04Z
updated_at: 2026-11-16T13:32:15Z
parent: sonic-pi-wcgd
blocked_by:
    - sonic-pi-r0om
---

# Task: Mixer senders + /mixer/settings state in the runner (F3)

## Files
- src/source-runner/main.ts (setDrive(amp), setLpf(freq|off), setHpf(freq|off) senders next to the existing mixer senders 949-996; onMixerSettings emitter + osc.on('/mixer/settings', ...) handler in setupOscReceiver - ADDITIVE, do not touch bind/error logic)
- src/source-runner/extension.ts (export onMixerSettings)

## Acceptance criteria (new test/unit/mixer.test.js, per-run-stop harness pattern)
- [ ] /mixer/settings push lands in the emitter with parsed floats
- [ ] drive sender emits /mixer-drive with (token, amp, 1); lpf enable emits (token, freq); volume keeps the existing /100 convention (setMasterVolume parity)

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/.agents/skills/ruby/SKILL.md (arg-order check against spider-server.rb 568-633 before coding)
