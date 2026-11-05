# Settings

All settings use the `vscode-sonic-pi.` prefix and can be set in your user or workspace settings.

## Server

| Setting | Default | What it does |
| ------- | ------- | ------------ |
| `vscode-sonic-pi.connectionMode` | `auto` | `auto` attaches to a Sonic Pi app you started yourself (found by scanning `/proc` for `spider-server.rb` on Linux) and boots our own daemon only if none is running. `managed` always boots the daemon. `attach` never boots: it errors if no running Sonic Pi server is found. |
| `vscode-sonic-pi.launchSonicPiServerAutomatically` | `ruby` | `ruby` starts the server with Ruby when a Sonic Pi file opens. `custom` runs the command in `launchSonicPiServerCustomExtension`. `never` never starts it; use **Sonic Pi: Start Server** by hand. |
| `vscode-sonic-pi.sonicPiRootDirectory` | platform default | Where Sonic Pi is installed. Defaults: `/usr/lib/sonic-pi` (Linux), `/Applications/Sonic Pi.app/Contents/Resources` (macOS), `C:\Program Files\Sonic Pi` (Windows). Set it if the extension reports the root path is not configured. |
| `vscode-sonic-pi.launchSonicPiServerCustomExtension` | unset | Full command line to start the server when the launch mode is `custom`. |
| `vscode-sonic-pi.stopServerOnLastEditorClose` | `false` | Stops the server and shuts the daemon down when the last Sonic Pi editor closes. Never fires while a server restart (audio recovery) is in progress. |

## Running code

| Setting | Default | What it does |
| ------- | ------- | ------------ |
| `vscode-sonic-pi.safeMode` | `true` | Prepends `use_arg_checks true` to every run. With it off, bad synth argument values can produce loud or uncomfortable sounds. |
| `vscode-sonic-pi.runFileWhenRunSelectedIsEmpty` | `true` | `Alt+T` with no selection runs the whole file instead of doing nothing. |
| `vscode-sonic-pi.autoMidiStart` | `true` | Sends `/midi-start` once per session before running code that uses `midi_*` functions, so MIDI is not silently ignored. |

## Editor controls

| Setting | Default | What it does |
| ------- | ------- | ------------ |
| `vscode-sonic-pi.showEditorControls` | `true` | The ▶ Run / ■ Stop row above the file, ▶ Run cell / ⟳ Load def above blocks, and the ▶ title-bar button. |
| `vscode-sonic-pi.showPlayingLineHighlight` | `true` | Highlights the lines that are currently making sound while code plays. |

## Output and flash

| Setting | Default | What it does |
| ------- | ------- | ------------ |
| `vscode-sonic-pi.logAutoscroll` | `true` | Keeps the Log channel scrolled to the newest line. |
| `vscode-sonic-pi.logClearOnRun` | `false` | Clears the Log channel on every run. |
| `vscode-sonic-pi.flashBackgroundColor` | `rgba(255,255,255,1.0)` | Background of the run flash over the played region. |
| `vscode-sonic-pi.flashTextColor` | `rgba(255,255,255,1.0)` | Text color during the run flash. |

## Mixer

| Setting | Default | What it does |
| ------- | ------- | ------------ |
| `vscode-sonic-pi.invertStereo` | `false` | Swaps left and right channels. |
| `vscode-sonic-pi.forceMono` | `false` | Plays everything through both channels. |
