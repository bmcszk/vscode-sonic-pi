---
# sonic-pi-wmae
title: 'Bug: plays silent + empty logs after attached daemon dies (window never notices)'
status: in-progress
type: bug
priority: normal
created_at: 2026-11-08T14:05:41Z
updated_at: 2026-11-16T11:28:36Z
parent: sonic-pi-u71o
---

# Bug (user, 2026-11-08 15:04): 'any play does not work and NO sonic pi logs'

## Verified root cause (parent, from daemon.log + window channel files)
1. Window attached to the 23:59:28 daemon (ports 33350/33351, daemon port 33355) - adoption + keepalive start were CORRECT at that time (channel shows 'Keep-alive started: pinging daemon port 33355').
2. 00:02:42 that daemon killed itself via KILL SWITCH (daemon.log: 'Kill switch timed out... EXIT signal received'). Why keepalive failed to save it: the window host restarted at 00:01:50 (extension reload during debugging) - the OLD host's keepalive stopped, the NEW host attached at 00:02 and started pinging, but the old daemon's timeout clock was already deep into its countdown and it died before enough heartbeats accrued.
3. Since then: NO user daemon alive (only integration-test leftovers). The window still considers the server attached (serverStarted true from the successful attach) and keeps sending plays to DEAD ports - silently lost (UDP fire-and-forget), and the empty log channel is the matching symptom (no daemon = no replies/cues/log output).

## The product gap (fix in this bean)
A window that attached to a now-dead daemon NEVER notices. Plays go to a dead port silently with an empty log channel. Three-part fix:
- [ ] e2e: attached window's daemon dies -> next play must trigger re-attach/reboot (ensureServerReady path) instead of silent dead-send
- [ ] keepalive send failures must surface (OscSender errorbacks) and force ensureServerReady before the next play
- [ ] On play: if serverStarted but no daemon actually answering (keepalive errorback / no recent ack), treat like the cold path (scanner finds nothing -> managed boot)

## Immediate user unblock
Press 'Sonic Pi: Restart Server' (now safely boots fresh) or reload the window then play.

## Notes
This is the THIRD manifestation of the dead-daemon silent-send class (after adopt-keepalive + restart raced-attach). Design rule going in: daemon liveness must be a first-class state, not an assumption.

## Skills for coder (worker contract)

- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md
- TDD mandatory: red-first named-case tests. No narration comments.
- Honest fixes only: no suppressions (@ts-ignore/eslint-disable), no config loosening. Suppression grep is a standing gate.
- Worktree: parent creates per-worker worktree from dev2. One writer per worktree.

## Scope (this bean, from the verified root cause)

1. DAEMON LIVENESS: keepalive send failures (OscSender errorbacks) must surface; N consecutive failures => daemon considered dead => reset server state so next play takes the cold path (scanner -> managed boot). The liveness check gates ensureServerReady.
2. PER-RUN STOP: listen to /run/started + /run/ended + /runs/all-completed pushes (job ids); cell Stop sends /stop-job(token, jobId) for THAT cell's job instead of /stop-all-jobs. Fallback: unknown job id -> stop-all (current behavior).
3. E2E (gate): integration test - attached window's fake daemon dies -> next play re-boots (no silent dead-send). Plus a per-run stop test: two cells running, stop cell A, cell B keeps playing.

## Acceptance criteria

- [ ] Unit: keepalive errorback -> state reset -> next play boots fresh daemon
- [ ] Integration: daemon-death e2e (play after death works, log channel receives run output)
- [ ] Integration: per-run stop keeps the other cell playing
- [ ] npm test green (lint + format + unit + all integration labels + vsix smoke)
- [ ] No suppression comments; no lint config changes

## Out of scope

- Mute/unmute loops (F2) - future feature bean after 818h Phase B picks
- Audio recovery / EADDRINUSE paths (already covered by existing tests)
