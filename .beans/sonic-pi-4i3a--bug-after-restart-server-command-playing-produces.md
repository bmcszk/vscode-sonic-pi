---
# sonic-pi-4i3a
title: 'Bug: after Restart Server command, playing produces nothing'
status: in-progress
type: bug
priority: normal
created_at: 2026-11-06T12:58:40Z
updated_at: 2026-11-06T13:43:50Z
---

sonic-pi-4i3a  in-progress   bug  [normal]                 
Bug: after Restart Server command, playing produces nothing
──────────────────────────────────────────────────         
                                                           

  # Bug (user report, 2026-11-06): after "Sonic Pi: Restart Server", nothing  
  works                                                                       
                                                                              
  User: 'after doing sonic pi: restart server - nothing works :('             
                                                                              
  ## Likely candidates (to verify, not assume)                                
                                                                              
  1. restartServer re-arms portsInitalized (landed in zlzp work) - but the NEW
  daemon may be unadopted: keepalive not started -> kill switch kills it ~100s
  later silently.                                                             
  2. Old daemon's /daemon/exit may race the fresh boot (exclusive reply-port  
  bind EADDRINUSE against a zombie receiver).                                 
  3. Boot-log route parsing (daemonPort from booter log) may fail on the      
  restarted daemon, leaving daemonPort = -1 => no keepalive.                  
  4. Existing e2e covers run-state bookkeeping on restart, NOT the full       
  restart-to-playing path with keepalive.                                     
                                                                              
  ## Triage checklist (before any fix)                                        
                                                                              
  [ ] Reproduce: play -> restart server -> play -> does sound return? Watch   
  daemon.log.                                                                 
  [ ] After restart, verify keepalive flows to the NEW daemon port.           
  [ ] Verify reply-port receiver rebinds (no deaf window).                    
  [ ] Add e2e: restart -> /version on new daemon + keepalive flowing + play   
  works.                                                                      
  [ ] If keepalive missing: same fix class as adopt-keepalive (zlzp feature   
  17).                                                                        
                                                                              
  ## Triaged + fixed (2026-11-06) - pending user verification                 
                                                                              
  Root cause (verified by test): restartServer killed the old daemon but the  
  follow-up startServer scanned /proc BEFORE the dying spider process         
  disappeared, adopted the corpse, and every play after Restart Server went   
  nowhere.                                                                    
                                                                              
  Fix: restart forces a one-shot managed boot (forceManagedBootOnce skips the 
  scanner once). TDD: red test 'restart ignores a still-visible dying server  
  and boots its own daemon'. Gates: unit green, lint clean, live-daemon e2e   
  green, on dev (91485bb).                                                    
                                                                              
  Remaining checklist item: user verification (play -> restart -> play ->     
  sound                                                                       
  returns).

## Bonus UX fix from user verification session (2026-11-06)

The user's restart report was actually the two-window informational flow working correctly - but the message read like an error ("Cannot receive Sonic Pi responses on port N") and hid that sound keeps playing. Messages rewritten in user language in both places:
- main.ts receiver-failure log: what still works, why logs went elsewhere, and that Play moves them here.
- notebook.ts takeover-failure error: plain terms.

Verified by user: "it works". Commit 4e973c1.
