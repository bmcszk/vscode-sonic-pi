# Research: Testing strategy for vscode-sonic-pi (bean sonic-pi-xow5)

Deliverable: research-backed UNIT + INTEGRATION testing strategy for the extension's real
call chain (`activate()` → command handlers → `Main` → `OscSender` → UDP → daemon).

Local facts verified by reading the repo: `package.json` (engines `^1.144.0`, `main ./out/extension.js`,
`test` = build + 14 sequential `node test/unit/*.test.js` runs, `test:e2e` = `test/e2e/protocol.js`,
no `@vscode/test-electron` dependency anywhere), `test/unit/activation.test.js` (stubs `vscode` via
`Module._load`; catches module-load/activation crashes only), `test/e2e/protocol.js` (spawns the real
daemon at `/usr/lib/sonic-pi/app/server/ruby/bin/daemon.rb`, parses the stdout ports line, drives
`/run-code` + `/stop-all-jobs` over OSC with `osc-js`, asserts against `spider.log`), `.github/workflows/ci.yml`
(ubuntu-latest, `npm ci` → `build` → `npm test`; `test:e2e` deliberately absent — no Sonic Pi on runners).

## Summary

Add a third layer between the existing unit and live-daemon layers: a **CI-safe integration suite
run by `@vscode/test-electron` inside a real (downloaded, Electron) VS Code Extension Development
Host**, where the real Sonic Pi daemon is replaced by a **fake daemon script injected through the
extension's own public settings seam** (`vscode-sonic-pi.sonicPiRootDirectory` / `commandPath`
→ `Main` constructor, verified in `src/source-runner/main.ts`). This covers exactly what is
untested today — command handlers, notebook controller wiring, and run-code routing through the
real `activate()` chain — without needing Sonic Pi installed, and it composes with the existing
`test/e2e/protocol.js` as an opt-in live layer. The Microsoft-blessed layout is unit (plain Node)
+ `out/test/*` Mocha suites under `@vscode/test-cli`/`test-electron`, run on Linux CI with
`xvfb-run -a` (Microsoft's own sample CI does exactly this; there is no supported xvfb-less mode
for the Electron host).

## Findings

### 1. The canonical integration harness: `@vscode/test-electron` (+ `@vscode/test-cli`)

