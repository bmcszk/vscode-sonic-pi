---
# sonic-pi-f6pd
title: No-ruby-lsp fallback + capability status (858b)
status: todo
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-18T15:05:52Z
parent: sonic-pi-858b
blocked_by:
    - sonic-pi-ce06
---

# No-ruby-lsp fallback + capability status (858b)

Defines what the user experiences when the LSP surface is unavailable, and how availability is reported. Builds on landed leaves: client lifecycle (ce06: degraded states + bundler probe + discovery), diagnostics (u3ui: silent degraded pulls, NullLspClient).

## Research basis (all landed, on dev3)
- ce06 client: discovery returns null when no binary (no spawn attempts); bundler-missing stderr -> state 'degraded', isAvailable=false; crash-respawn bound 3 then degraded.
- u3ui registrar: resolveRubyLspPathFromConfig() null OR no workspaceFolders -> registrar never boots (silent today: NO message anywhere - this leaf adds the message).
- Spike: ruby-lsp needs the bundler gem; a machine without it crashes on boot (exit path classified as degraded).

## Scope
- Capability surface: a tiny src/lsp/capability.ts (or same-file export in client.ts - judge by diff size): a module-level state emitter (available | unavailable:no-binary | unavailable:no-bundler | degraded:respawn-exhausted | starting | ready) + a getStatus() read. Client lifecycle already transitions these states - this leaf EXPOSES them, minimal client.ts touch if any (prefer exposing via client public getters; client.ts was frozen by past contracts but is now wave-owned - keep any change <10 lines and disclosed).
- One-time user signal: on first .pi open, when unavailable -> ONE vscode.window.showInformationMessage('Sonic Pi: ruby-lsp not found - static language features only' | '...ruby-lsp needs the bundler gem...', 'Settings') opening the setting on click; NEVER showErrorMessage; never repeated within a session (module-level flag).
- Status indication: reuse the existing statusbar pattern if cheap (a 'LSP' segment or a second item showing ready/degraded/off); if statusbar integration grows beyond ~40 lines, an output-channel line per transition is acceptable for this leaf (pick smaller diff).
- Unit tests: unavailable:no-binary path (no binary -> one message, no retries, zero spawn attempts); degraded path (fake client exhausting respawns -> status transitions logged, no crash, diagnostics stay silent); message-shown-once flag.

## Acceptance criteria
- [ ] absent binary: everything else works, ONE info message, no retries (unit-proven)
- [ ] misbehaving binary: degraded mode surfaced, no crash (unit-proven: respawn-exhausted fake)
- [ ] capability status readable (getStatus + transition log) and message-shown-once flag proven
- [ ] `node test/run-unit.js` exit 0; `npm test` exit 0; lint/prettier clean; budgets hold; zero suppressions

## Skills for coder (verified)
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
Do not touch: src/completionItems.ts, src/source-runner/main.ts. client.ts only for public state getters (<10 lines, disclosed in report).
