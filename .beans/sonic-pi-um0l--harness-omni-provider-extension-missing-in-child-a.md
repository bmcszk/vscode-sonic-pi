---
# sonic-pi-um0l
title: 'Harness: omni provider extension missing in child agents — stream deaths without terminal marker'
status: draft
type: bug
created_at: 2026-11-03T18:05:09Z
updated_at: 2026-11-03T18:05:09Z
---

# Harness defect (found 2026-11-03 via pi-subagents)

4+ child runs died with 'server_error: Upstream stream ended without a terminal marker' — always at final-message composition, never mid-work. The resumed run surfaced the harness error verbatim:

'Agent ran as a background child without the ambient extensions. In the parent, provider omni for omni/_worker:medium is registered by an extension that did not load in this child, so the child sent its requests without that extension's provider, through the built-in provider of the same id if there is one.'

So children (researcher, worker omni/_brainer and _worker:medium) fell back to a built-in provider whose long streams drop. Fix is OWNER-SIDE (user's pi config/instructions, agent can't register extensions for harness): per harness options — list the extension in subagentOnlyExtensions or extensions in agent frontmatter, or register via registerRequiredChildExtensions.

## AC (for the user / next session after config change)
- [ ] A dispatch of a worker agent runs WITH the omni extension (verify via the harness notice: no 'without the ambient extensions' warning on a test dispatch)
- [ ] Simplest mitigation adopted meanwhile in dispatch contracts: workers instructed to write their final report to the artifact file FIRST, then compose the chat message (stream death then only loses the goodbye) — note: this rule went into effect live this session but dates from later, retro-wired here.

Refs: sonic-pi-awd-fed? (none — standalone)
