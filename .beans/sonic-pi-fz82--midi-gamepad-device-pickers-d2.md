---
# sonic-pi-fz82
title: MIDI + gamepad device pickers (D2)
status: completed
type: feature
priority: normal
created_at: 2026-11-18T17:06:03Z
updated_at: 2026-11-18T17:54:03Z
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

## Proof of Work

- D2a wave 1: 8 tests/15 assertions red-first (parse round-trip, sections, toggle payloads per audio-device-picker convention). D2b chain O: 12/12 midi tests (senders arg orders per spider-server.rb:746-764, gamepad auto-start once-per-session, reset). 
- Orchestrator verified battery exit 0 at chain-O worktree; merged b2fea77.
Residual: D2c commands registration lands with chain H pass 2 (pending)

## Correction (orchestrator)

Reopened: D2c (midiDevices + gamepads commands, package.json contributes, cold-window guards, integration asserts) is NOT landed. Senders (D2b) + parser (D2a) stand verified; the feature closes when the pickers exist as commands and the wire asserts pass.

## Proof of Work (final)

- D2c landed: Main.lastMidiInPorts/OutPorts/lastGamepads cached from pushes (registerDeviceListHandlers); runMidiPortPicker/runGamepadPicker with injected QuickPick, refresh -> /midi-reset; commands vscode-sonic-pi.midiDevices/.gamepads with cold-window guards; 9 unit tests red-first ('no handler for /midi/in-ports' -> green).
- Integration: fake push midi-ports -> cache updated; pick via pickMidiPortForTest seam -> /midi-port-enable with flipped enabled on the wire ledger.
- Orchestrator gates at 2407142: same as 09v2 (all green).
Residual: none
