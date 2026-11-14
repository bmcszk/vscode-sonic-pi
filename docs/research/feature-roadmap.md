# Feature roadmap research — vscode-sonic-pi (bean sonic-pi-818h)

Status: research only, no repo files changed, no commits. Branch `feats-research` (worktree `vscode-sonic-pi-feats`).
Date of pass: 2026-11-14. Target: Sonic Pi 5.0.0 (pacman layout, `/usr/lib/sonic-pi`).

**Binding constraint (from user):** no changes to Sonic Pi itself. Every feature below is editor-side,
consuming surfaces the installed daemon already exposes (OSC routes, push events, documented files).

---

## 0. TL;DR — top-5 killer picks

| # | Feature | Why it wins | Value / Effort / Risk |
|---|---------|-------------|----------------------|
| 1 | **Per-run Stop + Mute-this-loop** (`/stop-job` + job tracking via `/run/started`/`/run/ended`) | True per-loop stop that even the official GUI does not expose; today our "cell stop" silently kills the whole session. Also unlocks Tidal-style mute/unmute. | killer / S-M / low |
| 2 | **Mixer popover** (volume, drive, LPF/HPF sweep, mono/invert/stereo) from the statusbar, initialized from the `/mixer/settings` push | The one live-performance control surface we lack; filter sweeps without writing code. | killer / S-M / low |
| 3 | **Link BPM + peers live display** (`/link-bpm`, `/link-num-peers` pushes) + BPM set via `set_link_bpm!` | Jam-session awareness in the statusbar for free — the data is already arriving on our port and being ignored. | killer / S / low |
| 4 | **Cue Inspector + cue test bench** (tree view of `/incoming/osc`, filter, insert-`sync`-path, UDP test sender to the cue port, `/cue-port-*` controls) | Makes the whole OSC-cue ecosystem (Orca, TouchOSC, Tidal, custom controllers) usable and debuggable from VS Code. | killer / M / low-med |
| 5 | **Audio device hot-swap** via daemon routes (`/daemon/audio/request-devices`, `/switch-device`, `/switch-driver`, `/reopen-device` + `/supersonic/devices` pushes) | Brings the v5 headline feature (plug headphones mid-jam, no reboot) into the editor; we already hold the daemon token for keep-alive. | killer / M / medium |

**Single biggest surprise:** the spider daemon *already pushes* a live telemetry stream to our listening
port — `/link-bpm`, `/link-num-peers`, `/mixer/settings`, `/midi/in-ports`, `/midi/out-ports`,
`/gamepad/devices-list`, `/live_loop/scope`, `/live_loop/scope-ended`, `/run/started`, `/run/ended`,
`/runs/all-completed`, `/spider/ready`, `/buffer/replace-idx`, `/buffer/run-idx` — and our extension
subscribes to almost none of it (it even parses "Starting run N" out of log text instead of using
`/run/started`). Roughly half of this roadmap is "stop ignoring the wire".

---

## 1. Method and ground truth

- Local daemon source read in full: `/usr/lib/sonic-pi/app/server/ruby/bin/spider-server.rb` (all
  `add_method` registrations at lines 302-830; all outgoing `gui.send(...)` events at ~960-1060).
- Local daemon wrapper: `/usr/lib/sonic-pi/app/server/ruby/bin/daemon.rb` (daemon API routes at
  198-246; SuperSonic forwards at 328-355; shm comment at 884).
- Local runtime: `.../lib/sonicpi/runtime.rb`, `lang/core.rb`, `lang/sound.rb`, `studio.rb`, `link_api.rb`.
- Our shipped code: `src/source-runner/main.ts` (OSC handlers 388-476; `/run-code` send at 795;
  stop-all-before-run at 783-785; mixer/record senders 860-912), `src/source-runner/extension.ts`
  (recording flow 306-319), `src/notebook.ts` (interrupt handler 219-231 → stop-all), `src/statusbar.ts`.
- Web: Strudel docs/paper, Tidal docs/blog, FoxDot, Gibber, Orca, vscode-supercollider,
  vscode-tidalcycles, sonic-pi upstream issues/releases. See §7 for which pages were fetched in full
  vs. read as search snippets.

