---
# sonic-pi-9uiy
title: '- Token parse: daemon stdout is 6 values on 5.x, code reads ports[7]'
status: todo
type: bug
priority: normal
created_at: 2026-11-03T14:40:48Z
updated_at: 2026-11-03T15:27:46Z
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
