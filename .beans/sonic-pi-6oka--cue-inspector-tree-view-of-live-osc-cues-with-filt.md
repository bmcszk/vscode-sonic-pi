---
# sonic-pi-6oka
title: 'Cue Inspector: tree view of live OSC cues with filter, pause/clear and insert-sync-path (F5)'
status: completed
type: feature
priority: normal
created_at: 2026-11-16T13:30:44Z
updated_at: 2026-11-17T12:49:48Z
parent: sonic-pi-818h
---

# Feature (F5): Cue Inspector - tree view of live OSC cues with filter, pause/clear, insert-sync-path

User outcome: makes the whole OSC-cue ecosystem (Orca, TouchOSC, Tidal, custom controllers) usable and debuggable from VS Code.

## OSC surface (verified)
Push /incoming/osc(time, id, address, args) [spider-server.rb:982] - already received at main.ts:441-453, only dumped to the log channel today. Controls /cue-port-start|stop|external|internal(token) [766-801].

## Structure
- task: Cue event stream: structured emitter + ring buffer
- task: TreeView cues panel with filter/pause/clear + insert sync path
- task: Cue-port controls + integration coverage

## Proof of Work (2026-11-17)

All three tasks completed: cue-store ring buffer (56gn), TreeView panel with filter/pause/clear/insert-sync (ho80), cue-port controls + integration coverage (3rze). End-to-end: the fake daemon pushes /incoming/osc -> store -> panel; cue-port toggles asserted on the wire. Residual: none.
