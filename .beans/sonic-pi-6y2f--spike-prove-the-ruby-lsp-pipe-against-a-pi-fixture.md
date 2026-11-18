---
# sonic-pi-6y2f
title: 'Spike: prove the ruby-lsp pipe against a .pi fixture (858b)'
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-18T13:54:06Z
parent: sonic-pi-858b
---

sonic-pi-6y2f  draft   task  [normal]                      
Spike: prove the ruby-lsp pipe against a .pi fixture (858b)
──────────────────────────────────────────────────         
parent: sonic-pi-858b                                      
──────────────────────────────────────────────────         
                                                           

  # Task: Spike - prove the ruby-lsp pipe against a .pi fixture (858b)        
                                                                              
  Minimal embedded LanguageClient spawning /usr/bin/ruby-lsp, documentSelector
  [{language:'sonic-pi',scheme:'file'}], controlled CWD (no Gemfile), try with
  and without BUNDLE_GEMFILE set.                                             
                                                                              
  ## Load-bearing facts (docs/research/ruby-lsp-integration.md, gem 0.26.10   
  verified on disk)                                                           
                                                                              
  server maps any unknown languageId to :ruby (server.rb:382-391 + store.rb:29-
  36); diagnostics are Prism-only, registered as PULL at 0.26.10; rootUri must
  be the workspace or diagnostics come back empty.                            
                                                                              
  ## Acceptance criteria (notes into this bean; NO production code)           
                                                                              
  [x] missing-end fixture produces Prism diagnostics - record whether         
  publishDiagnostics push or textDocument/diagnostic pull fires               
  [x] clean fixture yields none                                               
  [x] BUNDLE_GEMFILE inference confirmed or refuted                           
  [x] one page of notes in the bean                                           
                                                                              
  ## Skills for coder                                                         
                                                                              
  • /home/blaze/.agents/skills/typescript/SKILL.md                            
  • /home/blaze/.agents/skills/ruby/SKILL.md



## Spike result (empirical, this worktree)

- **ruby-lsp on disk:** 0.26.10 (`/usr/bin/ruby-lsp --version`). Environment: Arch system Ruby 3.4.12, ruby-lsp gem at `/usr/lib/ruby/gems/3.4.0/gems/ruby-lsp-0.26.10/`, **bundler was NOT installed initially** — `gem install bundler` (4.1.0) was required for any startup path to work. With bundler absent: unset BUNDLE_GEMFILE → exe crashes (`cannot load such file -- bundler` from `setup_bundler.rb:4`); set BUNDLE_GEMFILE → crashes later at `internal.rb:10 require "bundler"`. So the server hard-requires the bundler gem regardless of path — binary-detection in the real client should also check `require "bundler"` works (or try `Gem::Specification.find_by_name("bundler")`).
- **(a) Diagnostics arrive as PULL, not push.** Initialize result advertises `diagnosticProvider: {documentSelector: null, interFileDependencies: false, workspaceDiagnostics: false}` (a `DiagnosticRegistrationOptions`). Zero `textDocument/publishDiagnostics` notifications ever fire after didOpen (client capability `textDocument.diagnostic` declared; didn't matter). Must send explicit `textDocument/diagnostic` request → `FullDocumentDiagnosticReport {kind:"full", items:[...]}`. Responses are stable/cached (repeat pull identical). Server never pushes even on didOpen/didChange; on didClose it pushes an empty publishDiagnostics clear (server.rb:423-424) — that's the only push.
- **(b) Clean fixture:** `items: []` — no diagnostics for valid code.
- **(c) BUNDLE_GEMFILE verdict: matters, and the trap is inverted from the research guess.** With BUNDLE_GEMFILE set (to any non-nil path, e.g. a scratch Gemfile), the exe skips the SetupBundler/compose chain (exe/ruby-lsp:55 `if ENV["BUNDLE_GEMFILE"].nil?`) and boots the in-process server directly — this is the *reliable* path. Unset, the exe runs SetupBundler, which **exits 78** ("Project contains a Gemfile, but no Gemfile.lock...") if the cwd has a Gemfile without lockfile, otherwise runs a full composed-bundle `bundle install` dance (slow, network). Real client: always spawn with `BUNDLE_GEMFILE` set (even to a dummy value) to skip bundle composition entirely; degraded mode still works (init result showed `degraded_mode:false, bundle_env:null, formatter:"none"`).
- **(d) languageId sonic-pi vs ruby: identical results.** Both produce the same Prism diagnostics. Confirms server.rb:382-391 `else → :ruby`.
- **Gotchas discovered:**
  1. **workspace_path comes from `workspaceFolders[0].uri`, not `rootUri`** (global_state.rb:118). Send only rootUri and every pull returns `result: null` (empty-response path for "file outside workspace"). Real client MUST send `workspaceFolders`.
  2. Path with hyphens must be percent-encoded in URIs (`%2D`): Ruby's RFC2396 `URI()` keeps `%2D` escaped, so a raw `-` in the URI string yields a path that doesn't match the file on disk → "file outside workspace" → null. Use proper URI encoding (like VS Code does).
  3. Diagnostics are computed from the in-memory didOpen document (content stored at open), so fixture files don't even need to exist at the pull path for content — but the pull URI must parse to a path inside workspace_path.
  4. `--debug` flag requires the `debug` gem (not installed) — printed a warning, harmless; drop it from the real client.
  5. Startup lag ~1-2s between initialize response and readiness to answer pulls.
- **GO/NO-GO for sonic-pi-ce06: GO.** Hinges on 3 design facts:
  1. Spawn `/usr/bin/ruby-lsp` with `BUNDLE_GEMFILE` set (non-nil) + controlled cwd → deterministic fast boot, no bundle composition; also probe bundler availability at activation.
  2. Diagnostics are pull-only at 0.26.10: client polls `textDocument/diagnostic` (on didOpen/didChange/debounce), must send `workspaceFolders[0].uri` = sketch folder, and URI-encode document paths.
  3. Any languageId (sonic-pi included) is served as Ruby; Prism-only diagnostics → zero DSL false positives; clean file → empty items.
- Scratch artifacts (git-ignored): `scratch/client.mjs` (raw JSON-RPC stdio client), `scratch/ws/{missend.pi,clean.pi,missing-end.pi}`, `scratch/Gemfile`. Nothing committed, no tracked files touched.

## Proof of Work

- Empirical runs via raw JSON-RPC stdio against ruby-lsp 0.26.10 (Ruby 3.4.12): missing-end -> pull textDocument/diagnostic returns {kind:'full', items:[2 Prism severity-1 errors]}; didOpen produces ZERO publishDiagnostics pushes (diagnosticProvider registered pull-style, documentSelector:null); clean fixture -> items: [].
- BUNDLE_GEMFILE: set -> server boots in-process (skips SetupBundler); unset -> SetupBundler dance, exit 78 with unlocked Gemfile. Confirmed: real client must spawn with it set.
- languageId 'sonic-pi' vs 'ruby': byte-identical diagnostics (else->:ruby mapping proven).
- Design facts for sonic-pi-ce06: workspaceFolders[0].uri (NOT rootUri) drives workspace_path; percent-encode '-' in URIs; ~1-2s startup lag; bundler gem required on PATH (worker installed bundler 4.1.0 system-wide - disclosed machine change).
- GO verdict recorded; scratch client + fixtures git-ignored, nothing tracked.
Residual: none
