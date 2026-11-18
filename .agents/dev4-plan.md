# Dev4 wave plan — vscode-sonic-pi (branch `dev4` from `dev3`, stacked on PR #3)

Research pass, read-only. No repo mutations, no commits. Every daemon-route claim below carries a
file+line I actually read this run; every "shipped" claim carries a file I actually opened.
Target daemon: installed Sonic Pi 5 (pacman layout, `/usr/lib/sonic-pi`), `spider-server.rb` 1105 lines,
`daemon.rb` ~1233 lines.

---

## 0. Shipped-inventory verification (live tree, dev3 tip)

All 12 shipped-list items verified present, EXCEPT one honesty correction (item 5):

| Shipped claim | Verified at |
|---|---|
| Per-run stop (`/stop-job`) | `src/source-runner/main.ts:921-934` (`stopCell`), handler `/run/started`→`liveJobs` `main.ts:478-495` + `src/source-runner/osc-handlers.ts:120-135`; `test/unit/per-run-stop.test.js` (read in full); notebook interrupt → `stopCellByKeys` `src/notebook.ts:~228-243` |
| Mute-this-loop | `src/loop-mute.ts` (whole file read: `MuteRegistry`, cap 64), lenses `src/codelenses.ts:60-79`, commands `src/extension.ts:154-178`, integration `test/integration/suite/editor-controls.integration.js:181-333` |
| Mixer popover + drive | `src/mixer-panel.ts` (whole file: volume/drive/LPF/HPF/stereo/invert QuickPick), senders `main.ts:870-897` (`/mixer-drive` silent=1), push handler `osc-handlers.ts:64-69` (`/mixer/settings`), statusbar item `src/statusbar.ts:66,98` |
| Link BPM + peers | `src/link-label.ts` (whole file), `main.ts:827-837` (`setLinkBpm`, 20-999 range, silent no-replace run), `osc-handlers.ts:81-95`, `statusbar.ts:97` (priority 97), integration `server-lifecycle.integration.js:88-110` |
| Cue inspector tree + filter/pause/clear | `src/cue-inspector.ts`, `src/cue-store.ts` (both whole files), `/incoming/osc` handler `osc-handlers.ts:137-144`, view commands `src/source-runner/extension.ts:350-404` |
| **Cue test bench** | `src/cue-bench.ts` (whole file: `parseArgs`, `CueBenchSender`), `main.ts:933-941` — **shipped** |
| **Cue-port controls** | `main.ts:943-957` senders exist — **BUT dead code**: no command anywhere calls `cuePortStart/Stop/External/Internal` (grep `cuePort` in `src/`: only `main.ts`), `package.json` contributes no cue-port command, and the integration suite's claim "the extension's cuePort* senders are unit-covered" (`test/integration/suite/cue-inspector.integration.js:6`) is **false** — `test/unit` has only no-op stubs (`notebook.test.js:185-188`) and the integration test exercises the fake daemon's own `/fake/` recording channel (tautological). **Verdict: NOT shipped user-facing; dev4 task D5 wires it.** |
| Audio device picker + reopen + warning | `src/audio-device-picker.ts` (whole file: `RUNNING_CODE_CONFIRM`, `runDevicePicker`), senders `main.ts:397-415` (`/daemon/audio/*` via cached per-port daemon sender), push handler `osc-handlers.ts:71-78,216-227`, commands `source-runner/extension.ts:296-304,196-236` |
| Docs-in-editor | `src/docs-browser.ts` (whole file: QuickPick → `sonicpi-docs` readonly doc) |
| Recording flow | `src/source-runner/extension.ts:557-571` (toggle → save dialog → `saveRecording`/`deleteRecording`), senders `main.ts:841-855` |
| Codelens run controls | `src/codelenses.ts` (whole file: Run/Stop file lenses, Run cell/Load def block lenses, Mute/Unmute), `runWithText` `source-runner/extension.ts:530-541` |
| Notebook cell stop | `src/notebook.ts:~220-245` (interruptHandler → `stopCellByKeys` with `stopAllScripts` fallback) |
| Takeover-on-play | `main.ts:takeOverConnection` (token-matched `/daemon/exit` then fresh boot), `src/attach.ts`, `test/integration/suite/takeover.integration.js` |
| Restart hardening | `main.ts:restartServer` + `forceManagedBootOnce` + `portsInitalized` re-arm + `daemonDied` (3-strike keepalive); suites `daemon-liveness`, `receiver-recovery`, `audio-recovery` exist in `test/unit/` |
| `src/lsp/*` = dev3 Ruby LSP | confirmed 4 files (`client.ts`, `diagnostics.ts`, `hover.ts`, `shared-client.ts`) — unrelated to this roadmap, untouched by dev4 |

### Handler-gap scan for every roadmap feature NOT in the shipped list

