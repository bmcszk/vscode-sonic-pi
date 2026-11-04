---
# sonic-pi-0fbr
title: 'Add GitHub Actions: CI (build+test) and release (vsix on tag), SHA-pinned, least privilege'
status: completed
type: task
priority: normal
created_at: 2026-11-03T16:29:48Z
updated_at: 2026-11-04T11:37:35Z
parent: sonic-pi-bpba
blocked_by:
    - sonic-pi-r530
---

# Task (triaged 2026-11-03)

"Reasonable GHA" (user): CI + release workflows, SHA-pinned, least privilege. Blocked by sonic-pi-r530 (CI must run the bumped tree; workflows land after deps so CI green means something).

## Deliverables (templates from public-repo-maturity references/, adapt to npm/TS)

1. `.github/workflows/ci.yml` — on push to master + pull_request: setup-node (LTS 22, cache npm), npm ci, npm run build, npm test. `permissions: contents: read` at workflow level. NOTE: npm test (unit+guard) needs no daemon; test:e2e does — do NOT put e2e in CI (no Sonic Pi on runners; document that in the workflow comment).
2. `.github/workflows/release.yml` — on push tag `v*`: npm ci, npm run build, npm test (read-only job), then publish job (needs: test, only on tag): npx @vscode/vsce package → sonic-pi-extension-<ver>.vsix → softprops/action-gh-release (or gh CLI) uploads vsix. Publish job carries `permissions: contents: write` (the single write grant); test job read-only.
3. Pinning: EVERY `uses:` pinned to full peeled commit SHA + version comment (`owner/action@<40-hex> # v4.2.1`). Resolve SHAs via GitHub API before pushing (annotated tags need the peel hop).
4. Also verify Actions enabled on repo (recon job 3 covers: gh api .../actions/permissions).

## AC

- [ ] CI green on master after push (observed run, link in PoW)
- [ ] Release workflow: gate via a real `v0.1.1` tag push IF user approves tagging, else actionlint clean + workflow-parse OK (gh api workflow runs shows the workflow registered) — state which gate was used
- [ ] Every uses: @40-hex SHA + version comment (grep proof)
- [ ] Token perms: CI read-only; only publish job holds contents: write
- [ ] e2e explicitly excluded with comment why

## Skills for coder

- Read fully before editing: /home/blaze/.agents/skills/public-repo-maturity/SKILL.md — gates: SHA-pinning rule, token-permissions job-split rule, "verify the action ref resolves before pushing" pitfall.
- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md — gate: workflows read as intent, comments explain the non-obvious (e2e exclusion).

## Stop rule

Only .github/workflows/* (new) + this task's tag push if approved. No repo settings changes (branch protection etc. are user-side; list them as click-paths in the report, don't attempt).

Refs: sonic-pi-bpba

## Proof of Work

Implemented (worker; died on transient provider error AFTER committing — parent completed its remaining validation) + parent-verified 2026-11-03:
- Workflows: ci.yml (push/PR, contents: read, node 22, ci/build/test, e2e excluded with documented reason), release.yml (tag v*: read-only test job -> publish job with single contents: write; vsix filename derived from package.json; publishes via gh release create — gh CLI instead of a third-party release action, smaller supply-chain surface). Defensive addition by worker: publish FAILS ON TAG/VERSION MISMATCH before packaging instead of shipping a contradictory release.
- Pin proof (parent via GitHub API): actions/checkout@3d3c42e5... ; actions/setup-node@949feb24... — both resolve refs/tags/<ver> to object type 'commit' (peeled), versions match the inline comments; zero non-pinned uses across both workflows.
- Validation (parent): both YAMLs parse (safe_load); permission blocks verified (workflow-level read; publish-job-only write); e2e mentions are comment-only (grep count 1 each, verified in file content).
- LIVE OBSERVATION: merged as 927fcc0, pushed; CI run 41685786901 on master -> ✓ Build and test in 22s (github.run URL in session). Release workflow registered on repo (gh workflow list): gate = workflow-registered + CI-live-green; first real tag still required for the release-path proof (AC documented accordingly).
- gh run 41685786901: https://github.com/bmcszk/vscode-sonic-pi/actions/runs/41685786901

Residual: release.yml's publish path unexercised until first proper v-tag (tag/version match guard makes a wrong tag self-fail). User-side maturity clicks (branch protection etc.) remain per epic exit criteria.

## Post-close proof (residual resolved 2026-11-04)

First real tag v0.1.2 pushed (Release 0.1.2 commit a571268, tag/version guard passed): Release run 41821972746 -> test job green 19s, publish job green 17s, release asset sonic-pi-extension-0.1.2.vsix published at github.com/bmcszk/vscode-sonic-pi/releases/tag/v0.1.2. Full release path now proven live, not just workflow-registered.
