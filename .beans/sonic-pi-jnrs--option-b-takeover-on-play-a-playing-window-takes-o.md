---
# sonic-pi-jnrs
title: 'Option B: takeover-on-play — a playing window takes over the server cleanly (no shared ownership)'
status: in-progress
type: feature
created_at: 2026-11-05T21:00:56Z
updated_at: 2026-11-05T21:00:56Z
---

# Takeover-on-play (user decision, 2026-11-05, Option B)

One window owns the daemon, ALWAYS. When a second window plays (or starts a server), it cleanly TAKES OVER: the daemon restarts fresh (kill old via keepalive-less timeout is too slow - use the /daemon/keep-alive cessation? No: send nothing; boot NEW daemon instead and make the PREVIOUS owner's bind die). Seeded by the finding: EADDRINUSE-only ownership made the non-owner half-deaf; shared bind made delivery flip mid-session; BOTH are unacceptable. Ownership transfer on play is the only model without a confusing state.

## Contract
1. In EADDRINUSE path (setupOscReceiver error), the loser window does NOT just notify: it auto-takes-over on PLAY (notebook ensureServerReady + file runCode path):
   - kill the previous daemon: send /quit to the daemon's own port (daemon.rb replies cleanly? verify /quit exists in daemon.rb add_method list; else kill via /stop-all-jobs + soft strategy: send /exit (daemon exists per wiki) then boot a FRESH daemon via startServer).
   - after old daemon death: bind succeeds for us (port free), startServer() completes, play proceeds. One window, always.
2. TAKEOVER Notice: one showError per takeover (informationMessage preferred) 'Sonic Pi server restarted for this window (takeover from another VS Code window)'.
3. window2's ORIGINAL owner host: its bind dies with its daemon; on ITS next play it takes over back - SYMMETRIC: whoever plays last owns. THIS is the whole UX.
4. Gate criteria: old daemon exit; new daemon boot; bind succeeds; play runs; cell indicators work; keepalive flows to new daemon.
5. TDD: notebook.test.js cases: 'second window play takes over: old daemon asked to quit, new server booted, play proceeds'; symmetric case.

## AC
- [x] Scenario walk: window1 owner; window2 plays -> takeover; window2 owns; window1 plays -> takeover back
- [ ] red->green takeover unit cases
- [ ] all suites green; e2e gate green; package/install for user re-test

Stop rule: src/notebook.ts, src/source-runner/main.ts (quit path + takeover state), extension.ts, tests, README (short note).