Grep of `src/` + read of `osc-handlers.ts` (whole file) and `main.ts` (whole file):

| Roadmap feature | Needed surface | Gap (exact) |
|---|---|---|
| F17 live-loop badges | `/live_loop/scope`, `/live_loop/scope-ended` pushes | no `osc.on('/live_loop/scope'...)` anywhere in `src/` — **gap in `osc-handlers.ts`** |
| F14 MIDI picker | `/midi/in-ports`, `/midi/out-ports` pushes; `/midi-port-enable`, `/midi-stop`, `/midi-reset` sends | no handlers, no senders (`src/midi.ts` only holds the `/midi-start` heuristic) |
| F15 gamepad | `/gamepad/devices-list` push; `/gamepad-start|stop|enable` sends | no handlers, no senders |
| F9 remainder | fire `onRunStarted/Ended` from pushes; `/spider/ready`, `/exited`, `/exited-with-boot-error` | `osc-handlers.ts:102-110` still fires run emitters ONLY from the `/log/info` regex; `/spider/ready`+`/exited*` unhandled (push origin `spider-server.rb:1102,974,282,193,270`) |
| F10 ping | `/ping`→`/ack` | not sent (`/ping` appears only in `test/e2e/protocol.js:154-156`); `/ack` unhandled |
| F11 docs preview | silent `/run-code` | capability exists (`main.ts:749-752` — 4th arg `1` honored only with a workspace arg, verified `spider-server.rb:302-316`); no preview UI in `docs-browser.ts` |
| F12 auto-run on save | `onDidSaveTextDocument` | grep: zero matches in `src/` |
| F13 rec auto-import | post-save-dialog editor edit | not present (`extension.ts:557-571` ends at `saveRecording`) |
| F16 timewarp | `/set-global-timewarp(token, seconds)` | route exists `spider-server.rb:806-814`; no sender |
| F21 init.rb open | file I/O only | not present; daemon loads it (`spider-server.rb:249-253`), path `paths.rb:187-196` (`~/.sonic-pi/config/init.rb`, auto-migrated from old location `spider-server.rb:63-78`) |
| F22/F23/F24 | `/check-for-updates-now`, buffer-section routes, `/exit` | routes exist (`spider-server.rb:656-664`; `431-445,415-429,384-397`; `354-362`) — no senders (intentionally, see cut list) |
| F8 full per-file workspaces | `/save-buffer`,`/load-buffer` | `/save-buffer` IS sent (beautify, `main.ts:787`); `/load-buffer` (`spider-server.rb:374-382`) unused; cell-key workspaces shipped instead |

### Daemon spot-check ledger (all confirmed in installed source this run)

- `/live_loop/scope(jobid,name,workspace,line,scope_num)` push `spider-server.rb:1002`; `/live_loop/scope-ended(jobid,name)` `:1004`; placement origin `core.rb:2430-2468` (slot acquire at loop define, `with_fx :scope_out` wrap, release+push in `ensure`).
- `/midi/out-ports` push `spider-server.rb:986`, `/midi/in-ports` `:988`, `/gamepad/devices-list` `:990`. Payload encoding `runtime.rb:1949-1951`: one device per line as `enabled<TAB>name`, lines joined `\n` (gamepad identical, `runtime.rb:1963-1971`).
- `/midi-port-enable(direction,port,on)` `spider-server.rb:746-754` → `runtime.rb:998-1001` `__midi_port_enable(direction, port, enabled)`; `/midi-stop` `:701-711`, `/midi-reset` `:713-723` (reset = re-enumeration, `runtime.rb:991-996`).
- `/gamepad-start` `spider-server.rb:724-734`, `/gamepad-stop` `:735-745`, `/gamepad-enable(pad,on)` `:756-764` → `runtime.rb:1003-1005`.
- `/set-global-timewarp(token, time.to_f)` `spider-server.rb:806-814`.
- `/cue-port-external|internal|stop|start` `spider-server.rb:766-804`.
- `/runs/all-completed` push `:1073`; `/run/started(id, workspace)`/`/run/ended(id)` `:1078-1082` (on `:killed` too).
- `/spider/ready` `:1102`; `/exited` `:974` and `:282`; `/exited-with-boot-error` `:193`,`:270`.
- `/ping(token,id)` → `gui.send("/ack", id) if id` `:462-471`. `/gui-heartbeat` `:680-688`.
- Buffer group: `/save-buffer` `:342-352`, `/save-and-run-buffer` `:328-340`, `/load-buffer` `:374-382`, `/buffer-newline-and-indent` `:384-397`, `/buffer-indent-selection` `:415-429`, `/buffer-section-toggle-comment` `:431-445`.
- daemon.rb: `/daemon/keep-alive` `:198-205`, `/daemon/exit` `:207-216`; audio forwards map `:226-246` (`switch-device→/supersonic/devices/switch`, `switch-driver→/supersonic/drivers/switch`, `request-devices→/supersonic/devices/report`, `reopen-device→/supersonic/devices/reopen`, queued ≤64 until engine connects); engine pushes forwarded to GUI `:337-344` (`/supersonic/statechange|info|devices|device-table|input-devices|reopen.reply|reopen.done`).
- `set_link_bpm!` validates 20..999: `core.rb:3993-3996`.

