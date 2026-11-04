---
# sonic-pi-bpba
title: 'Public repo maturity: end-user docs, dep refresh, CI'
status: completed
type: epic
priority: normal
created_at: 2026-11-03T16:29:01Z
updated_at: 2026-11-03T17:37:55Z
---

Goal: make bmcszk/vscode-sonic-pi presentable and maintainable as a public fork: (1) README rewritten for end users only + CONTRIBUTING.md from scratch (no coffee/donation content), (2) dependencies bumped to latest stable with tests green + audit delta reported, (3) reasonable GitHub Actions: CI (build+test) and release (vsix artifact on tag), SHA-pinned actions, least-privilege token permissions.

User directive 2026-11-03: '1. update readme. readme is for end user only. create contributing md file but from scratch cause we do not want the coffee thing anymore 2. make sure that dependencies are up to date - lastest stable 3. make sure we have reasonable gha'

## Exit criteria
- README speaks to users (install, requirements, usage, settings); contributor/development content lives in CONTRIBUTING.md; no coffee/donation text anywhere.
- package.json deps/devDeps at latest stable per npm registry; npm test + npm run test:e2e exit 0 after the bump; npm audit before/after delta recorded.
- .github/workflows: CI on push/PR (npm ci, build, unit+guard tests) + release on tag (vsce package, GitHub release with vsix); every action pinned to peeled commit SHA with version comment; minimal token permissions (CI read-only, release job single contents:write).

## Test artifact references
- Local: package.json, README.md, tsconfig.json, src/, test/
- Skill: public-repo-maturity (loaded; references/ carry workflow + pinning templates)

## Proof of Work (epic-level, end-to-end)

- User directives 1/2/3 all delivered + parent-verified: (1) README end-user-only + CONTRIBUTING.md from scratch, zero coffee/donation content (grep-proven), settings cross-checked 11/11 against package.json, keybindings/commands quoted from manifest; (2) deps at latest CJS-compatible stable (ceiling map documented per package; audit 19 -> 16, remaining dev-chain only, follow-up drafted as z37y); clean-room ci/build/test/E2E all exit 0 on assembled master; (3) GitHub Actions live: CI run 41685786901 green on master (observed), Release workflow registered, SHA-pinned actions verified via API peel, least-privilege split enforced.
- Merged commits: 835f447 (docs), 2d8fb2c (deps), 927fcc0 (gha) — all pushed to origin/master.
- Exit criteria from body: met.

Residual: first v-tag still required to exercise release.yml's publish path (tag/version guard self-fails wrong tags); user-side repo clicks (branch protection, secret scanning) remain user actions.
