---
# sonic-pi-3rze
title: Cue-port controls + integration coverage (F5)
status: draft
type: task
priority: normal
created_at: 2026-11-16T13:30:44Z
updated_at: 2026-11-16T13:32:15Z
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
