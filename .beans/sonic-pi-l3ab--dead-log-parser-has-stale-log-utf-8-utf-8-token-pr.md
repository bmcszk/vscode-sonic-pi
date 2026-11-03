---
# sonic-pi-l3ab
title: '- Dead log parser has stale ''log: UTF-8, UTF-8, Token: '' prefix'
status: todo
type: bug
priority: normal
created_at: 2026-11-03T14:40:48Z
updated_at: 2026-11-03T15:27:46Z
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
