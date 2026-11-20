---
# sonic-pi-03nb
title: 'Bug: Run cell / Mute cell codelens renders twice (same duplicate-provider cause as Run/Stop)'
status: completed
type: bug
priority: normal
created_at: 2026-11-19T23:06:04Z
updated_at: 2026-11-19T23:21:21Z
parent: sonic-pi-6fiz
blocked_by:
    - sonic-pi-gqg7
---

# Bug: Run cell Mute cell lenses render TWICE

## Research
Same mechanism as the Run/Stop duplicate (sonic-pi-gqg7): two CodeLensProvider instances for 'sonic-pi' (src/extension.ts:187 + src/source-runner/extension.ts:751), each producing block lenses ('$(play) Run cell') and mute lenses ('$(sync) Mute'). Each instance holds its OWN SonicPiCodeLensProvider (mute registry included), so the two rendered lens rows also disagree when one side's mute registry flips - user sees duplicated 'Run cell Mute' rows.

## Fix direction
Shares the gqg7 fix: one provider instance registered once. This bean verifies the BLOCK+MUTE lens rows specifically (single 'Run cell' per block; single 'Mute' per muteable block; mute state consistent).

## Acceptance criteria
- [x] provideCodeLenses returns exactly ONE 'Run cell' per playable block and ONE mute lens per muteable block (unit-proven)
- [x] Two-provider registration eliminated (same one-instance fix as gqg7 - this bean is the verification half)
- [x] Mute flip consistent (single registry)
- [ ] npm test + run-unit green; budgets hold; zero suppressions

## Proof of Work

- Covered by the same fix + suite as sonic-pi-gqg7 (single provider): one 'Run cell' + one Mute per block asserted in codelens-single-provider.test.js (4/4 mine green: muting through the provider flips the one rendered mute row); mute registry consolidated to one instance, so the single row flips consistently.
- 51-suite unit battery + 42/0 integration verified by orchestrator; merged 3cd244b.
Residual: none
