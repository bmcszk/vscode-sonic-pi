---
# sonic-pi-fz82
title: MIDI + gamepad device pickers (D2)
status: completed
type: feature
priority: normal
created_at: 2026-11-18T17:06:03Z
updated_at: 2026-11-18T17:20:10Z
parent: sonic-pi-6fiz
---

# D2: MIDI + gamepad device pickers (roadmap F14+F15, one mechanism)

Pushes /midi/in-ports + /midi/out-ports (spider-server.rb:986-988) + /gamepad/devices-list (:990); payload one string of 'enabled<TAB>name' lines (runtime.rb:1949-1951). Sends: /midi-port-enable(token, direction, port, on) :746-754, /gamepad-enable(token, pad, on) :756-764, /midi-stop|reset :701-723, /gamepad-start|stop :724-745.

## UX
'Sonic Pi: MIDI Devices' QuickPick (Inputs/Outputs sections, toggle items showing on/off, picked flips state); 'Refresh MIDI devices' sends /midi-reset. 'Sonic Pi: Gamepads' same shape; 'Start gamepad cues' mirrors /midi-start. Auto-start for gamepad_ code mirrors the midi.ts heuristic (main.ts:737-741).

## Tasks
- D2a pure src/device-ports.ts: parseDevicePairs + buildPortQuickPickItems + buildGamepadQuickPickItems (audio-device-picker.ts pattern); unit >=8. No deps.
- D2b senders midiPortEnable/midiReset/gamepadEnable/gamepadStart/Stop + gamepad_ auto-start hook; unit >=5 (arg orders per :746-764, auto-start once per session). Deps D0.
- D2c handlers + commands vscode-sonic-pi.midiDevices / .gamepads (cold-window silent, extension.ts:288-295 pattern) + package.json. Deps D2a, D2b, W3a.

## Acceptance criteria
- [ ] D2a-D2c completed with PoW
- [ ] Integration: fake push midi-ports -> picker items; picking sends /midi-port-enable with flipped state on the wire
- [ ] Cold dispatch of both commands silent (activation gate green)

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
