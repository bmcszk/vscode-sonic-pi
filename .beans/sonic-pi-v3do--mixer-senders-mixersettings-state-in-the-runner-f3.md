---
# sonic-pi-v3do
title: Mixer senders + /mixer/settings state in the runner (F3)
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:30:04Z
updated_at: 2026-11-16T14:06:25Z
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

## Proof of Work (2026-11-16, parent-verified)

Worker branch f3t1-mixer-senders (625f993), merged to dev2: setDrive/setLpf/setHpf senders (arg orders re-verified against spider-server.rb 568-633), onMixerSettings emitter + additive /mixer/settings handler, volume /100 convention untouched. 5 unit tests.
Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, integration green. Suppressions 0.
Residual: none.
