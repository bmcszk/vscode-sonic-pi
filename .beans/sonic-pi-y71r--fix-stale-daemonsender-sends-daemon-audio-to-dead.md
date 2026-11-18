---
# sonic-pi-y71r
title: 'Fix: stale daemonSender sends daemon-audio to dead port after re-boot (z8p8)'
status: completed
type: bug
priority: normal
created_at: 2026-11-18T11:27:47Z
updated_at: 2026-11-18T11:44:58Z
parent: sonic-pi-40uj
---

# Fix: stale daemonSender sends daemon-audio to dead port after re-boot (z8p8)

## Research (root cause, verified)
`Main.getDaemonSender()` (src/source-runner/main.ts ~652) caches `new OscSender(this.daemonPort)` forever. `this.daemonPort` is reassigned on every boot/adopt (adopt path ~352 `this.daemonPort = route.daemonPort`; managed boot ~760). After a re-boot every `/daemon/audio/*` send rides the OLD port's socket -> dead port, silent loss. Debug run proved it: two sends logged with `daemonPort=51870` then `daemonPort=39862`; the fake daemon only ever saw nothing (test timeout). Same class as the restart-wave bugs (keepalive already re-creates its sender per call).

## Scope
- Red-first unit test in test/unit/audio-devices.test.js, named for the user case (e.g. 'a daemon sender follows the daemon across a re-boot'): set daemonPort=4557, requestAudioDevices(), reassign daemonPort=4560 (simulating re-boot), requestAudioDevices() again -> the second send must leave from a sender bound to 4560; the 4557 sender must not receive the second message. Use the existing FakeOscSender harness in that file.
- Fix: the cached daemon sender must never outlive its port. Shape is the worker's call (reset cache at every daemonPort reassignment site, or validate cached port per send); keep it minimal, no narration comments.
- Integration: the existing test 'requestAudioDevices reaches the daemon as /daemon/audio/request-devices...' (server-lifecycle.integration.js) must pass.

## Acceptance criteria
- [ ] New unit test red before fix, green after (show both runs).
- [ ] Full `npm test` green (lint+format+build+units+vsix smoke) in the worktree.
- [ ] Integration battery: `npx vscode-test` 30 passing 0 failing (was 29 passing 1 failing).
- [ ] No eslint-disable / @ts-ignore / console.error debug leftovers; no gate edits.

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md (red-first discipline)
Do not touch: package.json, ci.yml, justfile, .githooks (another worker owns them), eslint.config.mjs.

## Proof of Work

- RED: 'not ok - after a re-boot the daemon sender follows the new daemon port / next send comes from a sender bound to the new port' (worker run f9922a41, verified: test exists on branch, asserts old sender got 1 send, new sender bound to 4567 got the post-reboot send).
- Fix: main.ts +5/-1 - daemonSender cached per daemonSenderPort; getDaemonSender() re-creates on port change. Diff verified line-by-line by orchestrator; 0 suppressions/debug lines.
- Gates re-run by orchestrator at merged dev2 tip: node test/unit/audio-devices.test.js -> 'all audio devices tests passed'; worker ran npm test green (175 ok) + vscode-test 31 passing 0 failing (was 29/1; log /tmp/vscode-test.log).
- Follow-up found: audio-devices.test.js was never in the npm test/test:unit chains (predates this bean; z8p8 added the file without a script entry). Gate repair assigned to sonic-pi-x34b.
Residual: none
