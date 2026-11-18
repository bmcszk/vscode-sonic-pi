---
# sonic-pi-40uj
title: 'Epic: repo hygiene - just recipes, lint budgets, hooks, worktree law, dev2->dev PR'
status: in-progress
type: epic
priority: normal
created_at: 2026-11-18T11:26:55Z
updated_at: 2026-11-18T11:27:40Z
parent: sonic-pi-u71o
---

# Repo hygiene: just recipes, lint budgets, hooks, worktree law, dev2->dev PR

User directives (verbatim, this session): all current-bean work on `dev2`; git-skill worktree law enforced (worktrees in `.worktrees/`, none outside); everything green; draft PR dev2->dev; `just` CLI recipes (`just lint`, `just test`, `just test-unit`); pre-commit hook runs `just lint`; pre-push hook runs `just test-unit`; both run on GHA; eslint `max-lines: 1000`; `max-lines-per-function: 100`.

## Research (verified this session)
- dev2 = 78 commits ahead of dev, dev fully contained (`git rev-list --count dev2..dev` = 0). `z8p8-device-picker` = dev2 + 1 commit (unpushed commit + dirty worktree with debug lines).
- Stale worktrees: 14 sibling dirs `~/github/bmcszk/vscode-sonic-pi-*` (git skill: worktrees live only in `.worktrees/`, removed after merge, no long-lived worktrees).
- `just` 1.59.0 installed at /usr/bin/just. Repo has npm scripts: `lint` (eslint src), `test` (lint+format+build+~24 unit files+vsix smoke), `test:integration`, `test:e2e`. No `justfile`, no hooks, ci.yml invokes npm directly.
- Lint budgets vs reality: `src/builtins/generate-builtins.ts` 5836 lines (checked-in generated docs artifact, single file), `src/source-runner/main.ts` 1196 lines with `constructor` 126 lines and `setupOscReceiver` 189 lines. Honest fixes only - no rule exclusions beyond a documented generated-file override.
- Known red gate: bean sonic-pi-z8p8 integration test - `daemonSender` cached with the port of the first boot; after restart the window sends `/daemon/audio/request-devices` to the dead port (debug output proved it: two sends to two different ports). Real product bug in the same class as the restart wave.

## Scope
Cleanup (orchestrator): merge z8p8 branch into dev2, sweep worktrees/branches per git skill, delete remote z8p8 branch after merge.
Worker tasks below. One commit at the end on dev2, green; draft PR dev2->dev (base `dev`, head `dev2`).

## Acceptance criteria
- [ ] No worktrees outside `.worktrees/`; merged/stale branches deleted with empty-diff proof; remote z8p8 branch gone after merge.
- [ ] `just lint`, `just test`, `just test-unit` work from clean checkout.
- [ ] `.githooks/pre-commit` runs `just lint`; `.githooks/pre-push` runs `just test-unit`; installed via `core.hooksPath`.
- [ ] ci.yml runs `just lint` + `just test-unit` (pinned just install).
- [ ] eslint: max-lines 1000 + max-lines-per-function 100; `npm run lint` zero findings; only documented override is the generated `src/builtins/generate-builtins.ts`.
- [ ] z8p8 stale-sender bug fixed with red-first unit test; full integration battery green.
- [ ] Draft PR dev2 -> dev exists, URL reported to user.

## Skills for coder
- /home/blaze/.agents/skills/git/SKILL.md (worktree + branch laws - read fully before editing)
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
