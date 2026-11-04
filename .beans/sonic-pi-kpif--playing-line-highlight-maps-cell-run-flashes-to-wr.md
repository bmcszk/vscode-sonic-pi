---
# sonic-pi-kpif
title: Playing-line highlight maps cell-run flashes to wrong editor lines (no fragment offset)
status: in-progress
type: bug
priority: normal
created_at: 2026-11-04T18:14:56Z
updated_at: 2026-11-04T18:59:55Z
---

sonic-pi-kpif  in-progress   bug  [normal]                                             
Playing-line highlight maps cell-run flashes to wrong editor lines (no fragment offset)
──────────────────────────────────────────────────                                     
                                                                                       

  # Bug: runWithText fragment runs report /flash lines relative to the        
  fragment; highlighter maps them absolutely                                  
                                                                              
  ## User report (2026-11-04, trial of branch run-cell-and-highlight)         
                                                                              
  • Run cell on cloud_beat.pi blocks: "highlights in wrong lines"             
  • Whole-file run: bassdrum_schleife loop highlights only do+end lines       
  (upstream depth issue, see below), define body lines flash scattered        
                                                                              
  ## Evidence (parent live captures, flash-probe2/3/4 in session dir)         
                                                                              
  • bassdrum_alone as 1 file lines 42-67 fragment: flashes at fragment lines 3-
  13 (define body) + 17/26 - i.e. FRAGMENT-relative, NOT file-relative.       
  • spider-server.rb:302 /run-code accepts (token, code, workspace?, silent?) -
  NO firstline param; runtime.rb __spider_eval hardcodes firstline=1 (only    
  deducts leading #**nosave** lines).                                         
  • Whole-file with extension utf8.encode path: 275 flashes, no errors.       
  bassdrum loop: ONLY 58/67 (do/end block-flash). Call lines never flash:     
  upstream runtime.rb:533 __caller_workspace_line walks caller_locations(2,   
  50) max$depth; bassdrum(3 nested with_fx + method frames) exceeds 50$nil.   
  SAME capture: hihat call line (1 fx) DOES flash (x19) - discriminates       
  depth$call-line vs block lines.                                             
  • Whole-file invalid-UTF8 error in early probe was probe artifact (raw osc- 
  js send lacks extension$utf8.encode latin1-write); product path correct     
  (extension file has valid UTF-8 "u00df" in line 3 comment).                 
                                                                              
  ## Fix contract (Phase C)                                                   
                                                                              
  1. src/codelenses.ts runWithText args add block start line; src/source-     
  runner/main.ts runCode(code, offset): when offset>0, prepend offset inert   
  comment lines (offset lines of '#', enough to push fragment to its file     
  position) before utf8.encode/send; store pending offset.                    
  2. /run/started (jobid, workspace) subscription: record offset per jobid;   
  /flash resolves editorLine = flashLine - 1 + (offsetPerJob.get(jobid) ?? 0);
  /run/ended deletes map entry. Default 0 for whole-file runs. Offset map     
  lives in PlayingLineHighlighter (src/playing-lines.ts).                     
  3. Whole-file behavior unchanged; multi-run concurrency: offsets keyed by   
  jobid.                                                                      
  4. tests: codelenses (args carry block line) + playing-lines (map: fragment 
  line + offset -> editor line; per-jobid isolation; cleanup on ended). red-  
  >green.                                                                     
  5. README note in getting-started remains valid.                            
                                                                              
  ## Non-fixable here (upstream Sonic Pi): call-site lines for deep stacks    
  never                                                                       
  flash (caller_locations(2,50) cap; runtime.rb:533). Do/dne block lines still
  flash so loops remain visibly active; GUI has identical behavior. ACTION:   
  file upstream issue at sonic-pi-net/sonic-pi with capture evidence.         
                                                                              
  AC: [ ] red->green offset tests; [ ] npm test all suites; [ ] e2e green; [ ]
  cells highlight the right editor lines (verified vs cloud_beat by user); [ ]
  upstream issue filed (link in bean).                                        
                                                                              
  Stop rule: src/codelenses.ts, src/source-runner/main.ts, src/playing-lines. 
  ts,                                                                         
  their tests only. Anything else STOP.                                       
                                                                              
  Upstream deeper-half filed: sonic-pi-net/sonic-pi#3606 (issues open,        
  evidence                                                                    
  table included). Worker dispatched for the offset fix on branch run-cell-and-
  highlight.                                                                  
                                                                              
  ## Proof of Work (parent-verified 2026-11-04)                               
                                                                              
  Worker 3b93c17e shipped variant B (commit 2dac12e) after a supervisor round-
  trip flagged my contract's padding+map double-count (padding alone already  
  shifts daemon lines to file-absolute). Parent re-verified: npm test all     
  suites                                                                      
  green, live e2e gate green. Map: /run/started -> runStarted(jobid, offset); 
  flash resolves (line-1)+offset; runEnded cleans; stop-all clears. Research  
  doc                                                                         
  updated (padding plan marked rejected). Trial build installed in both       
  profiles for user re-test of cloud_beat.pi.

## Variant A rework (2026-11-04, worker f8c5b91a + parent evidence, commit 283ff96 + doc/comment fix 7c560ad)

User re-test caught variant B wrong live: flashes may race ahead of the 'Starting run N' /log/info that armed the offset map -> first triggers painted at top of file; runOffset=offset also double-shifted cell error lines (main.ts:368 evidence). Parent live probes established: /flash args[0] jobid DOES identify the run (fresh-daemon chain j0->j1), the race is the killer; padding derived correctly vs runtime.rb __spider_eval firstline (1 - leading #__nosave__ count, passed to eval) compensates the safeMode prefix 1:1 -> padN = offset makes flash AND error lines file-absolute in both safe-mode states (live-probed [61,63,64] from a line-60 block; safe-mode on and off). Variant A shipped stateless: pad in runCode, runOffset pinned 0, no map/pending/started-ended plumbing. Worker's own live probe + parent re-verified gates: all 6 suites green, e2e gate green, vsce ok (vsix deleted).

NOTE: 'more flashes than expected' from OTHER still-running jobs (e.g. an earlier whole-file run's bassdrum loop pulsing the define body) is Sonic Pi semantics (runs stack until Stop), not a mapping defect; upstream call-site depth cap (#3606) unchanged." 2>&1 | tail -1
