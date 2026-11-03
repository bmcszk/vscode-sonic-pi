---
# sonic-pi-dc8h
title: Rewrite README for end users + CONTRIBUTING.md from scratch (no coffee)
status: in-progress
type: task
priority: normal
created_at: 2026-11-03T16:29:48Z
updated_at: 2026-11-03T17:13:14Z
parent: sonic-pi-bpba
---

# Task (triaged 2026-11-03, recon-verified)

README.md becomes END-USER documentation; CONTRIBUTING.md created from scratch. **No coffee/donation content anywhere** (user directive verbatim: "readme is for end user only. create contributing md file but from scratch cause we do not want the coffee thing anymore").

## Verified baseline (recon 2026-11-03)

- README is 38 lines: marketing, Third-Party contributions (l.9-17), **Contribute + coffee/PayPal at l.19-24** (`https://paypal.me/lukasbachschwell/5`), fork notes (l.26-38). CONTRIBUTING.md absent. LICENSE = MIT (Lukas Bachschwell 2022) — leave untouched.
- Only coffee text in repo is README l.21-24 (other hits: package-lock sponsor URLs, bean files — do not touch those).
- 11 documented settings keys (full table in recon artifact II/III): sonicPiRootDirectory (leave-unset guidance!), launchSonicPiServerAutomatically (enum ruby|start|never|custom, default ruby), customExtension, runFileWhenRunSelectedIsEmpty, invertStereo, forceMono, safeMode, logAutoscroll, logClearOnRun, flashBackgroundColor, flashTextColor.
- Commands include: Open Examples, Open Tutorial, Start Server, Run, Check Install, Run Cell, Run Selected, New Notebook (notebook: sonic-pi-book). Keybindings live in package.json contributes.keybindings — doc only what is declared there.
- Vendored src/source-runner/README.md is stale upstream vendor doc — leave as-is (vendored).
- package.json repository.url still points to s00500 upstream — fix to https://github.com/bmcszk/vscode-sonic-pi in THIS task (attribution correctness, vsce validates the field).

## Deliverables

1. README (end-user only): what it is (1-2 lines incl. fork provenance link to s00500 + upstream), requirements (VS Code, Sonic Pi 5.x installed; Linux/pacman tested, /usr/lib/sonic-pi auto-detected), install (marketplace placeholder + from-vsix instruction), getting started (open .rb, set language Sonic Pi, run/stop keys), all 11 settings with defaults + sonicPiRootDirectory "leave unset unless non-standard install" guidance, troubleshooting (logs at ~/.sonic-pi/log/: daemon.log, spider.log, supersonic.log — no scsynth.log on 5.x; "Check Install" command), license note. Keep the tested-on + divergence summary from current fork notes in shortened form (1-3 lines).
2. CONTRIBUTING.md (from scratch): dev setup (node, npm ci, npm run build, npm test, npm run test:e2e + its requirement of a local Sonic Pi 5 daemon), repo layout (src/, test/unit, test/e2e, docs/research evidence dir, .beans ledger), change workflow (beans triage note: fixes tracked in .beans/, single end commit, tests must pass), PR expectations. NO donation content.

## AC

- [ ] README has no contributor/dev content, no coffee/donation text; every documented setting matches contributes.configuration exactly (11 keys)
- [ ] CONTRIBUTING.md covers dev setup + test gates + conventions, no coffee content
- [ ] (moved to r530 — package.json single-writer: repository.url fix ships with the deps bump)
- [ ] Fork provenance + tested-on facts preserved (shortened)

## Skills for coder

- Read fully before editing: /home/blaze/.agents/skills/writing-for-agents/SKILL.md — gate: docs written for the reader (end user vs contributor), no agent-narration style.
- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md — gate: factual tone, no invented features (only documented keys/commands/keybindings).

## Stop rule

Touch only README.md, CONTRIBUTING.md (new), package.json repository.url line. Vendored READMEs, LICENSE, bean files, src/ → out of scope; anything odd → report, don't fix.

Refs: sonic-pi-bpba
