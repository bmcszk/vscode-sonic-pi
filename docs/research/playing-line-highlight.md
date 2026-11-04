# Research: Playing-line highlight (Sonic Pi 5 → VS Code) — Phase A of sonic-pi-dgis

**Status: COMPLETE.** Local leg by researcher (salvaged from run `17a69b08` after its tooling failure), live capture and online leg completed by the parent (2026-11-04).

## Verdict

**Feasible with public API only.** Sonic Pi 5 already sends a per-trigger playing-line OSC message — `/flash (jobid, workspace, line)` — to the exact UDP port our extension binds, and we currently **silently drop it**. Rendering is one public-API call pair we already use elsewhere in this codebase (`flashCode()` in `src/source-runner/main.ts`).

---

## 1. Protocol (local ground truth, Sonic Pi 5.0.0 at `/usr/lib/sonic-pi`)

### 1.1 Emission — server side

`/usr/lib/sonic-pi/app/server/ruby/bin/spider-server.rb:999`:

```ruby
when :flash
  gui.send("/flash", message[:jobid], message[:workspace], message[:line])
```

`__delayed_flash_from_caller` fires on **every real sound trigger**:
- sample path: `app/server/ruby/lib/sonicpi/lang/sound.rb:3914` (after `trigger_synth`)
- synth/`trigger_inst` path: `sound.rb:3931`
- chord path: same mechanism (each chord member triggers, each reporting its own source line)

### 1.2 Live capture (parent, 2026-11-04, real daemon via the extension's own protocol seam)

Code run: `define :pinger do 4.times do play :E4; sleep 0.25 end end` + `pinger` (7 lines).

```
FLASH SAMPLES: [[0,"eval",4],[0,"eval",4],[0,"eval",4],[0,"eval",4]]
total /flash: 4
addresses seen: /supersonic/statechange /spider/ready /log/info /midi/in-ports
/midi/out-ports /incoming/osc /link-bpm /link-num-peers /ack /run/started
/log/multi_message /flash /run/ended
```

Facts established live:
- **`line` is 1-based** (play is on source line 4; VS Code ranges need `line - 1`).
- **`workspace` is `"eval"` for our extension's runs** (`/run-code`); the GUI's buffer runs use buffer names. Gives Phase B a free "is this my run" filter.
- **Exactly one `/flash` per trigger** — 4 plays → 4 flashes. `jobid` was `0` (single-job run).
- The GUI-flash is therefore **transient per trigger** (what looks like "the playing line is colored" in the Sonic Pi app is a fast repeating flash while a loop keeps triggering that line).

### 1.3 Receiving side today — why we never see it

- osc-js 2.4.1 `EventHandler.call` dispatches **only to subscribed addresses**; an unmatched address returns `false`, no error, no log.
- `src/source-runner/main.ts` subscribes five addresses; **`/flash` is not among them** (the `'*'` wildcard handler is commented out). The message arrives on our bound port and evaporates.

## 2. VS Code feasibility

- `window.createTextEditorDecorationType({ backgroundColor, isWholeLine: true })` + `TextEditor.setDecorations(type, ranges)` — **public, stable API** (verified against vendored `@types/vscode` 1.144 d.ts; render-only, no proposed API — consistent with the glyphMargin finding in `docs/research/editor-run-controls.md`, this is the *display* half that IS allowed).
- **In-repo precedent:** `src/source-runner/main.ts` `flashCode()` already creates a background decoration and disposes it after 250 ms for the run flash; `clearErrorHighlight()` shows the set-empty clearing pattern.
- **Prior art:** `mactkg/vscode-sonic-pi` flashes run regions using the same decoration approach (extension settings `flashBackgroundColor`/`flashTextColor`); upstream's own Qt `mainwindow.cpp` registers an OscHandler that consumes `/flash` to highlight buffer lines (github.com/sonic-pi-net/sonic-pi, `app/gui/qt/mainwindow.cpp`).

## 3. Recommended implementation sketch (Phase B)

1. On activation, subscribe the existing osc-js listener to `/flash`.
2. Filter: `workspace === 'eval'` (our runs); resolve the active Sonic Pi editor; `range = new Range(line - 1, 0, line - 1, 1000)` on a shared `isWholeLine` decoration type (one type, colored via setting, e.g. reuse `sonic-pi.flashBackgroundColor`).
3. Transient model matching the GUI: add the range, remove it after a short TTL (250 ms ≈ GUI's flash), DON'T stack disposals (track a Set of ranges + one timer sweep). Repeated triggers of a looping line produce a continuously "lit" look, same as the Sonic Pi app.
4. Lifecycle: clear decorations on `/run/ended`, on Stop (`stopAllJobs`), and in the server-loss recovery hook (`detectAudioServerLoss`/`restartServer` path from sonic-pi-1gye) so highlights never stick after a dead server.
5. Timing expectation: messages arrive per trigger over loopback UDP — effectively instant; Phase B should measure perceived lag in practice but no architectural latency risk.

### Open items for Phase B (flagged, not blockers)

- GUI's exact flash duration/color defaults: read `mainwindow.cpp`'s `/flash` handler before choosing TTL/colors (UNVERIFIED — not read during this pass; upstream hit cited above).
- Multi-chord runs emit several flashes per line burst — verify dedup feel (same line re-flash should refresh, not stack).

## Sources

- Local: `/usr/lib/sonic-pi/app/server/ruby/bin/spider-server.rb:999`; `app/server/ruby/lib/sonicpi/lang/sound.rb:3914,3931`; osc-js 2.4.1 `EventHandler.call`; `src/source-runner/main.ts` (`flashCode`, osc subscriptions).
- Live: parent probe against real daemon, 2026-11-04 (message dump in §1.2).
- Online: github.com/sonic-pi-net/sonic-pi wiki "Sonic Pi Internals — GUI Ruby API" (informal OSC API; `/flash` consumed by Qt GUI handler in `app/gui/qt/mainwindow.cpp`); github.com/mactkg/vscode-sonic-pi (prior art).