### Wire inventory: used vs. ignored (local evidence)

**Incoming routes we already send:** `/run-code` (no workspace arg → daemon defaults workspace to
`'eval'`, runtime.rb:1357), `/stop-all-jobs`, `/buffer-beautify`, `/start|stop|save|delete-recording`,
`/mixer-output-volume`, `/mixer-{invert-stereo,standard-stereo,mono-mode,stereo-mode}`, `/version`,
`/midi-start`, plus daemon-level `/daemon/keep-alive` and `/daemon/exit`.

**Incoming routes never sent:** `/save-buffer`, `/save-and-run-buffer`, `/load-buffer`, `/stop-job`,
`/buffer-newline-and-indent`, `/buffer-indent-selection`, `/buffer-section-complete-snippet-or-indent-selection`,
`/buffer-section-toggle-comment`, `/mixer-drive`, `/mixer-lpf-enable|disable`, `/mixer-hpf-enable|disable`,
`/ping`, `/exit`, `/gui-heartbeat`, `/midi-stop`, `/midi-reset`, `/midi-port-enable`, `/gamepad-start|stop`,
`/gamepad-enable`, `/cue-port-{start,stop,external,internal}`, `/set-global-timewarp`,
`/check-for-updates-now`, `/enable|disable-update-checking`, and daemon's `/daemon/audio/*` family.

**Outgoing events never listened to:** `/link-bpm`, `/link-num-peers`, `/mixer/settings`,
`/midi/in-ports`, `/midi/out-ports`, `/gamepad/devices-list`, `/live_loop/scope`, `/live_loop/scope-ended`,
`/run/started`, `/run/ended`, `/runs/all-completed`, `/spider/ready`, `/ack`, `/exited`,
`/exited-with-boot-error`, `/buffer/replace-idx`, `/buffer/run-idx`, `/buffer/replace-lines`,
`/supersonic/statechange`, `/supersonic/info` (daemon-forwarded).

**Listened to:** `/version`, `/log/info`, `/log/multi_message`, `/incoming/osc`, `/syntax_error`,
`/error`, `/flash`, `/buffer/replace` (beautify reply).

---

## 2. Full feature table

Value: killer / nice / meh. Effort: S / M / L. Risk: low / med / high (breakage, UX or version-lock).

