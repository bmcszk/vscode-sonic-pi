---
# sonic-pi-bpba
title: 'Public repo maturity: end-user docs, dep refresh, CI'
status: draft
type: epic
created_at: 2026-11-03T16:29:01Z
updated_at: 2026-11-03T16:29:01Z
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
