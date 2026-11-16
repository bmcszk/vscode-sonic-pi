---
# sonic-pi-eimm
title: Mute and unmute Sonic Pi loops without deleting them (stop this loop's job, remember its code, re-run on unmute)
status: draft
type: feature
created_at: 2026-11-16T13:29:31Z
updated_at: 2026-11-16T13:29:31Z
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
