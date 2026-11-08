---
# sonic-pi-858b
title: 'Ruby LSP integration: embedded LSP client for sonic-pi files (error highlighting as you type)'
status: todo
type: epic
priority: normal
created_at: 2026-11-05T21:20:27Z
updated_at: 2026-11-08T12:20:19Z
---

sonic-pi-858b  todo   epic  [normal]                                                         
Ruby LSP integration: embedded LSP client for sonic-pi files (error highlighting as you type)
──────────────────────────────────────────────────                                           
                                                                                             

  # Ruby LSP integration epic                                                 
                                                                              
  Goal: synthesize the biggest live-coding gap - real-time syntax error       
  highlighting (squiggles) for .pi/.rb Sonic Pi files - by embedding our own  
  LSP client to the system ruby-lsp, with a Sonic Pi-taught addon. User       
  decision: option (a), deferred ('not for now'): this epic holds the wave    
  until picked up.                                                            
                                                                              
  ## Research basis (Phase A complete: docs/research/ruby-lsp-integration.md, 
  verified)                                                                   
                                                                              
  • ruby-lsp gives Prism syntax errors on every keystroke (missing end,       
  unclosed strings) - the #1 live-coding pain we don't cover today            
  • ruby-lsp does NO undefined-method analysis: DSL methods (live_loop/play/...
  ) never flagged - concern moot                                              
  • Shopify's VS Code extension cannot serve us at all: activation only on    
  Gemfile.lock presence; document selector hard-codes ruby ids; no Bundler    
  context in Sonic Pi installs                                                
  • The working path: OUR OWN jsonrpc client spawns /usr/bin/ruby-lsp with    
  documentSelector 'sonic-pi'; optional project-local addon for DSL           
  completion/navigation                                                       
  • Keep our static completions (synths/fx/samples docs) client-side - ruby-  
  lsp can't supersede them                                                    
                                                                              
  ## Why deferred (user call 2026-11-05)                                      
                                                                              
  Current priorities: takeover-on-play UX polish, 0.3.0 release, store listing.
  The spike-then-build plan stays fully researched, so pickup cost is low.    
                                                                              
  ## Planned wave (draft; becomes tasks on pickup)                            
                                                                              
  1. spike half-day: spawn system ruby-lsp against a .pi file, confirm Prism  
  diagnostics flow + version drift handling (0.26.x experimental addon API    
  pinning)                                                                    
  2. task: LSP client lifecycle (spawn/didOpen/didChange/didClose, telemetry  
  off, graceful fallback when binary absent)                                  
  3. feature: diagnostics -> editor squiggles (+ settings: rubyLspIntegration 
  on/off, executable path override)                                           
  4. feature (optional stretch): Sonic Pi DSL addon - declare builtin methods 
  so advanced requests stop erroring; completion injection Hook               
  5. docs + knob in README/SETTINGS                                           
                                                                              
  ## AC (epic closure)                                                        
                                                                              
  [ ] user re-picks this epic in a future session                             
  [ ] wave tasks complete with gates green (suites + e2e + package)           
  [ ] diagnostics verified against a syntax-broken .pi file live

## User correction (2026-11-07, binding): doc reframed, no code changes yet

The user clarified the research intent: EMBED the system ruby-lsp SERVER BINARY (/usr/bin/ruby-lsp, v0.26.10 present locally) - our extension spawns it and speaks LSP itself. The Shopify VS Code extension analysis is only an avoid-this appendix.

Actions running:
- Research doc rewrite in worktree 858b-research-2 (branch off dev): embedded-server framing first (server.rb maps any languageId to :ruby is the load-bearing fact), Shopify demoted to appendix, verification re-run against the INSTALLED 0.26.10 gem (not GitHub main), spike becomes phase 1.
- NO code changes until user greenlights the epic (their standing state: parked, decision to resume pending).