1. **Claim:** Integration tests for VS Code extensions run inside a special VS Code instance (the
   **Extension Development Host**) with full API access; the official runner is
   `@vscode/test-electron` (`runTests`), and new projects are pointed at `@vscode/test-cli`
   (a config-driven wrapper that uses Mocha underneath and reads `.vscode-test.mjs`).
   **Sources:** [Testing Extensions — code.visualstudio.com](https://code.visualstudio.com/api/working-with-extensions/testing-extension),
   [@vscode/test-cli README](https://github.com/microsoft/vscode-test-cli/blob/main/README.md).
   **Support:** direct evidence (fetched both docs). **Confidence:** high.
2. **Claim:** `runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs, version,
   extensionTestsEnv, vscodeExecutablePath })` downloads+unzips VS Code and launches it with the
   extension loaded from **source** (`extensionDevelopmentPath` = folder containing
   `package.json`) and a test-runner script (`extensionTestsPath`). `version` pins a specific VS
   Code release (e.g. `'1.36.1'`) or `'insiders'`; `--disable-extensions` in `launchArgs` disables
   all other extensions; `extensionTestsEnv` injects env vars into the test host;
   `downloadAndUnzipVSCode` pre-caches (and `runVSCodeCommand(['--install-extension', …])`
   installs other extensions).
   **Sources:** [microsoft/vscode-test README](https://github.com/microsoft/vscode-test/blob/main/README.md).
   **Support:** direct evidence (fetched raw README). **Confidence:** high.
3. **Claim:** There is **no verified `runTests` option to point the host directly at a packaged
   `.vsix`**; `extensionDevelopmentPath` is a source folder. A packaged-artifact test is done by
   installing the VSIX into the host (`code --install-extension …` / `runVSCodeCommand`) — an OSS
   repo that ships this way tests its real `.vsix` in a real VS Code outside `runTests`, driving the
   extension host over the V8 inspector (CDP). **Sources:** vscode-test README (options list);
   [trlc-vscode-extension DEVELOPER_GUIDE](https://github.com/bmw-software-engineering/trlc-vscode-extension/blob/main/docs/DEVELOPER_GUIDE.md).
   **Support:** interpretation (option-list absence + one concrete OSS precedent). **Confidence:**
   medium-high for "no direct VSIX option"; the CDP approach is one repo's practice, not a
   Microsoft recommendation. Recommendation for us: integration suite runs from source
   (`extensionDevelopmentPath`); if VSIX-level coverage is wanted later, keep it as an opt-in
   smoke step (`vsce package` → install → open a `.pi` file → run command), not part of CI-fast.
4. **Claim:** Headless Linux CI: Microsoft's own sample workflow runs the suite with
   **`xvfb-run -a npm test`** on Linux (and plain `npm test` elsewhere). Community evidence shows
   Electron on GitHub-hosted runners fails without a virtual display ("Unable to open X display"
   / D-Bus errors). **Sources:** [vscode-test sample ci.yml](https://github.com/microsoft/vscode-test/blob/main/sample/.github/workflows/ci.yml);
   [SO: integration tests fail in GitHub Action](https://stackoverflow.com/questions/79607537/).
   **Support:** direct evidence (fetched the sample workflow). **Confidence:** high that
   `xvfb-run -a` is the blessed path; **no evidence found of a supported xvfb-less mode**
   (e.g. an `--ozone-platform=headless` flag working with the test host) — treat any xvfb-less
   claim as UNVERIFIED; don't build CI on it.
5. **Claim:** Version pinning + reproducibility: pin `version` (e.g. the `engines` minimum or an
   explicit LTS-ish release) instead of default `stable` to keep suite behavior deterministic;
   `downloadAndUnzipVSCode` / the `.vscode-test` cache dir can be cached between CI runs.
   `@vscode/test-cli` config exposes the same knobs: `files`, `version`, `workspaceFolder`,
   `extensionDevelopmentPath`, `mocha` (e.g. `timeout`, `require`).
   **Sources:** vscode-test README; test-cli README. **Support:** direct evidence for the options
   existence; caching benefit is **researcher inference** (the cache dir is documented as
   `.vscode-test/vscode-<version>`).
6. **Claim:** Driving the extension from inside the host: tests import the real `vscode` module and
   can call `vscode.commands.executeCommand('vscode-sonic-pi.run')`,
   `vscode.extensions.getExtension(...).activate()`, `vscode.workspace.openTextDocument` /
   `openNotebookDocument`, and inspect `vscode.commands.getCommands()`.
   **Sources:** [Testing Extensions doc](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
   (extension-activate + commands assertions pattern),
   [Notebook API guide](https://code.visualstudio.com/api/extension-guides/notebook)
   (`NotebookSerializer` / `NotebookController#notebookType`, controller execution model).
   **Support:** direct evidence for the general mechanisms. **UNVERIFIED specifics:** the exact
   built-in command IDs for notebook execution (`notebook.cell.execute`, `notebook.execute`) —
   I could not confirm these IDs from a primary doc page; verify empirically in the host
   (`vscode.commands.getCommands(true)` filter) before relying on them. Safer primary path:
   `openNotebookDocument` + the controller's `executeHandler` via the public
   `NotebookController.execute(cells)` API (present in the API surface, not re-verified here) or
   via our own controller instance lookup.

### 2. Boundaries: unit vs electron-integration vs live-daemon

7. **Claim:** Keep the current unit layer exactly as-is. Sinon's own guidance is "prefer fakes
   over spies/stubs… use mocks only for the method under test, at most one per test" — i.e. the
   repo's existing fake-injected style (clock/editors/senders) is the sanctioned unit approach;
   mocks with upfront expectations would couple tests to implementation details.
   **Sources:** [Sinon fakes](https://sinonjs.org/concepts/fakes/),
   [Sinon mocks](https://sinonjs.org/concepts/mocks). **Support:** direct evidence.
   **Confidence:** high.
8. **Claim (the decisive local fact):** The extension already exposes the seam needed to replace
   the daemon without touching source: `Main`'s constructor takes
   `vscode-sonic-pi.sonicPiRootDirectory` and `commandPath` from workspace settings
   (`src/source-runner/main.ts`: `this.rootPath = '/usr/lib/sonic-pi'` → overridden by
   `config.sonicPiRootDirectory()`; `rubyPath` → `config.commandPath()`; `daemonLauncherPath`
   derived from rootPath). `OscSender` sends to `127.0.0.1:<port>` where the port comes from the
   daemon's stdout ports line (same line `test/e2e/protocol.js` parses via
   `out/source-runner/daemonstdout.js`).
   **Sources:** local code (`src/source-runner/main.ts`, `src/source-runner/oscsender.ts`,
   `src/source-runner/config.ts`, `test/e2e/protocol.js`). **Support:** direct evidence (read).
   **Confidence:** high. **Consequence (researcher inference):** a **fake daemon = a small Node
   script** that (a) prints a daemon-ports stdout line with **dynamically bound (port 0→assigned)
   ports**, (b) speaks the OSC message set we already prove works in `protocol.js`
   (`/run-code`, `/stop-all-jobs`, ping/started/ended messages on the gui-listen port), and
   (c) records everything it receives for assertions. Inject it purely via settings written into
   the test host's user-data dir — the exact pattern `microsoft/vscode-python-environments` uses
   in its `.vscode-test.mjs` (`writeUserSettings` + `userDataDir` in `os.tmpdir()`, the latter
   also to dodge the ~103-char macOS unix-socket path cap).
   **Sources:** [vscode-python-environments .vscode-test.mjs](https://github.com/microsoft/vscode-python-environments/blob/main/.vscode-test.mjs).
   **Support:** direct evidence (fetched) for the settings/userDataDir pattern; fake-daemon
   feasibility is inference from the verified settings seam + verified protocol.js message set.
9. **Claim:** Three-layer boundary for this repo:
   - **Unit (existing, keep):** pure logic with fakes — `parseSpiderCmdline`, `RunResolvers`,
     serializer round-trip, cell-flash map, codelenses, statusbar, beautify, daemon-start guard
     logic, etc. No VS Code host, no daemon.
   - **Electron integration (NEW, CI-safe):** real host + real extension `activate()` + **fake
     daemon**. Covers command handlers, notebook controller, run-code routing, daemon-start
     handshake, takeover routing decisions that depend on window/editor state.
   - **Live daemon (existing + optional extension):** `test/e2e/protocol.js` proves the raw
     protocol; optionally add an opt-in `test:live` suite that runs the **installed/loaded
     extension** against the real daemon on a dev machine (developer-local only, exactly like
     `test:e2e` is excluded from CI today).
   **Sources:** local repo facts + layering doc precedent below. **Support:** interpretation
   grounded in verified facts. **Confidence:** high.
10. **Claim:** Two-hosts-in-one-instance (takeover between two extension hosts) is **not
    supported** by the harness: each `runTests()` call is one Electron instance, the test runner
    executes in one window's extension host, and the extension is a singleton per host. Simulating
    two hosts must stay at the unit layer (`spiderServerScanner` is already injectable in
    `src/attach.ts`, `parseSpiderCmdline` is pure) or across two sequential `runTests()` runs with
    state via disk (e.g. a fake spider `/proc`-like artifact — but `/proc` cannot be faked in the
    real host without code seams). **Sources:** vscode-test README (one instance per `runTests`);
    local `src/attach.ts` (injected scanner). **Support:** interpretation; the "no two windows in
    one test host" claim is **researcher inference, not doc-verified** — flag UNVERIFIED if it
    becomes load-bearing; recommend the unit-layer two-host simulation regardless (cheaper, more
    deterministic).

### 3. OSS precedent: how major extensions structure tests (incl. a child-server extension)

11. **Claim:** Microsoft's canonical scaffold layout is `src/test/` → compiled to `out/test/`,
    with an `index.ts` Mocha bootstrap and `*.test.ts` files; the sample repos
    (`helloworld-test-sample`, `helloworld-test-cli-sample`) show `runTest.ts` +
    `.vscode-test.mjs`. The Microsoft-maintained `vscode-python-environments` extension uses a
    single root `.vscode-test.mjs` (`defineConfig([...])`) with per-suite entries — one config
    array element = one VS Code host run (own `files`, `workspaceFolder`, `version`, `mocha`
    options, `userDataDir`).
    **Sources:** [testing-extension doc](https://code.visualstudio.com/api/working-with-extensions/testing-extension),
    [vscode-extension-samples helloworld-test-cli-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/helloworld-test-cli-sample),
    [vscode-python-environments .vscode-test.mjs](https://github.com/microsoft/vscode-python-environments/blob/main/.vscode-test.mjs).
    **Support:** direct evidence (fetched doc + config). **Confidence:** high.
12. **Claim (direct child-server precedent):** `bmw-software-engineering/trlc-vscode-extension`
    (TS client + Python server **spawned as a child process** over JSON-RPC/stdio) splits tests as
    `tests/unit/` (pytest), `tests/integration/` ("spawns a real `python -m server --stdio`
    subprocess and drives it through actual LSP requests" via pytest-lsp), and
    `tests/e2e/` ("golden-path smoke test of the packaged extension inside a real VSCode host"),
    with the e2e explicitly **not part of the default CI target**. This is the same shape being
    proposed here, with our "integration" = electron host + fake daemon and our "e2e/live" =
    real daemon.
    **Sources:** [trlc DEVELOPER_GUIDE](https://github.com/bmw-software-engineering/trlc-vscode-extension/blob/main/docs/DEVELOPER_GUIDE.md).
    **Support:** direct evidence (fetched). **Confidence:** high. (Caveat: their integration layer
    is pytest-lsp outside VS Code; the VS-Code-host layer is their e2e. Our equivalent split is
    justified by the Microsoft docs, not by this repo alone.)

### 4. Flakiness control for UDP + child processes in CI

13. **Claim:** Port strategy — do NOT hardcode ports. The daemon protocol already carries ports in
    the stdout line and the extension parses them (`protocol.js` does exactly this against the real
    daemon). The fake daemon should bind ephemeral ports (`:0`) and print the assigned ports, so
    parallel CI jobs and repeat runs never collide; `SO_REUSEADDR`-style reuse is then irrelevant
    on the extension side (it only sends). **Sources:** local `test/e2e/protocol.js` +
    `src/source-runner/main.ts` (verified). **Support:** direct evidence for the mechanism;
    the `:0` recommendation is **researcher inference**. **Confidence:** high.
14. **Claim:** The specific bug class "send OSC to an unbound port silently" is a UDP property —
    sends to a dead port succeed locally with no error. Therefore integration assertions MUST be
    positive (fake daemon received the expected OSC message with expected args), never
    "no exception thrown". This inverts the current coverage gap. **Sources:** local code
    (`OscSender` fire-and-forget `send()`), UDP semantics. **Support:** interpretation from
    verified code. **Confidence:** high.
15. **Claim:** Timeouts/teardown: give the Mocha suite a generous per-test `timeout` via the
    `.vscode-test.mjs` `mocha` options (the CLI exposes it; Microsoft's environments config uses
    `mocha.require` similarly), kill the fake daemon in `after()` hooks, and never let a failing
    daemon kill the run silently — mirror `protocol.js`'s discipline (`READY_TIMEOUT_MS`,
    `DAEMON_EXIT_TIMEOUT_MS`, `finally`-based teardown, exit-code semantics).
    **Sources:** test-cli README (`mocha` options), local `protocol.js` (verified).
    **Support:** direct evidence for the knobs; the discipline is interpretation. **Confidence:**
    medium-high.
16. **Claim:** CI-safe vs live split for THIS repo (researcher recommendation, grounded in the
    above): CI gains one job step `xvfb-run -a npm run test:integration` (fake daemon, no audio,
    no Sonic Pi, works on `ubuntu-latest`); `test:e2e` stays opt-in/developer-local as today;
    optionally `test:live` (extension + real daemon) also opt-in with a local doc note
    (`SPIDER_LOG_PATH` etc. already assume a real install).

## (a) Reference layouts (two options)

### Layout 1 — "Microsoft canonical" (recommended): keep `test/`, add `test/integration/`

```
vscode-sonic-pi/
├── src/…                              # unchanged
├── test/
│   ├── unit/            *.test.js     # EXISTING 14 suites, plain `node`, no host — keep as-is
│   ├── integration/
│   │   ├── runTest.ts                 # runTests({ extensionDevelopmentPath: repo root,
│   │   │                              #   extensionTestsPath: ./out/test/integration/suite })
│   │   ├── suite/index.ts             # Mocha bootstrap inside the host (canonical index.ts)
│   │   ├── suite/*.test.ts            # the ~6 suites below
│   │   ├── fake-daemon/daemon.js      # Node fake daemon: prints ports line (ephemeral ports),
│   │   │                              #   speaks OSC /run-code, /stop-all-jobs, started/ended, ping
│   │   ├── fake-daemon/recorder.js    # assertion API: waitForMessage(address, args, timeout)
│   │   └── fixtures/                  # .pi files, .pibook notebook, settings template
│   └── e2e/protocol.js                # EXISTING live-daemon gate — keep as-is
├── .vscode-test.mjs                    # @vscode/test-cli config (or keep runTest.ts only)
└── package.json scripts:
    "test":            build + unit suites (existing)
    "test:integration":"npm run build && node out/test/integration/runTest.js"
    "test:e2e":        existing (opt-in)
```

Why: preserves the working unit layer verbatim, adds exactly one new runner, and matches the
`helloworld-test-sample` / `vscode-python-environments` shape (config-driven, one host per
suite-group). `extensionDevelopmentPath` = repo root (source, `main: ./out/extension.js`
already points at the build output — verified).

### Layout 2 — "Microsoft scaffold" (`src/test/`)

`src/test/runTest.ts` + `src/test/suite/*.test.ts` compiled by the main `tsc` build into
`out/test/` (the doc's `index.ts` + `*.test.ts` pattern, auto-discovered by Mocha's file glob).
Same semantics, different folder. Only worth it if you want the tests type-checked by the
existing single `tsconfig` build — otherwise Layout 1 keeps build/test wiring simpler and unit
tests untouched.

Either way: **one `.vscode-test.mjs` with an array entry per suite-group** when groups need
different workspaces/versions (verified pattern from `vscode-python-environments`).

## (b) Integration-suite inventory (this repo), ranked by regression value

All run in the real host against the **fake daemon** (settings-injected). "Pain ref" = the bug
class it would have caught.

| # | Suite | What it drives (real chain) | Asserts | Pain ref |
|---|-------|------------------------------|---------|----------|
| 1 | **cold-window run** | Fresh window, **no editor open**, `executeCommand('vscode-sonic-pi.run')` | Either fake daemon receives a sane `/run-code` (with valid token/ports) **or** the guard refuses and surfaces a message — the exact silent-unbound-port regression, now asserted positively | **Exact today pain** |
| 2 | **run-code routing** | Open `.pi` fixture (language `sonic-pi`), set selection/whole-doc, `run` | Fake daemon received the **selected code**, correct message + token, routed to the parsed port | run routing shipped untested |
| 3 | **notebook play e2e** | `openNotebookDocument` on a `.pibook` fixture, execute one code cell via the controller | Fake daemon got the cell code; `NotebookCellExecution` ends success; `RunResolvers` settled (started/ended handshake works) | notebook wiring untested |
| 4 | **contributions/activation wiring** | `getExtension(...).activate()`; `getCommands(true)` filter for all 9 contributed commands; serializer registered (`onNotebook:sonic-pi-book` activates); codelens provider on `.pi` | every `contributes.command` id present + notebook serializer/controller reachable | packaging/activationEvents regressions the stub can't see |
| 5 | **start-server handshake** | `vscode-sonic-pi.startserver` with fake daemon via settings | ports parsed from stdout line; sender bound to those ports; statusbar/state flips; daemon child spawned with expected argv | child-process + OSC seam |
| 6 | **stop-all / connection-lost** | Running state, then fake daemon stops responding; `stopAllScripts` / stop-all-jobs | No silent send to unbound port; recovery path taken (restart/guard) | silent-UDP bug class |

Optional 7th: **runCell / runselected routing** (cheaper variant of #2/#3).
Takeover-between-hosts: **unit layer only** (inject `spiderServerScanner` with two fake
`/proc` cmdlines — already supported, verified in `src/attach.ts`); no electron-host equivalent
(see Finding 10, flagged UNVERIFIED for the two-window question).

## (c) CI implications

- Add to the existing `build-and-test` job: `sudo apt-get install -y xvfb` (runner image has it
  preinstalled in practice, but be explicit) and `- run: xvfb-run -a npm run test:integration`
  — mirrors Microsoft's own sample workflow (`xvfb-run -a npm test`, Linux-only condition).
- **Pin the VS Code version** in `runTests`/`.vscode-test.mjs` (`version:`) for determinism, and
  cache `.vscode-test/` (downloaded host) between runs to cut wall time; keep `launchArgs:
  ['--disable-extensions']` so other extensions can't interfere.
- `test:e2e` (and any `test:live`) stays **excluded from CI** — runners have no Sonic Pi; this is
  already the repo's documented choice. Document the local incantation instead.
- Budget: expect the integration job to add ~1–3 min (host download cached + one Electron boot
  per suite-group). Set `mocha.timeout` generously (e.g. 30–60s/test) for daemon-handshake waits;
  `xvfb-run -a` auto-allocates the display so concurrent jobs don't fight over `:99`.
- Flakiness rules (from Findings 13–15): fake daemon binds ephemeral ports and prints them;
  assertions are positive (message received with expected args) with explicit timeouts;
  `finally` teardown kills the daemon; suite exit code is the only signal (match `protocol.js`).

## Contradictions

- None material found between primary sources. One soft tension: `@vscode/test-cli` README says
  new extensions may prefer the CLI, while `@vscode/test-electron` remains the underlying engine —
  they compose (CLI wraps `test-electron`), so this is a style choice, not a conflict.
- xvfb-less running: no primary source supports a headless/no-display mode for the test host;
  community noise around `--ozone-platform` exists but nothing verified → recorded as missing
  evidence rather than resolved.

## Missing evidence

- Exact built-in notebook execution command IDs (`notebook.cell.execute`, `notebook.execute`) —
  UNVERIFIED from primary docs; verify in-host via `vscode.commands.getCommands(true)` or use the
  controller API instead.
- `NotebookController.execute(cells)` availability/semantics in our engine version (`^1.144.0`) —
  not re-verified here; check the 1.144 API dts before writing suite #3.
- Whether one `runTests()` host can host two windows/extension-host instances (two-host takeover
  test) — UNVERIFIED; unit-layer simulation recommended regardless.
- Whether GitHub-hosted `ubuntu-latest` already ships `xvfb` (it historically does) — verify once
  in the workflow; the explicit apt step is cheap insurance.
- Fake-daemon fidelity: the exact OSC message set the real daemon emits for job started/ended
  (we verify `/run-code`, `/stop-all-jobs` in `protocol.js`; the gui-port notification messages
  need a one-time capture against the live daemon to make `RunResolvers` settle in suite #3).

## Sources

**Kept**
- Testing Extensions — code.visualstudio.com/api/working-with-extensions/testing-extension —
  canonical integration-test model, test-cli, `--extensionDevelopmentPath/--extensionTestsPath`.
- microsoft/vscode-test README — `runTests` option surface (version pinning, launchArgs,
  extensionTestsEnv, downloadAndUnzipVSCode, runVSCodeCommand).
- microsoft/vscode-test sample `.github/workflows/ci.yml` — the blessed `xvfb-run -a` Linux CI step.
- @vscode/test-cli README — `.vscode-test.mjs` config shape (`files`, `version`,
  `workspaceFolder`, `mocha.timeout/require`), multi-suite config arrays.
- microsoft/vscode-python-environments `.vscode-test.mjs` — real-world config-driven layout,
  `userDataDir`-in-tmpdir + `writeUserSettings` determinism pattern (directly reusable for
  injecting our fake-daemon settings).
- vscode Notebook API guide — serializer/controller model, `notebookType`, execution handler.
- Sinon fakes + mocks docs — fake-over-mock policy validating the existing unit style.
- bmw-software-engineering/trlc-vscode-extension DEVELOPER_GUIDE — unit / integration(real child
  server subprocess) / e2e(packaged VSIX in real host, outside default CI) precedent for an
  extension that spawns a local server process.
- Local repo (direct reads): `package.json`, `test/unit/activation.test.js`,
  `test/e2e/protocol.js`, `src/extension.ts`, `src/source-runner/{extension,main,oscsender,config}.ts`,
  `src/notebook.ts`, `src/attach.ts`, `.github/workflows/ci.yml`.

**Rejected/deprioritized**
- Old `Microsoft/vscode-docs` `testing-extensions.md` (2018, master-branch copy) — superseded by
  the live code.visualstudio.com page.
- remarkablemark headless-CI blog post — generic Electron/xvfb advice; the Microsoft sample
  workflow is the authoritative equivalent.
- StackOverflow namespacer question — used only as corroboration that a virtual display is
  required; primary evidence already covers it.
- Mintlify mirror of VS Code docs — mirror of primary; dropped.
- vscode-python wiki "Multi-Project Testing" — user-facing feature doc, not a test-layout source.

## Next steps

1. Capture the real daemon's gui-port notification messages once (extend `protocol.js` logging) so
   the fake daemon can drive `RunResolvers` faithfully.
2. Empirically confirm in-host: `vscode.commands.getCommands(true)` for the notebook execute
   command IDs, and `NotebookController.execute(cells)` on engine 1.144.
3. Spike suite #1 (cold-window run) first — it targets today's exact regression and forces the
   fake-daemon + settings-injection plumbing into existence.
