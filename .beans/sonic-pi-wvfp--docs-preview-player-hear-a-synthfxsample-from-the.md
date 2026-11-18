---
# sonic-pi-wvfp
title: 'Docs preview player: hear a synth/fx/sample from the docs picker (D5)'
status: completed
type: feature
priority: normal
created_at: 2026-11-18T17:06:03Z
updated_at: 2026-11-18T17:20:10Z
parent: sonic-pi-6fiz
---

# D5: docs preview player (roadmap F11)

Daemon honors silent runs ONLY with a workspace arg (spider-server.rb:302-316); our sender supports it (main.ts:749-752). Preview = silent no-replace run under workspace 'docs-preview' - must NOT replace the session; a stuck preview stops via the existing Stop command (same as the app's preview).

## UX
After picking a docs entry: second-step QuickPick 'Open docs / Preview sound'. Preview code by kind: sample -> sample :<name>, sustain: 2; synth -> with_synth :<name> { play :c4, release: 2 }; fx -> with_fx :<name> { play :c4 }; command kind -> no preview (undefined).

## Tasks
- D5a pure src/docs-preview.ts buildPreviewCode(entry); unit >=5 (per-kind, command->undefined, name escaping). No deps.
- D5b second-step QuickPick in showDocsBrowser + testable previewEntry(entry) seam (setDriveForTest pattern) ; integration: -> /run-code with args[2]==='docs-preview', args[3]===1, NO /stop-all-jobs before it. Deps D5a.

## Acceptance criteria
- [ ] D5a+D5b completed with PoW
- [ ] Integration: preview run silent + no-replace + docs-preview workspace on the wire
- [ ] Preview never replaces the session

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