| Feature | What the user gets | OSC surface used | Value | Effort | Risk | Deps |
|---|---|---|---|---|---|---|
| **F1 Per-run Stop / Stop-this-loop** | ■ button (or cell stop) kills only that run's job; other loops keep playing. Today every stop is global (`src/notebook.ts:224-231`). | listen `/run/started`(id, workspace), `/run/ended`, `/runs/all-completed`; send `/stop-job`(token, id) | killer | S-M | low | job→cell map |
| **F2 Mute/unmute loops (Tidal d1-style)** | Toggle a live_loop silent without deleting it; unmute re-runs its remembered code | F1 + `/run-code` re-send of stored cell text | killer | M | low | F1, cell store |
| **F3 Mixer popover** | Statusbar → volume, drive, LPF/HPF enable+freq, mono/stereo, invert; live values shown | `/mixer-output-volume`, `/mixer-drive`, `/mixer-lpf|hpf-*`, `/mixer-{mono,stereo,invert,standard}-*`; state from `/mixer/settings` push | killer | S-M | low | none |
| **F4 Link BPM + peers statusbar** | `♪ 122.4 · ⇄3` item, live-updating; click to set session BPM (via silent `/run-code` of `set_link_bpm! n`) | pushes `/link-bpm`, `/link-num-peers`; set via `/run-code` (lang/core.rb:3993 `set_link_bpm!` is a documented fn) | killer | S | low | none |
| **F5 Cue Inspector panel** | Tree view of `/incoming/osc` events (time, address, args), filter box, "copy/insert `sync :path`", pause/clear | listen `/incoming/osc` (already received, dumped to log channel); `/cue-port-start/stop/external/internal` | killer | M | low-med | TreeView |
| **F6 Cue test bench** | Send test OSC cues (address + args editor) from VS Code to exercise `sync` code — no external tool needed | our own UDP sender to the documented cue port (4560 default; `spider-server.rb:133-138`) — not a daemon change | nice | S | low | F5 |
| **F7 Audio device hot-swap** | Pick output/input device, driver, sample rate; "Reset audio device" — v5's headline feature, in-editor | daemon routes `/daemon/audio/request-devices`, `/switch-device`, `/switch-driver`, `/reopen-device` (daemon.rb:228-235) with daemon token we already hold; device table from `/supersonic/devices` pushes (daemon.rb:337-340) | killer | M | med | daemon token |
| **F8 Multi-buffer workspace sync** | Every open `.pi` file registered as its own workspace: per-file error/flash mapping, daemon buffer ops per tab, enables F1/F2 per file | `/save-buffer`(token, id, code), `/save-and-run-buffer`(token, id, code, workspace), `/load-buffer`, `/buffer/replace` | nice (enabler) | M | med | per-file ids |
| **F9 Run-tracking hardening** | Replace log-line regex (`main.ts:398`) with real events; faster, locale-proof | `/run/started`, `/run/ended`, `/runs/all-completed`, `/spider/ready`, `/exited`, `/exited-with-boot-error` | nice | S | low | none |
| **F10 Health ping** | Sub-second server liveness (complements audio-loss detection) | `/ping` → `/ack` roundtrip (spider-server.rb:462-471) | nice | S | low | none |
| **F11 Sample/synth preview** | ▶ button in the Docs browser (and hover/code-action) plays `sample :bd` / `synth :prophet` in a silent workspace — app-parity "preview player" | `/run-code` with silent flag (`args[3]==1`, spider-server.rb:302-316); stop via `/stop-all-jobs` | nice-killer | S-M | low | docs browser |
| **F12 Auto-run on save (live-reload)** | Strudel-style: save file → code updates in the running session; was explicitly requested upstream (issue #1902) | `/run-code` on `onDidSaveTextDocument` (config-gated) | nice | S | low-med | config |
| **F13 Recording auto-import** | After the existing save dialog, offer to insert `sample "<path>"` at the cursor | existing `/save-recording` flow (extension.ts:306-319) + editor edit API | nice | S | low | none |
| **F14 MIDI device picker** | Toggle individual in/out ports from a QuickPick; mirrors the app's IO menu | pushes `/midi/in-ports`, `/midi/out-ports`; send `/midi-port-enable`, `/midi-stop`, `/midi-reset` | nice | S | low | none |
| **F15 Gamepad support** | Device picker + start/stop; auto-start when code uses gamepad fns (like our `autoMidiStart`) | pushes `/gamepad/devices-list`; send `/gamepad-enable`, `/gamepad-start`, `/gamepad-stop` | nice | S | low | F14 pattern |
| **F16 Timewarp picker** | Set global schedule-ahead latency (use_bpm-latency tuning for live play) | `/set-global-timewarp`(token, seconds) (spider-server.rb:806) | nice | S | low | none |
| **F17 Live_loop activity badges** | Per-live_loop inline badge/scope *placeholder* pinned to the loop's header line; pairs with playing-line highlight | pushes `/live_loop/scope`(jobid, name, workspace, line, slot), `/live_loop/scope-ended` (spider-server.rb:1001-1004; core.rb:2430-2469) | nice | M | low | decoration API |
| **F18 Scope via shared memory (fragile tier)** | Real waveforms: master + per-loop mini-oscilloscopes in a webview, like the app | read `/dev/shm/SuperSonic_<scsynth-port>` segment (exists live on this machine; layout defined by upstream `shared_memory.h`, version-tagged by a MAGIC) — *not* an OSC route; read-only, no daemon change | killer if stable | L | high (layout is an internal contract; commit a97c53b shows it being reworked) | native shm read |
| **F19 "Run at next bar" (quantized run)** | Gibber-style: hold a run until the next Link bar so edits land musically | editor wraps the cell in a bar-sync preamble via `/run-code` (language-level `use_bpm :link` + `sync`); no route needed | nice | M | med (alters user code) | F4 |
| **F20 Sets (`.sonicpi`) save/load** | Save/restore all open Sonic Pi buffers as one plain-text set (app parity, but over our unlimited files) | pure editor file I/O + F8 workspaces | nice | S-M | low | F8 |
| **F21 Config/init.rb quick open** | Command to open `~/.sonic-pi/config/init.rb` (the editor-side equivalent of Tidal's BootTidal selection) | file I/O only; daemon already evals init.rb on boot (spider-server.rb:233-236) | nice | S | low | none |
| **F22 Update-check refresh** | "Check for updates now" on the version tooltip | `/check-for-updates-now` + `/version` | meh | S | low | none |
| **F23 Daemon-side comment toggle / snippet expand** | App-parity commenting and server snippet expansion | `/buffer-section-toggle-comment`, `/buffer-section-complete-snippet-or-indent-selection`, `/buffer-indent-selection`, `/buffer-newline-and-indent`; replies via `/buffer/replace-lines` | meh (VS Code already does both well enough) | S-M | low | none |
| **F24 Clean shutdown** | `/exit` to the spider instead of SIGKILL of the daemon child | `/exit`(token) | meh | S | low | none |

Priority read: F1→F3→F4 are the cheapest killers (all S-M, all low risk, no new infrastructure).
F5-F7 form the second wave. F8 is an enabler worth doing when F1/F2 need per-file granularity.

---

## 3. Route-group → UX mapping (the killer-feature scan, detailed)

**Recording group** (`/start-recording`, `/stop-recording`, `/save-recording`, `/delete-recording`):
already shipped (toggle + save dialog + delete-on-cancel, `extension.ts:306-319`). Gaps: F13
auto-import; a statusbar ● REC indicator while recording (S). Daemon semantics verified: recording is
written to a temp wav and `recording_save(filename)` *moves* it (lang/sound.rb:1107-1160) — so the
save dialog path must be a final destination, which we already respect.

**Mixer group**: only volume is surfaced (input-box prompt in `statusbar.ts`). F3 adds drive
(pre-limiter gain, the v5 "crunch" control — release notes: volume and drive are now separate controls
on opposite sides of the limiter), LPF/HPF with frequency, mono/invert/stereo, and — importantly —
live state via the `/mixer/settings` push (`studio.rb:378-385`: the daemon pushes drive+volume on
every change, whoever changed it, so dials never go stale). UI: QuickPick first (S), real dials in a
webview panel later (M).

**Link group**: `/link-bpm` and `/link-num-peers` are *pushes* (link_api.rb:355-377: tempo and peer
notifications fire `/link-bpm` / `/link-num-peers` to the GUI, plus internal cues
`/link/tempo-change`, `/link/num-peers`, `/link/connected|disconnected` — which also appear in the cue
stream). There is no incoming "set link bpm" route; setting goes through the documented fn
`set_link_bpm!` via silent `/run-code` (editor-side trick, no daemon change). F4.

**Cue-port group**: `/cue-port-start|stop|external|internal` toggle the daemon's cue server modes.
Combined with `/incoming/osc` (already received and logged) this gives F5/F6. Extra: internal cues
(`/link/*`, `/midi/*`) arrive in the same stream, so the Cue Inspector doubles as a Link/MIDI event
monitor.

**Buffer group**: `/save-buffer`, `/load-buffer`, `/save-and-run-buffer`, plus outgoing
`/buffer/replace`, `/buffer/replace-idx`, `/buffer/replace-lines`, `/buffer/run-idx`. Verified
semantics: buffers persist as `~/.sonic-pi/store/../buffers/<id>.spi`-style project files
(`__load_buffer` reads `Paths.project_path/<id>.spi`, runtime.rb:1046-1053) and `__spider_eval` takes
a workspace string used in `/flash` and error line mapping (runtime.rb:1351-1360). We currently send
`/run-code` with no workspace → everything lands in `'eval'`. F8 registers each editor under its own
workspace id so flash/error/stop all become per-file.

**Gamepad/MIDI group**: device lists are pushes (`/midi/in-ports`, `/midi/out-ports`,
`/gamepad/devices-list` — runtime.rb:1969-1970 encodes device pairs); enables `/midi-port-enable(id,
dir, on)` and `/gamepad-enable(id, on)`. F14/F15. Our `autoMidiStart` already covers `/midi-start`
heuristically; the same heuristic can auto `/gamepad-start`.

**Timewarp**: `/set-global-timewarp(time)` sets the global schedule-ahead time (spider-server.rb:806).
Live-performance latency tuning; pairs with F16.

**Lifecycle group**: `/ping`→`/ack`, `/gui-heartbeat`, `/exit`, `/exited`, `/exited-with-boot-error`,
`/spider/ready` (sent once when the runtime is up, spider-server.rb end of boot). F9/F10/F24: today
boot and run-state detection lean on log scraping; these events make it exact.

**Audio-device group (daemon-level)**: `/daemon/audio/request-devices` → engine broadcasts the device
table; `/daemon/audio/switch-device`, `/switch-driver`, `/reopen-device` apply changes
(daemon.rb:226-246). These use the *daemon* token — which we already parse and use for keep-alive
(`main.ts:565-572`), so this is within reach today. Consequence to handle in UX: a real device rebuild
triggers the spider's cold-swap reinit, which **stops running jobs** (spider-server.rb:866-880 comment
is explicit). So F7 must warn "this restarts your running code" — same as the app.

---

## 4. What other systems offer that we lack (research question 1 & 4)

**Strudel (strudel.cc)** — REPL with built-in visual feedback: highlights which mini-notation elements
drive the currently sounding event; `pianoroll`/`punchcard` scrolling visualizations; `spiral`;
`scope`; `.fft()`; hydra shader integration with `H(pattern)` mapping patterns to visuals
(strudel.cc/learn/visual-feedback, strudel.cc/learn/hydra, technical-manual/repl). Also: shuffle-mode
example browser, interactive tutorial worksheets, sound browser with per-bank sample counts.
Transferable editor-side: playing-line highlight (we have — the analogue of Strudel's active-element
highlight), docs-with-preview (F11), tutorial via our `.pibook` notebooks, live-reload (F12).
Not transferable: true pianoroll (needs pattern-event data Sonic Pi does not expose over OSC; only
line-level `/flash`). A "pulse timeline" webview driven by `/flash` events is the honest middle ground.

**TidalCycles / SuperDirt tooling** — per-connection `d1..d16` with mute/unmute (`ctrl+number`,
pulsar-tidalcycles), `hush`, `setcps` global tempo, orbits for multichannel routing, BootTidal file
selection, hover/completion verbosity levels (vscode-tidalcycles: `OFF/MINIMUM/NO_EXAMPLES_NO_LINKS/FULL`).
Steal: mute/unmute (F2 — via `/stop-job` + re-run), global tempo readout/set (F4), boot-file selection
(F21 → init.rb), configurable docs verbosity (XS, nice). Skip: orbits (no route — see §5).
Pitfall to avoid: vscode-tidalcycles depends on fragile ghci stdin/stdout plumbing; our OSC channel is
far more robust — keep it that way (prefer pushes over log parsing, F9).

**vscode-supercollider** — server status bar with live CPU/UGens/synths/groups, per-workspace language
instances with auto-allocated ports, evaluate-region-by-name, MCP server exposing the synth server to
AI assistants, sclang info panel. Steal: the *shape* of the statusbar (our F3/F4 items), an "engine
info" panel fed by `/supersonic/info` + `/supersonic/statechange` pushes (payload unverified — flagged
in §6). Their pitfalls: quark/extension version-mismatch install pain (we have none of that — good);
they deliberately removed click-to-kill-server from the statusbar as too easy to hit by accident —
apply the same rule to any destructive action in our statusbar items.

