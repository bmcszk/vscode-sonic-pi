---
# sonic-pi-pvuc
title: 'Integration: mixer popover round-trips against the fake daemon (F3)'
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:30:04Z
updated_at: 2026-11-17T13:03:37Z
parent: sonic-pi-wcgd
blocked_by:
    - sonic-pi-v3do
    - sonic-pi-s155
    - sonic-pi-r0om
---

sonic-pi-pvuc  in-progress   task  [normal]                        
Integration: mixer popover round-trips against the fake daemon (F3)
──────────────────────────────────────────────────                 
parent: sonic-pi-wcgd                                              
──────────────────────────────────────────────────                 
                                                                   

  # Task: Integration - mixer popover round-trips against the fake daemon (F3)
                                                                              
  ## Files                                                                    
                                                                              
  • extend test/integration/suite/server-lifecycle.integration.js (the volume-
  prompt test at 33-57 is the pattern; add the mixer twin)                    
                                                                              
  ## Notes                                                                    
                                                                              
  Uses Wave 0 mixer-settings control: push state -> open popover -> accept -> 
  assert /mixer-drive on the wire.                                            
                                                                              
  ## Acceptance criteria                                                      
                                                                              
  [ ] fake push updates the item text                                         
  [ ] popover selection sends the expected route with the token               
  [ ] suite time +<=2s                                                        
                                                                              
  ## Skills for coder                                                         
                                                                              
  • /home/blaze/.agents/skills/typescript/SKILL.md



## Done (dev2 08012bd)
- push->item assertion kept (host.sendControl mixer-settings -> item shows drive 1.5 / vol 60%).
- popover QuickPick drive replaced with setDriveForTest seam (src/source-runner/extension.ts); integration asserts /mixer-drive(token, 1.5, 1) on the fake's wire.
- Gates: lint, prettier, npm test, vscode-test all green (29 passing in main suite; attach/takeover suites run separately, 1 passing each).

## Proof of Work (2026-11-16/17, parent-verified)

Worker commits 9510831 + 08012bd on dev2 (parent-verified locally):
- push->item: /fake/mixer-settings control -> mixer statusbar item shows 'drive 1.5' + 'vol 60%'
- drive wire: setDriveForTest seam -> /mixer-drive(token, 1.5, 1) asserted on the fake's wire
- popover modal interaction stays unit-covered (mixer-panel.test.js) - honest scope note per the bean

Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, integration 29+1+1 passing, suppressions 0.
Residual: none.
