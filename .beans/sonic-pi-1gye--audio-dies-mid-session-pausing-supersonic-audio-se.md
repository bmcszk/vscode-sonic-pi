---
# sonic-pi-1gye
title: 'Audio dies mid-session: ''Pausing SuperSonic Audio Server'' then daemon loses SuperSonic conn'
status: completed
type: bug
priority: normal
created_at: 2026-11-03T17:22:12Z
updated_at: 2026-11-04T11:37:35Z
---

# Bug report (user, 2026-11-03, verbatim)

'It worked fine but then this in logs, and no more sound:'

```
Pausing SuperSonic Audio Server
Daemon Err: Daemon SuperSonic Conn: connection lost (EOFError: connection closed) - reconnecting
Daemon Err: Daemon SuperSonic Conn: reconnected
Daemon Err: Daemon SuperSonic Conn: connection lost (Errno::ECONNRESET: Connection reset by peer) - reconnecting
```

Context: extension 0.1.1 (this fork) installed in the 'Sonic PI' VS Code profile; first F5 run worked (sound), then audio died permanently. Sonic Pi 5.0.0-1 pacman.

# Prior evidence (session artifacts)

- Our own E2E (test/e2e/protocol.js, SIGTERM cleanup) captured the SAME two 'Daemon SuperSonic Conn: connection lost ... reconnecting' stderr lines — benign THERE (daemon being shut down). In the user's report they coincide with 'Pausing SuperSonic Audio Server' and audio death DURING a session — different event.
- Upstream src/source-runner/main.ts contains a /daemon/kill-switch path (historically misfired when token was NaN — 9uiy fixed token). Remaining suspects for triage: (a) who sends what on window focus loss / editor switch / stop — esp. any OSC message that pauses SuperSonic; (b) extension sending messages with stale/garbage token on keep-alive after reconnect; (c) source strings to locate: 'Pausing SuperSonic Audio Server' origin (search /usr/lib/sonic-pi ruby sources), kill-switch call sites in src/.

# Triage checklist (do these BEFORE any fix)

- [ ] Grep /usr/lib/sonic-pi for 'Pausing SuperSonic' and 'connection lost' to find the emitting code path (what triggers pause)
- [ ] Grep src/ for kill-switch, pause, mixer, suspend OSC sends and WHEN each fires (focus events? stop? window close?)
- [ ] Pull ~/.sonic-pi/log/{daemon,supersonic,spider}.log around the incident timestamps (user session; ask user for approx time if needed)
- [ ] Reproduce locally: extension flow (or protocol.js variant) that plays, then triggers the suspected call site, confirm audio death
- [ ] Only then: root cause + fix plan as acceptance criteria

# AC (placeholder until triage)

- [ ] Root cause identified with file:line evidence (both sides: extension sender + daemon receiver)
- [ ] Fix proven by live E2E variant: run -> trigger -> audio still alive afterwards (second run produces sound)
- [ ] No regression: existing npm test + test:e2e green

Refs: sonic-pi-sawd (fork epic, closed; bug surfaced post-ship)

## Triage (research complete 2026-11-03)

