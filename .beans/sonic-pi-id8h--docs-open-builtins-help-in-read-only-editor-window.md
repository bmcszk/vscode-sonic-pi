---
# sonic-pi-id8h
title: 'Docs: open builtins help in read-only editor window instead of log channel'
status: completed
type: feature
priority: normal
created_at: 2026-11-06T12:57:05Z
updated_at: 2026-11-06T14:38:38Z
---

# Feature request (user, 2026-11-06): docs in an editor window, not the log channel

Today the Docs quick-pick (P3, docs-browser.ts) shows builtin help text in the 'Sonic Pi Log'-style output channel. The user asks: can docs land in an EDITOR window (read-only) instead?

## Candidate design (draft, to refine)
- Reuse the docs pick; on selection, open a virtual read-only document (custom scheme like 'sonicpi-docs:', showTextDocument preview:true).
- One read-only tab per lookup (simplest); log channel keeps run output/cues only.

## Open questions for triage
- Render markdown (webview) or plain text suffices?
- Should the docs tab auto-follow cursor symbol?
- Escaping/size limits for big builtins.

## AC (draft)
- [ ] Selecting a builtin from the quick-pick opens a read-only editor tab
- [ ] Content identical to today's channel output
- [ ] Log channel no longer carries docs dumps
- [ ] e2e: pick -> doc opens read-only with expected content

## Completed (2026-11-06, plain-text-first scope)

- Docs pick results open as read-only preview editor tabs on the 'sonicpi-docs:' scheme (TextDocumentContentProvider).
- 'Sonic Pi Docs' output channel removed from the dump path; log channels keep run output/cues.
- TDD: unit red->green + integration assertion (docs tab opens with builtin detail).
- Deferred (needs separate decision): markdown webview rendering, auto-follow cursor symbol.
- Gates on dev: lint clean, prettier clean, unit green, integration 16 passing (attach/takeover skip documented - live session running), live-daemon e2e green.

## Follow-up (user: 'command vscode-sonic-pi.docs not found' - honest root cause)

The docs editor-tab feature itself was tested (unit + integration green). The user's failure
was an ACTIVATION MANIFEST GAP: 6 contributed commands (incl. docs) lacked onCommand
activationEvents, so in a fresh window with no sonic-pi file open the palette showed
'command not found'. Fix: all 6 added + a permanent unit gate asserting every contributed
command activates. Lesson: e2e drove activation via the API directly (activateExtension()),
which masked manifest-level activation gaps; product surface tests must include
cold-window command dispatch.
