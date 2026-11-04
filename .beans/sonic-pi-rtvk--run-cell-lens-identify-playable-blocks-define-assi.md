---
# sonic-pi-rtvk
title: 'Run cell lens: identify playable blocks (define / assignment / with_fx semantics)'
status: in-progress
type: task
priority: normal
created_at: 2026-11-04T12:55:01Z
updated_at: 2026-11-04T12:55:32Z
---

# Run cell lens: which blocks are actually playable? (user-reported refinement of sonic-pi-qlkd)

User (non-specialist, explicitly ordered online deep research): "Run cell won't work for define. Not sure about with_fx wrapping live_loop, or assignment-only chord blocks. Identify what sections should have Run cell."

## Problem

The current lens filter (hasPlayableLine: block needs one non-comment, non-setting line) mislabels:
- define :chord_player do ... end -> silent registration, lens wrongly shown
- chord_low_1 = chord :c2, :maj9 -> assignment-only block: silent AND variables may not persist across Sonic Pi runs (to be verified by research) -> lens actively misleading
- with_fx :reverb do live_loop ... end -> probably audible, semantics of re-running unknown

## Phase A - research (contract)

Deep online research against PRIMARY sources only (Sonic Pi built-in tutorial, sonic-pi.net docs/tutorial, github.com/sonic-pi-net source + issues, Sonic Pi forum threads; secondhand blogs only for corroboration):
1. Does running a define block alone produce sound? Do definitions persist across Run invocations in a session (can a later single-block run call a function defined by an earlier run)?
2. Do plain local variables (x = ...) persist across Runs? What does the official tutorial say (Variables / Variable Scope / Runs sections)? What is the sanctioned persistent form (set/get/tilde-vars)?
3. What does a single-block run of "with_fx ... do live_loop ... end" do - sound? what happens on re-run (fx stacking? live_loop name collision)?
4. When only a block is run (runWithText), are names defined elsewhere in the file available? What error results if not?
5. Enumerate construct classes a lens filter must classify: define, assignment-only, with_fx wrappers, live_loop, play/sample/synth statements, use_*/set_* settings, comments - for each: audible on single-block run? safe/misleading to offer Run cell?

Deliverable: docs/research/run-cell-semantics.md in-repo (durable, no /tmp) with findings per question with primary-source citations (URLs + quotes), a classification table, and a recommended implementable rule (regex-detectable where possible, explicitly noting what regex CANNOT see, e.g. nesting).

## Phase B - implementation (after Phase A accepted)

Red->green in test/unit/codelenses.test.js; rule in src/codelenses.ts; README getting-started step 4 updated if the user-facing rule changes; npm test + e2e + package; release patch per release flow.

## AC
- [ ] Phase A report committed with citations and a concrete rule proposal
- [ ] Phase B red->green, all suites green, live e2e green
- [ ] User-facing README text matches the shipped rule

Stop rule: Phase A writes ONLY docs/research/run-cell-semantics.md. Phase B touches ONLY src/codelenses.ts, test/unit/codelenses.test.js, README.md, package.json version. Anything else -> STOP.

## Notes

Phase A researcher dispatched (run adf523c1) on branch rtvk-research; report-first discipline (docs/research/run-cell-semantics.md committed+pushed before any chat reply). Phase B dispatch after user accepts findings.
