---
# sonic-pi-um0l
title: 'Harness: omni provider extension missing in child agents — stream deaths without terminal marker'
status: completed
type: bug
priority: normal
created_at: 2026-11-03T18:05:09Z
updated_at: 2026-11-04T13:37:01Z
---

# Harness defect (found 2026-11-03 via pi-subagents)

4+ child runs died with 'server_error: Upstream stream ended without a terminal marker' — always at final-message composition, never mid-work. The resumed run surfaced the harness error verbatim:

'Agent ran as a background child without the ambient extensions. In the parent, provider omni for omni/_worker:medium is registered by an extension that did not load in this child, so the child sent its requests without that extension's provider, through the built-in provider of the same id if there is one.'

So children (researcher, worker omni/_brainer and _worker:medium) fell back to a built-in provider whose long streams drop. Fix is OWNER-SIDE (user's pi config/instructions, agent can't register extensions for harness): per harness options — list the extension in subagentOnlyExtensions or extensions in agent frontmatter, or register via registerRequiredChildExtensions.

## AC (for the user / next session after config change)
- [x] A dispatch of a worker agent runs WITH the omni extension (verify via the harness notice: no 'without the ambient extensions' warning on a test dispatch)
- [ ] Simplest mitigation adopted meanwhile in dispatch contracts: workers instructed to write their final report to the artifact file FIRST, then compose the chat message (stream death then only loses the goodbye) — note: this rule went into effect live this session but dates from later, retro-wired here.

Refs: sonic-pi-awd-fed? (none — standalone)

## Root cause + fix (2026-11-04, parent-local diagnosis)

settings.json subagents.defaultExtensions=[pi-permission-system, atuin] was stamped onto EVERY agent as its extensions field (pi-subagents src/agents/agents.js:1167-1171 applySubagentDefaultExtensions). child-tool-plan.js then computes disableAmbientExtensions = ceiling.denyExtensions || extensions !== undefined, so ambient extension inheritance was OFF for all children: keenable tools missing (researcher failures) AND omni provider unregistered (workers fell back to built-in same-id provider with dying long streams -> 'no terminal marker'). The two listed extensions loading fine masked the loss.

FIX APPLIED: key renamed defaultExtensions -> defaultSubagentOnlyExtensions (same two entries). defaultSubagentOnlyExtensions is added ON TOP of ambient discovery (child-tool-plan.js ordinary branch keeps ambient + subagentOnlyExtensions), preserving permission-system/atuin while restoring keenable + omni. Backup: ~/.pi/agent/settings.json.bak-um0l. JSON validated.

## Proof of Work

- Probe 1 (worker a29a287c, post-fix): completed clean, 1-line reply, NO stream death; session jsonl contains 0x 'without the ambient extensions' and 4x provider omni on request records -> AC1 (real omni provider in child) SATISFIED.
- Probe 2 (researcher d2c61daf, post-fix): keenable_search availability check in flight -> AC for ambient tools.

Probe 2 (researcher d2c61daf, post-fix): keenable_search call SUCCEEDED in child (results received, cited HN + Patreon first results), structured report survived final-message transmission intact -> ambient extension tools available to researchers. AC1+AC2 SATISFIED; probes green on both failure signatures. No stream deaths since fix.
