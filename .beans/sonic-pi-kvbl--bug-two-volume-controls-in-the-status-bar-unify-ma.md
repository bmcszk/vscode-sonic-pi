---
# sonic-pi-kvbl
title: 'Bug: two volume controls in the status bar - unify master volume into the mixer item'
status: todo
type: bug
priority: normal
created_at: 2026-11-19T23:06:30Z
updated_at: 2026-11-19T23:06:30Z
parent: sonic-pi-6fiz
---

# Bug: status bar shows TWO volume controls; unify

## Research (verified this session)
src/statusbar.ts has TWO volume-bearing items: this.item (priority 100, command 'vscode-sonic-pi.masterVolume' -> master volume prompt, text = '{state}/{version}/{volume}') AND this.mixerItem (priority 98, command 'vscode-sonic-pi.mixer' -> popover; item text 'drive X vol Y%' from the /mixer/settings push, and the popover ALSO drives volume). Both show a volume number: 100-priority item = master-volume prompt, 98 = mixer summary - user sees two controls saying different 'volume' things (master vs mixer/main volume - they are different daemon routes but the UX reads as duplicates).

## Fix direction
ONE item owns volume: the mixer popover item becomes the single volume surface (its popover drives /mixer-output-volume AND /mixer-drive + filters; its item text shows the live volume). The master-volume prompt merges into the popover's 'Master volume' entry (QuickPick action with input box) instead of being the leftmost item's click command. The 100-priority item keeps server state + version only. Migration must keep 'the box opens at the volume this window last set' (line 52-54 behavior) and the cold-window silent guard.

## Acceptance criteria
- [ ] Exactly ONE statusbar item exposes a volume affordance (unit: item count + command mapping)
- [ ] Volume still settable to the same daemon routes (both master-volume and mixer-drive paths preserved per existing unit contracts)
- [ ] Cold-window dispatch silent; npm test + run-unit + integration green; budgets hold; zero suppressions
