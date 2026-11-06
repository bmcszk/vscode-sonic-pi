# Research: ruby-lsp integration for vscode-sonic-pi (bean sonic-pi-w0ij, Phase A)

**Question:** Would integrating Shopify's ruby-lsp improve this extension's language support — primarily ERROR HIGHLIGHTING and AUTOCOMPLETION for Sonic Pi code?

---

## Summary (TL;DR)

**Yes for diagnostics-as-you-type, no for autocompletion beyond what we already ship.** Ruby-lsp's real contribution is **Prism syntax errors on every keystroke** (`live_loop do … ` missing `end`, unclosed blocks, stray tokens) — exactly what our extension lacks. But ruby-lsp reports **only** Prism syntax errors + optional RuboCop lint; it does **no undefined-method/undefined-variable analysis**, so `live_loop`/`with_fx`/`play` being "unknown to ruby-lsp" is a **non-issue** — nothing flags them. Dealbreakers for the naive path: (1) Shopify's VS Code extension hard-codes its document selector to Ruby-family languageIds and activates **only** on `workspaceContains:Gemfile.lock`, so it will never light up for `languageId 'sonic-pi'` files; (2) Sonic Pi users have no Bundler context. The only clean path is **Option A: embed our own LSP client** to the system `ruby-lsp` with a client-side documentSelector for `sonic-pi`, optionally plus a project-local Sonic Pi addon — keeping our static completions client-side.

---

## Findings

### Q1. Can ruby-lsp serve `languageId 'sonic-pi'`? Two-extensions-one-languageId precedent

