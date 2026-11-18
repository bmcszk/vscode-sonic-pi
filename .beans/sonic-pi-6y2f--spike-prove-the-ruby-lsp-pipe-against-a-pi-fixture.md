---
# sonic-pi-6y2f
title: 'Spike: prove the ruby-lsp pipe against a .pi fixture (858b)'
status: in-progress
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-18T13:39:57Z
parent: sonic-pi-858b
---

# Task: Spike - prove the ruby-lsp pipe against a .pi fixture (858b)

Minimal embedded LanguageClient spawning /usr/bin/ruby-lsp, documentSelector [{language:'sonic-pi',scheme:'file'}], controlled CWD (no Gemfile), try with and without BUNDLE_GEMFILE set.

## Load-bearing facts (docs/research/ruby-lsp-integration.md, gem 0.26.10 verified on disk)
server maps any unknown languageId to :ruby (server.rb:382-391 + store.rb:29-36); diagnostics are Prism-only, registered as PULL at 0.26.10; rootUri must be the workspace or diagnostics come back empty.

## Acceptance criteria (notes into this bean; NO production code)
- [ ] missing-end fixture produces Prism diagnostics - record whether publishDiagnostics push or textDocument/diagnostic pull fires
- [ ] clean fixture yields none
- [ ] BUNDLE_GEMFILE inference confirmed or refuted
- [ ] one page of notes in the bean

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/.agents/skills/ruby/SKILL.md
