---
# sonic-pi-xow5
title: 'Test reliability: real integration tests for extension wiring + research-backed strategy'
status: completed
type: task
priority: normal
created_at: 2026-11-05T22:17:45Z
updated_at: 2026-11-06T13:04:53Z
---

# Test reliability (user: "are you even testing your code? unit? integration? research how to do both reasonably - I want it reliable!")

## Honest current-state audit (2026-11-05)
- 16 unit suites (131 assertions): pure logic under fakes - logic bugs caught, wiring NOT.
- activation.test stubs vscode via Module._load: catches module-load crashes only.
- e2e/protocol.js drives the raw daemon protocol, not our extension code.
- Wiring edits (command handlers, notebook controller, run-code routing) shipped without any
  test covering the real call chain - the cold-window "no logs, no feedback" bug class.

## Phase A - research (delivered: docs/research/testing-strategy.md)
@vscode/test-electron real Extension Development Host + fake daemon injected through the
settings seam; unit (plain node) / integration (electron host) / live-daemon (opt-in) layers;
xvfb on CI.

## Phase B - delivered (bean sonic-pi-zlzp)
Integration harness + 18 tests covering every session feature; wired as npm run
test:integration; found and fixed 9 real product bugs (see zlzp ledger + e2e-report.md).

## Completed (2026-11-06)

Delivered via bean sonic-pi-zlzp:
- Research: docs/research/testing-strategy.md (committed, pushed)
- Implementation: integration harness + 18 e2e tests, npm run test:integration, wired in CI order
- Outcome: 9 real product bugs found and fixed (see zlzp ledger + e2e-report.md)
- Gates: integration 18/18, unit green, lint clean
