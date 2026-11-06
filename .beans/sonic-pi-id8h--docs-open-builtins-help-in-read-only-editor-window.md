---
# sonic-pi-id8h
title: 'Docs: open builtins help in read-only editor window instead of log channel'
status: draft
type: feature
priority: normal
created_at: 2026-11-06T12:57:05Z
updated_at: 2026-11-06T13:00:13Z
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
