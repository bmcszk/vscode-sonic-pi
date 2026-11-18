---
# sonic-pi-eimm
title: Mute and unmute Sonic Pi loops without deleting them (stop this loop's job, remember its code, re-run on unmute)
status: completed
type: feature
priority: normal
created_at: 2026-11-16T13:29:31Z
updated_at: 2026-11-17T12:49:48Z
parent: sonic-pi-818h
---

# Feature (F2): Mute and unmute Sonic Pi loops without deleting them

User outcome: Tidal d1-style - stop this loop's job, remember its code, re-run on unmute. Other loops keep playing.

## OSC surface (verified spider-server.rb)
- mute: /stop-job(token, jobId) [318-326]
- unmute: /run-code(token, code, workspace, silent) [302-316] re-send with the stored workspace

## Critical seam insight
runCode (main.ts:828-861) calls stopAllJobs() at 842 whenever runReplacesSession is on (the default). An unmute through today's runCode would kill every other loop - F2 adds a no-replace send variant.

## Structure
- task: Muted-cell registry + no-replace run path in the runner
- task: Mute toggle in the editor (CodeLens + notebook cell command)
- task: Integration - mute stops only that run, unmute re-runs it

## Proof of Work (2026-11-17)

All three tasks completed:
- hjng: mute registry + no-replace run path (unit)
- 8nva: mute UI CodeLens + notebook commands (unit + integration; re-dispatched after the VOIDED false PoW incident)
- fccp: mute/unmute integration (editor + notebook paths, per-run stop verified on the wire)

End-to-end: a notebook or editor cell can be muted (only its job stops), unmuted (its code re-runs under the same workspace without replacing the session). En-route product fixes: runWithText cell keys + /stop-job job-id-0 predicate (fcc2706).

Residual: none.

## Proof of Work (2026-11-17)

All three tasks completed (hjng, 8nva re-dispatch, fccp). End-to-end: mute stops only the run's job; unmute re-runs stored code under the same workspace. Residual: none.
