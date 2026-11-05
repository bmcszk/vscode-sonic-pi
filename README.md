# Sonic Pi 5 for VS Code

Write and run [Sonic Pi](https://sonic-pi.net/) code in VS Code. Syntax highlighting, completions,
hovers for samples, synths, FX and commands, a log channel, and Run/Stop straight to a running
Sonic Pi 5 server.

Fork of [s00500/vscode-sonic-pi](https://github.com/s00500/vscode-sonic-pi), targeting Sonic Pi 5.
Linux is the tested platform. See [Fork notes](#fork-notes).

## Requirements

- VS Code 1.144 or newer.
- Sonic Pi 5.x installed on the same machine. Check that Sonic Pi plays sound on its own first.

## Install

1. Download the `.vsix` from [Releases](https://github.com/bmcszk/vscode-sonic-pi/releases).
2. In VS Code, open the Extensions view, click the `...` menu, choose **Install from VSIX…**, and
   pick the file.

## Getting started

1. Open a `.pi` file. For a `.rb` file, run **Change Language Mode** and choose **Sonic Pi**. The
   server starts automatically when a Sonic Pi file is open.
2. Press `F5` or `Alt+R` to run the file, `Alt+S` to stop.
3. The editor shows controls above the code: **▶ Run / ■ Stop** above the first line, **▶ Run
   cell** above each block that plays something, and **⟳ Load def** above `define` blocks. Load
   def reloads that function into the running session, so a running loop picks up your edit on
   its next cycle. A **▶** button also sits at the top right of the editor tab. Turn all of this
   off with `sonic-pi.showEditorControls`.
4. While code plays, the lines that are currently making sound light up, like in the Sonic Pi
   app. Turn it off with `sonic-pi.showPlayingLineHighlight`.

Run cell runs only that block in its own run. Variables from other blocks are not visible there.
Share state with `define`d functions or `set`/`get`, or run the whole file.

## Snippets

Typing a prefix and accepting the suggestion inserts a template: `ll` (live loop), `lls` (live
loop with synth), `llb` (live loop with sample), `def` (define function), `with_fx`, `use_bpm`,
`in_thread`, `chord`, `scale`.

## Commands

All commands are in the Command Palette under the **Sonic Pi** category: Start Server, Check
Install, Open Examples, Open Tutorial, Docs, Run, Run selected text, Beautify, Stop, Toggle
recording, and the notebook commands (create notebook, run cell, stop). **Docs** opens a
searchable browser over the built-in synths, FX, samples and commands; picking an entry shows its
documentation and options.

| Key | Action |
| --- | ------ |
| `F5`, `Alt+R` | Run file (or notebook cell) |
| `Alt+S` | Stop |
| `Alt+T` | Run selection |
| `Shift+Alt+B` | Beautify (align buffer via the daemon) |
| `Shift+Alt+R` | Toggle recording |

## Settings

Settings use the `vscode-sonic-pi.` prefix. The full table with defaults lives in
[docs/SETTINGS.md](docs/SETTINGS.md). The ones you are most likely to touch:

- `sonic-pi.sonicPiRootDirectory`: set this only if your Sonic Pi install is not in the platform
  default location (`/usr/lib/sonic-pi` on Linux, `/Applications/Sonic Pi.app/Contents/Resources`
  on macOS, `C:\Program Files\Sonic Pi` on Windows).
- `sonic-pi.showEditorControls`: the Run/Stop/Run cell controls.
- `sonic-pi.stopServerOnLastEditorClose`: shut the server down when the last Sonic Pi editor closes.
- `sonic-pi.showPlayingLineHighlight`: the playing-line highlight.
- `sonic-pi.autoMidiStart`: sends `/midi-start` automatically before code that uses `midi_*` functions.
- `sonic-pi.safeMode`: synth argument checking. Keep it on; turning it off lets bad synth
  argument values produce loud or uncomfortable sounds.

## Troubleshooting

If there is no sound or the server never comes up, check that Sonic Pi itself plays sound. Then
read the **Log** and **Cues** output channels in VS Code, plus the files in `~/.sonic-pi/log/`:
`daemon.log` for startup, `spider.log` for run errors, `supersonic.log` for the audio engine.

If VS Code says the Sonic Pi root path is not properly configured, set
`sonic-pi.sonicPiRootDirectory`, for example `/usr/lib/sonic-pi` on Linux.

If Run and Stop do nothing, check the language mode in the status bar; the shortcuts need a Sonic
Pi editor. Notebooks have their own bindings.

To check that the extension loaded, run **Sonic Pi: Check Install**.

## Fork notes

Tested against Sonic Pi 5.0.0 on Linux (pacman layout, daemon under `app/server/ruby/bin/`). The
Linux root path defaults to `/usr/lib/sonic-pi`, both daemon layouts are detected, and the Sonic
Pi 5 token line is parsed (6 values, negative tokens kept, unparsable line aborts the start).
Editor controls and the playing-line highlight are this fork's additions. Full change history:
[CHANGELOG.md](CHANGELOG.md).

## License and credits

MIT, see [LICENSE](LICENSE). Builds on the work of Jackson Kearl, Luis Lloret and the s00500
fork. Bundled tutorial content is copyright Scott Aaron.
