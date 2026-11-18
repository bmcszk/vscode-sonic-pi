---
# sonic-pi-jg86
title: Hover/definition pass-through, static completions kept client-side (858b)
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-18T15:13:50Z
parent: sonic-pi-858b
blocked_by:
    - sonic-pi-ce06
---

# Hover/definition pass-through, static completions kept client-side (858b)

Routes hover/definition through the ce06 client to ruby-lsp; keeps the existing client-side completion providers as the winners for Sonic Pi builtins.

## Research basis
- Spike + ce06 facts: sendRequest('textDocument/hover'|'textDocument/definition', {textDocument:{uri}, position}) once ready; URIs percent-encoded; 1-2s startup lag (hover before ready -> null, retry-free).
- Existing completion surface (verify in src/builtins/builtins.ts + editor registration sites before coding): synths/fx/samples static lists, richer than ruby-lsp's Ruby-only completions for DSL methods.

## Scope
- src/lsp/hover.ts (name flexible): HoverProvider + DefinitionProvider that forward to the client via the same injected-structural-type seam as diagnostics (Pick<LspClient,'sendRequest'>); null when client not ready/degraded; LSP MarkedString/content variants normalized to vscode MarkdownString.
- Registration via ONE registrar function in the existing extension.ts split (registerLspLanguageFeatures or similar). Pass-through ONLY - no filtering of hover content needed.
- Completion conflict law: do NOT add a completion provider. Verify the existing providers still win (ruby-lsp is not registered as a completion source in our client - document that in code). If research shows a conflict scenario, record it in the bean notes instead of coding around it.
- Unit tests (fake client, vscode stubs with fake hover/definition provider registry): hover forwards params and maps result; null on not-ready; definition forwards; existing completion provider list unchanged (regression assertion).
- Real-server smoke (skip-if-absent precedent): hover over `sampl` in a fixture with `sample :loop_amen` returns a result or null WITHOUT error; no crash on 1-2s startup window.

## Acceptance criteria
- [x] hover on plain Ruby forwards to ruby-lsp and maps the result (unit-proven; real-server smoke when available)
- [x] our completion providers remain the registered winners for Sonic Pi builtins (regression assertion: registration list unchanged)
- [x] no double-hover: exactly one HoverProvider registered per document selector (unit-proven via the fake registry)
- [x] not-ready/degraded client -> hover/definition resolve null, no unhandled rejections (unit-proven)
- [x] `npm test` green; suites in both chains; lint budgets hold; zero suppressions

## Skills for coder (verified)
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
Do not touch: src/lsp/client.ts (frozen), src/lsp/diagnostics.ts (u3ui's land until it lands), src/source-runner/** except the ONE registrar addition, eslint.config.mjs, ci.yml, justfile, .githooks.

## Proof of Work

- Red-first: 10/10 hover unit tests failed before src/lsp/hover.ts existed (forward+map: string/{value,language}/array contents; definition Location/Location[]/null; not-ready rejection -> undefined, no unhandled rejections).
- Registration regression: exactly 5 completion providers, 1 static hover, 0 definition providers pre-boot (lsp-completion-winners.test.js); registrar registers exactly one hover + one definition provider.
- Real-server smoke: hover over 'sample' -> null without crash; definition -> 0 locations, resolved in timeout (skip-if-absent on CI).
- Orchestrator probes (real server): hover WITHOUT didOpen -> null (tolerated), definition of a local variable usage AFTER didOpen -> [] (ruby-lsp 0.26.10 returns no definition for plain locals in this setup). The smoke's 0-locations is a true result, not a vacuous pass - recorded so the next session does not misread it.
- Full battery: run-unit.js 34 suites exit 0 (worker's files picked up automatically by the enumerating runner); lint clean.
- Known issue filed, not silently shipped: hover registrar boots its OWN client -> two ruby-lsp processes per window (sonic-pi-<shared-client bug bean>, fix lands with sonic-pi-f6pd).
Residual: none for this leaf's ACs
