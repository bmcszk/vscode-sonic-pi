# Feature gap analysis — sonic-pi-helper (marketplace) + Sonic Pi app vs ours (sonic-pi-q65q)

Analysis date: 2026-11-04. Every claim below was verified against extracted sources, not docs alone.

## 1. sonic-pi-helper v0.3.2 (vsix downloaded + inspected; `out/` + manifest)

Complete surface:
| Feature | Detail |
|---|---|
| Run/Stop (alt+r/alt+s) | 2 commands. **Connection by process discovery**: scans `/proc/*/cmdline` (Linux) / PowerShell (Windows) for `spider-server.rb -u <port> ... <token>` — attaches to whatever Sonic Pi is already running; NO daemon management, no boot, no recovery |
| Hover + completions | from bundled `data/sonic-pi-compact.json`: 43 synths, 34 fx, **11 samples** (stale subset), symbol notes, ~30 keyword templates |
| Snippets (`ll`, `lls`, `llb`, ...) | Spanish-labeled templates |
| Language config | `.rb` registered as sonic-pi; brackets/comments config |

**Verdict vs ours:** nothing it has that we lack except **snippets**; its completions/hovers are a subset of ours (we ship 43 synths + 34 fx + samples with full option docs via `argsParser.ts`), and it has no editor controls, highlight, notebook, cue log, error decoration, or server-side robustness. Its genuinely interesting idea is the **/proc attach mode** (serve a running Sonic Pi *app* from any editor).

## 2. Sonic Pi app vs us — unused OSC surface (from `/usr/lib/sonic-pi/.../spider-server.rb` add_method list)

| OSC method | GUI uses it for | We use it? | Feature potential |
|---|---|---|---|
| `/version` | status dialog | no | **Connection status in the status bar** (server state + version at a glance) |
| `/mixer-output-volume` | master volume slider | no | **Status-bar volume control** (only media control we're missing) |
| `/buffer-beautify`, `/buffer-indent-selection` | Align / indent buttons | no | "Sonic Pi: Beautify" (center-align do/end blocks) using the app's own RBeautify engine |
| `/midi-start` etc. | MIDI pane | no | Auto-start MIDI when `midi_*` functions are used (their runtime needs it) |
| `/gui-heartbeat` | liveness | no | Faster/robust server-loss detection (complements audio-recovery) |
| `/load-buffer`/`/save-buffer` | buffer sync with GUI | no | (only relevant if sharing state with the GUI app; skip) |
| `/external_editor` | "open in external editor" | n/a | the inverse of our use-case; skip |

Notes:
- **No `/stop-job` exists** — Sonic Pi has no single-job kill OSC; "stop everything" is the app's own model. A "stop this loop" feature would require upstream change → skip.
- Recording is complete in ours already (start/stop/save-dialog/current stop).
- The still-alive-your-older-runs flash behavior + frame-depth cap are daemon semantics (documented in playing-line-highlight.md; upstream issue filed, NO PR to be opened per user directive).

## 3. Proposed features (ranked by value/effort; pick any)

P1 **Status bar: server state + version + volume** — one item shows ● running/stopped (via expected running pid) + Sonic Pi version (from `/version` on connect); click → pick volume (`/mixer-output-volume`). Small, closes the biggest visible parity gap with the app. 
P2 **Snippets pack** (`ready made snippets`): live_loop/synth/sample/use_bpm/etc. templates. Trivial (manifest only), helps beginners; the one thing the helper does that we don't. 
P3 **Build-along/completion polish (optional)**: trigger completion on `:` and `,` like helper, plus a `Sonic Pi: Docs` quick-pick browser over our builtins data (synths/fx/samples docs in a searchable picker). 
P4 **Beautify buffer** via `/buffer-beautify` (needs our buffer content + workspace name; app parity "Align"). Small-medium.
P5 **MIDI auto-start** when a run's code contains `midi_*` (config-gated). Tiny.
P6 **"Attach to running Sonic Pi app" mode** (process discovery like helper + our token/port parse): lets power users keep the GUI app + VS Code simultaneously. Medium; recommend only if a user actually wants both.
P7 (hygiene) **Option: stop server when last Sonic Pi editor closes.** Small.

Explicitly NOT proposed (with reasons): single-run stop (no upstream OSC), GUI buffer sync, upstream PRs (user directive), external-editor integration.
