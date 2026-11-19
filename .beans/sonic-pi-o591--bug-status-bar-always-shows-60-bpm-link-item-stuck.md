---
# sonic-pi-o591
title: 'Bug: status bar always shows 60 bpm (Link item stuck at default)'
status: todo
type: bug
priority: normal
created_at: 2026-11-19T23:06:21Z
updated_at: 2026-11-19T23:06:21Z
parent: sonic-pi-6fiz
---

# Bug: Link bpm item shows 60 forever

## Research (verified this session)
src/statusbar.ts setLinkData keeps this.linkBpm only when a push provides it (line 132-134); formatLinkLabel shows '60' when bpm is undefined?? formatLinkLabel(undefined, ...) returns undefined -> item hidden (link-label.ts). '60' displaying means linkBpm GOT a value of 60 - i.e. the /link-bpm push fired with 60 (Sonic Pi default) - and then NEVER updated. Candidates: (1) the /link-bpm push handler only fires while the osc receiver is the CURRENT one (a restart re-creates the receiver; if the handler registers onGen-scoped it survives - verified registered every setupOscReceiver). (2) THE REAL SUSPECT: Sonic Pi only pushes /link-bpm when the session actually USES Link (use_bpm :link); otherwise bpm stays 60 from the mixer/settings push (statusbar setMixerSettings line 94-98 includes volume AND the item may show 60 from a stale default). Needs a live capture: play a loop with +bpm change and watch /link-bpm pushes on the wire.

## Fix direction
Capture the real push cadence first (e2e logs or fake control replay). If the real daemon pushes /link-bpm only on Link-enable, the item must render bpm from the SESSION tempo push instead (/use-bpm or the /mixer/settings push payload) or state clearly 'Link: off' instead of a misleading 60.

## Acceptance criteria
- [ ] The bpm shown always equals the session's actual current tempo (integration: bpm push -> item text, unit: formatLinkLabel truth table)
- [ ] No 60/0 shown when the session has pushed no tempo data (item hidden or explicit 'Link off')
- [ ] npm test + run-unit green; zero suppressions; budgets hold
