# Sonic Pi for VS Code

Write and run [Sonic Pi](https://sonic-pi.net/) code in VS Code: syntax highlighting, completions and
hovers for samples, synths, FX and commands, a log channel, and Run/Stop straight to a running
Sonic Pi server.

This is a fork of [s00500/vscode-sonic-pi](https://github.com/s00500/vscode-sonic-pi), which in turn
builds on the work of [JacksonKearl/vscode-sonic-pi](https://github.com/JacksonKearl/vscode-sonic-pi)
and [llloret/sonic-pi-vscode-editor](https://github.com/llloret/sonic-pi-vscode-editor). It targets
Sonic Pi 5.

## Requirements

- VS Code 1.58 or newer.
- Sonic Pi 5.x installed on the same machine. The extension starts Sonic Pi's own server, so check
  first that Sonic Pi plays sound on its own.
- Sonic Pi found in the platform default location: `/usr/lib/sonic-pi` on Linux,
  `/Applications/Sonic Pi.app/Contents/Resources` on macOS, `C:\Program Files\Sonic Pi` on Windows.
  Only the Linux layout has been tested against Sonic Pi 5. If your install lives somewhere else,
  set [`sonicPiRootDirectory`](#settings).

## Install

The Marketplace listing for this fork is not published yet. Install the packaged extension instead:

1. Get the `.vsix` package (`sonic-pi-extension-<version>.vsix`).
2. In VS Code, open the Extensions view, click the `...` menu and choose **Install from VSIX…**.
3. Pick the file. Reload the window if VS Code asks.

## Getting started

1. Open the file you want to play. Files ending in `.pi` open as Sonic Pi automatically; for any
   other file, such as a `.rb`, run **Change Language Mode** from the Command Palette and choose
   **Sonic Pi**. Run and Stop only fire in a Sonic Pi editor.
2. The server starts by itself once a Sonic Pi file is open, since
   [`launchSonicPiServerAutomatically`](#settings) defaults to `ruby`. To start it by hand, run
   **Sonic Pi: Start Server**.
3. Press `F5` (or `Alt+R`) to run the whole file, `Alt+S` to stop it. The played region flashes
   briefly, and the **Cues** and **Log** output channels show what the server reports.
4. Or use the editor controls: a **▶ Run / ■ Stop** row above the first line, a **▶ Run cell**
   above each blank-line-separated block that plays something, a **⟳ Load def** above a block
   that starts with `define`/`defonce` (reloads that function into the running session), and a
   **▶** button at the top right of the editor tab. Blocks that only assign variables
   (`chord_low_1 = ...`) or only set options (`use_bpm 120`) get no lens because running them
   makes no sound. Everything clickable runs the same commands as the keys. Turn them off with
   [`showEditorControls`](#settings).

   Run cell executes only that block in its own run. Plain local variables from other blocks are
   not visible there; share state with `define`d functions or Time State (`set`/`get`), or use Run
   for the whole file.

### Keyboard shortcuts

| Shortcut      | Action               | Active in               |
| ------------- | -------------------- | ----------------------- |
| `F5`, `Alt+R` | Run the whole file   | Sonic Pi editor         |
| `Alt+S`       | Stop                 | Sonic Pi editor         |
| `Alt+T`       | Run selected text    | Sonic Pi editor         |
| `Shift+Alt+R` | Toggle recording     | Sonic Pi editor or cell |
| `F5`, `Alt+R` | Run the current cell | Sonic Pi notebook       |
| `Alt+S`       | Stop the notebook    | Sonic Pi notebook       |

### Commands

All commands sit in the Command Palette under the **Sonic Pi** category.

| Command                                    | What it does                                        |
| ------------------------------------------ | --------------------------------------------------- |
| **Sonic Pi: Start Server**                 | Starts the Sonic Pi server without needing a file   |
| **Sonic Pi: Check Install**                | Confirms the extension is running (`All Good!`)     |
| **Sonic Pi: Open Examples**                | Opens the bundled example pieces                    |
| **Sonic Pi: Open Tutorial**                | Opens the bundled tutorial as a notebook            |
| **Sonic Pi: Run**                          | Runs the current file                               |
| **Sonic Pi: Run selected text**            | Runs the selection                                  |
| **Sonic Pi: Stop**                         | Stops every running job                             |
| **Sonic Pi: Toggle recording**             | Toggles Sonic Pi's recording                        |
| **Sonic Pi: Create new Sonic Pi notebook** | New notebook with a cell-by-cell player             |
| **Sonic Pi: Run Notebook Cell**            | Runs the cell the cursor is in, in a notebook       |
| **Sonic Pi: Stop Notebook**                | Stops a notebook's player                           |

## Settings

All settings live under **Settings → Extensions → Sonic Pi**, or in `settings.json` under the
`vscode-sonic-pi.` prefix.

| Setting | Default | Meaning |
| ------- | ------- | ------- |
| `vscode-sonic-pi.sonicPiRootDirectory` | unset | Sonic Pi installation directory. Leave it unset unless your install is outside the platform default; the extension warns when the configured root has no `daemon.rb` under it. |
| `vscode-sonic-pi.launchSonicPiServerAutomatically` | `"ruby"` | When to start the server automatically: `ruby` (a Sonic Pi file is open), `start` (VS Code starts), `never` (only via **Sonic Pi: Start Server**), `custom` (a file with the extension named in `launchSonicPiServerCustomExtension` is open). |
| `vscode-sonic-pi.launchSonicPiServerCustomExtension` | unset | File extension that triggers the automatic start when the setting above is `custom`. |
| `vscode-sonic-pi.runFileWhenRunSelectedIsEmpty` | unset | What **Run selected text** does when nothing is selected: `always` runs the whole file, `never` does nothing. While unset, the extension asks once and offers to remember the answer. |
| `vscode-sonic-pi.invertStereo` | `false` | Invert stereo output. |
| `vscode-sonic-pi.forceMono` | `false` | Force mono output. |
| `vscode-sonic-pi.safeMode` | `true` | Synth argument checking. Turning it off lets synth opt values create unexpectedly loud or uncomfortable sounds. |
| `vscode-sonic-pi.logAutoscroll` | `true` | Autoscroll the log. |
| `vscode-sonic-pi.logClearOnRun` | `true` | Clear the log when a run starts. |
| `vscode-sonic-pi.flashBackgroundColor` | `"rgba(255,20,147,1.0)"` | Background flash color while code runs. |
| `vscode-sonic-pi.flashTextColor` | `"rgba(255,255,255,1.0)"` | Text flash color while code runs. |
| `vscode-sonic-pi.showEditorControls` | `true` | Show Run/Stop controls above the editor (CodeLens) and in the editor title bar. |

## Troubleshooting

- **No sound, or the server never comes up.** Check that Sonic Pi itself plays sound. Then read the
  **Log** and **Cues** output channels in VS Code (View → Output), and the log files Sonic Pi writes
  to `~/.sonic-pi/log/`:
  - `daemon.log` — server startup, including the port and token line the extension reads.
  - `spider.log` — whether a run was accepted, and any error in your Sonic Pi code.
  - `supersonic.log` — audio engine activity. Sonic Pi 5 logs the audio engine to `supersonic.log`;
    there is no `scsynth.log` on 5.x.
- **"The Sonic Pi root path is not properly configured".** The extension found no
  `app/server/ruby/bin/daemon.rb` (or `server/ruby/bin/daemon.rb`) under the configured root. Click
  **Go to settings** and set `sonicPiRootDirectory`, for example `/usr/lib/sonic-pi` on Linux.
- **Run and Stop do nothing.** The shortcuts need a Sonic Pi editor: check the language mode in the
  status bar. Inside a notebook use the notebook shortcuts instead.
- **Unsure the extension is loaded?** Run **Sonic Pi: Check Install**.

## Fork notes

- Tested against Sonic Pi 5.0.0 on Linux (pacman package), daemon at
  `/usr/lib/sonic-pi/app/server/ruby/bin/daemon.rb`: a live run and stop were accepted by
  `spider.log`.
- Divergences from the s00500 fork: Linux root defaults to `/usr/lib/sonic-pi` and both the `app/`
  and flat daemon layouts are detected; the Sonic Pi 5 daemon line is parsed for its 6 values,
  negative tokens are kept, and an unparsable line aborts the start instead of sending a bogus token;
  the dead log parser is gone.
- Version 0.1.1.

## License and credits

MIT — see [LICENSE](LICENSE). The language support builds on the previous work of Jackson Kearl,
Luis Lloret and the s00500 fork; the bundled tutorial content is copyright Scott Aaron.
