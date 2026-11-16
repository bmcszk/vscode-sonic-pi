---
# sonic-pi-u71o
title: 'Epic: dev2 hardening + feature wave (parent of all open work)'
status: in-progress
type: milestone
priority: normal
created_at: 2026-11-16T11:25:08Z
updated_at: 2026-11-16T11:28:04Z
---

# Epic: dev2 hardening + feature wave (parent of all open work)

**Session goal:** drive all four open beans to resolution on branch `dev2`, then merge to `dev` and ship 0.3.0.

## Children (grouped here)

| Bean | Type | Status | One-line |
|---|---|---|---|
| sonic-pi-4i3a | bug | in-progress | Restart Server fix landed + gated; needs user manual verify (play → Restart → play) |
| sonic-pi-wmae | bug | in-progress | Dead-daemon silent-send class: window never notices attached daemon died → per-run stop + liveness + keepalive errorbacks |
| sonic-pi-818h | epic | in-progress | Feature roadmap delivered (docs/research/feature-roadmap.md); Phase B = user picks killer features → promote to feature beans |
| sonic-pi-858b | epic | todo | Ruby LSP: embedded system ruby-lsp server (docs done, parked per user); green-light to code later |

## Acceptance criteria for this parent epic

- [ ] sonic-pi-4i3a: user confirms Restart Server works → close
- [ ] sonic-pi-wmae: e2e + fix for daemon-liveness (per-run stop + keepalive surfacing + re-attach on death) → close
- [ ] sonic-pi-818h: user reviews roadmap, picks features, those become feature beans → close (research phase done)
- [ ] sonic-pi-858b: remains parked unless user green-lights; no code yet

## Merge plan

When children are resolved: squash-merge `dev2` → `dev` (fast-forward or PR #2), then PR #1 `dev` → `master` for 0.3.0 release.

## Structure note (2026-11-08)

u71o is the MILESTONE (session goal) on branch dev2. Active epic = sonic-pi-818h (feature wave). wmae = active bug work (daemon liveness + per-run stop). 4i3a = awaiting user verification. 858b = PARKED (user: no ruby-lsp code until green-light).

Session discipline: one active epic per session (818h). Subtasks delegated to workers with ~10min scope. Gates: lint clean, unit green, integration green, vsix smoke green - every dispatch.

Refs: sonic-pi-dev2
