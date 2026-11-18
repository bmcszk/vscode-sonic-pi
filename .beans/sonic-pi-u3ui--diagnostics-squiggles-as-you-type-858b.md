---
# sonic-pi-u3ui
title: 'Diagnostics: squiggles as you type (858b)'
status: in-progress
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-18T14:07:13Z
parent: sonic-pi-858b
blocked_by:
    - sonic-pi-ce06
---

# Diagnostics: squiggles as you type (858b)

Wires the completed client lifecycle (sonic-pi-ce06) to the editor. Spike facts (sonic-pi-6y2f, completed) decide the shape: diagnostics are PULL-ONLY at ruby-lsp 0.26.10 (textDocument/diagnostic -> {kind:'full', items}), didOpen never pushes; workspaceFolders required; URIs percent-encoded; 1-2s startup lag before first answers.

## Scope
- src/lsp/diagnostics.ts: DiagnosticCollection ('sonic-pi'); didOpen -> immediate pull after ready; onDidChangeTextDocument -> debounced pull (~300ms); didClose -> clear the document's entries. Map LSP items to vscode.Diagnostic (0-based ranges map 1:1, keep source 'Prism', severity mapping).
- Extension wiring: a registrar in the existing activate() split structure (like registerStatusBar/registerCueInspector) that starts the controller when a .pi document opens and disposes on extension deactivate. Client lifecycle owns spawn/respawn; this leaf owns NOTHING about spawning.
- Real-server smoke: one test that runs against the REAL /usr/bin/ruby-lsp when present and skips when absent (CI has no ruby-lsp - takeover suites set the skip precedent). Assert: missing-end fixture yields >=1 Prism diagnostic; clean fixture yields none.
- Unit tests with the ce06 fake-server harness pattern: pull fires after debounce, clear on close, range mapping, degraded client -> no diagnostics and no crashes.

## Acceptance criteria
- [ ] typing a syntax error squiggles within ~1s of the change (debounce + pull proven in unit test; real-server smoke when available)
- [ ] closing the file clears its diagnostics (unit-proven)
- [ ] valid Sonic Pi DSL code produces zero diagnostics (real-server smoke: live_loop/sample/synth fixture clean)
- [ ] degraded/unavailable client never crashes the editor surface (unit-proven)
- [ ] `npm test` green; suites in both chains; lint budgets hold; zero suppressions

## Skills for coder (verified)
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
Do not touch: src/source-runner/**, src/lsp/client.ts (lifecycle is ce06's, frozen), eslint.config.mjs, ci.yml, justfile, .githooks. extension.ts may gain ONE registrar function, nothing else.
