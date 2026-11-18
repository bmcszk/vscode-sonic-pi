---
# sonic-pi-f6pd
title: No-ruby-lsp fallback + capability status (858b)
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-18T15:41:24Z
parent: sonic-pi-858b
blocked_by:
    - sonic-pi-ce06
    - sonic-pi-v2u1
---

# No-ruby-lsp fallback + capability status (858b) + shared-client fix (v2u1 folded in)

Defines what the user experiences when the LSP surface is unavailable, how availability is reported, and fixes the double-boot (v2u1) in the same stroke - one writer, one surface.

## Research basis (landed code, dev3)
- ce06 client: discovery null when no binary (zero spawn attempts); bundler-missing stderr -> degraded, isAvailable=false; respawn bound 3 then degraded.
- u3ui registrar: null path/workspace -> never boots, SILENT today (this leaf adds the message).
- jg86 hover registrar: own boot listener -> DOUBLE ruby-lsp process per window (v2u1). Probes: hover without didOpen -> null; definition after didOpen -> [] (true result).
- Existing statusbar pattern exists (src/statusbar.ts) but LSP segment may be more than this leaf needs - prefer the smaller diff (output-channel transitions are acceptable).

## Scope (in order)
1. SHARED CLIENT (fixes v2u1): src/lsp/shared-client.ts - module-level boot-once owner: ensureLspClient() returns THE instance (lazy create + start once); dispose rides context.subscriptions once; both registrars consume it via the structural seam. Delete both per-registrar boot listeners. Hover: rely on the shared client being the same instance diagnostics uses (didOpen already owned by the diagnostics controller) - verify with a unit test that exactly ONE client exists after both registrars boot.
2. CAPABILITY STATUS: client exposes state transitions (prefer public getters on LspClient - change <10 lines, disclose); capability.ts (or same-file) maps to: starting | ready | unavailable:no-binary | unavailable:no-bundler | degraded:respawn-exhausted; getStatus() read + transition log to the 'Sonic Pi' output channel.
3. ONE-TIME USER SIGNAL: on first .pi open with unavailable status -> ONE showInformationMessage ('Sonic Pi: ruby-lsp not found - static features only' / '...needs the bundler gem...'), 'Settings' action opens the setting; session-scoped flag so it never repeats; never showErrorMessage.
4. UNIT TESTS (red-first): shared instance identity (both registrars -> same client, spawn count 1); unavailable:no-binary (one message, zero spawns, no retries); degraded (respawn-exhausted fake -> status + no crash + diagnostics stay silent); message-once flag.

## Acceptance criteria
- [ ] One LspClient per window; zero double-spawn on .pi open (v2u1 fixed, unit-proven)
- [ ] absent binary: everything else works, ONE info message, no retries (unit-proven)
- [ ] misbehaving binary: degraded surfaced, no crash (unit-proven)
- [ ] capability status readable (getStatus + transition log) and message-once proven
- [ ] `node test/run-unit.js` exit 0; `npm test` exit 0; lint/prettier clean; budgets hold; zero suppressions

## Skills for coder (verified)
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
Do not touch: src/completionItems.ts, src/source-runner/main.ts. client.ts only for public state getters (<10 lines, disclosed).

## Proof of Work

- Orchestrator-verified at dev3 (worker skipped PoW - a gate violation, corrected here; its red->green narrative is in the run artifact 29f76b8f).
- Shared client: both registrars get ONE instance, factory ran once, client started exactly once, two .pi opens boot once (test/unit/lsp-shared-client.test.js, spawn-counting fake).
- absent binary: ONE info message (never error), zero spawn attempts, no retries, message-once flag proven.
- degraded: respawn-exhausted fake -> status surfaced via getLspCapabilityStatus + 'Sonic Pi' channel log, no crash, diagnostics stay silent.
- client.ts untouched (0 lines - capability exposed in shared-client.ts, smaller than the allowed 10).
- Gates re-run by orchestrator: run-unit.js 35 suites exit 0; npm test exit 0 (incl. vsix smoke); lint exit 0; prettier clean; zero suppressions; budgets hold (shared-client.ts 107 lines).
Residual: none
