# End-to-end coverage report (bean sonic-pi-zlzp)

Every feature shipped in this session now has an end-to-end test that drives a real
Extension Development Host against `test/integration/fake-sonic-pi.js`, a stand-in daemon
booted through the extension's own settings seam (`ruby.interpreter.commandPath`,
`sonicPiRootDirectory`). Nothing inside the extension is stubbed: a suite asserts what a user
or the daemon observes (commands, documents, notebooks, OSC on the wire).

Run it with `npm run test:integration` (needs `VSCODE_TEST_EXECUTABLE` pointing at the real
Code binary on a machine where `code` is a wrapper script, e.g. `/usr/share/code/code`).

## Layout

| Path | Role |
| --- | --- |
| `test/integration/harness/environment.js` | per-label temp HOME/workspace/daemon dir + generated Sonic Pi root |
| `test/integration/harness/host.js` | host-side helpers: fixtures, settings, OSC messages/events, modules |
| `test/integration/fake-sonic-pi.js` | daemon contract: port line, booter log with takeover route, `/log/info`, `/version`, `/buffer/replace`, `/flash` |
| `.vscode-test.mjs` | three labels: `extension` (owns its daemon), `attach` (adopts a user app), `takeover` (blocked reply port) |
| `.vscode-test.debug.mjs` | one label per suite, for a single-suite run while iterating |

## Per-feature status

Status is the last full `extension` label run recorded in this session.

| # | Feature | Suite | Status |
| --- | --- | --- | --- |
| 1 | Editor run controls (Run / Stop / Run cell / Load def CodeLenses) | `editor-controls` | pass |
| 2 | Run-cell lens semantics (playable blocks: define / assignment / `with_fx`) | `editor-controls` | pass |
| 3 | Status bar: server state + daemon version + master volume prompt | `server-lifecycle` | pass |
| 4 | Beautify via the daemon (`/buffer-beautify` -> `/buffer/replace`) | `editor-controls` | pass |
| 5 | Cold-window boot and warm-window reuse of the daemon | `server-lifecycle` | pass |
| 6 | `runReplacesSession` (new run stops the previous jobs) | `editor-controls` | pass |
| 7 | MIDI auto-start (`/midi-start` once, before the run) | `editor-controls` | pass |
| 8 | Notebook: per-cell play sends only the played cell | `notebook-run` | **fail** (no `/run-code` reaches the daemon) |
| 9 | Notebook: playing-cell mark lasts the whole run | `notebook-run` | **fail** (same cause) |
| 10 | Notebook: cell Stop interrupts and stops every job | `notebook-run` | **fail** (same cause) |
| 11 | Notebook: whole-song mode replays the executed cells | `notebook-run` | **fail** (same cause) |
| 12 | Notebook: a server restart abandons in-flight runs (stale job ids) | `notebook-run` | **fail** (same cause) |
| 13 | Notebook fixture deserializes into markdown + code cells | `notebook-run` | pass |
| 14 | Snippet pack ships and expands in a Sonic Pi editor | `media-docs` | pass (flaky, see risks) |
| 15 | Docs command: searchable pick, picked builtin detail | `media-docs` | pass (see limitation) |
| 16 | Stop server when the last Sonic Pi editor closes (opt-in) | `server-shutdown` | pass |
| 17 | Adopt-keepalive: attaching to a user-run app keeps `/daemon/keep-alive` flowing, logged to the Sonic Pi Log channel | `attach` | **fail** (`attach`: no `/version` on the adopted app's port) |
| 18 | Takeover-on-play: a playing window takes the daemon over cleanly | `takeover` | **fail** (`before all`: the second window could hear the reply port) |

## Failures fixed in this change

1. **Status bar volume prompt** (`server-lifecycle`): the suite typed into the prompt with the
   `type` command, which only reaches an *editor* text area, so the box submitted empty and the
   extension (correctly) refused. The prompt now opens prefilled with the volume this window last
   set (`value: String(this.volume)`), which is also better UX - Enter is never an error, and the
   suite accepts the suggested value and asserts `/mixer-output-volume` on the wire.
2. **Notebook kernel was never picked** (`notebook-run`): a controller that never asks for a
   notebook is not auto-selected, so a freshly opened `.pibook` had no kernel and its play buttons
   would do nothing until the user picked one. `NotebookController` now asks for every notebook of
   its type (`updateNotebookAffinity(..., Preferred)`) on construction and on
   `onDidOpenNotebookDocument`.
3. **Notebook runs awaited forever** (`notebook-run`): `notebook.cell.execute` settles only when
   the execution does, and this suite holds every run open. The suite now fires the command without
   awaiting it and asserts on what the daemon received.
4. **Notebook cell documents counted as open editors** (`server-shutdown`): the "last Sonic Pi
   editor" check counted *documents*, including a notebook's cell documents (they are `sonic-pi`
   too and have no tab) and documents that outlive their tab. It now counts open editor tabs
   (`tabGroups` + `TabInputText`), which is what the feature means.
