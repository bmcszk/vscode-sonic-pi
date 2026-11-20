---
# sonic-pi-6fiz
title: 'Epic: dev4 — live-loop badges, device pickers, docs preview, run-state hardening'
status: completed
type: epic
priority: normal
created_at: 2026-11-18T17:06:15Z
updated_at: 2026-11-18T17:55:06Z
parent: sonic-pi-u71o
---

# Dev4 wave: consume the telemetry the daemon already pushes

User directive: the roadmap review is addressed ALL in the dev4 wave (stacked on PR #3). Plan: research pass (run a1921f2f), verified by the orchestrator against /usr/lib/sonic-pi sources + live tree (route lines, cue-port gap, tautological asserts, main.ts 963/1000 all re-verified).

## Scope
D1 live-loop activity badges (/live_loop/scope + scope-ended, spider-server.rb:1002-1004) - gutter badge on the live_loop header while the loop thread lives. D2 MIDI + gamepad pickers (/midi/in-ports|out-ports :986-988, /gamepad/devices-list :990; sends /midi-port-enable :746-754, /gamepad-enable :756-764, /midi-reset, /gamepad-start|stop). D3 run-state hardening (/run/started|ended :1078-1082, /runs/all-completed :1073, /spider/ready :1102, /exited :974). D4 command pack: reachable cue-port commands (senders exist main.ts:943-957, unreachable), timewarp picker (/set-global-timewarp :806-814), init.rb open (:249-253). D5 docs preview player (silent no-replace runs, workspace docs-preview; silent honored only with workspace arg, :302-316). D6 auto-run on save (config-gated, default OFF). D0 prerequisite: sender/emitter extraction keeps main.ts (963 lines) under the 1000 budget.

## Acceptance criteria
- [x] Wave 1+2+3 all completed with PoW; integration suite covers the new pushes/sends on the fake-daemon wire ledger
- [x] node test/run-unit.js green with >=5 new suites; npm test exit 0; lint budgets intact (main.ts <900)
- [x] Cold-window gate stays green (new commands dispatch silent no-ops)
- [x] Cut list respected (nothing needs Sonic Pi changes; nothing in src/lsp/** touched)

## How done is measured
Every task AC names assertion counts or an observed events.ndjson message. Full plan: .agents/dev4-plan.md (committed on dev4).

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md

## Proof of Work (end-to-end)

- All 7 children completed with PoW (D0 extraction, D1a-d badges, D2a-c pickers, D3a-b run-state, D4a-c command pack, D5a-b docs preview, D6a auto-run-save).
- Honest correction in the ledger: 09v2 + fz82 were prematurely completed mid-wave and reopened; final wiring landed in 2407142 with red-first tests per leaf.
- E2e at 2407142: node test/run-unit.js 49 suites exit 0; npm test exit 0 (lint+format+build+units+vsix smoke); integration device-telemetry suite 42 passing 0 failing (fake pushes: live-loop-scope/scope-ended, midi-ports, gamepads, spider-ready, exited); cue-port 4 real wire asserts; activation gate green (cold dispatch of every new command).
- Lint budgets hold: main.ts 976/1000, extension.ts 865/1000, all functions <100; zero suppressions; both hooks live-fired on every commit in the line.
- Stacking: dev4 pushed on top of dev3 (PR #3, unmerged); PR #4 (dev4->dev3) opens after merge.
Residual: badge legibility visual check at next live session (cosmetic)
