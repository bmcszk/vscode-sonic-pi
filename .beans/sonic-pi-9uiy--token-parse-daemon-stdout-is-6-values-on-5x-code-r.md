---
# sonic-pi-9uiy
title: '- Token parse: daemon stdout is 6 values on 5.x, code reads ports[7]'
status: completed
type: bug
priority: normal
created_at: 2026-11-03T14:40:48Z
updated_at: 2026-11-03T15:56:40Z
parent: sonic-pi-sawd
blocked_by:
    - sonic-pi-lz8o
---

# Bug (verified live + source-quoted, triaged 2026-11-03)

`src/source-runner/main.ts` `startRubyServer()` parses daemon stdout as v4.6's 8-value line: `ports[7]` for token (`~L490-493`, `this.guiUuid = parseInt(ports[7])`). Sonic Pi 5.0 daemon prints **6** values (`daemon gui-listen gui-send scsynth osc-cues token`, daemon.rb ~L266), so token = parseInt(undefined)=NaN → every OSC command rejected ("Invalid token") and /daemon/kill-switch eventually kills the daemon via NaN-token keep-alive.

Live capture (docs/research/daemon-stdout.txt): `38880 38877 38876 38878 4560 1411627710`.

**Researcher new finding (binding):** tokens can be NEGATIVE — live daemon.log showed `-2000447764`, daemon.rb uses `rand(-2147483647..2147483647)`. Gate it.

## Fix

Token = last element of the split line: `parseInt(parts[parts.length-1])` — robust to v4's 8-value and v5's 6-value layouts. Keep-alive + `/run-code` args[0] = that int (validate: not NaN before sending OSC).

## AC

- [ ] Token parsed correctly from 5.0 stdout (6-value) AND still OK on 4.x 8-value layout
- [ ] Negative-token case proven (test with `-2000447764` in the stdout fixture)
- [ ] NaN token never sent: guard logs + aborts rather than transmitting (protocol test, not unit trivia)
- [ ] spider-server / spider.log shows runs accepted, no "Invalid token" (E2E covered by 1lg0)

## Skills for coder

- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md — gate: minimal diff.
- Read fully before editing: /home/blaze/.agents/skills/tdd/SKILL.md — gate: the negative-token + 6-value-parse cases ship as tests in the same commit (fixing code first and backfilling tests is a fail).

## Stop rule

Only the stdout-parse block + the token-consumption sites change. Anything else → new draft bean.

Refs: sonic-pi-sawd

## Proof of Work

Implemented (worker, attempt 2 after transient provider failure; attempt 1 died pre-edit, verified no partial state) + parent-verified 2026-11-03:
- Red→green observed: behavior-preserving seam extraction first (ports[7] kept), tests written, red run '5 of 6 tests failed' (NaN vs expected on 6-value, negative, CRLF, garbage, empty), then fix, green 'all token parse tests passed'.
- New seam src/source-runner/daemonstdout.ts: parseDaemonStdout() — trim+split(/\s+/), token = parseInt(last), null unless Number.isInteger. Handles v4 8-value and v5 6-value, negative tokens, CRLF.
- main.ts parse block consumes the seam; null → logOutput(raw line) + reject before any OscSender construction (keep-alive cannot start with NaN). startServer() gained try/catch (adjacent defect: abort was previously an unhandled silent rejection).
- Parent re-run: npm test exit 0 — 6 token-parse tests + 3 daemon-start-guard tests (real Main vs vscode stub + FakeOscSender: 6-value token reaches OSC, negative token reaches OSC, garbage line aborts with zero OSC sends).
- Protocol verified against installed daemon: /usr/lib/sonic-pi/app/server/ruby/bin/daemon.rb:266 prints 6 values token-last; rand(-2147483647..2147483647) at L145; live daemon.log negative-token evidence (-2000447764) captured pre-triage.
- Diff scope within stop rule: daemonstdout.ts (new), main.ts parse+startServer, package.json test script, test/unit/* — no other src changes.

Residual: spider.log live acceptance is E2E — lands with 1lg0.
