---
# sonic-pi-4i3a
title: 'Bug: after Restart Server command, playing produces nothing'
status: draft
type: bug
priority: normal
created_at: 2026-11-06T12:58:40Z
updated_at: 2026-11-06T13:00:01Z
---

# Bug (user report, 2026-11-06): after "Sonic Pi: Restart Server", nothing works

User: 'after doing sonic pi: restart server - nothing works :('

## Likely candidates (to verify, not assume)
1. restartServer re-arms portsInitalized (landed in zlzp work) - but the NEW daemon may be unadopted: keepalive not started -> kill switch kills it ~100s later silently.
2. Old daemon's /daemon/exit may race the fresh boot (exclusive reply-port bind EADDRINUSE against a zombie receiver).
3. Boot-log route parsing (daemonPort from booter log) may fail on the restarted daemon, leaving daemonPort = -1 => no keepalive.
4. Existing e2e covers run-state bookkeeping on restart, NOT the full restart-to-playing path with keepalive.

## Triage checklist (before any fix)
- [ ] Reproduce: play -> restart server -> play -> does sound return? Watch daemon.log.
- [ ] After restart, verify keepalive flows to the NEW daemon port.
- [ ] Verify reply-port receiver rebinds (no deaf window).
- [ ] Add e2e: restart -> /version on new daemon + keepalive flowing + play works.
- [ ] If keepalive missing: same fix class as adopt-keepalive (zlzp feature 17).
