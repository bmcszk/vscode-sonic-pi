---
# sonic-pi-w0ij
title: 'Ruby LSP integration: would ruby-lsp add error highlighting + better completions for Sonic Pi .rb files? (deep online research)'
status: todo
type: feature
created_at: 2026-11-05T21:09:11Z
updated_at: 2026-11-05T21:09:11Z
---

# Ruby LSP: does integrating ruby-lsp improve our language support? (user directive 2026-11-05)

"we have ruby lsp in system (/usr/bin/ruby-lsp present; ruby-lsp gem 0.26.10; ruby 3.4.12 PRISM). Check if our VS Code extension would benefit - mainly error highlighting and autocomplete. Task includes ONLINE DEEP RESEARCH."

## Local facts
- /usr/bin/ruby-lsp binary exists shopify/ruby-lsp 0.26.10
- Our extension today: static-regex-ish completion items (synths/fx/samples with arg docs via argsParser), hover over builtin tokens, codelens, no diagnostics, no semantic analysis. Grammar: our own sonic-pi tmLanguage? (check package.json grammars) or Ruby-adjacent.
- SONIC PI SPECIFIC REALITY (matters for feasibility): a .pi/.rb sonic-pi file is NOT valid standalone Ruby in general (dangling live_loop/play calls are fine; DSL methods exist only inside the running server). ruby-lsp will flag UNKNOWN METHODS unless the DSL is taught. ruby-lsp has custom DSL support via 'DSL viewers'/add-ons (ruby-lsp custom DSLs docs).

## Phase A - online deep research (primary sources: shopify/ruby-lsp repo+docs, Ruby LSP addon API docs, marketplace ShopiOS/ruby-lsp extension behavior, sonic-pi specific prior art)
Questions:
1. Does the ruby-lsp VS Code extension co-exist with a custom grammar extension (ours registers language 'sonic-pi')? How do extensions negotiate LSP server activation for a languageId? Two servers same file?
2. ruby-lsp diagnostics-on-fly: does it report unknown methods/undefined variables for plain code as you type (rubocop needed?), and can its addon API TEACH DSLs (declare live_loop/with_fx/... so they don't error)? Cite the add-on API (RubyLsp::Listener, requests, 'document symbol', 'completion' override) with links.
3. Prior art: existing extensions providing ruby-lsp for sonic-pi or simulating DSL? (any github repo).
4. Cost/latency: ruby-lsp on every keystroke for a 60-line music file - perf notes from docs/issues.
5. COMPLETION: can an add-on inject our synths/fx/samples docs data as completion items (its ruby-lsp completion uses type info; DSL methods untyped) - what is the sanctioned hook?

Deliverable: docs/research/ruby-lsp-integration.md with verdict + recommended integration plan (options: (a) standalone: our own jsonrpc to /usr/bin/ruby-lsp with an addon teaching sonic-pi DSL; (b) recommend users install ruby-lsp ext in parallel and provide .rb workspace config + an addon gem; (c) don't integrate: our static completions suffice - with reasons). Include evidence for every claim (URLs + quotes) and flag UNVERIFIED.

## Phase B (separate contract later): only after research verdict + user pick.

## AC
- [ ] research doc committed with primary citations + local ruby-lsp presence noted
- [ ] explicit feasibility verdict for diagnostics-on-type + DSL-taught completions
- [ ] option comparison with effort estimates

Stop rule: docs/research/ruby-lsp-integration.md only (plus its bean note). No code.
Skills: /home/blaze/.agents/skills/coding-rules/SKILL.md (for the eventual coder), researcher discipline (report-first).
