---
# sonic-pi-9x5q
title: Link telemetry receivers + silent BPM-set sender (F4)
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:30:27Z
updated_at: 2026-11-16T14:14:48Z
parent: sonic-pi-2fkg
blocked_by:
    - sonic-pi-hjng
    - sonic-pi-r0om
---

# Task: Link telemetry receivers + silent BPM-set sender (F4)

## Files
- src/source-runner/main.ts (onLinkBpm/onLinkPeers emitters + handlers in setupOscReceiver; setLinkBpm(bpm) using the no-replace silent run - DEPENDS on the F2 runCode options seam)
- src/source-runner/extension.ts (exports)

## Acceptance criteria (test/unit/link-status.test.js)
- [ ] /link-bpm 122.5 and /link-num-peers 3 pushes update emitter state
- [ ] setLinkBpm(124) sends /run-code whose args are (token, code containing 'set_link_bpm! 124', 'link-bpm-set', 1) and no /stop-all-jobs precedes it (red today)
- [ ] bpm outside 20..999 is clamped/rejected client-side with a message

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/.agents/skills/ruby/SKILL.md (silent-flag check: spider-server.rb 302-316)

## Proof of Work (2026-11-16, parent-verified)

Worker branch f4t1-link-telemetry (79c695a), merged to dev2 (1c9b325):
- onLinkBpm/onLinkPeers emitters + additive handlers for /link-bpm + /link-num-peers
- setLinkBpm(bpm): validates 20..999, logs warning + shows warning for out-of-range; sends silent no-replace runCode ('set_link_bpm! <n>', workspace 'link-bpm-set', silent=1)
- runCode opts.silent flag added (4th arg = 1, only honored with workspace present)
- 3 unit tests: emitters fire, silent no-replace run sent, out-of-range rejected

Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, integration 21+1+1 passing. Suppressions 0.
Residual: none.
