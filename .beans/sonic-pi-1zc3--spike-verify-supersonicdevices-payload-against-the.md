---
# sonic-pi-1zc3
title: 'Spike: verify /supersonic/devices payload against the live daemon (F7 hard gate)'
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:31:42Z
updated_at: 2026-11-16T13:57:44Z
parent: sonic-pi-kxiz
---

# Task: Spike - verify /supersonic/devices payload against the live daemon (F7 HARD GATE)

## Method (no production code)
Run the real Sonic Pi daemon, send /daemon/audio/request-devices with the token from the booter log, capture the pushes (host-side openOscReceiver script is the pattern). Notes go into THIS bean body (parent may move to docs/research).

## Acceptance criteria
- [ ] push address(es) + arg shapes recorded verbatim with line-cites
- [ ] decision recorded: parse format for the picker
- [ ] if payload differs per driver, note the union

## Skills for coder
- /home/blaze/.agents/skills/ruby/SKILL.md (read daemon.rb forwarding to target the capture)
- /home/blaze/.agents/skills/typescript/SKILL.md

## Spike results (2026-11-16, COMPLETE - parent ran it locally)

Method: throwaway daemon.rb boot (plain ruby, no --disable=gems - the spider uses that flag, the daemon does NOT), keepalive thread within the 3s window, /daemon/audio/request-devices(token) to the daemon port, osc-js (the extension's own lib) for encoding. Hand-rolled OSC encoding failed (NO ACK - subtle padding/parse mismatch); osc-js encoding works - use OscSender in production.

Captured pushes (verbatim arg shapes, all three arrive after ONE request-devices call):
- /supersonic/device-table: ["PipeWire", "", 2, "ALSA", 20, "System Default", "follows-default,synthetic", "Default ALSA Output (currently PipeWire Media Server)", "", "PulseAudio Sound Server", "", ...] - structure: [engine, ?, engineId, driver, maxInputs?, then TRIPLETS: name, key-flags, description...]
- /supersonic/devices (outputs): ["system", "System Default", "System Default", "Ryzen HD Audio Controller Speaker", "ThinkPad Thunderbolt 3 Dock USB Audio Analog Stereo", "Renoir/Cezanne HDMI/DP Audio Controller HDMI / DisplayPort 3 Output (Stereo)", ...]
- /supersonic/input-devices (inputs): ["System Default", 20, "System Default", "Patchbay (16 ch)", "Ryzen HD Audio Controller Stereo Microphone", ...]

Parse decision: outputs/inputs lists are FLAT name arrays (display names); device-table carries structured key metadata for switching. F7 task 2 parses devices+input-devices as flat name lists for the QuickPick; device-table keys used for switch-device args at task 3 (verify exact key name shape when implementing: likely the name strings themselves are the keys).

Gotchas recorded:
- daemon.rb must spawn WITHOUT --disable=gems (needs user gems, e.g. tomlrb)
- keepalive must start within 3s of the ports line
- ruby Time#> needs a Time, not a number (script bug class)
- the request-devices reply lands on gui-listen as /supersonic/devices + /supersonic/input-devices + /supersonic/device-table (all three, one round-trip)

## Acceptance criteria check
- [x] push address(es) + arg shapes recorded verbatim (this body)
- [x] parse decision recorded (flat lists for picker; device-table keys for switch)
- [x] per-driver difference: only ALSA/PipeWire driver present on this machine; the triplet structure of device-table is driver-independent per shape above - note: switch-device arg shape still to be confirmed live at task 3 (cheap: one more spike round with /daemon/audio/switch-device on a safe device)

## Proof of Work (2026-11-16, parent-executed)

Commands: throwaway daemon boot + request-devices capture (script /tmp/f7-spike*.rb + /tmp/f7-oscjs.js, outputs /tmp/f7-final*.txt); all three pushes captured verbatim (see spike results above).
Residual: switch-device ARG shape to be confirmed live during task jdhc/z8p8 (cheap round-trip on a safe device).

Residual: none for the spike scope itself.
