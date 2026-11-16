---
# sonic-pi-r0om
title: Fake daemon learns telemetry pushes, job lifecycle events and a cue socket
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:29:23Z
updated_at: 2026-11-16T13:56:31Z
parent: sonic-pi-818h
---

# Task (Wave 0): fake daemon learns telemetry pushes, job lifecycle events and a cue socket

## Scope (files)
test/integration/fake-sonic-pi.js, test/integration/harness/host.js, one assertion appended to test/integration/suite/server-lifecycle.integration.js.

## Additions (backward compatible - existing suites keep passing)
1. /run-code handler: after the /log/info 'Starting run N' line, also sendToGui('/run/started', [id, args[2] ?? 'eval']). On completion (timed path + completeRun) also sendToGui('/run/ended', [id]). /stop-all-jobs sends /run/ended for every held id. Safe: main.ts:424-435 only mutates liveJobs (additive; onRunStarted still fires from the /log/info regex - RunResolvers pairing untouched).
2. New /stop-job(token, jobId) branch: pending.delete(id) + completeRun(socket, id) (mirrors spider-server.rb:1081-1083 :killed -> /run/ended).
3. New /fake/ controls (recorded to events.ndjson as today): mixer-settings [drive, volume] -> push /mixer/settings; link-bpm [bpm] -> push /link-bpm; link-peers [n] -> push /link-num-peers; cue [address, ...args] -> push /incoming/osc [now, id++, address, args.join(' ')] (shape mirrors main.ts:441-453 consumption).
4. Cue-port socket opt-in via spec.ports.cues (or spec.bindCuePort): bind UDP on that port, record every packet as {event:'cue', address, args}, echo an /incoming/osc push to the GUI. Print the bound port as the 5th stdout field instead of hard-coded 4562 when overridden. Default: unchanged - nothing binds, 4562 stays.

## Acceptance criteria
- [ ] Integration: after /run-code with a workspace, a follow-up /stop-job reaches the fake (red today: liveJobs stays empty with the fake, /stop-job never sent)
- [ ] Full existing integration suite green; 'extension' label time grows by no more than ~2s

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md (plain-node JS but repo style/lint rules apply)
- /home/blaze/.agents/skills/ruby/SKILL.md (re-check push arg orders against spider-server.rb lines cited above)

## Proof of Work (2026-11-16, parent-verified)

Worker branch w0-fake-daemon (3d623b5), merged to dev2:
- fake daemon: /run/started + /run/ended pushes, /stop-job branch, /fake/ controls (mixer-settings, link-bpm, link-peers, cue), optional cue UDP socket via spec.ports.cues
- OUT-OF-SCOPE PRODUCT FIX (approved option a): runScript dropped the cells argument - cell keys never reached main.runCode, so per-run stop worked only in unit tests. Now forwarded (extension.ts + notebook.ts one-liner). Red test exposed this exact wiring bug - the class the new unit assertion locks in.
- notebook-run interrupt test updated per approved semantics (asserts /stop-job with the /run/started job id, no /stop-all-jobs); whole-session stops unchanged.
- new server-lifecycle test: held-run daemon -> cell play -> /run/started workspace -> interrupt -> /stop-job with that id.

Parent-verified gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, vscode-test 21 passing extension + attach 1 + takeover 1 passing (NO skips - clean run), suppression grep 0.

Residual: none.
