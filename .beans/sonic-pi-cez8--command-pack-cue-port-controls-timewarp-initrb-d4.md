---
# sonic-pi-cez8
title: 'Command pack: cue-port controls, timewarp, init.rb (D4)'
status: todo
type: feature
priority: normal
created_at: 2026-11-18T17:06:03Z
updated_at: 2026-11-18T17:07:08Z
parent: sonic-pi-6fiz
---

# D4: command pack - cue-port controls, timewarp, init.rb (roadmap F16/F21/F11-adjacent)

(1) cue-port senders exist (main.ts:943-957) but NO command reaches them (orchestrator-verified grep). (2) /set-global-timewarp(token, seconds) :806-814. (3) init.rb: daemon evals ~/.sonic-pi/config/init.rb on boot (:249-253; paths.rb:187-196; example copy-down :87-95).

## Tasks
- D4a register vscode-sonic-pi.cues._portStop/_portStart/_portExternal/_portInternal on the cues view title menu; REPLACE the tautological asserts in cue-inspector.integration.js (today the suite sends /fake/cue-port-stop itself and asserts the fake recorded it - proves nothing about the extension; false comment :6 removed). AC: 4 real wire asserts (dispatch command -> /cue-port-* ledger, token = boot token) + activation gate green. Deps: none (senders exist).
- D4b sender setGlobalTimewarp(seconds) guard 0-5 (setLinkBpm pattern main.ts:827-837) + input-box command + cold guard; unit >=3; integration ledger assert. Deps D0.
- D4c pure resolveInitPath(homedir) + initialInitContent() (create-if-missing, header comment); command opens as sonic-pi doc; unit >=3; cold dispatch safe. Deps: none.

## Acceptance criteria
- [ ] D4a-D4c completed with PoW; 4 real cue-port wire asserts green
- [ ] timewarp out-of-range sends nothing (unit)
- [ ] init.rb create-if-missing unit-proven

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
