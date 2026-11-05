---
# sonic-pi-oow6
title: 'Lint hardening: eslint+prettier into npm test and GHA CI (bulletproof gate, zero findings)'
status: in-progress
type: task
priority: normal
created_at: 2026-11-05T22:19:20Z
updated_at: 2026-11-05T22:23:59Z
---

sonic-pi-oow6  in-progress   task  [normal]                                               
Lint hardening: eslint+prettier into npm test and GHA CI (bulletproof gate, zero findings)
──────────────────────────────────────────────────                                        
                                                                                          

  sonic-pi-oow6  in-progress   task  [normal]                                 
  Lint hardening: eslint+prettier into npm test and GHA CI (bulletproof gate, 
  zero findings) ──────────────────────────────────────────────────           
                                                                              
  /tmp/bean-lint.md                                                           
                                                                              
  ## Notes                                                                    
                                                                              
  • Phase A researcher dispatched (run 37b0013d) on branch oow6-lint; report- 
  first discipline (docs/research/lint-hardening.md committed+pushed before   
  any chat reply).                                                            
  • Phase B becomes mechanical from the research doc: config + scripts + CI   
  patch block; proper await/void on the 4 floating promises (not suppressions),
  lint wired into npm test AND ci.yml, zero-finding gate.

## USER DIRECTIVE (2026-11-05, binding): all lint findings fixed HONESTLY in code

- NO lint-config loosening, NO suppressions (@ts-ignore/@ts-expect-error/eslint-disable), NO rule deletions to silence findings, NO renaming prettier rules into oblivion. Every one of the 38 findings (34 prettier formatting + 4 no-floating-promises) must be fixed by REAL code changes: properly awaited/void-with-explicit-pragmatic-commitration... properly handled promises (await or documented fire-and-forget with a functional reason in code), and real formatting applied by running prettier ONCE as part of the honest fix pass (not by weakening the prettier config).
- The config modernization (flat config, tab preservation) PROCEEDS as research proposes - but the FINDINGS count must reach zero on the FIRST lint run after config upgrade with the ORIGINAL rules intact. If the new config禁 discovers NEW errors, those get fixed in code too.
- Reviewer note: after Phase B lands, re-run npx eslint with the OLD .eslintrc semantics mentally... simpler: the honest gate is 'eslint with the NEW config reports 0 problems on src+test, AND no suppression markers exist anywhere in the diff (grep-based gate) AND the diff shows real code changes per finding'.

## Gate additions (contract binding for Phase B)
- [ ] No 'eslint-disable', '@ts-ignore', '@ts-expect-error', '@ts-expect-error --typescript' or suppression markers anywhere in the repo (grep gate in CI or package test)
- [ ] tsc strict-relevant findings resolved by real code
- [ ] Formatting findings fixed by prettier 3 run once (config unmodified from research proposal's tab-preserving form)