**Proven (worker research + parent repro x3):**
- 'Pausing SuperSonic Audio Server' is NORMAL Sonic Pi 5 design: runtime.rb:1437 on_all_completed -> sound.rb:160-162 sends /n_run [0,0] (pause whole engine) when the LAST job completes; resume /n_run [0,1] on next job start. Fired on EVERY run completion (message silent-defaults).
- Parent repro (throwaway script, committed as test later): RUN 1 -> pause -> idle 12s -> RUN 2 ACCEPTED AND COMPLETED (run 1, evaluate) with audio callbacks — audio DOES resume after pause. The pause is NOT the bug.
- Extension sends NOTHING on focus/visibility/window-close/unload events (audited: only 1s keep-alive ping, run-code, stop-all-jobs, recording start/stop). The extension did not kill the audio.
- No 'Invalid token' / token-mismatch anywhere (worker validated before crash).
- Supersonic died with EOFError then ECONNRESET (daemon stderr, rendered by extension as 'Daemon Err:') — audio engine process terminated mid-session. In a clean 3x-repeated repro supersonic NEVER died mid-session. Signature matches 'sound device went away during the session': suspend/resume or output-device switch under PipeWire (classic; same class as upstream wiki's 'switched sound output device' entry) OR unopened external factor (jack/pipewire ctl). Incident-time daemon.log rotated by later test runs — original trigger unknowable forensically.

**Conclusion:** not one bug but a missing survival behavior: the extension neither DETECTS audio-engine loss nor offers RECOVERY. The fix is detection + a recovery command, independent of which env trigger fires.

## Root-cause verdict
Environment-driven supersonic death (suspend/device-switch prime suspects). Extension defect to fix: silently-dead audio UX.

## AC
- [ ] Extension detects the daemon stderr sequence 'connection lost' + 'reconnecting' (and non-guaranteed re-quiet) >=1 occurrence while a session is live, and surfaces a VS Code ERROR notification: 'Sonic Pi audio server connection lost' with actions [Restart server] [Dismiss]
- [ ] 'Restart server' (also manually available as command 'Sonic Pi: Restart Server') kills the current daemon process (send upstream's own shutdown path if it exists in src, else SIGTERM the spawned proc + respawn via existing startServer path) and reports success/failure in the Log channel
- [ ] After restart, a run is accepted and supersonic boots fresh (headless proof: e2e variant test/e2e/restart.js spawns daemon, kills supersonic's TCP conn... practical: prove restart command end-to-end via unit wiring test (vscode stub + fake process: restart killed old proc and created new) + one live manual smoke by user)
- [ ] The repro variant ships: test/e2e runs normalize against the pause cycle (accept that pause lines appear; no false failure on 'Pausing')
- [ ] npm test + npm run test:e2e green

## Skills for coder
- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md (intent-reading helpers, no vite reformatting)
- Read fully before editing: /home/blaze/.agents/skills/tdd/SKILL.md (unit test for detection+restart wiring ships same commit)

## Stop rule
Only src/source-runner/main.ts (detection + command + restart wiring) + new test file + package.json contributes.commands (add Sonic Pi: Restart Server). If implementing requires touching daemon suppression or src/ beyond wiring, STOP + report.

## Proof of Work

Implemented LOCALLY by parent (2 failed worker dispatches on transient provider stream failures; repair ladder invoked) + all gates re-run 2026-11-03:
- Detection: daemon stderr handler refactored through onDaemonStderr -> detectAudioServerLoss; matches 'connection lost' + 'reconnect' lines, debounced 30s (lastAudioLossNotifiedAt), one error notification per outage with Restart Server action wired to restartServer(). 'Pausing SuperSonic Audio Server' explicitly matches nothing (normal completion event, proven by repro x3).
- Recovery: restartServer() logs, kills stored daemonProcess (new field — previously no process reference existed at all), resets serverStarted and boots a fresh daemon via the existing startServer path; idempotent (works with no server running).
- Command 'Sonic Pi: Restart Server' registered (vscode-sonic-pi.restartserver) + package.json contributes entry (single-line surgical diff; an earlier JSON round-trip reformat of package.json was reverted).
- Tests: test/unit/audio-recovery.test.js (4 tests: notification once, debounce, pause/noise lines inert incl. lastAudioLossNotifiedAt untouched, restart kills old proc exactly once + fresh token 734224294 used + first proc != fresh). npm test wired: 13 ok tests green. npm run build exit 0. npm run test:e2e exit 0 'gate green' — live pause cycle does not trip assertNoRejection (no e2e change needed).
- vsce package smoke exit 0 (vsix deleted after; no version bump).
- Commit d4f6595 ('Merge fix-audio-recovery...') pushed; live CI run 41693800705 -> success, observed (21s). 
- Deployment note: user must reinstall the new vsix (same version 0.1.1 — extension version was NOT bumped this time; recommend next bump to 0.1.2 for clarity) + reload window.

Residual: keep-alive timer may send one stale ping between kill and fresh ports (benign UDP send to a closed port; no crash path); UI notification/restart behavior itself needs the user's live smoke (next time audio dies, notification + Restart Server restore sound). Root cause remains environmental (suspend/device-switch) — unfixable upstream of the extension; recovery is the shipped answer.

## Deployment note (2026-11-04)

Version bumped 0.1.1 -> 0.1.2, packaged, installed into BOTH local profiles (default + Sonic PI). Public: released as v0.1.2 with vsix asset (see 0fbr PoW). User action: reload VS Code window to activate 0.1.2 in running sessions.
