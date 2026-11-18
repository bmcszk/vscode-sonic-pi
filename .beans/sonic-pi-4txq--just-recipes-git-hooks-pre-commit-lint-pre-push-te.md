---
# sonic-pi-4txq
title: Just recipes + git hooks (pre-commit lint, pre-push test-unit) + GHA wiring
status: completed
type: task
priority: normal
created_at: 2026-11-18T11:27:47Z
updated_at: 2026-11-18T11:44:58Z
parent: sonic-pi-40uj
---

# Just recipes + git hooks (pre-commit lint, pre-push test-unit) + GHA wiring

User directives: `just` CLI with `just lint`, `just test`, `just test-unit`; pre-commit hook runs `just lint`; pre-push hook runs `just test-unit`; both run on GHA. `just` 1.59.0 exists locally.

## Research
- npm scripts are the single source of truth today: `lint` (eslint src), `test` (lint+format:check+build+~24 unit files+vsix smoke), `test:integration`, `test:e2e`. ci.yml runs npm directly (lint step = `npm run lint && npm run format:check`, then `npm test`).
- No justfile, no hooks, no core.hooksPath. .gitignore lacks `.worktrees/` and agent dirs.

## Scope
- justfile: `lint` = `npm run lint && npm run format:check`; `test-unit` = `npm run test:unit` (new npm script: build + every node test/unit/*.js run currently in the `test` chain, WITHOUT vsix smoke); `test` = the full battery (`npm test`); a `default` recipe that lists. npm stays source of truth.
- .githooks/pre-commit (`exec just lint`) + .githooks/pre-push (`exec just test-unit`), executable, `sh` shebang. Install via package.json `prepare` script: `git config core.hooksPath .githooks` guarded for non-git contexts (`[ -d .git ] && git config core.hooksPath .githooks || true` style) so `npm ci` on CI/forks does not fail.
- ci.yml: lint step -> `just lint`; test step -> `just test-unit` + keep `npm test`? NO - replace npm invocations with just recipes; install just pinned (casey/just release binary, version pinned, checksum documented) before the steps. Keep checkout/setup-node/npm ci as-is.
- .gitignore: add `.worktrees/` plus the repo's agent state dirs (`.pi/` if the repo carries one - check; do not add dirs that do not exist).
- README dev/CONTRIBUTING section: 3-line note about `just` recipes + auto-installed hooks IF a dev section exists; else skip (minimal changes).

## Acceptance criteria
- [ ] `just --list` shows lint/test/test-unit; each runs green from a clean checkout (`npm ci` first).
- [ ] `sh -n .githooks/pre-commit .githooks/pre-push` parses; both executable; `git config core.hooksPath` reads `.githooks` after `npm ci`-equivalent (run the prepare command) in the worktree.
- [ ] ci.yml valid YAML, uses just with a pinned install; no other jobs weakened.
- [ ] `npm test` still green (no gate dropped from the full battery).
- [ ] No eslint-disable, no gate edits, no narration comments.

## Skills for coder
- /home/blaze/.agents/skills/bash-scripting/SKILL.md (hook scripts)
- /home/blaze/.agents/skills/git/SKILL.md (hooks + worktree law context)
Do not touch: src/**, test/**, eslint.config.mjs, main.ts (other workers own them).

## Proof of Work

- justfile: default/lint/test-unit/test, npm stays source of truth. Hooks .githooks/pre-commit (exec just lint) + .githooks/pre-push (exec just test-unit), 755, sh -n clean.
- prepare script guarded (git rev-parse ... && git config core.hooksPath .githooks || true); hooksPath confirmed set in main .git config.
- ci.yml: pinned casey/just 1.42.3 install step (URL verified 200 by worker), lint step just lint, test step just test-unit; existing pins kept.
- Gates: just --list 4 recipes; just lint green; just test-unit green (orchestrator re-ran both at merged tip); npm test green incl. vsix smoke; pre-commit hook live-fired during the worker's commit.
Residual: none