**FoxDot (Atom/Pulsar plugin + vscode-foxdot)** — block-at-cursor eval (blank-line blocks — same rule
as our cells), evaluate file, multiple-cursor evaluation in order, clear-clock shortcut. vscode-foxdot
itself is WIP with just start + eval-selection. Steal: multi-cursor ordered evaluation (S, cute);
nothing structural.

**Gibber / gibberwocky** — column-based environment with code/GUI/reference/graphics columns;
audiovisual mappings; execution optionally deferred to the next musical measure for sample-accurate
sync. Steal: "run at next bar" (F19) and, longer-term, the idea of a *performance view* column
(webview showing cues + playing lines). Not stealable: shader/graphics stack (out of scope).

**ORCA (Hundred Rabbits)** — grid sequencer emitting MIDI/OSC/UDP; explicitly documents a Sonic Pi
OSC target and a tutorial section for it; controllable itself over UDP. Relevance: our Cue Inspector
(F5) + test bench (F6) turn the documented Orca↔Sonic-Pi recipe into a first-class workflow; consider
a docs page recipe. No feature to build beyond that.

**Sonic Pi's own GUI (v5 release notes, fetched)** — what the app has that we lack, editor-side
feasibility: inline mini-oscilloscope per live_loop (F17 placement events now; F18 real waveforms),
scope triggering + level scope (F18 only), Quickstart Cards (content feature — could ship as .pibook
deck), completion popup with previews/mini-keyboard/sliders (VS Code API limits: no mini-keyboard in
completion items; preview player belongs in our Docs browser, F11), Sets (F20), in-editor search
(VS Code native), audio prefs incl. Volume/Drive/Level meter (F3; level meter needs F18),
SuperSonic debug panel + node tree (shm-dependent), Link Audio Streams panel (engine pushes,
unverified payload), video recording + Syphon/Spout (GUI-only, skip).