### Hard constraint discovered: `main.ts` is 962 lines, eslint budget `max-lines: 1000` (`eslint.config.mjs`)

Only ~38 lines of headroom. Dev4 adds ~8 sender methods + ~7 emitters → **a sender/emitter extraction
to a new module is a prerequisite task (D0)** or the wave busts the lint budget. `max-lines-per-function: 100`
also applies; handler functions stay small.

---

## 1. EPIC (bean) — draft

**Title:** dev4 — live-loop feedback, device pickers and docs preview from daemon telemetry the editor already receives

**Body draft:**

> **Goal.** Close the biggest remaining "the data is already on the wire and we ignore it" gaps from
> `docs/research/feature-roadmap.md` (§0 surprise finding): per-live-loop activity/scope badges
> (`/live_loop/scope` + `/live_loop/scope-ended`, `spider-server.rb:1002-1004`), a MIDI + gamepad
> device picker (`/midi/in-ports`+`/midi/out-ports`+`/gamepad/devices-list` pushes,
> `spider-server.rb:986-990`; enables `:746-764`), a docs preview player riding the existing silent
> run path (`main.ts:749-752`, daemon honors silent only with a workspace arg,
> `spider-server.rb:302-316`), and run-state hardening that replaces log-regex run detection with the
> daemon's own events (`/run/started`/`/run/ended`/`/runs/all-completed` `spider-server.rb:1073-1082`,
> `/spider/ready` `:1102`, `/exited` `:974`). Plus three small command-pack items: expose the
> already-written-but-unreachable cue-port senders (`main.ts:943-957`), a timewarp picker
> (`/set-global-timewarp` `spider-server.rb:806-814`), and init.rb quick-open (loaded by the daemon at
> `spider-server.rb:249-253`, path `paths.rb:187-196`).
>
> **Research citations.** `docs/research/feature-roadmap.md` §0 (top-5), §2 rows F14/F15/F17/F9/F11/F16/F21,
> §3 route-group→UX mapping, §5 not-possible list (respected — nothing here needs Sonic Pi changes).
> Daemon refs as above; editor refs: `src/source-runner/osc-handlers.ts` (handlers 41-227),
> `src/source-runner/main.ts` (`liveJobs` 108, `runCode` 714-757, cue-port senders 943-957),
> `src/playing-lines.ts` + `src/cell-flash-provider.ts` (existing decoration surfaces to complement).
>
> **Scope.** Editor-side only. No changes under `/usr/lib/sonic-pi`. No changes to `src/lsp/**` (dev3,
> frozen). `main.ts` sender/emitter extraction first to protect the `max-lines: 1000` budget.
>
> **Acceptance criteria (epic level).**
> 1. Unit battery (`node test/run-unit.js`, enumerates `test/unit/*.test.js`) green with ≥5 new suites.
> 2. Integration: fake daemon pushes `/live_loop/scope`, `/midi/in-ports|out-ports`,
>    `/gamepad/devices-list`, `/spider/ready`; suites assert editor-visible outcomes (decoration set,
>    picker items, statebar text) and the exact OSC sends (`/midi-port-enable`, `/gamepad-enable`,
>    `/set-global-timewarp`, `/cue-port-*`) on the wire ledger.
> 3. Cold-window dispatch: every new command tolerates a no-server window silently
>    (activation gate `test/integration/suite/activation.integration.js` dispatches all contributed
>    commands; a modal there hangs the gate).
> 4. `npm run lint` green with `max-lines 1000` / `max-lines-per-function 100` intact.
> 5. How-done-measured: each feature's AC names a number (assertion count) or an observed wire
>    message in `events.ndjson`, so any reviewer can re-run the suite and check.
>
> **Stacking.** Branch `dev4` from `dev3`; PR `dev4→dev3` after PR #3 (`dev3→dev2`) merges, then
> rebase onto `dev` with the dev2 stack (mirrors the PR #2/#3 flow).

---

## 2. Features picked for dev4 (ranked)

### D1 — Live-loop activity badges (roadmap F17) — the wave's headline

- **Surfaces:** pushes `/live_loop/scope(jobid, name, workspace, line, scope_num)` and
  `/live_loop/scope-ended(jobid, name)` (`spider-server.rb:1002-1004`). Slot logic `core.rb:2430-2468`:
  the push fires at loop definition with the loop's header line, and `scope-ended` fires from the
  loop thread's `ensure` — i.e. badge ON when the loop thread lives, OFF when it dies. `scope_num` is
  the audio scope-buffer slot (needed only for a future waveform tie-in; we display identity+state).
- **UX:** a gutter/before-decoration on the `live_loop` header line: `♪ :name` while alive (subtle
  pulse animation optional), removed on `scope-ended`. Persist across re-runs (slot logic re-registers,
  same name). Complements — does not duplicate — `src/playing-lines.ts` (line-level flash of the
  currently-executing line) and the notebook cell status bars (`src/cell-flash-provider.ts`): those say
  "this line just played"; the badge says "this loop exists and is alive right now".
- **Value/effort/risk:** high (visual feedback is the #1 thing Strudel/Tidal users cite, roadmap §4) /
  M / low (pure additive push consumption; unknown payload only in the sense that we ignore
  `scope_num`'s downstream use — state itself is unambiguous from source).
- **Integration:** new `src/live-loop-badges.ts` (pure render state) + registration next to the
  existing `PlayingLineHighlighter` wiring in `src/source-runner/extension.ts` (`registerLastEditorClose`
  currently owns the `onFlash` subscription, `extension.ts:~525`).

**Tasks (~10 min each):**

- **D1a — pure badge store** `src/live-loop-scope.ts`: `LiveLoopScopeStore` keyed by loop name →
  `{ jobid, workspace, line, scopeNum, at }`; `apply(push)`, `end(name)`, `clear()`; cap by name count
  (live loops are bounded by running jobs). Unit suite `test/unit/live-loop-scope.test.js`.
  *AC:* ≥6 assertions: apply→list, end removes, re-register refreshes line, clear empties, unknown
  name end is a no-op, store survives jobid change (same name).
  *Deps:* none. *Skills:* `/home/blaze/.agents/skills/tdd/SKILL.md`,
  `/home/blaze/.agents/skills/coding-rules/SKILL.md`, `.agents/skills/typescript/SKILL.md`.
- **D1b — decoration renderer** `src/live-loop-badges.ts`: pure function
  `badgeDecorations(store, documentText) → { line, text }[]` matching `live_loop :name` header lines
  to store names (regex `^\s*live_loop\s+[:']?(\w+)`), fallback: badge at the pushed line when no
  textual match. Unit suite `test/unit/live-loop-badges.test.js`.
  *AC:* ≥5 assertions incl. no-match fallback and ended-loop removal.
  *Deps:* D1a. *Skills:* tdd + coding-rules + typescript (same trio below, omitted per-task when identical).
- **D1c — emitters + handlers:** add `onLiveLoopScope` / `onLiveLoopScopeEnded` emitters and the two
  `osc.on` handlers in `osc-handlers.ts` (single owner task for that file; see D3c for the batched
  alternative — D1c and D3c are merged if run by one coder).
  *AC:* unit: firing the handler populates the store via the emitter (pattern of
  `test/unit/per-run-stop.test.js` FakeOsc `fire()`); wire shape `(jobid, name, workspace, line, scope_num)`
  matches `spider-server.rb:1002` arg order.
  *Deps:* D0 (budget headroom), D1a. *Files:* `osc-handlers.ts`, `main.ts` (emitters only, 2 lines each).
- **D1d — registration + statusbar-free UX:** subscribe in `source-runner/extension.ts`, decoration
  type with `before` content, dispose with the store on server restart (`onServerRestart` already
  clears mute memory, `extension.ts:244-246` — same pattern).
  *AC:* integration (needs W3 fake push): `sendControl('live-loop-scope', [1,'drums','a|b',0,2])` →
  `vscode.window.visibleTextEditors[0]` shows the decoration (assert via the tree/harness seam or via
  the pure renderer called from the suite through `host.extensionModule`); `scope-ended` removes it.
  *Deps:* D1b, D1c, W3a. *Files:* `source-runner/extension.ts` (chain H).

### D2 — MIDI + gamepad device pickers (roadmap F14 + F15, one mechanism)

- **Surfaces:** pushes `/midi/in-ports` + `/midi/out-ports` (`spider-server.rb:986-988`) and
  `/gamepad/devices-list` (`:990`) — payload is one string, lines `enabled<TAB>name` (`runtime.rb:1949-1951`).
  Sends: `/midi-port-enable(token, direction, port, on)` (`spider-server.rb:746-754`),
  `/gamepad-enable(token, pad, on)` (`:756-764`), `/midi-stop|/midi-reset(token, silent)`
  (`:701-723`; reset = device re-enumeration, `runtime.rb:991-996`), `/gamepad-start|stop`
  (`:724-745`). Auto-start heuristic already exists for MIDI (`src/midi.ts` `shouldAutoStartMidi`,
  sent at `main.ts:737-741`) — gamepad copies the pattern (`gamepad_` prefix).
- **UX:** palette command "Sonic Pi: MIDI Devices" → QuickPick, sections Inputs/Outputs, each item a
  checkbox-flavored toggle (picked → send enable with flipped state; title shows current on/off).
  "Refresh MIDI devices" entry sends `/midi-reset`. Same for "Gamepads" (list from push; toggles
  `/gamepad-enable`; a "Start gamepad cues" entry mirrors `/midi-start`). Items populate from the last
  push (daemon pushes on hotplug; a cold list can be refreshed via `/midi-reset`).
- **Value/effort/risk:** high for the MIDI/gamepad live-coding audience (per-port mute is an app-IO-menu
  parity feature; today our MIDI is all-or-nothing) / S-M / low.
- **Integration:** new pure module + one command family; NO statusbar item (keeps the bar at 4 items);
  the auto-start heuristic file gains a sibling function — no duplication of the mixer/link pickers.

**Tasks:**

- **D2a — pure device-pair parser + picker items** `src/device-ports.ts`:
  `parseDevicePairs(val: string) → { name, enabled }[]` (split `\n`, split first `\t`), plus
  `buildPortQuickPickItems(inPorts, outPorts)` and `buildGamepadQuickPickItems(pads)` with section
  separators (pattern: `src/audio-device-picker.ts` `buildDeviceQuickPickItems`). Unit suite
  `test/unit/device-ports.test.js`.
  *AC:* ≥8 assertions: parse round-trip, empty string → [], missing tab → enabled=false fallback,
  item order/sections, gamepad shape identical to midi shape.
  *Deps:* none.
- **D2b — senders:** `midiPortEnable(direction, port, on)`, `midiReset()`, `gamepadEnable(pad, on)`,
  `gamepadStart()/gamepadStop()` on Main (3-4 lines each, post-D0 budget) + auto-start hook for
  `gamepad_` in `runCode` mirroring `main.ts:737-741`. Unit suite extends `test/unit/midi.test.js`
  (pattern: assert the OSC address + arg order against `spider-server.rb:746-764`).
  *AC:* ≥5 assertions incl. `/gamepad-start` sent once per session when code matches `gamepad_`, arg
  order `(token, direction, port, 1|0)`.
  *Deps:* D0.
- **D2c — handlers + registration:** `osc.on('/midi/in-ports')`, `/midi/out-ports`,
  `/gamepad/devices-list` → emitters; commands `vscode-sonic-pi.midiDevices`, `vscode-sonic-pi.gamepads`
  (cold-window silent no-op guard, pattern `extension.ts:288-295`). package.json contributes both.
  *AC:* integration: `sendControl('midi-ports', ['1\tLPD8\n0\tMicroBrute'])` → picker items (assert via
  pure builder + a wire assert that picking sends `/midi-port-enable` with flipped `1`); cold dispatch
  of both commands logs DISPATCH-free (activation gate stays green).
  *Deps:* D2a, D2b, W3a. *Files:* `osc-handlers.ts` (chain with D1c/D3c), `source-runner/extension.ts`
  (chain H), `package.json`.

### D3 — Run-state hardening (roadmap F9 remainder; F10 partially subsumed)

- **Surfaces:** `/run/started(id, workspace)` `spider-server.rb:1078-1080`, `/run/ended` `:1082`,
  `/runs/all-completed` `:1073`, `/spider/ready` `:1102`, `/exited` `:974`/`:282`,
  `/exited-with-boot-error` `:193`/`:270`.
- **UX (mostly invisible, one visible win):** run-started/ended emitters fire from the real pushes
  (today ONLY from the `/log/info` regex `osc-handlers.ts:102-110` — locale-fragile); `/spider/ready`
  flips server state to `running` and requests the version without waiting for the first log line;
  `/exited`+`/exited-with-boot-error` mark the window stopped with a clear message (complements the
  keepalive-death path `main.ts:daemonDied`).
- **Value/effort/risk:** medium-visible/high-robustness / S / low. **`/ping`→`/ack` CUT from scope**
  (see cut list) — keepalive already covers liveness and `/exited` covers spider death.
- **Integration:** same emitters the notebook already consumes (`src/notebook.ts:~205-220`); no new UI.

**Tasks:**

- **D3a — dual-source run emitters:** in the `/run/started`/`/run/ended` handlers
  (`osc-handlers.ts:120-133`) also fire `onRunStarted(jobId)`/`onRunEnded(jobId)`; keep the
  `/log/info` regex as a fallback (dedupe: a run id fires `started` at most once until it ends).
  *AC:* unit (FakeOsc pattern): a `/run/started` push fires the emitter exactly once even when the
  log line also arrives; `/run/ended` fires once; `/runs/all-completed` clears pending set. ≥4 assertions.
  *Deps:* D0. *Files:* `osc-handlers.ts` (chain).
- **D3b — lifecycle pushes:** `/spider/ready` → `onServerState.fire('running')` + version request;
  `/exited`, `/exited-with-boot-error` → stop-state transition + one log line naming which push.
  *AC:* unit ≥3 assertions (state transitions, idempotent ready); integration: fake pushes
  `/spider/ready` on boot → statusbar text `$(radio-tower) Sonic Pi` before any run
  (`server-lifecycle.integration.js` extension).
  *Deps:* D0, W3a.

### D4 — Command pack: cue-port exposure + timewarp picker + init.rb open

- **Surfaces:** `/cue-port-start|stop|external|internal` (`spider-server.rb:766-804`) — senders already
  written, `main.ts:943-957`, currently unreachable (§0 correction). `/set-global-timewarp(token,
  seconds)` (`spider-server.rb:806-814`). init.rb: file I/O only; daemon evals it on boot
  (`spider-server.rb:249-253`), path `paths.rb:187-196` `~/.sonic-pi/config/init.rb`.
- **UX:** Cue Inspector view-title gets a mode dropdown-ish pair of commands ("Cue port: Stop/Start",
  "Cue port: External/Internal") — honest labels, no modal. "Sonic Pi: Set Latency (Timewarp)" input
  box (seconds, default current, 0.0-5.0 guard) — live-performance schedule-ahead tuning. "Sonic Pi:
  Open init.rb" opens (or creates from `user_config_examples_path` if absent — same copy-down the
  daemon does at `spider-server.rb:87-95`).
- **Value/effort/risk:** medium / S / low. Fixes a shipped-list honesty gap (cue-port).

**Tasks:**

- **D4a — cue-port commands:** register `vscode-sonic-pi.cues._portStop/_portStart/_portExternal/_portInternal`
  calling the existing `main.cuePort*`; menu contributions on the `sonic-pi.cues` view title; REPLACE the
  tautological wire asserts in `cue-inspector.integration.js` with real ones: dispatch the command →
  `host.waitForMessage('/cue-port-stop', mark)` (today the suite sends `/fake/cue-port-stop` itself and
  asserts the fake recorded it — `cue-inspector.integration.js:15-37` — which proves nothing about the
  extension; also fix the false comment at line 6).
  *AC:* 4 wire asserts (one per route, token = boot token) + activation gate still green + the false
  comment removed.
  *Deps:* none (senders exist). *Files:* `source-runner/extension.ts` (chain H), `package.json`,
  `test/integration/suite/cue-inspector.integration.js`.
- **D4b — timewarp:** sender `setGlobalTimewarp(seconds)` (guard `0 ≤ s ≤ 5`, log-reject otherwise,
  pattern `setLinkBpm` `main.ts:827-837`) + command with input box (cold-window guard).
  *AC:* unit ≥3 (address+args `(token, seconds)`, reject out-of-range sends nothing); integration:
  dispatch → `/set-global-timewarp` on the ledger.
  *Deps:* D0.
- **D4c — init.rb open:** pure `resolveInitPath(homedir)` + `initialInitContent()` (create-if-missing
  with a header comment); command opens it as a `sonic-pi` document.
  *AC:* unit ≥3 (path join, existing file untouched, missing file created with content); command
  dispatches cold without error (activation gate).
  *Deps:* none.

### D5 — Docs preview player (roadmap F11)

- **Surfaces:** existing `/run-code` with silent flag — daemon honors `args[3]==1` ONLY when a
  workspace arg is present (`spider-server.rb:302-316`, read this run); our sender already supports it
  (`main.ts:749-752`). Stop = existing `/stop-all-jobs`… **no — per-preview stop needs care:** a preview
  must NOT replace the session, so it rides `replaceSession: false`; stopping a stuck preview uses the
  existing Stop command. Long-decay samples (`sample :ambi_lunar`) are stopped by the user's Stop —
  acceptable, same as the app's preview.
- **UX:** in the docs QuickPick (`src/docs-browser.ts:showDocsBrowser`), add per-item detail line
  "Enter: open docs · P: preview sound"; simplest robust version: after picking an entry, offer an
  inline action "Preview `sample :bd`" (information message with a Preview button, or a second
  QuickPick step). Preview code: `sample :<name>, sustain: 2` / `with_synth :<name> { play :c4, release: 2 }` /
  `with_fx :<name> { play :c4 }` by kind, sent as a silent no-replace run under workspace `docs-preview`.
- **Value/effort/risk:** nice-killer (app-parity sound browser; roadmap §4 "docs-with-preview") / S-M / low.
- **Integration:** extends `docs-browser.ts` only; the docs document rendering is untouched.

**Tasks:**

- **D5a — pure preview-code builder:** `buildPreviewCode(entry: DocsEntry) → string` by kind (synth/fx/
  sample/command→no preview, returns undefined). Unit suite `test/unit/docs-preview.test.js`.
  *AC:* ≥5 assertions (per-kind code, command kind → undefined, name escaping for names with spaces).
  *Deps:* none.
- **D5b — preview flow + registration:** second-step QuickPick in `showDocsBrowser` (Open docs / Preview
  sound) dispatching `runScript`-equivalent via `scriptRunEnsuresServer`-style guard, silent no-replace,
  workspace `docs-preview`. package.json: no new command needed if it rides the existing docs flow
  (preferred — avoids package.json churn).
  *AC:* integration: pick flow (drive via `vscode.window.showQuickPick` stub is flaky — instead export
  a testable `previewEntry(entry)` seam like `setDriveForTest` `source-runner/extension.ts:128-134`) →
  `/run-code` on the wire with `args[2]==='docs-preview'` and `args[3]===1` and NO `/stop-all-jobs`
  before it. Unit: ≥3 assertions on the seam.
  *Deps:* D5a. *Files:* `docs-browser.ts`, `source-runner/extension.ts` (chain H).

### D6 — Auto-run on save (roadmap F12) — wave 3, config-gated, default OFF

- **Surfaces:** none new — `onDidSaveTextDocument` (VS Code API) → existing `runCode`.
- **UX:** setting `vscode-sonic-pi.runOnSave` (default `false`); when on, saving a `sonic-pi` document
  runs it whole-file (same as the Run lens). Explicit upstream ask (roadmap §2 F12, issue #1902 cited).
- **Value/effort/risk:** nice / S / low-med (surprise factor — default OFF + one-time info message).
- **Tasks:**
  - **D6a:** config getter + watcher + unit suite (setting off → no send; on → one `/run-code` per save,
    notebook-cell saves excluded). *AC:* ≥4 assertions. *Deps:* none (waves into 3).
  - *Files:* `src/source-runner/config.ts`, `source-runner/extension.ts` (chain H), `package.json` (config).

---

## 3. Prerequisite infra task

- **D0 — `main.ts` sender/emitter extraction (protect the lint budget).** Move the pure sender group
  (`cuePort*`, recording, mixer, timewarp-to-be) into `src/source-runner/senders.ts` as functions taking
  `(sendOsc, guiUuid)`, and/or move the emitter declarations to a small `main-events.ts`. Zero behavior
  change; unit battery must stay green untouched (proves it is a pure move).
  *AC:* `npm run lint` green with `main.ts` comfortably under 900 lines; `node test/run-unit.js` green
  with NO test edits (the move is invisible at the seams); `git diff --stat` touches only `main.ts` +
  new file + (if needed) `extension.ts` imports.
  *Deps:* none. *Blocks:* D1b(c), D2b, D3a/b, D4b. *Skills:* coding-rules (minimal-diff rule), tdd
  (no-new-test-is-fine rule for pure moves — the existing suites ARE the red/green), typescript.

---

## 4. Wave order (parallel-safe batches) + collision map

| Wave | Tasks (parallel within wave) | Files touched | Blocks |
|---|---|---|---|
| **1** (pure, disjoint) | D0; D1a; D2a; D4c(pure half); D5a | D0: `main.ts`+new `senders.ts`; D1a: new `live-loop-scope.ts`+test; D2a: new `device-ports.ts`+test; D4c: new `init-file.ts`+test; D5a: new `docs-preview.test.js` (pure fn can live in `docs-browser.ts` OR a new module — **pick new module** to keep D5a off `docs-browser.ts` until wave 2) | everything in wave 2 |
| **2** (wiring, sequenced per collision file) | Chain O (single owner): D1c + D2c(handlers) + D3a + D3b → `osc-handlers.ts` + `main.ts` emitters. Chain H (single owner, serial): D1d → D2c(commands) → D4a → D4b → D5b → D6a → `source-runner/extension.ts` + `package.json`. D2b sender task rides chain O's `main.ts` window. Chains O and H are parallel with each other. | D1d also waits on W3a | wave 3 |
| **3** (integration + fake daemon) | W3a fake-daemon telemetry: add `/fake/` controls `live-loop-scope`, `live-loop-scope-ended`, `midi-ports`, `gamepads`, `spider-ready`, `exited` + push them (pattern: existing `mixer-settings`/`link-bpm` controls, `fake-sonic-pi.js:157-190`). W3b new integration suite `live-loop-and-devices.integration.js` + extends to `server-lifecycle` (ready push) and `cue-inspector` (real cue-port asserts). W3c README/docs update (one task). | `fake-sonic-pi.js` single owner; `.vscode-test.mjs` suite list append (same task); suites | — |

**Named file-collision conflicts for the orchestrator:**
1. `src/source-runner/main.ts` — D0 must land BEFORE D1c/D2b/D3a/D3b/D4b (budget + churn). Do not run
   any two main.ts-touching tasks in parallel.
2. `src/source-runner/osc-handlers.ts` — D1c, D2c-handlers, D3a, D3b all add handlers: ONE task (or a
   strict serial chain) owns this file in wave 2.
3. `src/source-runner/extension.ts` — D1d, D2c-commands, D4a, D4b, D5b, D6a all register things:
   strict serial chain (H).
4. `package.json` — every command/config task edits contributes/activationEvents: ride the H chain
   serially (or one consolidating task at the end of wave 2).
5. `test/integration/fake-sonic-pi.js` — one owner (W3a).
6. `test/unit/activation.test.js` vscode stub — new commands with modals need stub additions; fold
   into whichever H-chain task adds the first modal command (check the stub's `showInputBox` presence
   before assuming; `activation.test.js` stub currently has NO `showInputBox` — D4b/D4a must add it or
   guard cold dispatch before the modal, matching `setLinkBpm`'s guard `extension.ts:305-307`).

**Total: 6 features, 17 leaf tasks, 3 waves.** Estimated wall-clock with parallel waves 1: ~2 sessions.

---

## 5. CUT LIST (roadmap items rejected for dev4)

| Item | Reason (one line) |
|---|---|
| F1 per-run stop | **shipped** (dev2: `main.ts:921-934`, `per-run-stop.test.js`) |
| F2 mute/unmute | **shipped** (dev2: `loop-mute.ts`, `codelenses.ts`, integration `editor-controls.integration.js:181-333`) |
| F3 mixer popover | **shipped** (`mixer-panel.ts`, `/mixer-drive` `main.ts:870-877`) |
| F4 Link BPM+peers | **shipped** (`link-label.ts`, `setLinkBpm` `main.ts:827-837`) |
| F5 cue inspector | **shipped** (`cue-inspector.ts`, `cue-store.ts`) |
| F6 cue test bench | **shipped** (`cue-bench.ts`, `cueSendTest` command) |
| F7 audio device picker | **shipped** (`audio-device-picker.ts`, `/daemon/audio/*` `main.ts:397-415`) |
| F8 multi-buffer workspace sync (full per-file) | cell-key workspaces already shipped cover the user-visible payoff; per-file ids are an enabler with M effort/med risk (error-mapping regressions) and no direct win |
| F10 health ping (`/ping`→`/ack`) | redundant: keepalive (3-strike, `main.ts:433-466`) covers daemon liveness and `/exited` (`spider-server.rb:974`) covers spider death — adopted into D3 instead |
| F13 recording auto-import | nice-to-have polish, low marginal value vs. wave theme; stretch task if a slot opens |
| F18 scope via shared memory | high risk: shm layout is an internal, in-flux contract (upstream commit a97c53b reworked it); version-locked promise we cannot keep |
| F19 run-at-next-bar | requires wrapping user code in a bar-sync preamble (alters user code); med risk, defer |
| F20 Sets (`.sonicpi`) | depends on the F8 buffer model we cut; defer with it |
| F22 update-check refresh | meh value (roadmap's own rating); `/check-for-updates-now` `spider-server.rb:656-664` stays unused |
| F23 daemon-side comment toggle / snippet expansion | VS Code's native commenting/indent is good enough (roadmap rated meh); routes `spider-server.rb:384-445` stay unused |
| F24 clean shutdown via `/exit` | low value and dangerous in attach mode (`/exit` `spider-server.rb:354-362` kills a user's OWN spider); our managed stop already SIGTERMs our child |
| `/gui-heartbeat` | daemon's kill switch keys on `/daemon/keep-alive` which we already send (`main.ts:447-450`, daemon side `daemon.rb:198-205`); no second heartbeat needed |
| Orbits / per-synth routing / pianoroll / engine metrics | **needs Sonic Pi changes** (roadmap §5) — out by the binding constraint |

---

## 6. Honesty notes / unknowns

- The `scope_num` argument's downstream consumer (the app's scope widget) is shm-based; we display
  identity+alive only and ignore `scope_num` beyond storing it — deliberately not promising waveforms.
- `/supersonic/info` and `/supersonic/statechange` payloads remain unverified (forwarded at
  `daemon.rb:337-344`; content unknown) — NOT built on in dev4.
- Fake-daemon push shapes for D1/D2/D3 are inferred from `spider-server.rb`/`runtime.rb` source, not
  from a live capture; W3a's control names must match the real arg orders cited above, and the first
  live e2e (`test/e2e/protocol.js` gate) after wave 3 is the truth check for the badge feature.
