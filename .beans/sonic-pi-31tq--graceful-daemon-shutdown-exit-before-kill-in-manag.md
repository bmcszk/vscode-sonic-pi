---
# sonic-pi-31tq
title: 'Graceful daemon shutdown: /exit before kill in managed stop/restart (F24)'
status: completed
type: task
priority: normal
created_at: 2026-11-18T23:36:52Z
updated_at: 2026-11-19T03:12:02Z
parent: sonic-pi-6fiz
---

# Graceful daemon shutdown: /exit before kill in managed stop/restart (F24)

User directive this session: "add it to dev4". Un-cut from the roadmap cut list: the feared attach-mode danger does not apply to our wiring (stop paths run only when this.daemonProcess exists, i.e. managed mode; in adopted mode the stop is already a state-flag only).

## Research (daemon + runtime source, read this session)
- /exit(token) -> sp.__exit (spider-server.rb:354-362) -> runtime.rb:1445-1451: __stop_jobs (scheduler-clean thread teardown, ensure blocks run, no clipped tails) then exit push; spider at_exit (spider-server.rb:278-285) sends /exited.
- Today: main.ts stopServer:625/restartServer:596 kill() (SIGTERM to daemon) - spider has no SIGTERM trap; /exited never arrives on stop; jobs die raw.
- Token check fences wrong-recipient exits ("Invalid token - ignoring", :358-360).

## Scope
- Sender: exitGracefullyMs deadline flow in managed stop + restart: send /exit (token) -> await child 'exit' event OR 2000ms -> if still alive, kill() as fallback (existing belt-and-suspenders stays). Both stopServer:625 and restartServer:596.
- The /exited push that arrives mid-shutdown feeds the D3b path (already handles /exited) - assert it is not double-counted into an error state.
- Adopted mode (daemonProcess undefined): unchanged, no send.

## Acceptance criteria
- [x] Unit >=4: /exit sent with token before any kill on stop+restart; 2s fallback kill fires when the daemon ignores /exit (hang-until-killed fake); adopted mode sends nothing; no double error state from the mid-shutdown /exited push.
- [x] Integration: restartServer via command -> fake daemon receives /exit with boot token; boots a fresh generation after.
- [x] node test/run-unit.js + npm test + integration battery green; zero suppressions; budgets hold.

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md

## Proof of Work

- 5/5 unit tests in test/unit/graceful-exit.test.js (real-UDP fake daemon, port-correct, SIGTERM-fatal per daemon.rb): send-before-kill order capture; 2s deadline fallback kill (elapsed >= 1900ms asserted); adopted mode sends nothing; /exited mid-shutdown fires no error state (stop + restart variants).
- REAL BUG FOUND AND FIXED beyond the feature itself: the graceful wait widened the send-queue re-arm hole - a run issued mid-shutdown landed on the dying sender (notebook integration suites' lost /run-codes, proven by wire ledger). Fix: /exit rides the OLD queue, queue re-arms BEFORE the wait, new traffic queues for the next generation.
- consumeShutdownReport: shutdown reported exactly once (by the push OR the stop/restart body).
- Gates re-run by orchestrator at 297dae8: unit battery 50 suites exit 0; npm test exit 0 (incl. vsix smoke); integration 42 passing 0 failing (was 39/3 - the notebook trio fixed by the re-arm, NOT by test weakening: the suite change is only mark-after-restart-resolve); just lint + format:check green; main.ts 1000/1000; zero suppressions.
- Process note: three worker timeouts + one inline debug session (stray 17 integration daemons killed; probe discipline violated once by the orchestrator, corrected into the delegation trail).
Residual: none