---

## 5. Not possible without daemon changes — skip (honoring the constraint)

- **Per-synth/per-bus audio routing (Tidal orbits)**: no route exposes bus allocation or per-synth
  output mapping. Users can still do `with_fx` routing *in code*; editor-side routing UI is out.
- **Real-time waveform/spectrum data over OSC**: audio samples are not on the OSC wire. Only the shm
  segment carries them (see F18 — allowed since read-only, but version-locked; do not promise it).
- **Engine metrics (CPU, node/synth counts) as vscode-supercollider has**: metrics live in shm; the
  `/supersonic/info` push payload is unverified. Do not build on it until verified.
- **Pattern-event stream (Strudel-style pianoroll)**: the daemon reports *source lines* (`/flash`),
  not musical events (note/dur). No route exists.
- **Per-synth kill / synth-graph inspection**: `/stop-job` is job-granular, not synth-granular.
- **Tempo *set* via a dedicated route**: does not exist; the `set_link_bpm!`-via-`/run-code` trick (F4)
  is the sanctioned path. A hypothetical `/set-link-bpm` route would need upstream change — skip.
- **Recording to video, Syphon/Spout streaming**: GUI-process features, no OSC surface.

---

## 6. Missing evidence / open questions

- `/supersonic/info` and `/supersonic/devices` push payloads: byte layout not verified locally (the
  forwarding exists, daemon.rb:337-340; content unknown). F7's device picker needs this decoded.
