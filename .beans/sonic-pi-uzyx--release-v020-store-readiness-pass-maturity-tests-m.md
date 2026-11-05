---
# sonic-pi-uzyx
title: 'Release v0.2.0: store-readiness pass (maturity, tests, manifest, listing)'
status: in-progress
type: task
created_at: 2026-11-05T12:35:32Z
updated_at: 2026-11-05T12:35:32Z
parent: sonic-pi-q65q
---

# Release v0.2.0 to the Microsoft VS Code Marketplace (user directive 2026-11-05)

"keep focus on v0.2.0, make sure it is mature enough and well tested to publish it into ms vs code store."

## Local research (done across session)
- Content of 0.2.0 already on master: editor controls (Run/Stop codelens + title button + Load def), playing-line highlight, run-cell semantics + fragment offset fix, deps sweep (audit 0), activation smoke gate, .vscodeignore.
- Gates that exist: 7 unit suites (npm test), live-daemon e2e (protocol.js), npm audit, vsce package (now green post-EISDIR fix), CI + tag-release workflows (SHA-pinned).
- Manifest state: version 0.1.4; publisher "s00500" (upstream author - CANNOT be used for our store publish); repository field points to bmcszk fork (fixed in r530 follow-up); icon img/icon.png exists.
- README: end-user facing; documents editor controls (step 4) + settings table 12 keys.

## Online research (researcher dispatched)
- MS marketplace publishing requirements 2026: publisher setup, PAT scope, vsce publish vs web upload, icon requirements, listing quality bar. Report: docs/research/marketplace-publishing.md

## AC
- [ ] Version 0.2.0; CHANGELOG.md created (0.2.0 detailed, 0.1.x summarized from git history)
- [ ] README covers every 0.2.0 feature incl. playing-line highlight; package slimmed via .vscodeignore (test/docs/CI out)
- [ ] Full gates green on the release commit: npm test (7 suites), live e2e, npm audit 0, vsce package DONE
- [ ] Fresh-install smoke: 0.2.0 vsix installed into a clean profile, activation + controls verified
- [ ] GitHub tag v0.2.0 + Release workflow green with asset
- [ ] Marketplace publish: executed (needs user's publisher + PAT) or STOPPED-WAITING with the exact credential ask

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md
- /home/blaze/.agents/skills/vscode-ext-commands/SKILL.md
- package.json: surgical text edits only (established repo incident).

Stop rule: release ops only (version, CHANGELOG, README, .vscodeignore). Feature code changes -> separate bean.
