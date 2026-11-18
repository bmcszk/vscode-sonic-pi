---
# sonic-pi-jhpc
title: 'Bug: LSP client speaks newline-delimited JSON, real servers require Content-Length framing'
status: in-progress
type: bug
priority: normal
created_at: 2026-11-18T14:41:44Z
updated_at: 2026-11-18T14:41:57Z
parent: sonic-pi-858b
---

# Bug: LSP client speaks newline-delimited JSON, real servers require Content-Length framing

## Research (root cause, reproduced)
src/lsp/client.ts (ce06) encodes every message as `JSON.stringify(message) + '\n'` (encodeMessage, line 55) and onServerStdout splits on '\n' + JSON.parse per line. The LSP/JSON-RPC stdio transport (LSP spec §Base Protocol) requires header framing: 'Content-Length: <bytes>\r\n\r\n' before each message body. The ce06 fake test server echoed the same wrong format, so 12/12 unit tests passed while the real ruby-lsp never answered: orchestrator probe (scratch-probe.js) -> 'timeout waiting for initialize reply' at exactly 5009ms, server stderr EMPTY (server alive, awaiting a well-framed request). Contract gap: the ce06 bean said 'minimal JSON-RPC echo' without pinning the transport format - the smoke test (u3ui) caught what the unit harness could not.

## Fix (TDD)
- Red: a unit test where the FAKE server speaks REAL Content-Length framing -> client must complete initialize; and a fake client-side capture: bytes the client writes must start with Content-Length header.
- Fix encodeMessage + onServerStdout parser: header-framed writes; buffered header/body reader on stdout (\r\n\r\n delimiter, Content-Length byte count). Keep 5s request timeout; consider raising initialize-specific timeout only if smoke proves cold-start > 5s (separate concern - do not conflate).
- The u3ui real-server smoke then must pass end-to-end (initialize + pull diagnostics + Prism items).

## Acceptance criteria
- [ ] Client writes Content-Length-framed requests (unit-proven via captured stdin bytes).
- [ ] Client parses framed replies (fake server with real framing; initialize completes).
- [ ] New-unit red before fix; all 12 existing ce06 tests updated to the real framing and green.
- [ ] u3ui real-server smoke passes against /usr/bin/ruby-lsp (initialize + pull + Prism diagnostics).

## Skills for coder
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/.agents/skills/coding-rules/SKILL.md
