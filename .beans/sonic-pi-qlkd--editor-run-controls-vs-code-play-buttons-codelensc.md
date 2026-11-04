---
# sonic-pi-qlkd
title: 'Editor run controls: VS Code play buttons (codelens/code-action) on Sonic Pi files'
status: completed
type: feature
priority: normal
created_at: 2026-11-03T17:30:50Z
updated_at: 2026-11-04T12:42:22Z
---

sonic-pi-qlkd  in-progress   feature  [normal]                                    
Editor run controls: VS Code play buttons (codelens/code-action) on Sonic Pi files
──────────────────────────────────────────────────                                
                                                                                  

  sonic-pi-qlkd  in-progress   feature  [normal]                              
  Editor run controls: VS Code play buttons (codelens/code-action) on Sonic Pi
  files ──────────────────────────────────────────────────                    
                                                                              
  # Request (user, 2026-11-03, verbatim)                                      
                                                                              
  VS Code text editors have controls e.g. for running tests. these controls   
  are visible on the top of the text file or sometimes on the left of text    
  file as "play" button.                                                      
                                                                              
  I need similar controls for pi sound files.                                 
                                                                              
  The beans task should be a deep online research and then implementation.    
                                                                              
  # What exists today (known)                                                 
                                                                              
  • Extension offers Run/Stop only via keybindings (F5/Alt+R/Alt+S) + command 
  palette (plus inline flash of the played region, per README). No clickable  
  editor-level run controls.                                                  
                                                                              
  # Phase A — deep online research (BEFORE writing any code)                  
                                                                              
  Research question: the canonical VS Code mechanism(s) for editor-attached   
  run                                                                         
  controls, and which fits Sonic Pi UX:                                       
                                                                              
  [ ] **CodeLens**: contributed via contributes.codelenses / CodeLensProvider 
  API — the "Run Tests" play control above functions in C#/Java/Jest is       
  CodeLens with a command (and icon via a committed UI command, e.g.          
  editor/CodeLens UI). What granularity: top-of-file, per-symbol, per-line? [ 
  ]                                                                           
  **Left-of-line play button**: how "run test in gutter" UIs actually   render
  —                                                                           
  is it a TextEditorDecorationType with gutterIcon (SVG data-URI), an inlay   
  hint, or a debug editor contribution? Which real extensions (dotnet test,   
  Jest, rust-analyzer run button) use which, with repo links.         [ ]     
  **Code actions**: lightbulb/title-command variant with $(play) codicon in   
  the                                                                         
  title — secondary, lower discoverability; note as fallback.        [ ]      
  **Notebook parity**: sonic-pi-book cells already have run commands (Run     
  Notebook Cell) — how does the extension's cell logic decide the unit        
  (extension.ts runCell), and can text-file controls reuse the same           
  segmentation?                                                             [ 
  ] **Sonic Pi semantics flight-check**: confirm the "unit" the upstream  cell
  logic treats as runnable (code between blank lines / the runCell            
  segmentation in src/extension.ts) so the button granularity maps to real    
  semantics, not invented ones (whole file / cell / selection all exist as    
  commands today — buttons should map to THESE).                            [ 
  ] **Mechanics**: when codelens providers refresh (onDidChangeCodeLenses),   
  language filtering (sonic-pi documents only), gating on server-started state,
  keeping keybinding behavior untouched.                                    [ 
  ] Official API references pinned: code.visualstudio.com API docs (CodeLens, 
  Decorations gutterIcon, InlayHints), @types/vscode 1.144 surface, at least  
  one real extension's implementation permalinked.                            
                                                                              
  Phase A output: committed research doc (docs/research/editor-run-controls.  
  md)                                                                         
  — comparison table + chosen mechanism(s) + cited sources + the design       
  decision surface (placement, granularity, icon, gating) for Phase B triage. 
                                                                              
  # Phase B — implementation (after Phase A is triage-approved)               
                                                                              
  • Acceptance criteria determined by Phase A's findings (granularity,        
  placement, icon, server-up gating, notebook-vs-text-file scope).          • 
  Gates: headless test where possible (e.g. the provider returns expected     
  lenses for a fixture document; nothing shown for non-sonic-pi languages);   
  manual UI smoke for visual placement.                                     • 
  Constraints: existing keybindings stay intact; controls are additive; stop  
  rule = extension src additions for the chosen mechanism only.               
                                                                              
  # AC (placeholder until Phase A triage)                                     
                                                                              
  [ ] Research doc committed with cited sources + chosen design             [ 
  ] Implementation per chosen design, tested per its gates                [ ] 
  No regression: npm test + npm run test:e2e green                            
                                                                              
  Refs: sonic-pi-bpba (queued behind current epic), sonic-pi-1gye (bug queue) 
                                                                              
  ## Phase A complete (research 2026-11-04, doc committed 4bf50e9)            
                                                                              
  Full doc: docs/research/editor-run-controls.md (490 lines, 9 sections, every
  claim cited to vscode.d.ts / core source / real extension repos). Parent re-
  verified the two load-bearing claims locally (gutterIconPath-only in        
  @types/vscode 1.144; no glyphMargin/click API public or proposed).          
                                                                              
  **Verdict on the user's exact ask:** a clickable LEFT-MARGIN play button is 
  not implementable by an extension (glyph-margin click handling is VS Code   
  core; public API only paints gutterIcon). Nearest equivalents, all evidence-
  backed:                                                                     
                                                                              
  1. CodeLens with codicons — the only persistent, clickable, icon-capable per-
  line control ( proven in julia-vscode codecells.ts:876-915; C#/Go run-test  
  lenses identical pattern). At document top + per code block.                
  2. editor/title icon button (the ▶ at top of the editor tab area) — pure    
  manifest (contributes.menus editor/title + when clause), zero code, runs the
  file. This is what 'controls on the top of the text file' maps to.          
  3. Notebooks already have true per-cell ▶ via NotebookController (core UI) —
  text files are the only gap.                                                
                                                                              
  ## Phase B — implementation scope (parent decision, additive only)          
                                                                              
  [ ] editor/title  icon button: when editorLangId == sonic-pi, command run — 
  manifest-only (package.json contributes.menus + commands icon)            [ 
  ]                                                                           
  CodeLensProvider for language sonic-pi: line 1 lens ' Run' + ' Stop'; per-  
  block ' Run cell' lenses at blank-line-separated block starts when the doc  
  has                                                                         
  >=2 blocks (julia rule: no lenses for single-block docs), reusing existing  
  runCode command path with the block text                         [ ] Setting
  gate: vscode-sonic-pi.showEditorControls (boolean, default true) hides both 
  when false                                                     [ ] Unit test
  (plain node, stub pattern): fixture doc -> expected lens                    
  count/positions/commands; non-sonic-pi doc -> none; showEditorControls=false -
                                                                              
  | none                                                                    [ 
  ]                                                                           
  | npm test + npm run test:e2e green; vsce package smoke                 [ ] 
  | Dev vsix installed locally for user sign-off; merge after user accepts the
  | shape (sign-off probe: user asked for left button; codelens+title-button  
  is                                                                          
  | the implementable substitute — user sees it live before merge)            
                                                                              
  ## Skills for coder                                                         
                                                                              
  • /home/blaze/.agents/skills/coding-rules/SKILL.md (intent-reading provider)
  •                                                                           
  /home/blaze/.agents/skills/tdd/SKILL.md (provider tests first)              
                                                                              
  Stop rule: src/codelenses.ts (new) or src/extension.ts registration,        
  package.json (commands icon/menus/configuration), test/unit file, README    
  settings row. No changes to run/stop command internals, token parsing, or   
  server code.                                                                
                                                                              
  ## Triage note correction (shell interpolation ate the codicon strings      
  above)                                                                      
                                                                              
  Where the Phase B section shows bare ' Run' / ' Stop' / ' Run cell' or '(   
  proven in julia-vscode', the intended text is the codicon forms: $(play) Run,
  $(stop) Stop, $(play) Run cell — i.e. VS Code codicon IDs embedded in lens  
  titles, exactly as julia-vscode does. The implementation contract below     
  repeats this precisely so no ambiguity ships to the coder:                  
                                                                              
  • Line 1 lenses: title $(play) Run (command vscode-sonic-pi.run) and $(stop)
  Stop (command vscode-sonic-pi.stop).                                        
  • Per-block lenses: title $(play) Run cell (command vscode-sonic-pi.run with
  the block text as argument).                                                
                                                                              
  ## Phase B implementation report (worker on editor-controls 20e22f1; parent-
  verified 2026-11-04)                                                        
                                                                              
  • Red->green observed (provider suite started MODULE_NOT_FOUND red, ended   
  'all codelens tests passed').                                               
  • Parent re-verification on the branch: 19 tests ok across 5 suites; npm run
  test:e2e live-daemon gate green; diff master..editor-controls = exactly the 
  5 contracted files (+279/-2); package.json edits surgical (test script,     
  menus editor/title with when-clause, run command icon $(play),              
  showEditorControls configuration).                                          
  • Codicon support verified by worker against the LOCAL workbench bundle     
  (ThemeIcon.fromString path for string icons) — editor/title play button     
  confirmed working, not just documented.                                     
  • Provider design: showEditorControls gate (default true) + languageId guard +
  notebook-cell-scheme exclusion + refresh on config/document change; file-   
  level Run/Stop lenses at line 1; per-block Run cell lenses (blank-line      
  blocks, >=2 blocks only) via new runWithText command reusing main.runCode.  
                                                                              
  ## SIGN-OFF PROBE (pending user)                                            
                                                                              
  Dev build packaged from the branch and installed into both local profiles.  
  User asked to: open a .pi/.rb Sonic Pi file, reload window, and             
  accept/reject the shape: (a) 'Run / Stop' row above the file, (b) 'Run cell'
  above each blank-line block, (c) play button top-right of editor tab. Left- 
  margin button impossible per research (docs/research/editor-run-controls.md).
  Merge happens after user accepts.