- Shm segment layout for F18: upstream has `shared_memory.h` with a MAGIC and an in-flux layout
  (commit a97c53b reworked it). If attempted, gate strictly on the magic + verify against the
  installed 5.0.0; treat as experimental.
- Whether `/buffer/run-idx` / `/buffer/replace-idx` (Quickstart-card plumbing) have any editor-useful
  semantics for us: probably not, but unverified.
- Upstream dev-branch issue triage was sampled via search, not exhaustively enumerated; the two
  load-bearing upstream asks cited (#1902 external editor/LSP/waveform; the forum thread on buffer
  limits) were snippet-verified, not fetched page-by-page.

---

## 7. Citations

**Fetched in full (keenable_fetch):**
- Sonic Pi v5.0.0 release notes — https://github.com/sonic-pi-net/sonic-pi/releases/latest
  (app feature inventory: scopes, Sets, drive/volume split, audio hot-swap, link_audio, gamepads).

**Local files (authoritative for daemon behavior):**
- `/usr/lib/sonic-pi/app/server/ruby/bin/spider-server.rb` — route registrations 302-830; outgoing
  events incl. `/live_loop/scope` 1001-1004; `/ping`→`/ack` 462-471; `/supersonic/setup` reinit
  stops jobs 866-880.
- `/usr/lib/sonic-pi/app/server/ruby/bin/daemon.rb` — daemon API + audio routes 198-246, 226-246;
  SuperSonic push forwarding 328-355; shm segment naming 884.
