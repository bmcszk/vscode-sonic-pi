---
# sonic-pi-zlzp
title: 'E2E coverage: every feature shipped this session gets an end-to-end test'
status: completed
type: task
priority: normal
created_at: 2026-11-05T22:39:23Z
updated_at: 2026-11-06T00:56:38Z
---

# Goal (user directive): every feature shipped this session gets an e2e test.

One integration test per user-visible feature (16 inventoried at open; grew to 18 cases
with the adopt-keepalive and takeover labels), each named after the behavior it guards.
Layer per docs/research/testing-strategy.md: real Extension Development Host via
@vscode/test-electron, fake daemon (test/integration/fake-sonic-pi.js) injected through
the extension's settings seam; live-daemon e2e stays opt-in (test/e2e/protocol.js).
Full per-feature table: e2e-report.md (tracked in repo root).

## Completed (2026-11-06)

All 18 integration tests green on dev (16 feature-host + attach adopt-keepalive + takeover).
Gates on dev: eslint clean, unit 0 fail, live-daemon e2e green, integration 18/18.
Product bugs found & fixed by this work: dead playing-indicator wiring (triggerPlay cell keys),
missing stopServerOnLastEditorClose manifest contribution, OscSender dropped-first-send
(ephemeral bind), attach-path keepalive hole (window reload killed sound mid-play),
transient zero-tab shutdown (debounced), dead send queue after stopServer, kernel affinity
(notebooks had no kernel auto-selected), statusbar prompt prefill, editor-close tab counting.
Report: e2e-report.md (in zlzp worktree, merged to dev).
