---
# sonic-pi-x8zf
title: 'Cue test bench: send test OSC cues to Sonic Pi''s cue port from VS Code (F6)'
status: draft
type: feature
created_at: 2026-11-16T13:31:24Z
updated_at: 2026-11-16T13:31:24Z
parent: sonic-pi-818h
---

# Feature (F6): Cue test bench - send test OSC cues to Sonic Pi's cue port from VS Code

User outcome: exercise sync code without any external tool (Orca-style loop, end-to-end).

## Wire (verified)
Our own UDP sender to the documented cue port (4560 default; spider-server.rb:133-138 - argv[5]).
VERIFIED GAP: serverOscCuesPort (main.ts:82) is only set in attach mode (applySpiderPorts); managed mode leaves it -1. The daemon stdout carries it as parts[4] (daemonstdout.ts comment) but the parser drops it.

## Structure
- task: Cue port discovery: parse osc-cues from daemon stdout + setting override (no deps - Wave 1)
- task: Bench sender + view-title UI in the Cue panel (blocked-by F5 task 2 + Wave 0 cue socket)
