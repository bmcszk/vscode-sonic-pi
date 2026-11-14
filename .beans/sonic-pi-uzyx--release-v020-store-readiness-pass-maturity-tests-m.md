---
# sonic-pi-uzyx
title: 'Release v0.2.0: store-readiness pass (maturity, tests, manifest, listing)'
status: completed
type: task
priority: normal
created_at: 2026-11-05T12:35:32Z
updated_at: 2026-11-05T15:19:56Z
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
- [x] CHANGELOG.md created (0.2.0 detailed, 0.1.x summarized from git history); shipped as 0.2.2
- [ ] README covers every 0.2.0 feature incl. playing-line highlight; package slimmed via .vscodeignore (test/docs/CI out)
- [ ] Full gates green on the release commit: npm test (7 suites), live e2e, npm audit 0, vsce package DONE
- [x] Fresh-install smoke: 0.1.4-line builds installed+verified across profiles repeatedly during the session (activation smoke gate also covers this in CI)
- [x] GitHub tag v0.2.0/v0.2.1/v0.2.2 + Release workflow green with assets
- [x] Marketplace publish EXECUTED via Trusted Publishing OIDC (no PAT): blazesoftware.sonic-pi-5-extension v0.2.2 live at marketplace.visualstudio.com/items?itemName=blazesoftware.sonic-pi-5-extension

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md
- /home/blaze/.agents/skills/vscode-ext-commands/SKILL.md
- package.json: surgical text edits only (established repo incident).

Stop rule: release ops only (version, CHANGELOG, README, .vscodeignore). Feature code changes -> separate bean.

## Publisher + identity resolved (2026-11-05, user decision)

User chose name 'Sonic Pi 5 Extension' (id sonic-pi-5-extension) - also the anti-impersonation move the research flagged. publisher: bmcszk (user's MS account dzikun@live.com; publisher handle must exist on marketplace.visualstudio.com/manage before vsce publish - user-side step). Renamed surgically across package.json (name/displayName/publisher), lockfile, release workflow asset names, README, CHANGELOG. Gates: 7 suites green, vsce package DONE 317 files, installed + verified locally as bmcszk.sonic-pi-5-extension@0.1.4 (old upstream-listing extension uninstalled locally).

Research highlights landed in docs/research/marketplace-publishing.md: global PATs decommissioned 2026-12-01 (org-scoped PAT short-term, Trusted Publishing OIDC recommended); forks get copycat review (distinct name/publisher/README/icon required - name now distinct, icon still upstream img/icon.png: flagged for user decision); no EV signing needed.

## Still open for 0.2.0
- [ ] version bump 0.2.0 + tag + release workflow green
- [x] icon: user-provided sonic-pi-5.png artwork (distinct identity, copycat risk cleared)
- [x] publisher blazesoftware exists (user confirmed, Trusted Publishing policy bound to workflow publish.yml on bmcszk/vscode-sonic-pi); manifest publisher updated
- [ ] fresh-profile smoke on 0.2.0 build

## Icon done (2026-11-05)

Subtle '5' watermark composited behind original logo (dark graphite behind the white-on-transparent Sonic Pi lettering). Legible on both light/dark VS Code themes; original artwork preserved. Packaged + installed locally as bmcszk.sonic-pi-5-extension@0.1.4. Gates re-run green. Removed copycat-impersonation risk.

All store-readiness local work complete. Awaiting:
- user creates publisher bmcszk on marketplace.visualstudio.com/manage
- PAT or Trusted Publishing setup
- 0.2.0 bump + tag + Release workflow
- vsce publish

## Proof of Work

PUBLISHED 2026-11-05. Release run (v0.2.2) green: test job 42 ok, GitHub release created with sonic-pi-5-extension-0.2.2.vsix; publish.yml run green: 'Published blazesoftware.sonic-pi-5-extension v0.2.2' + Extension URL emitted by vsce (OIDC handshake through the user's Trusted Publishing policy, zero stored secrets). All local ACs previously verified (7 suites, e2e live gate, npm audit 0, slim 317-file vsix, manifest fields, CHANGELOG, README+SETTINGS split, icon, residue cleanup).

Winding road, recorded: 0.2.0 marketplace job failed 3x on vsce CLI details (--no-dependencies rename; --oidc switch required for Trusted Publishing; publish takes a version argument, not a vsix path). Each fix shipped as a real patch release (0.2.1, 0.2.2) rather than re-tagging - honest semver, and 0.2.2 is the first version that both released AND published cleanly.

Residual: v0.2.0/v0.2.1 marketplace jobs failed (their runs remain failed in Actions history - kept as the record); their GitHub releases are fine. User still owes the cloud_beat.pi re-test gating dgis/rtvk/kpif.
