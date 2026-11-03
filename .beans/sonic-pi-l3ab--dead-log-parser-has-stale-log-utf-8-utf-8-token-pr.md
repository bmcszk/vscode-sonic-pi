---
# sonic-pi-l3ab
title: '- Dead log parser has stale ''log: UTF-8, UTF-8, Token: '' prefix'
status: completed
type: bug
priority: normal
created_at: 2026-11-03T14:40:48Z
updated_at: 2026-11-03T16:00:18Z
parent: sonic-pi-sawd
blocked_by:
    - sonic-pi-lz8o
---

# Bug (verified; redesigned per triage 2026-11-03)

`initAndCheckPorts()` greps daemon log for a v3-era prefix `log: UTF-8, UTF-8, Token: ` (`main.ts` ~L422) that never appears in 5.0 logs. **Researcher finding (binding):** it is dead code — the only call site is commented out (`//await this.initAndCheckPorts()`, ~L239). Reframed from parser-fix to **deletion**.

## Fix

Delete `initAndCheckPorts()` and all references (the commented call site included). Preserve `daemonLogPath` field if other code reads it; keep the log-path config intact.

## AC

- [ ] `initAndCheckPorts` gone from src (tsc build green, no dangling references)
- [ ] No behavior change possible: dead code only — verified by grep that no live call site existed pre-patch (cite the ~L239 comment)
- [ ] daemonLogPath usage audited: still used elsewhere or removed with the dead code, no new dead fields

## Skills for coder

- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md — gate: pure deletion, minimal diff; if the audit finds a live hidden caller, STOP and report back instead of refactoring it alive.

## Stop rule

Deletion-only. If anything in the audit suggests the code should be FIXED rather than deleted, stop and report — do not redesign.

Refs: sonic-pi-sawd

## Proof of Work

Implemented (worker) + parent-verified 2026-11-03:
- Pure deletion confirmed at line level: 63 lines removed (initAndCheckPorts method + stale 'log: UTF-8, UTF-8, Token: ' parser, commented call site, daemonLogPath field + assignment + its createReadStream consumer, orphaned readline import); 0 lines added to main.ts by this leaf (all 25 added lines in cumulative diff belong to verified siblings 9qtk/9uiy).
- daemonLogPath audit verdict: REMOVED — pre-patch grep showed exactly 3 sites (decl/assign/consumer inside deleted method), no live reader; keeping it would have violated the no-new-dead-fields AC.
- oscsender.ts header comment de-clawed (1 line, comment-only) to satisfy the zero-hits grep gate; no code change.
- Parent re-run: grep -rn 'initAndCheckPorts|daemonLogPath|readline' src/ test/ → zero hits (exit 1); npm run build exit 0; npm test exit 0 (sibling tests guard main.ts).
- Behavior-neutral by construction: only live-reachable deletion was the commented call site.

Residual: none.
