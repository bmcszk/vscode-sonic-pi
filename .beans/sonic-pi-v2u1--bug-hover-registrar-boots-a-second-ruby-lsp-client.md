---
# sonic-pi-v2u1
title: 'Bug: hover registrar boots a second ruby-lsp client - two server processes per window'
status: todo
type: bug
priority: normal
created_at: 2026-11-18T15:13:50Z
updated_at: 2026-11-18T15:33:57Z
parent: sonic-pi-858b
---

# Bug: hover registrar boots a second ruby-lsp client - two server processes per window

## Research (probes + code read, this session)
- src/lsp/hover.ts registerLspLanguageFeatures has its OWN boot-on-first-.pi-document listener creating a NEW LspClient; src/source-runner/extension.ts registerLspDiagnostics does the same. activate() calls both -> opening a .pi file spawns TWO ruby-lsp processes.
- Consequences beyond resource waste: (1) the hover client never sends didOpen, so its server never knows any document (probe: hover without didOpen -> null - tolerated but it means that server can never do document-aware work); (2) per-client lifecycle states (degraded on one, ready on the other) can disagree.
- Root cause: jg86's contract allowed 'its own listener' as the smaller-diff option - a contract design error, now owned here.

## Fix direction (lands inside sonic-pi-f6pd's capability work, one writer)
- ONE shared client per extension instance: extract a boot-once module (e.g. src/lsp/shared-client.ts) owning lazy client creation + ready-notification; both registrars consume the same instance via the structural seam; dispose rides context.subscriptions once.
- Both registrars keep their swapClient behavior; hover controller gains didOpen handling OR relies on the shared client having a single didOpen owner (diagnostics controller already sends it) - decide by smaller diff, document in the bean.

## Acceptance criteria
- [ ] One LspClient instance per window (unit-proven: boot path returns the same instance to both registrars).
- [ ] Zero double-spawn on .pi open (unit-proven via spawn-counting fake).
- [ ] Full battery green; lint/prettier clean; budgets hold.

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md
- /home/blaze/.agents/skills/tdd/SKILL.md

## Proof of Work

- Fixed inside sonic-pi-f6pd: per-registrar boot listeners deleted (hover.ts -16 net, extension.ts -19 net); ensureLspClient() is the single boot-once owner.
- Unit-proven: 'both registrars get the same client instance and it starts exactly once'; 'opening two .pi documents boots the shared client once, not once per registrar' (spawn-counting fake, factory-count assertions).
- Orchestrator re-ran full battery at dev3: 35 suites exit 0.
Residual: none
