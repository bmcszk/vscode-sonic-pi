---
# sonic-pi-lz8o
title: Create GitHub repo bmcszk/vscode-sonic-pi from upstream master
status: completed
type: task
priority: normal
tags:
    - research
created_at: 2026-11-03T14:40:48Z
updated_at: 2026-11-03T15:48:18Z
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


## Proof of Work

Preconditions: `gh auth status` → active account bmcszk (ssh protocol);
`gh repo view bmcszk/vscode-sonic-pi` → "Could not resolve to a Repository"
(repo did not exist); `git status` → "fatal: not a git repository".

Import (git-init-in-place):
1. `git init -b master` → "Initialized empty Git repository".
2. `git add -A && git commit -m "Chore: beans ledger + research artifacts (pre-import)"`
   → commit fcab5a1, 30 files (.beans.yml, 6 beans, 23 docs/research files).
3. `git remote add upstream https://github.com/s00500/vscode-sonic-pi.git`
   (gh rewrote to ssh on fetch: git@github.com:/s00500/vscode-sonic-pi.git);
   `git fetch upstream master` → upstream/master at c64f7cc "Adjust windows
   daemon path".
4. `git merge upstream/master --allow-unrelated-histories --no-edit` → clean,
   no conflicts; merge commit 52ea9fc. Working tree now carries upstream 0.1.0
   (src/, package.json, package-lock.json, syntaxes/, tutorial/, ...) *and*
   .beans/ + .beans.yml + docs/research/ (nothing overwritten, nothing lost).

Build:
5. `npm ci` → exit 0, "added 221 packages, and audited 222 packages in 2s"
   (no dependency changes; lockfile untouched, `git status` clean afterwards).
6. `npm run build` FIRST RUN → exit 2:
   `docs/research/spfork-main.ts(28,27): error TS2307: Cannot find module
   './oscsender'` and `(32,24): error TS2307: Cannot find module './config'`.
   Root cause: upstream tsconfig.json has no `include`, so every .ts under the
   repo root joins the tsc program; the imported docs/research/spfork-main.ts
   snapshot pulls itself in, fails resolution, and also moves the computed
   rootDir up so tsc emitted out/src/extension.js instead of out/extension.js.
7. Fix (import-integration, not a bug fix): tsconfig.json `exclude` gains
   `"docs"`, documented in the commit message e1526c7. `rm -rf out &&
   npm run build` → exit 0, `out/extension.js` present (3584 bytes) plus
   out/argsParser.js, out/extension.js.map, out/builtins/, out/source-runner/.
8. Clean-room re-verification: `rm -rf node_modules out && npm ci` → exit 0;
   `npm run build` → exit 0; `ls -l out/extension.js` → present. `git status`
   clean (out/ and node_modules/ are gitignored upstream).

Publish:
9. `git remote add origin git@github.com:bmcszk/vscode-sonic-pi.git`;
   `gh repo create bmcszk/vscode-sonic-pi --public --source=. --remote=origin
   --push` → repo created (https://github.com/bmcszk/vscode-sonic-pi) but gh
   refused the push ("X Unable to add remote \"origin\"", exit 1) because
   origin already existed; fallback from the contract:
   `git push -u origin master` → "* [new branch] master -> master", tracking
   set. (Contract-sanctioned fallback path, not an improvised step.)
10. README "Fork notes" section appended (3 lines: fork purpose, docs/research/
    + .beans/ evidence, fixes tracked as beans) in commit e1526c7.

Gate evidence:
- `gh repo view bmcszk/vscode-sonic-pi --json ...` →
  {"defaultBranchRef":{"name":"master"},"isFork":false,
   "nameWithOwner":"bmcszk/vscode-sonic-pi","visibility":"PUBLIC"};
  `gh api repos/bmcszk/vscode-sonic-pi` → default_branch master, parent null.
- `git log --oneline -6` → e1526c7 Chore: keep docs/research out of the tsc
  program, add fork notes / 52ea9fc Merge remote-tracking branch
  'upstream/master' / fcab5a1 Chore: beans ledger + research artifacts
  (pre-import) / c64f7cc Adjust windows daemon path / 0c6fa45
  sonic-pi-extension / 09793bb change name.
- `git merge-base --is-ancestor upstream/master HEAD` → true (upstream master is
  an ancestor of HEAD).
- `git ls-remote origin refs/heads/master` = e1526c7… == `git rev-parse HEAD`;
  `git status -sb` → "## master...origin/master" (no divergence).
- `git ls-files | grep -c '^\.beans'` → 6 beans + `.beans.yml`;
  `git ls-files | grep -c '^docs/research'` → 23.
- Remote tree: `gh api .../contents/.beans` → 6 bean files;
  `gh api .../contents/docs/research` → daemon-46.rb, daemon-stdout.txt,
  spfork-main.ts, sph-vsix.
- `git remote -v` → origin git@github.com:bmcszk/vscode-sonic-pi.git,
  upstream git@github.com:/s00500/vscode-sonic-pi.git.

Residual: tsconfig.json is an upstream-owned file that now carries a one-line
`"docs"` exclude (required for a green build with evidence in-repo — a clean
upstream tsconfig emits out/src/extension.js and exits 2). No dependency was
touched, so the ancient devDeps (typescript ^4.2.3, engines vscode ^1.58.0)
remain as-is; `npm ci` also reports 19 pre-existing advisories
(1 low, 4 moderate, 14 high) from upstream's lockfile — untouched by design.
Local branch has one unstaged modification (this bean ledger update), not
committed per contract; parent owns ledger commits at close.

## Scope amendment (user request, 2026-11-03)

User: 'why i do not see forked from in github?' — repo was created via gh repo create + push (standalone, isFork=false). Epic intent is a real fork (banner + upstream relationship). Conversion requires delete → gh repo fork → re-push; verified origin/master == local HEAD (e1526c7) and zero issues/stars/watchers, so delete is lossless. Reopened to land the fork relationship.

## Proof of Work — fork conversion (2026-11-03)

- Before: gh repo view bmcszk/vscode-sonic-pi → isFork:false, parent:null (gh repo create makes a standalone repo; no fork relationship possible post-hoc).
- Lossless precondition: origin/master == local HEAD (e1526c7), open_issues 0, stars 0, watchers 0 — nothing existed only on GitHub.
- Conversion (no deletion, no delete_repo scope): gh repo rename → vscode-sonic-pi-pre-fork (frees the name); gh repo fork s00500/vscode-sonic-pi → created true fork at bmcszk/vscode-sonic-pi; origin re-pointed; git push -u origin master = clean fast-forward c64f7cc..e1526c7.
- After: gh repo view → {isFork:true, parent:s00500/vscode-sonic-pi}; ls-remote origin master = e1526c7 == HEAD; upstream remote = s00500 (ssh). GitHub 'Sync fork' button now functional for future upstream pulls.
- Leftover: old standalone repo lives at bmcszk/vscode-sonic-pi-pre-fork (public) — user to delete via GitHub UI (Settings → Danger Zone) or grant delete_repo scope; parent will not delete repos silently.

Residual: pre-fork leftover repo pending user deletion (content fully superseded, verified identical).
