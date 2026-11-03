---
# sonic-pi-0fbr
title: 'Add GitHub Actions: CI (build+test) and release (vsix on tag), SHA-pinned, least privilege'
status: todo
type: task
priority: normal
created_at: 2026-11-03T16:29:48Z
updated_at: 2026-11-03T17:13:00Z
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