## Proof of Work

All ACs met; parent-verified. Shipped across editor-controls (20e22f1, merged 5147fd6), activation-fix 0b32bce, playable-block lens filter 3a09b44, release 5d138e6 (tag v0.1.4, Release run 41831362730 green, asset sonic-pi-extension-0.1.4.vsix published).

- Left-margin ▶ verified impossible (glyphMargin click handling is core-only; public + all 184 proposed .d.ts checked) — documented in docs/research/editor-run-controls.md. Implemented pattern: CodeLens + editor/title button, confirmed against local workbench bundle (ThemeIcon.fromString for string icons).
- User sign-off obtained live ("works"), with one review tweak: comment-only and settings-only blocks (use_*/set_*!) no longer get Run cell lenses (red→green, 8 codelens tests).
- README getting-started step 4 documents the controls end-user-facing; settings table has showEditorControls row.
- Gates: 6 unit suites green (incl. activation smoke), live-daemon e2e gate green, vsce package clean.

## Summary of Changes

Editor run controls for Sonic Pi files: ▶ Run / ■ Stop CodeLens row on line 1, ▶ Run cell per playable block (blank-line separated, ≥2 blocks), ▶ title-bar button (manifest icon, lang-guarded), runWithText command reusing main.runCode, showEditorControls setting (default true). Bonus hardening en route: activation smoke test + JSON import fix after the v0.1.2 activation regression (sonic-pi-aedq).
