---
# sonic-pi-aedq
title: 'Regression: module node16 JSON namespace imports broke extension activation in 0.1.2'
status: completed
type: bug
priority: normal
created_at: 2026-11-04T12:24:10Z
updated_at: 2026-11-04T12:24:19Z
---

# Found 2026-11-04 (user reported: command vscode-sonic-pi.run not found)

v0.1.2 shipped with a fatal activation bug: src/builtins/builtins.ts used 'import * as fxJSON from ./fx.json'. Under the r530 tsconfig companion change (module/moduleResolution node16, TS 6.0.3) that emit wraps the JSON root in a namespace object, so builtins.js:55 died at require time (TypeError: fxJSON.map is not a function) and activate() never ran — zero commands registered ('command not found' for every command; only the static manifest title-button rendered, and clicking it errored).

Why gates missed it: unit tests stub only main.ts paths; e2e never loads the extension host; nobody loaded the built extension end-to-end.

## AC
- [x] Default-import JSON roots (src/builtins/builtins.ts) — emit passes the raw root
- [x] test/unit/activation.test.js added: loads REAL out/extension.js under vscode stub, asserts activation completes + 5 core commands registered — the missing gate, wired into npm test
- [x] 0.1.3 packaged, installed both profiles, released as v0.1.3 (release run green, asset present)

## Fix commit
0b32bce (includes merge of editor-controls 20e22f1: codelens + title button, now user-visible for the pending sign-off)

Refs: sonic-pi-r530 (tsconfig change), sonic-pi-qlkd (surfaced by user sign-off attempt)

## Proof of Work

All ACs landed in commit 0b32bce + release v0.1.3 (run 41828797366: build+test green, publish green, asset sonic-pi-extension-0.1.3.vsix on the release page). Parent re-verified locally: 6 suites green incl. activation smoke ('activation smoke passed'), live-daemon e2e gate green, installed 0.1.3 into both local profiles. Structural fix per retro rule: the activation smoke test is the wired check — this failure class (compiles fine, dies at activation) now fails CI. Residual: user must reload windows; v0.1.2 remains a broken release (superseded; recommend deleting its asset or noting it — user call).