**1.1 — Shopify's VS Code extension will never activate for Sonic Pi workspaces.**
- **Claim:** `vscode/package.json` declares `"activationEvents": ["workspaceContains:Gemfile.lock", "workspaceContains:gems.locked"]` — nothing else. No `onLanguage:*`, no `onStartupFinished`.
- **Sources:** [ruby-lsp vscode/package.json](https://github.com/Shopify/ruby-lsp/blob/main/vscode/package.json)
- **Support:** direct evidence (fetched raw package.json). **Confidence:** high.

**1.2 — The client's document selector is hard-coded to Ruby-family languageIds.**
- **Claim:** `vscode/src/common.ts` exports `SUPPORTED_LANGUAGE_IDS` (used to build the `documentSelector` in `client.ts`, which imports it). A `sonic-pi` languageId is outside the selector, so `vscode-languageclient` never routes requests for those files to the server.
- **Sources:** [vscode/src/common.ts](https://github.com/Shopify/ruby-lsp/blob/main/vscode/src/common.ts), [vscode/src/client.ts](https://github.com/Shopify/ruby-lsp/blob/main/vscode/src/client.ts) (imports `SUPPORTED_LANGUAGE_IDS`), corroborated by [PR #1184 "Add `erb` to `documentSelector`"](https://github.com/Shopify/ruby-lsp/pull/1184) and [serena CHANGELOG](https://github.com/oraios/serena/blob/main/CHANGELOG.md) ("ruby-lsp supports both .rb and .erb files").
- **Support:** direct evidence for the import; the array literal was truncated in my fetch — exact contents high-confidence from corroboration, not verbatim. **Confidence:** high.

**1.3 — Server-side, languageId is mapped, never validated: anything non-erb/rbs is treated as Ruby.**
- **Claim:** `lib/ruby_lsp/server.rb` `text_document_did_open` maps `languageId`: `"erb"|"eruby" → :erb`, `"rbs" → :rbs`, **`else → :ruby`**. No whitelist, no rejection. Likewise `store.rb` `get`/`set` defaults to a `RubyDocument` for any extension other than `.erb/.rhtml/.rbs`. **If we own the client, the server will happily serve `sonic-pi` files as Ruby.**
- **Sources:** [lib/ruby_lsp/server.rb](https://github.com/Shopify/ruby-lsp/blob/main/lib/ruby_lsp/server.rb), [lib/ruby_lsp/store.rb](https://raw.githubusercontent.com/Shopify/ruby-lsp/main/lib/ruby_lsp/store.rb)
- **Support:** direct evidence (both fetched raw). **Confidence:** high.

**1.4 — Two servers on one languageId: VS Code has no arbiter; diagnostics merge/dupe.**
- **Claim:** VS Code multiplexes requests to every provider matching the document selector. Diagnostics from different servers land in **separate DiagnosticCollections** and are not de-duplicated — you get stacked/duplicated squiggles. The `ryl` issue documents the mechanics inside `vscode-languageclient` itself: it "routes the two models into **separate** `DiagnosticCollection`s and does not de-duplicate across them".
- **Sources:** [owenlamont/ryl #323](https://github.com/owenlamont/ryl/issues/323), [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events)
- **Support:** direct evidence for the mechanics. **Confidence:** high.
- **Researcher inference:** if we ship an embedded client, we own the selector exclusively and Shopify's ext never sees `sonic-pi` files (1.1/1.2), so no duplicate diagnostics by construction.

**1.5 — Precedent:** multiple Ruby servers coexist (Solargraph vs ruby-lsp vs RuboCop LSP); editors like Zed ship both but force a choice: "you can't use both at the same time" ([Zed Ruby docs](https://zed.dev/docs/languages/ruby)). On VS Code users self-manage; duplicate diagnostics are the known failure mode.

### Q2. Diagnostics-as-you-type: exactly what ruby-lsp reports

**2.1 — Diagnostics = Prism syntax errors + Prism warnings + (optional) RuboCop. Nothing else.**
- **Claim:** `lib/ruby_lsp/requests/diagnostics.rb#perform` does `diagnostics.concat(syntax_error_diagnostics, syntax_warning_diagnostics)`, then only if the file is syntactically valid runs `@active_linters` (RuboCop). There is no undefined-method, undefined-variable, or type analysis anywhere in the request.
- **Sources:** [lib/ruby_lsp/requests/diagnostics.rb](https://raw.githubusercontent.com/Shopify/ruby-lsp/main/lib/ruby_lsp/requests/diagnostics.rb)
- **Support:** direct evidence (full source fetched). **Confidence:** high.
- **Implication (researcher inference):** DSL methods are never flagged because nothing ever checks method existence. The parent's worry is moot for diagnostics. What users gain: missing-`end`, stray tokens, unclosed strings — the classic live-coding typos.

**2.2 — Pull diagnostics only fire inside the workspace.**
- **Claim:** `server.rb#text_document_diagnostic` bails for files outside the workspace: "Do not compute diagnostics for files outside of the workspace… unless path.start_with?(@global_state.workspace_path)" → empty response.
- **Sources:** [lib/ruby_lsp/server.rb](https://github.com/Shopify/ruby-lsp/blob/main/lib/ruby_lsp/server.rb)
- **Support:** direct evidence. **Confidence:** high.
- **Implication:** our client must start the server with `rootUri` = the folder containing the sketch; loose single files opened from outside a folder get no diagnostics.

**2.3 — Config toggles.**
- **Claim:** `initialize` advertises `Requests::Diagnostics.provider if enabled_features["diagnostics"]` — gated by the `enabledFeatures` initialization option. Linters are separate (`linters` option; RuboCop is the only one today). In VS Code this is togglable via the language status center → `Manage`.
- **Sources:** [server.rb](https://github.com/Shopify/ruby-lsp/blob/main/lib/ruby_lsp/server.rb), [Ruby LSP marketplace docs](https://marketplace.visualstudio.com/items?itemName=Shopify.ruby-lsp) ("The Ruby LSP features include… RuboCop errors and warnings (diagnostics)… allows disabling specific features… select `Manage`"), [Ruby LSP docs](https://rubyweekly.com/link/182046/web) ("native support for syntax errors and also supports showing linting errors. You can configure which linters to use").
- **Support:** direct evidence. **Confidence:** high.

### Q3. Add-on API: teach the DSL, inject static completions, non-Ruby fileId

**3.1 — `RubyLsp::Addon` is public and additive.**
- **Claim:** Subclass `RubyLsp::Addon`, implement `name` + `activate`. Gem addons auto-discovered via `Gem.find_latest_files("ruby_lsp/**/addon.rb")`; **project-local** addons via `Dir.glob("#{global_state.workspace_path}/**/ruby_lsp/**/addon.rb")`.
- **Sources:** [lib/ruby_lsp/addon.rb](https://raw.githubusercontent.com/Shopify/ruby-lsp/main/lib/ruby_lsp/addon.rb), [Add-ons docs](https://shopify.github.io/ruby-lsp/add-ons.html)
- **Support:** direct evidence. **Confidence:** high.

**3.2 — DSL teaching via `RubyIndexer::Enhancement` is first-class.**
- **Claim:** `RubyIndexer::Enhancement` exposes exactly two overridable hooks — `on_call_node_enter` / `on_call_node_leave` — that "fire during indexing whenever a method call node is encountered", letting you add index entries; once indexed, "Go-to-definition, Hover documentation, Completion, Signature help, Workspace symbol search" work automatically. Docs distinguish **call-site DSLs** vs **declaration DSLs** (metaprogramming that creates methods).
- **Sources:** [Indexing enhancements (official docs mirror)](https://mintlify.wiki/Shopify/ruby-lsp/addons/indexing-enhancements) — canonical anchor at [shopify.github.io/ruby-lsp/add-ons](https://shopify.github.io/ruby-lsp/add-ons.html) (canonical anchor page would not fetch; mirror serves Shopify's docs content verbatim)
- **Support:** direct evidence (docs quote). **Confidence:** high on API existence/shape; medium on canonical-URL exactness.

**3.3 — (a) Can an addon suppress unknown-method errors for the DSL? Moot + partially.**
- **Claim:** Moot per 2.1 — ruby-lsp never emits unknown-method diagnostics. Partially relevant: RuboCop (the only linter) doesn't do undefined-method detection either.
- **Support:** interpretation of 2.1; the RuboCop cop-defaults assertion is from general knowledge, **not re-verified this run (flagged)**. **Confidence:** medium.

**3.4 — (b) Inject static completions with rich docs via addon: YES, well-trodden.**
- **Claim:** Add-ons enhance requests via listeners (`create_completion_listener`, `create_hover_listener`, …) that append to a shared `ResponseBuilders::CollectionResponseBuilder`. The reference add-on `ruby-lsp-rails` uses this pattern in production (e.g. `create_definition_listener(response_builder, node_context, uri, …)`). Appended completions arrive as normal LSP `CompletionItem`s with `documentation`.
- **Sources:** [Add-ons docs](https://shopify.github.io/ruby-lsp/add-ons.html), [ruby-lsp-rails addon.rb](https://github.com/Shopify/ruby-lsp-rails/blob/v0.3.26/lib/ruby_lsp/ruby_lsp_rails/addon.rb)
- **Support:** direct evidence. **Confidence:** high.

**3.5 — (c) Can an addon run for a non-Ruby fileId? YES — server maps any non-erb/rbs id to `:ruby`.**
- **Claim:** Direct from 1.3. Add-ons execute in the same server process, so they run identically for `sonic-pi` files **if the client sends them**. The binding constraint is the *client*, not the server.
- **Support:** direct evidence (1.3) + researcher inference for the in-process claim. **Confidence:** high.

**3.6 — KEY UNLOCK for a no-bundler audience: project-local addon discovery needs no gem and no bundler.**
- **Claim:** `Dir.glob("#{global_state.workspace_path}/**/ruby_lsp/**/addon.rb")` — dropping `<workspace>/ruby_lsp/sonic_pi/addon.rb` into the user's Sonic Pi folder is enough. Meanwhile the server has explicit no-bundler escapes (`Bundler.bundle_path` rescued against `Bundler::GemfileNotFound`; `NON_REPORTABLE_SETUP_ERRORS` covers `Bundler::GemNotFound`/`GitError`/`DSLError`), i.e. it is designed to degrade gracefully without bundler.
- **Sources:** [addon.rb](https://raw.githubusercontent.com/Shopify/ruby-lsp/main/lib/ruby_lsp/addon.rb), [server.rb](https://github.com/Shopify/ruby-lsp/blob/main/lib/ruby_lsp/server.rb)
- **Support:** direct evidence. **Confidence:** high.

### Q4. Prior art

**4.1 — magicmonty/sonicpi.nvim (neovim): Solargraph + `on_init` DSL injection, diagnostics OFF by default.**
- **Claim:** README shows `lsp_diagnostics = false` as the default and an "LSP setup" section: "If you want to use the LSP, then install solargraph correctly and add the following to the `on_init` callback…" — piggybacking Solargraph and injecting Sonic Pi globals via its config, with diagnostics **disabled by default**.
- **Sources:** [magicmonty/sonicpi.nvim](https://github.com/magicmonty/sonicpi.nvim)
- **Support:** direct evidence (fetched README). **Confidence:** high.
- **Lesson (researcher inference):** the only prior Sonic Pi LSP integration turns diagnostics **off** by default because Solargraph's semantic checks false-positive on the DSL. ruby-lsp's Prism-only diagnostics avoid that trap entirely — a genuine differentiator.

**4.2 — llloret/sonic-pi-vscode-editor: runtime errors from the daemon, not editor squiggles.**
- **Claim:** Feature list: "Highlight errors as reported by the Sonic Pi server" — daemon-reported, not static analysis.
- **Sources:** [llloret/sonic-pi-vscode-editor](https://github.com/llloret/sonic-pi-vscode-editor)
- **Support:** direct evidence. **Confidence:** high.

**4.3 — The Sonic Pi VS Code ecosystem has NO LSP integration.** s00500/vscode-sonic-pi (our upstream) and JacksonKearl/vscode-sonic-pi are static-completions + hover only. ([s00500/vscode-sonic-pi](https://github.com/s00500/vscode-sonic-pi))
- **Support:** direct evidence (READMEs). **Confidence:** high.

### Q5. Performance

**5.1 — Indexing is the whole cost; tiny files ≈ free.**
- **Claim:** Indexing runs at server startup for the workspace. Shopify's own numbers: "it took around 90 seconds to index Shopify's core Rails monolith" and "around 2.2 GB" in memory — for one of the largest Ruby codebases on earth. A Sonic Pi sketches folder (a handful of files) indexes far faster.
- **Sources:** [railsatscale.com — A Ruby open-source sabbatical](https://railsatscale.com/2025-07-01-a-ruby-open-source-sabbatical)
- **Support:** direct evidence (quoted figures). **Confidence:** high at monorepo scale; **researcher inference** for the tiny-folder extrapolation (no published ms-figures for small workspaces found — flagged).
- serena only saw "Timeout waiting for ruby-lsp indexing completion" on huge jobs ([serena #554](https://github.com/oraios/serena/issues/554)) — not our scale.

**5.2 — No-Gemfile pitfall is real and documented.**
- **Claim:** "The VSCode extension 'Ruby LSP' requires the presence of a Gemfile.lock file at the root level in order for it to run." Users hit "Couldn't find a workspace for `URI…`" / "Ruby LSP: Starting" forever; the fix is a **dummy Gemfile.lock**. Also: "Ruby LSP activates ONLY when there is a workspace folder (so it will not work for a single file)".
- **Sources:** [Shopify/ruby-lsp #2376](https://github.com/Shopify/ruby-lsp/issues/2376), [Medium — Initial Ruby LSP configurational pain](https://medium.com/@luka.barczak/initial-ruby-lsp-configurational-pain-7d58bba2b995) (corroborating)
- **Support:** direct evidence. **Confidence:** high.
- **Researcher inference:** Option A bypasses the Shopify VS Code ext entirely (we spawn `ruby-lsp` ourselves with our own workspace path), so the Gemfile.lock *activation* trap doesn't apply; the server's bundler rescue paths (3.6) cover the runtime side.

**5.3 — "Index only dependencies" / no bundle context.**
- **Claim:** Without a Gemfile, ruby-lsp indexes the workspace folder and falls back to Ruby-core entities for completion; it does not auto-install anything.
- **Support:** interpretation of docs + the rescue clauses in 3.6. **Confidence:** medium (**not verified against current indexer defaults this run**).

### Q6. Verdict

**Recommendation: Option (a) — embed our own JSON-RPC client to the system `ruby-lsp` (+ optional project-local Sonic Pi addon), keep static completions client-side.**

| Option | What | Effort | Risk |
|---|---|---|---|
| **(a) Embedded client + addon — RECOMMENDED** | `LanguageClient` spawning `/usr/bin/ruby-lsp`, `documentSelector: [{ language: 'sonic-pi', scheme: 'file' }]`; optional project addon `<ws>/ruby_lsp/sonic_pi/addon.rb` adds DSL index entries; client-side merge of our static completions | **1–2 weeks** | moderate: addon API is "experimental and subject to changes"; ruby-lsp version drift; graceful fallback needed when `ruby-lsp` isn't installed |
| (b) Users install Shopify ruby-lsp ext + our addon gem | Requires the Shopify ext to serve `sonic-pi` files | ~1 week | **cannot work as stated**: Shopify's ext never activates without a `Gemfile.lock` and its document selector excludes `sonic-pi` (Q1) |
| (c) Skip integration | keep static-only | 0 | none — but forfeits syntax-error highlighting, our biggest gap |

**Why (a):**
1. **Diagnostics are the win.** Prism syntax errors on every keystroke for `live_loop do` … missing `end` — the #1 typo class in live coding — with zero false positives on the DSL (2.1).
2. **Completions are already ours.** Our static synths/fx/samples dataset with full arg docs is richer than anything an addon could infer; keep it client-side. An addon adds go-to-def/hover for Sonic Pi methods — nice-to-have.
3. **Works without bundler.** Project-local addon discovery (3.6) means we drop a file into the user's folder — no gem install, no bundler.
4. **Verdict on (b):** impossible as stated. A hybrid (users install only our gem) is possible but strictly worse than (a) (extra install step, still needs our client).

**Effort breakdown for (a):** client bootstrap + spawn/respawn handling (2–3d), documentSelector + didOpen/didChange plumbing (1d), diagnostics integration (1d), completion merge logic (2d), addon sketch (1d), version-compat testing (1–2d).

**Risks:** (i) Add-on API banner: "The Ruby LSP add-on system is currently experimental and subject to changes in the API" — pin a ruby-lsp version range. (ii) Server-side hover/definition may resolve Sonic Pi methods to nothing (no false hover, just absence) — acceptable. (iii) Users without `ruby-lsp` on PATH → detect at activation (`ruby-lsp --version`) and fall back to static-only mode.

---

## Contradictions

1. **No real contradictions found.** One soft tension: Shopify's `AGENTS.md` says the server handles "Ruby, RBS and ERB files" while the VS Code `SUPPORTED_LANGUAGE_IDS` is Ruby+ERB — RBS is served via a separate path. Not load-bearing for us; noted for completeness.
2. **Two-servers-one-language:** no authoritative VS Code doc states "VS Code picks one winner"; the observed behavior (parallel DiagnosticCollections, no dedup) comes from the ryl issue + vscode-languageclient internals. Recorded as **observed, not spec-guaranteed**.

## Missing evidence
1. Exact `SUPPORTED_LANGUAGE_IDS` array literal was truncated in my fetch; high confidence from PR #1184 + serena corroboration, not verbatim.
2. Per-keystroke latency numbers for tiny files: no published figures; only monorepo-scale data. Extrapolation is inference.
3. RuboCop default cops re: undefined methods — general knowledge, not re-verified. (Verdict unaffected: we'd ship with linters disabled anyway.)
4. TidalCycles LSP prior art: nothing on-point found. Confirmed prior art is neovim/Solargraph (4.1) and non-LSP VS Code extensions (4.2/4.3).
5. **Local `ruby-lsp 0.26.10` vs `main` API drift:** researched against `main`; the addon API is experimental, so verify against the installed 0.26.10 before coding.

## Sources

**Kept (load-bearing):**
- ruby-lsp [vscode/package.json](https://github.com/Shopify/ruby-lsp/blob/main/vscode/package.json) — activation events (Gemfile.lock-only); kills Option (b).
- ruby-lsp [vscode/src/common.ts](https://github.com/Shopify/ruby-lsp/blob/main/vscode/src/common.ts) + [client.ts](https://github.com/Shopify/ruby-lsp/blob/main/vscode/src/client.ts) — `SUPPORTED_LANGUAGE_IDS` / documentSelector construction.
- ruby-lsp [lib/ruby_lsp/server.rb](https://github.com/Shopify/ruby-lsp/blob/main/lib/ruby_lsp/server.rb) — didOpen languageId mapping (`else → :ruby`), pull-diagnostics workspace gate, `enabled_features["diagnostics"]` gate.
- ruby-lsp [lib/ruby_lsp/store.rb](https://raw.githubusercontent.com/Shopify/ruby-lsp/main/lib/ruby_lsp/store.rb) — `RubyDocument` default for unknown extensions.
- ruby-lsp [lib/ruby_lsp/requests/diagnostics.rb](https://raw.githubusercontent.com/Shopify/ruby-lsp/main/lib/ruby_lsp/requests/diagnostics.rb) — Prism-only + linters; no semantic checks.
- ruby-lsp [lib/ruby_lsp/addon.rb](https://raw.githubusercontent.com/Shopify/ruby-lsp/main/lib/ruby_lsp/addon.rb) — addon class, `Gem.find_latest_files`, project `Dir.glob` discovery, bundler rescues.
- [Add-ons docs](https://shopify.github.io/ruby-lsp/add-ons.html) — listeners, request enhancement, performance guidance, "experimental" banner.
- [Indexing enhancements docs](https://mintlify.wiki/Shopify/ruby-lsp/addons/indexing-enhancements) — `RubyIndexer::Enhancement`, call-site vs declaration DSLs.
- [ruby-lsp-rails addon.rb](https://github.com/Shopify/ruby-lsp-rails/blob/v0.3.26/lib/ruby_lsp/ruby_lsp_rails/addon.rb) — listener API in production use.
- [ruby-lsp #2376](https://github.com/Shopify/ruby-lsp/issues/2376) — Gemfile.lock activation pain.
- [railsatscale](https://railsatscale.com/2025-07-01-a-ruby-open-source-sabbatical) — indexing cost figures.
- [magicmonty/sonicpi.nvim](https://github.com/magicmonty/sonicpi.nvim) — closest prior art (Solargraph + on_init injection, diagnostics off by default).
- [s00500/vscode-sonic-pi](https://github.com/s00500/vscode-sonic-pi) — our upstream: static-only.
- [llloret/sonic-pi-vscode-editor](https://github.com/llloret/sonic-pi-vscode-editor) — daemon-reported errors only.
- [owenlamont/ryl #323](https://github.com/owenlamont/ryl/issues/323) — multi-collection diagnostic dedup mechanics.
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events) — `onLanguage` semantics.
- [Ruby LSP marketplace](https://marketplace.visualstudio.com/items?itemName=Shopify.ruby-lsp) — feature list + enabledFeatures toggle.
- [Zed Ruby docs](https://zed.dev/docs/languages/ruby) — multiple Ruby servers coexisting; user chooses.

**Rejected/deprioritized:**
- Medium post — second-hand, corroborating only.
- Reddit threads — anecdotal.
- Stack Overflow ERB diagnostics — user troubleshooting; useful only as corroboration that Prism is the diagnostic source.
- sonic-pi.el gist — not LSP-relevant.
- tm-grammars list — keyword-collision noise.

## Next steps
1. **Verify against installed 0.26.10:** diff `addon.rb`/`store.rb`/`server.rb` between `main` and the v0.26.10 tag (addon API is experimental; confirm `create_*_listener` signatures).
2. **Spike (~half a day):** embed a `LanguageClient` pointing at `/usr/bin/ruby-lsp` with selector `sonic-pi`; confirm diagnostics render for a missing-`end` inside `live_loop do`. Empirically validates 1.3/2.1/2.2.
3. **Decide completion delivery:** static client-side (recommended) vs addon-injected; measure current static completion latency for comparison.
4. **Check s00500/vscode-sonic-pi issues** for LSP/diagnostics feature requests to validate demand.
