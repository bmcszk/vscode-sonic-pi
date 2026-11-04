# Research: Run cell semantics — which blocks are meaningfully runnable? (Phase A of sonic-pi-rtvk)

**Status: COMPLETE.** Server-source analysis by researcher (salvaged from run `adf523c1`, which hit the 30-min async timeout after finishing the analysis), tutorial citations and synthesis by the parent (2026-11-04). Ground truth: the Sonic Pi 5.0.0 runtime our extension actually boots (`/usr/lib/sonic-pi`).

## The model that explains everything

Every Run (`/run-code`) creates a **new job thread** and evals the code with `eval(code, nil, workspace, firstline)` against a **long-lived runtime object** (`sp`) and a **long-lived `user_methods` Module**, both created once at server boot:

- **Running a block does NOT stop previous jobs** — runs stack concurrently (`runtime.rb`, `__spider_eval` → `@user_jobs.add_job`; only `/stop-all-jobs` kills).
- **Methods defined with `define` live on the persistent Module** → they survive across runs.
- **Local variables live in the single eval's binding** → they die the moment that run's eval ends. They are NOT visible to any other run or block. Ever.

## Answers to the contract questions

### Q1 `define :chord_player do … end` run alone
- **Silent** — it only registers a method (`core.rb` ~3002: `@user_methods.send(:define_method, name, &block)`).
- **BUT the definition persists**: official tutorial §5.5 "Functions": *"When you define a function, Sonic Pi remembers it… Delete all the code in your buffer, replace it with `foo`, press Run — and hear your function play. This behaviour only works with functions created using `define` (and `defonce`)."*
- Live-coding consequence (tutorial's own framing: define is "the gateway into live coding"): re-running an edited `define` block while a running `live_loop` calls that function **changes the sound of the running loop immediately** — no stop needed.

### Q2 `chord_low_1 = chord :c2, :maj9` block run alone
- **Silent** — binds a local, triggers nothing.
- **Actively misleading**: locals do not survive the eval (separate binding per run). Later runs/blocks **cannot see `chord_low_1`** — a block referencing it fails standalone with `NameError` (undefined local variable).
- Sanctioned persistent form is Time State: `set`/`get` — tutorial §"Time State": *"calls to `get` can return information that was `set` in a previous run… when sharing information across live loops and threads, use `get` and `set` instead of variables."*

### Q3 `with_fx :reverb do live_loop :x do … end end` run alone
- **Audible** — the inner loop plays through the fx.
- Re-run: each run creates its **own fx instance** (`Run-#{job_id}-#{fx_name}` buses/groups, `sound.rb` ~1913); the same-named `live_loop` is redefined and its thread replaced (named-thread rule: the old loop is killed once the new registers); the old fx group is garbage-collected after its block's threads finish + kill delay. **Safe to re-run, no stacking.**

### Q4 Cross-block visibility when only a block is run
- Locals from other blocks: **invisible** (separate eval bindings) → `NameError`.
- `define`d functions from other blocks: **visible**, if their `define` block ran at least once this session (persistent Module).
- `~dollar` thread-locals: thread-scoped per the docs (not shared into a different run's threads).

### Q5 Classification table

| Construct | Audible on single-block run | Persists across runs | Run cell lens |
|---|---|---|---|
| `define` / `defonce` block | no (registers only) | **yes** (method on persistent Module) | **user decision** — see below |
| `live_loop` block | yes (starts looping) | thread replaced on re-run | **KEEP** |
| `with_fx … do live_loop … end` | yes | fx instance per run; safe | **KEEP** |
| `play`/`sample`/`synth` statement | yes | n/a | **KEEP** |
| `in_thread` block | yes | named duplicates killed at birth | **KEEP** |
| assignment-only block (`x = …`) | **no** | **no** (locals die with the eval) | **REMOVE** (misleading) |
| settings-only (`use_*`, `set_*!`) | no | thread-local (mostly) | REMOVE (already shipped) |
| comment-only | no | — | REMOVE (already shipped) |

## Recommended rule for `src/codelenses.ts`

1. Keep shipped filters (comment-only, `use_*`/`set_*!`-only).
2. **Assignment-only blocks get no lens** — every non-comment line matches `^\s*[a-z_]\w*\s*=[^=]` (single `=`, not `==`). Detection is regex-reliable.
3. **`define`/`defonce`-first blocks**: detect `^\s*(define|defonce)\b` on the block's first code line. Two options, needs user sign-off:
   - **(a) Hide the lens** (matches the user's "won't work" instinct; simplest);
   - **(b) Relabel to e.g. `$(sync) Load def`** — turns the lens into the tutorial's live-coding move: edit a function, click, hear running loops change timbre instantly. Genuinely useful in the user's own file (`chord_player` feeds two running loops).
4. Everything else defaults to KEEP (audible-biased); a rare silent-but-kept block (e.g. lone `sleep`) is harmless noise, not a lie.

### What regex CANNOT see (documented limitation, out of scope)

Cross-block **local-variable** dependencies: if `live_loop` block B references `chord_low_1` from assignment block A, B fails standalone (`NameError`) no matter what the lens shows — locals never cross runs. A lens cannot fix that without a Ruby parser. README for Phase B should state plainly: **cells run in isolation; functions (`define`) and Time State (`set`/`get`) are the supported way to share state across cells; use full-file Run for files that rely on plain local variables.**

## Sources

- Local (primary, the booted runtime): `/usr/lib/sonic-pi/app/server/ruby/lib/sonicpi/lang/core.rb` (~3002 `define`, ~2386 `live_loop`), `app/server/ruby/lib/sonicpi/runtime.rb` (`__spider_eval` job model), `app/server/ruby/lib/sonicpi/lang/sound.rb` (~1913 `with_fx`, named-subthread mechanics), `bin/spider-server.rb` (`/run-code` handler).
- Online (official tutorial): sonic-pi.net tutorial §5.5 "Functions — Functions are remembered across runs"; §"Time State" (`set`/`get` persistence quote; sonic-pi.net/tutorial-10.html). Texts retrieved 2026-11-04 (§5.5 text via official-docs mirror sunderb.me, verbatim official wording).
