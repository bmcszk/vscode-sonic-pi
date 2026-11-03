---
# sonic-pi-lz8o
title: Create GitHub repo bmcszk/vscode-sonic-pi from upstream master
status: in-progress
type: task
priority: normal
tags:
    - research
created_at: 2026-11-03T14:40:48Z
updated_at: 2026-11-03T15:29:00Z
parent: sonic-pi-sawd
---

# Task (triaged 2026-11-03)

Create the actual repo: import upstream master (defaultBranch `master`, pushedAt 2024-07-14, verified via `gh repo view s00500/vscode-sonic-pi --json`) into https://github.com/bmcszk/vscode-sonic-pi (verified NOT existing yet). Local dir `/home/blaze/github/bmcszk/vscode-sonic-pi` becomes its clone — the dir is NON-EMPTY and not a git repo (`.beans/` + `.beans.yml`), so plain `git clone` fails: use **git-init-in-place** (`git init`, commit `.beans*` first, `git remote add origin`, `git fetch`, checkout `upstream/master` over the working tree / merge-base import), then set `origin`/`upstream` remotes explicitly: `upstream` = s00500/vscode-sonic-pi, `origin` = bmcszk fork.

## Verified packaging prerequisites (live, 2026-11-03)

- Upstream `package.json`: name `sonic-pi-extension`, publisher `s00500`, version `0.1.0`, `scripts.build = "tsc"`, icon `img/icon.png`, engines `vscode ^1.58.0`, deps `osc-js ^2.1.0 / utf8 ^3.0.0 / uuid ^8.1.0`, old devDeps (typescript ^4.2.3).
- `src/source-runner/main.ts` snapshot in docs/research is byte-identical to upstream master (diff-verified), so all line-number evidence in child beans is valid.
- System node v25.4.0 / npm 11.19.1 present; `gh` authed as bmcszk (ssh protocol).

## Acceptance

- [ ] `bmcszk/vscode-sonic-pi` exists on GitHub with upstream master as base (upstream code in tree, remotes `origin`/`upstream` set, pushed)
- [ ] Local clone checked out; `npm ci` + `npm run build` (tsc) green
- [ ] `.beans/` + `.beans.yml` committed to the repo (documented in README fork-notes section)
- [ ] `docs/research/` artifacts committed (evidence must live in-repo, never /tmp)

## Skills for coder

- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md — gate: no reformatting of upstream code beyond what import requires.
- No TypeScript/VS Code skill exists on this machine (probed both skills roots) — coder works from upstream source directly.

## Stop rule

Do NOT fix the bugs in this bean — only import + build. Bug fixes are 9qtk/9uiy/l3ab.

Refs: sonic-pi-sawd
