---
# sonic-pi-ce06
title: 'LSP client lifecycle: discovery, spawn, respawn, dispose (858b)'
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-18T14:06:16Z
parent: sonic-pi-858b
blocked_by:
    - sonic-pi-6y2f
---

# LSP client lifecycle: discovery, spawn, respawn, dispose (858b)

First production leaf of the Ruby LSP epic (spike sonic-pi-6y2f: GO, completed with empirical notes).

## Research basis
- Spike facts (sonic-pi-6y2f body, verified on ruby-lsp 0.26.10): diagnostics PULL-only; spawn must set BUNDLE_GEMFILE (dummy ok) + controlled cwd or SetupBundler exits 78; workspaceFolders[0].uri (NOT rootUri) drives server workspace; percent-encode URIs; 1-2s startup lag; bundler gem required on PATH.
- docs/research/ruby-lsp-integration.md (Phase A): raw JSON-RPC over stdio, no vscode-languageclient dependency needed; documentSelector {language:'sonic-pi',scheme:'file'}.

## Scope (lifecycle ONLY - diagnostics are sonic-pi-u3ui, not here)
- New module src/lsp/client.ts (name flexible): binary discovery (setting override e.g. vscode-sonic-pi.rubyLspPath, fallback PATH scan); spawn via child_process with BUNDLE_GEMFILE env + cwd = workspace folder; JSON-RPC initialize/initialized handshake with workspaceFolders set and documentSelector [{language:'sonic-pi',scheme:'file'}].
- State machine: stopped -> starting -> ready -> restarting -> stopped. Crash/exit while running -> bounded respawn (e.g. 3 attempts, backoff), then degraded state with logged error.
- Dispose: extension deactivation kills the child cleanly (SIGTERM then SIGKILL fallback; no orphan).
- Bundler probe: if `bundler` missing from the spawn env, log the capability as degraded/unavailable (spike: server crashes without it) - do NOT install anything.
- Unit tests (node, same style as existing suites): FAKE server script (node, speaks minimal JSON-RPC echo) as spawn target - real process spawn covered, no mocks of child_process.
- Respect lint budgets (max-lines 1000, max-lines-per-function 100) from the first line.

## Acceptance criteria
- [x] Discovery: found binary -> spawn path; missing -> 'unavailable' status, zero spawn attempts (unit-proven).
- [x] Handshake: initialize result recorded, ready state reached against the fake server; workspaceFolders + BUNDLE_GEMFILE visible in the fake server's received params/env (unit-proven).
- [x] Respawn: unexpected exit -> bounded restart attempts then degraded (unit-proven with a fake server that dies N times).
- [x] Dispose kills the child (unit-proven: process gone after dispose).
- [x] `npm test` green; new suites wired into BOTH npm test and test:unit chains; lint budgets hold.

## Skills for coder (verified to exist)
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md (red-first for every behavior)
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md (project-local)
Do not touch: src/source-runner/**, eslint.config.mjs, ci.yml, justfile, .githooks. Extension wiring (command registration, activation) lands with the diagnostics leaf, not here.

## Proof of Work

- Red-first: every AC failed on missing out/lsp/client.js before implementation, green after (worker run 744e5e22; 12 tests in test/unit/lsp-client.test.js, real child_process spawn of a temp-dir fake JSON-RPC echo server - no child_process mocks).
- Coverage: discovery (override / PATH-scan binDir / not-found -> null, zero spawn attempts); spawn env (BUNDLE_GEMFILE dummy + cwd asserted via fake-server marker file); handshake (workspaceFolders[0].uri + documentSelector sonic-pi/file + initialized follow-up); percent-encoded URIs; crash -> 3 respawns with backoff -> degraded (spawnCount 4); bundler-missing stderr -> straight degraded, no respawn; dispose SIGTERM -> SIGKILL escalation + dispose-during-starting.
- Orchestrator re-ran at worktree: 12 passed; npm run lint exit 0; client.ts 247 lines (under both budgets); zero suppressions; hermetic on CI (no real ruby-lsp needed - discovery tests inject binDir).
- Gates at dev3 tip 09e2d11: npm test green (worker), merged ff, pushed; PR #3 auto-updates.
Residual: none (extension wiring lands with u3ui by contract).
