---
# sonic-pi-gqg7
title: 'Bug: Run/Stop codelens renders twice (extension.ts + source-runner both register the lens provider)'
status: completed
type: bug
priority: normal
created_at: 2026-11-19T23:05:57Z
updated_at: 2026-11-19T23:21:21Z
parent: sonic-pi-6fiz
---

# Bug: Run Stop lenses render TWICE

## Research (verified this session)
Two registerCodeLensProvider({language:'sonic-pi'}, ...) calls exist: src/extension.ts:187 (registers a codeLensProvider) AND src/source-runner/extension.ts:751 (registers ANOTHER codeLensProvider from its own registerEditorCommands wiring). Both providers produce '$(play) Run' + '$(stop) Stop' file lenses (+block/mute lenses), so VS Code renders two identical rows. The providers are separate instances (separate mute registries) - the second registration is a leftover from the dev3/dev4 registrar split.

## Fix direction
ONE provider instance owns lenses for .pi files. Decide which registrar owns it (source-runner owns editor commands today; root extension.ts owns the static feature wiring), pass the instance to the other side or move the registration; delete the duplicate registration + any duplicate mute registry (two registries = mute lens state diverges between rows).

## Acceptance criteria
- [x] Exactly ONE CodeLensProvider registered for language 'sonic-pi' (unit-proven via the registration recording used in lsp-completion-winners.test.js)
- [x] Run/Stop render once per file (integration or unit screenshot-comparable assertion: provideCodeLenses returns ONE Run lens per file)
- [ ] npm test + run-unit green; budgets hold; zero suppressions

## Addendum

Delegated first (root cause of TWO user-visible duplicates: gqg7 + 03nb); the dedupe unblocks 03nb's verification and simplifies zyq8's playing-lens work.

## Proof of Work

- RED: 'expected 1 CodeLensProvider, got 2' (new test/unit/codelens-single-provider.test.js) - then GREEN: one provider instance (root extension.ts owns it), source-runner registration deleted.
- Orchestrator re-ran at the worktree: 51-suite unit battery exit 0; npm test exit 0 incl. vsix smoke; extension-label integration 42 passing 0 failing (twice).
- Merged to dev4 (3cd244b).
Residual: none
