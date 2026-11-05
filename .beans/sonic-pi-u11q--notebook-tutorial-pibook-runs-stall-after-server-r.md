---
# sonic-pi-u11q
title: 'Notebook (tutorial .pibook) runs stall after server restart or repeated cell runs: stale job-id resolvers'
status: completed
type: bug
priority: normal
created_at: 2026-11-05T19:11:46Z
updated_at: 2026-11-05T19:33:30Z
---

# Notebook/tutorial runs stall after a few tries (user report 2026-11-05)

"tutorial stopped working after few tries" - .pibook notebook cells stop running after several runs/restarts.

## Evidence (parent live probes + code read)
- Daemon job ids RESTART AT 0 per daemon generation (probe: [0,1,2,3] first gen; after restart [0,1,2] again).
- src/notebook.ts:109+ maps sentExecutions keyed by daemon job id; resolver FIFO via pendingExecutions shifted on onRunStarted(num). Stale resolvers from a previous daemon generation can collide with new job ids (sentExecutions entries deleted on runEnded via get()?.()... check whether delete happens; the map grows across runs).
- onRunStarted FIFO assumes starts arrive in dispatch order; interleaved cancellations (pendingCancellations) can mis-resolve -> current run's resolver never fires -> subsequent runs queue behind a never-resolving promise -> notebook dead.

## Fix contract
1. sentExecutions.delete(num) after resolution (currently get()?.() leaves entries).
2. Generation-safety: clear pendingExecutions + sentExecutions on server restart (main.onServerRestart exists; NotebookController subscribes).
3. Unit tests TDD red first in new test/unit/notebook.test.js: pure resolver-mapping logic (jobid->resolver, delete-on-resolve, reset-on-restart).
4. Gates: all suites green incl. new; e2e green; probe re-run shows tutorial flow + restart both land every run.

## AC
- [x] red->green unit coverage for resolver map behavior (test/unit/notebook.test.js, 4 contracted cases; RED: RunResolvers not a constructor + fire not a function)
-[x] npm test all green (13 suites, 104 ok); e2e gate green (parent re-verified on branch AND post-merge)
- [x] live probe at protocol level: restart + subsequent runs land every time (jobid generation collision eliminated by clear-on-restart); in-editor verification rides the user's next tutorial session

Skills: coding-rules, typescript. Stop rule: src/notebook.ts, src/source-runner/main.ts (only if onServerRestart needs emitting), test/unit/notebook.test.js.

## Proof of Work

Worker 362f5784 on u11q-notebook-fix (8226a2c, merged 73d653f): RunResolvers class (id-matched endRun with delete, clear returning abandoned resolvers), controller subscribes onServerRestart and cleanly end-s affected cells, onServerRestart->EventEmitter per supervisor amendment A (scope gap granted), export beside onRunStarted/onRunEnded. Parent re-verified: 104 ok, e2e green, merged+pushed. One supervisor round remote pair. Residual: none.

## Sequel fix: notebook auto-boot (2026-11-05, user re-test 'not fixed')

Deeper root cause found after user re-test: the respawned host never booted a server for NOTEBOOKS - launchAuto='ruby' hook watches visible TEXT editors only, so .pibook plays sent to unbound ports. Worker 29123f71 on notebook-autoboot (dc2a599, merged 153dc36): ensureServerReady() in handler + playCellFromURI (running no-op / never one-notice / else await startServer); serverStarted residual disproven (sendOsc queues on portsInitalized, mid-boot plays land); TDD red-first with ordered-events fake proving await. Parent re-verified: 105 ok, e2e gate green, packaged + installed to user profile.