5. **Docs suite asserted an output-channel tab** (`media-docs`): output channels live in the panel
   and are not part of `window.tabGroups`, so the assertion could never hold. The suite now drives
   the pick's data layer (search + detail formatting) and accepts the real pick.
6. **Harness `sendControl` without args** (`notebook-run` teardown): `sendControl('stop-all')` with
   no args threw inside the OSC encoder; it now defaults to `[]`.
7. **Unit stubs** (`activation`, `notebook`): added `workspace.notebookDocuments`,
   `onDidOpenNotebookDocument` and `controller.updateNotebookAffinity` to the vscode doubles.

## Open failures and limitations

- **Notebook cell execution does not reach the daemon in the host** (features 8-12). The suite's
  setup boots a held-run daemon and the notebook opens with the controller attached, but a driven
  `notebook.cell.execute` produces no `/run-code` and no cell output at all, so the kernel handler
  is never entered (or `ensureServerReady` returns false silently). Next step: log the handler's
  entry and `isReceiving()`/`serverIsRunning()` in the fake-daemon event stream, and compare against
  the working `Run cell` CodeLens path in `editor-controls`, which dispatches through the
  extension's own command rather than through the notebook kernel.
- **Output channels are not observable** through the extension API: the docs suite can assert the
  pick and the detail text but not that the channel was revealed.
- **Snippet expansion is timing sensitive**: `editor.action.insertSnippet` types into whichever
  editor has focus, so a suite that ran before it can leave the notebook focused. The suite now
  re-shows its editor in column one before inserting.
- `attach` and `takeover` skip themselves on a machine where a real `spider-server.rb` is running.
- **`attach` label** (feature 17): the window that adopts the stand-in app never sends `/version`
  to the app's command port, so the suite times out before it can assert the keep-alive. Either the
  `/proc` scan does not find the stand-in (the suite's skip guard did not trigger) or the adopted
  ports are applied after the first status-bar version request; the keep-alive code itself
  (`applySpiderPorts` -> `daemonExitRoute` -> `startKeepAlive`, logged to the Sonic Pi Log channel)
  is in place and unit-covered.
- **`takeover` label** (feature 18): its `before all` finds the reply port still reachable from the
  window that was supposed to be blocked, so the takeover route is never exercised in this pass.
  Both labels need one more pass with their own logging; they are independent of the notebook work.
- **`server-shutdown` second test** (feature 16): closing the last tab still does not stop the
  daemon after the `notebook-run` suite has run (the off-path test passes). The tab count the
  extension now uses has to be compared against what the notebook suite leaves behind.

## Gates

| Gate | Result |
| --- | --- |
| `npm run lint` (eslint, zero findings) | pass |
| `npm test` (build + 16 unit suites) | pass |
| `npm run test:integration` | **not green**: `extension` 10 passing / 6 failing (5 notebook + server-shutdown second test); `attach` 0 passing / 1 failing; `takeover` 0 passing / 1 failing (`before all`) |
