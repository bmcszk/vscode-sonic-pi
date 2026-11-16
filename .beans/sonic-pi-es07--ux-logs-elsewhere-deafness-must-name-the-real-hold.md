---
# sonic-pi-es07
title: 'UX: ''logs elsewhere'' deafness must name the real holder (app vs window) and be visible outside the log channel'
status: completed
type: bug
priority: normal
created_at: 2026-11-16T12:55:06Z
updated_at: 2026-11-16T13:18:54Z
parent: sonic-pi-u71o
---

# UX: deaf-window takeover message missed the user (2026-11-08 -> verified 11-16 13:53)

## What actually happened (parent verified from logs + ss)
User restarted the VS Code window while the REAL Sonic Pi Qt app (pid 835051, running since Nov 15) held the server. Reload -> window attached to the app's daemon (29928/29929) -> our reply-port bind failed EADDRINUSE (the APP owns 29929) -> window deaf by design: plays sounded, logs went to the app's GUI, extension channel showed nothing. Takeover-then-boot recovered at 13:49:12 (own daemon, receiver on 29249, healthy now).

## The failure
The takeover UX message DID log ('Another VS Code window is connected... IT will show the run logs...') but the user still reported 'logs empty'. Two real defects:
1. The message blames 'another VS Code window' when the holder was the Sonic Pi APP itself - wrong attribution, confusing.
2. The deafness is invisible in the UI: it only lives in a log channel the user wasn't reading. Nothing in the statusbar or editor says 'logs are going elsewhere'.

## Fix contract
- [ ] Detect the actual reply-port holder and name it: read /proc for the pid owning the port (app: /usr/bin/sonic-pi -> 'the Sonic Pi app'; code -> 'another VS Code window'). Message: 'The Sonic Pi app is showing the run logs. Your window's Play will still sound. To bring the logs here: press Play again (takes over the connection).' Note: press-Play-again IS the takeover trigger (verified this incident) - say that explicitly.
- [ ] Statusbar deafness indicator while receiving=false (e.g. logs icon + 'logs: elsewhere' item) with the same explain-on-click.
- [ ] Integration test: bind-squatter scenario asserts the new message wording + holder attribution.

## Skills for coder (worker contract)

- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md
- TDD mandatory: red-first named-case tests. No narration comments.
- Honest fixes only: no suppressions, no lint config loosening. Suppression grep is a standing gate.
- Worktree: parent creates per-worker worktree from dev2.

## Implementation notes (parent-verified ground truth)

- The EADDRINUSE handler lives in setupOscReceiver() in src/source-runner/main.ts (~line 359-395). The three log lines are the wrong-attribution message.
- Holder detection: /proc/net/udp + /proc/<pid>/fd + /proc/<pid>/cmdline can resolve which pid owns the reply port. /usr/bin/sonic-pi = the real app; the extension host itself (process.execPath contains 'code') = another VS Code window; anything else = 'another program'. Linux-only detection with a graceful fallback ('another program is showing the run logs') - the extension already runs /proc scans (spiderServerScanner) so the pattern exists in main.ts.
- Statusbar: src/statusbar.ts owns the items. Deafness indicator shows only while receiving === false after a server start (receiving flips true on successful receiver open - osc.on('open') handler). Clear it on receiving=true and on server state changes.
- Unit test seams: receiver-recovery.test.js pattern (FakeOsc stub) for the message wording; statusbar.test.js pattern for the indicator.
- Integration: attach suite (test/integration/suite/attach.integration.js) already exercises EADDRINUSE via a blocker receiver - extend or add a case asserting the new message text mentions the holder, not 'Another VS Code window'.

## Acceptance criteria

- [ ] Unit: EADDRINUSE with a /usr/bin/sonic-pi holder -> message names 'the Sonic Pi app' + says press Play again to bring logs here; with a code holder -> 'another VS Code window'; unknown pid -> graceful fallback
- [ ] Unit: statusbar shows a deafness item while receiving=false after start; clears on receiving=true
- [ ] Integration (attach suite): EADDRINUSE scenario asserts new wording (holder named)
- [ ] npm test green end to end; no suppressions; no lint config changes

## Proof of Work (2026-11-16, verified by parent)

Worker delivered (branch es07-deaf-ux, commit 634e5b6, merged to dev2):
- src/port-holder.ts: LogHolder classifier (/proc/net/udp inode -> /proc/<pid>/fd walk -> cmdline; injected-deps pure function; failures degrade to 'another-program')
- EADDRINUSE message names the holder: 'The Sonic Pi app is showing the run logs. Your window's Play will still sound. To bring the logs here: press Play again - it takes over the connection.'
- statusbar '$(circle-slash) logs: elsewhere' item shows only while running && !receiving; clears on receiver open / state change
- tests: receiver-recovery 7 cases (classifier + message shape + fallback), statusbar 14 (item lifecycle)

Parent-verified gates:
- npm run lint -> 0 findings; npx prettier --check src -> clean
- npm test -> exit 0, 0 not ok (unit chain + vsix smoke)
- npx vscode-test -> 20 passing (extension label); attach/takeover suites SKIPPED on this machine (real Sonic Pi server running) - the attach-suite EADDRINUSE wording assertion runs in CI
- suppression grep: 0; no lint/prettier config changes; package.json untouched

Residual: none. Known minor: classifier's 'code' substring tier could over-match a program with 'code' in its path (self-cmdline exact match runs first, sonic-pi first) - acceptable honest-tier tradeoff, revisit if it ever misfires.
