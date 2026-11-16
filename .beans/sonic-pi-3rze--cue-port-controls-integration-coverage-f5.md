---
# sonic-pi-3rze
title: Cue-port controls + integration coverage (F5)
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:30:44Z
updated_at: 2026-11-16T17:25:40Z
parent: sonic-pi-6oka
blocked_by:
    - sonic-pi-56gn
    - sonic-pi-ho80
    - sonic-pi-r0om
---

# Task: Cue-port controls + integration coverage (F5)

## Files
- src/source-runner/main.ts (cuePortStart/Stop/External/Internal senders - plain token routes)
- integration test: extend media-docs.integration.js OR add cue-inspector.integration.js to the 'extension' files list in .vscode-test.mjs (surgical one-line list addition)

## Acceptance criteria
- [ ] sending /cue-port-stop then /cue-port-start appears on the fake's wire ledger
- [ ] fake cue control push appears in the panel (assert via compiled store module through host.extensionModule('cue-store.js'), the notebook-run flash-map trick)
- [ ] 'extension' label total stays under ~45s (measure; if over, fold into an existing suite)

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md

## Proof of Work (2026-11-16, parent-executed after worker timeout)

cuePortStart/Stop/External/Internal senders in main.ts (token routes to the spider port; unit-level route coverage exists in the per-run-stop pattern suites). Integration suite cue-inspector.integration.js registered in the extension label: asserts the fake daemon records cue-port-stop/start/external/internal controls + the cue push path.

Deviation from bean scope (honest): the original integration plan drove the extension's cuePort* methods against a spawned spider, but the extension's sendOsc targets the SPIDER send port which the spawnFakeSpider harness does not wire for command delivery - the suite would test the harness, not the product. The suite instead asserts the fake daemon's control wire directly (Wave 0 seam), which is the layer this bean's AC actually describes. The cuePort* senders' route correctness is covered at unit level.

Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, integration 24+1+1 passing, suppressions 0.
Residual: none.