- `/usr/lib/sonic-pi/app/server/ruby/lib/sonicpi/runtime.rb` — `__load_buffer`/`__save_buffer`
  1046-1063; `__spider_eval` workspace default `'eval'` 1351-1360; heartbeat 349-353.
- `/usr/lib/sonic-pi/app/server/ruby/lib/sonicpi/lang/core.rb` — live_loop scope tap + slot logic
  2430-2469; `set_link_bpm!` 3993-4024.
- `/usr/lib/sonic-pi/app/server/ruby/lib/sonicpi/lang/sound.rb` — recording lifecycle 1107-1182.
- `/usr/lib/sonic-pi/app/server/ruby/lib/sonicpi/link_api.rb` — `/link-bpm` + `/link-num-peers`
  pushes and internal cues 355-377.
- `/usr/lib/sonic-pi/app/server/ruby/lib/sonicpi/studio.rb` — `/mixer/settings` push semantics 347-385.
- `/usr/lib/sonic-pi/app/server/ruby/lib/sonicpi/synths/synthinfo.rb` — `:fx_scope_out` doc 6018-6059.
- Worktree: `README.md`, `CHANGELOG.md`, `docs/research/feature-gaps.md`,
  `docs/research/editor-run-controls.md`, `src/source-runner/main.ts`, `src/source-runner/extension.ts`,
  `src/notebook.ts`, `src/statusbar.ts`.
- Live system: `/dev/shm/SuperSonic_29947`, `/dev/shm/SuperSonic_57190` (segment existence check).

**Web, read via search-result snippets (substantive but not page-fetched; treat as secondary):**
- Strudel REPL architecture & visual feedback — https://strudel.cc/technical-manual/repl ,
  https://strudel.cc/learn/visual-feedback , https://strudel.cc/learn/hydra ,
  https://strudel.cc/learn/getting-started ; ICLC 2023 paper text (aesthetic.computer mirror).
- Tidal — https://tidalcycles.org/docs/getting-started/tutorial ,
  https://blog.tidalcycles.org/2018/07 ,
  https://tidalcycles.org/docs/configuration/AudioConfig/audio_outputs (orbits).
- Editors — https://github.com/tidalcycles/vscode-tidalcycles (README),
  https://github.com/tidalcycles/pulsar-tidalcycles (README),
  https://github.com/scztt/vscode-supercollider (README; scsynth.org statusbar/liveshare threads),
  https://marketplace.visualstudio.com/items?itemName=vvzen.vscode-foxdot ,
  https://packages.pulsar-edit.dev/packages/foxdot , https://github.com/Qirky/FoxDot ,
  https://marketplace.visualstudio.com/items?itemName=deep2universe.strudel-box.
- Gibber — https://gibber.cc , Roberts 2014 (ACM MM, UCSB PDF), gibberwocky (NIME 2017 PDF).
- Orca — https://github.com/hundredrabbits/Orca/blob/main/README.md (operators/IO/ports, Sonic Pi
  tutorial reference), https://github.com/hundredrabbits/orca-c.
- Upstream asks — https://github.com/sonic-pi-net/sonic-pi/issues/1902 (external editor / LSP /
  waveform-over-extension idea), https://in-thread.sonic-pi.net/t/vs-code-extension/3935 ,
  https://in-thread.sonic-pi.net/t/edit-sonic-pi-code-in-my-own-editor/8465 ,
  commit https://github.com/sonic-pi-net/sonic-pi/commit/a97c53b117ff35783304568775c7ccfa39f84999
  (shm layout rework, `shared_memory.h`).
