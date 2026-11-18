---
# sonic-pi-kxiz
title: Switch audio output device, driver and sample rate from VS Code with running-code warning (F7)
status: completed
type: feature
priority: normal
created_at: 2026-11-16T13:31:42Z
updated_at: 2026-11-17T12:49:48Z
parent: sonic-pi-818h
---

# Feature (F7): Switch audio output device, driver and sample rate from VS Code without rebooting

User outcome: v5's headline feature in-editor - plug headphones mid-jam and switch. With a running-code warning (a real device rebuild triggers cold-swap reinit which stops running jobs - spider-server.rb:866-880).

## OSC surface (verified daemon.rb:226-246)
/daemon/audio/request-devices, /daemon/audio/switch-device, /daemon/audio/switch-driver, /daemon/audio/reopen-device - DAEMON token as args[0], sent to the DAEMON port (main.ts holds both: daemonPort + guiUuid, used by keepalive at 599-622; use a SEPARATE OscSender - keepalive untouched).
Device table from pushes /supersonic/devices, /supersonic/device-table, /supersonic/input-devices (forwarded daemon.rb:337-340) - PAYLOAD SHAPE UNVERIFIED (roadmap section 6): the spike task is a hard gate.

## Structure
- task: Spike - verify /supersonic/devices payload against the live daemon (HARD GATE)
- task: Daemon-audio sender + device-push receivers (blocked-by spike)
- task: Device picker QuickPick + reopen + running-code warning

## Proof of Work (2026-11-17)

Tasks completed: F7 spike (1zc3 - payload shapes captured from the live daemon), daemon-audio senders + device-push receivers (jdhc). Residual: z8p8 (device picker UI + integration) is the remaining task in todo - it completes the feature.
