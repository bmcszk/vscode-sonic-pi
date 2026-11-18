---
# sonic-pi-nixf
title: Run-state hardening from daemon run events (D3)
status: todo
type: feature
priority: normal
created_at: 2026-11-18T17:06:03Z
updated_at: 2026-11-18T17:07:08Z
parent: sonic-pi-6fiz
---

# D3: run-state hardening (roadmap F9 remainder)

Today run start/end rides the /log/info regex (osc-handlers.ts:102-110, locale-fragile). The daemon pushes the truth: /run/started(id, workspace) :1078-1080, /run/ended :1082, /runs/all-completed :1073, /spider/ready :1102, /exited :974/:282, /exited-with-boot-error :193/:270.

## UX (mostly invisible, one visible win)
onRunStarted/onRunEnded fire from real pushes (log regex stays as fallback, deduped per run id - a run id fires started at most once until it ends); /spider/ready flips running + requests version without waiting for a log line; /exited(+boot-error) marks stopped with a message naming the push. Complements keepalive-death path (main.ts daemonDied). /ping->/ack CUT (keepalive + /exited cover it).

## Tasks
- D3a dual-source emitters in the /run/started|ended handlers; unit >=4 (push fires once despite log line also arriving; all-completed clears pending). Deps D0.
- D3b lifecycle pushes /spider/ready | /exited; unit >=3 (transitions, idempotent ready); integration: fake pushes ready on boot -> statusbar running before any run. Deps D0, W3a.

## Acceptance criteria
- [ ] D3a+D3b completed with PoW
- [ ] /spider/ready -> statusbar running before any run (integration)
- [ ] exited paths transition + log which push

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
