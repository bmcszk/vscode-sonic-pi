---
# sonic-pi-l2qf
title: Settings + docs (858b)
status: in-progress
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-18T15:34:30Z
parent: sonic-pi-858b
blocked_by:
    - sonic-pi-u3ui
    - sonic-pi-jg86
    - sonic-pi-f6pd
---

# Settings + docs (858b) - final leaf of the Ruby LSP epic

## Research basis (landed code)
- The only LSP setting today: vscode-sonic-pi.rubyLspPath (resolveRubyLspPathFromConfig in src/lsp/client.ts; PATH fallback). LSP features: diagnostics (u3ui), hover/definition (jg86), shared client + capability + one-time hint (f6pd).
- Docs surfaces: README.md (features section), docs/SETTINGS.md (settings table), CHANGELOG.md (Keep a Changelog-ish top section).

## Scope
1. Settings (package.json contributes.configuration):
   - vscode-sonic-pi.rubyLsp.enabled (boolean, default true): false -> registrars never boot, capability reports 'off'; flipping live requires reload (document that in the description - honest and simple; live restart wiring is out of scope for this leaf).
   - vscode-sonic-pi.rubyLsp.path (string, default ''): documented as the existing override (resolveRubyLspPathFromConfig already reads rubyLspPath - either rename the read site to the new key or declare the EXISTING key properly in package.json; pick the smaller diff and keep one key, not two).
2. Capability 'off' state: shared-client honors enabled=false -> no boot, no info message, getStatus 'off'. Unit-proven.
3. Docs: docs/SETTINGS.md rows for both keys; README short paragraph (what squiggles/hover need: ruby-lsp + bundler gem installed; one-time hint when missing); CHANGELOG entry under a new 'Unreleased' heading (release process adds versions later).
4. Tests: enabled=false -> nothing boots, no message (unit); default-on unchanged (existing suites keep passing untouched - they run without the key, proving default).

## Acceptance criteria
- [ ] settings toggle stops the client from booting (enabled=false: no spawn, no message, status 'off', unit-proven)
- [ ] docs updated: SETTINGS.md rows, README paragraph, CHANGELOG entry
- [ ] `node test/run-unit.js` exit 0; `npm test` exit 0; lint/prettier clean; budgets hold; zero suppressions

## Skills for coder (verified)
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
Do not touch: src/completionItems.ts, src/source-runner/main.ts; client.ts only if the setting key read needs it (<5 lines, disclosed).
