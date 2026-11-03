---
# sonic-pi-r530
title: Bump dependencies to latest stable; tests green; audit delta recorded
status: in-progress
type: task
priority: normal
created_at: 2026-11-03T16:29:48Z
updated_at: 2026-11-03T17:13:14Z
parent: sonic-pi-bpba
---

# Task (triaged 2026-11-03, recon-verified)

Bump deps/devDeps to latest stable **compatible with this CommonJS extension** (user: "make sure that dependencies are up to date - lastest stable"). Latest-absolute is NOT always shippable — ESM-only majors have verified ceilings; ship the ceiling, document the gap.

## Verified bump map (recon: npm registry module-type checks, 2026-03)

| pkg | from | to | evidence |
|---|---|---|---|
| osc-js | ^2.1.0 | **^2.4.1** | CJS, same API, fixes a high advisory. SAFE. |
| utf8 | ^3.0.0 | (none) | 3.0.0 IS latest. |
| uuid | ^8.1.0 | **^11.1.1** | 12+ ESM-only (no require export); 11.1.1 last CJS dual. Clears moderate advisory. |
| typescript | ^4.2.3 | **~6.0.3** | 7.0.2 ESM-only native port; 6.0.3 last CJS; also eslint@8 peer cap is <6.1. |
| @types/node | ^14 | **^22** (match extension-host Node LTS era; NOT machine v25) | types only. |
| @types/vscode | ^1.58 | **^1.144.0** | engines.vscode must rise to ^1.144 — user's editor IS 1.144.1 (verified); old engine floor was already inconsistent (types 1.73 vs engines 1.58). This is a visible support-floor change — flag in PoW, not a blocker. |
| eslint | ^7.23.0 | **leave at 7.32.0** OR flat-config migration | eslint 8/9 need config migration; repo has no lint script in CI scope this epic. Minimal: bump to latest 7.x-compatible patch state only if trivially safe; otherwise document as known-gap. Do NOT migrate config in this task. |
| package-lock | regenerate via npm install | — | never hand-edit. |

## Gates

- [ ] All bumps per table; every deviation justified in PoW table (package, from→to, why-not-latest)
- [ ] npm ci + npm test + npm run test:e2e all exit 0 on bumped tree (e2e needs live daemon — machine has it)
- [ ] npm audit before/after delta recorded (baseline: 19 advisories: 1 low, 4 moderate, 14 high)
- [ ] engines.vscode ^1.144 + @types/vscode ^1.144 consistent
- [ ] vsce package still succeeds (0.1.2-dev local smoke ok, no version bump here — version bumps belong to release flow)

## Skills for coder

- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md — gate: no code changes beyond what a bump forces (e.g. uuid import shape if 11 changed it — check require('uuid') v11 CJS shape first; expected: unchanged).
- Read fully before editing: /home/blaze/.agents/skills/tdd/SKILL.md — gate: existing tests are the bump's gate; do not weaken assertions to get green.

## Stop rule

package.json + package-lock.json only (+ the single engines line). If a bump forces src/ changes beyond import-shape trivia, STOP and report the required change for a user decision (ESM migration is out of scope).

Refs: sonic-pi-bpba

## Added scope (single-writer rule)

Also fix package.json repository.url → https://github.com/bmcszk/vscode-sonic-pi (moved here from dc8h so package.json has exactly one writer this wave).
