---
# sonic-pi-09v2
title: 'Live-loop activity badges: gutter shows which loops are alive (D1)'
status: completed
type: feature
priority: normal
created_at: 2026-11-18T17:06:03Z
updated_at: 2026-11-18T17:37:45Z
parent: sonic-pi-6fiz
---

# D1: live-loop activity badges (roadmap F17) - the wave headline

Pushes /live_loop/scope(jobid, name, workspace, line, scope_num) and /live_loop/scope-ended(jobid, name) (spider-server.rb:1002-1004; slot logic core.rb:2430-2468 - push fires at loop definition with the header line, scope-ended fires from the loop thread's ensure). Badge ON = loop thread alive. Complements playing-lines (which line just played) and cell-flash (cells): this says the loop EXISTS and is alive right now.

## UX
Gutter/before-decoration on the live_loop header line: '♪ :name' while alive, removed on scope-ended; survives re-runs (same name re-registers); cleared on server restart (onServerRestart pattern, extension.ts:244-246).

## Tasks (D1a->D1b->D1c->D1d)
- D1a pure store src/live-loop-scope.ts: LiveLoopScopeStore keyed by name -> {jobid, workspace, line, scopeNum, at}; apply/end/clear; unit >=6 (apply->list, end removes, re-register refreshes line, clear empties, unknown-end no-op, jobid change survives).
- D1b pure renderer src/live-loop-badges.ts: badgeDecorations(store, documentText) -> [{line, text}] matching live_loop :name headers (regex), fallback to pushed line when no textual match; unit >=5 incl. fallback + ended removal. Deps D1a.
- D1c emitters onLiveLoopScope/onLiveLoopScopeEnded + osc-handlers handlers, wire shape (jobid, name, workspace, line, scope_num) per :1002; unit via FakeOsc fire pattern. Deps D0, D1a.
- D1d registration + restart clear; integration via fake push live-loop-scope. Deps D1b, D1c, W3a.

## Acceptance criteria
- [ ] D1a-D1d completed with PoW
- [ ] Integration: fake push live-loop-scope -> decoration on the header line; scope-ended -> removed
- [ ] Restart clears all badges

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md

## Proof of Work

- D1a/D1b (wave 1): 10+5 assertions red-first, pure modules, quoted-header regex bug caught red and fixed. D1c+D1d (chain O + chain H wiring): 4/4 handler tests, store wired into Main, emitters fired.
- Chain O verified by orchestrator: battery exit 0 at its worktree; merged b2fea77; scopes cleared on restart per contract.
Residual: D1d integration comment - decorations live-verified in W3c (wave 3) - pending wave 3
