---
# sonic-pi-es07
title: 'UX: ''logs elsewhere'' deafness must name the real holder (app vs window) and be visible outside the log channel'
status: todo
type: bug
created_at: 2026-11-16T12:55:06Z
updated_at: 2026-11-16T12:55:06Z
parent: sonic-pi-u71o
---

# UX: deaf-window takeover message missed the user (2026-11-08 -> verified 11-16 13:53)

## What actually happened (parent verified from logs + ss)
User restarted the VS Code window while the REAL Sonic Pi Qt app (pid 835051, running since Nov 15) held the server. Reload -> window attached to the app's daemon (29928/29929) -> our reply-port bind failed EADDRINUSE (the APP owns 29929) -> window deaf by design: plays sounded, logs went to the app's GUI, extension channel showed nothing. Takeover-then-boot recovered at 13:49:12 (own daemon, receiver on 29249, healthy now).

## The failure
The takeover UX message DID log ('Another VS Code window is connected... IT will show the run logs...') but the user still reported 'logs empty'. Two real defects:
1. The message blames 'another VS Code window' when the holder was the Sonic Pi APP itself - wrong attribution, confusing.
2. The deafness is invisible in the UI: it only lives in a log channel the user wasn't reading. Nothing in the statusbar or editor says 'logs are going elsewhere'.

## Fix contract
- [ ] Detect the actual reply-port holder and name it: read /proc for the pid owning the port (app: /usr/bin/sonic-pi -> 'the Sonic Pi app'; code -> 'another VS Code window'). Message: 'The Sonic Pi app is showing the run logs. Your window's Play will still sound. To bring the logs here: press Play again (takes over the connection).' Note: press-Play-again IS the takeover trigger (verified this incident) - say that explicitly.
- [ ] Statusbar deafness indicator while receiving=false (e.g. logs icon + 'logs: elsewhere' item) with the same explain-on-click.
- [ ] Integration test: bind-squatter scenario asserts the new message wording + holder attribution.
