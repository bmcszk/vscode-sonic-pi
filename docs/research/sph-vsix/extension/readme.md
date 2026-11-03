# Sonic Pi Helper

Code Sonic Pi from VS Code with IntelliSense, live execution and inline documentation.

## Features

### ▶ Run code directly in Sonic Pi

Send your code to a running Sonic Pi instance without leaving VS Code.

- **`Alt+R`** — run the current file (or selection) in Sonic Pi
- **`Alt+S`** — stop all sounds immediately
- Connects to Sonic Pi's internal OSC server — no plugins or configuration needed

> Sonic Pi must be open before pressing `Alt+R`.

---

### 🔍 IntelliSense for synths, FX and samples

Autocomplete triggers automatically when you type:

| What you type | What you get |
|---|---|
| `use_synth :` | All 43 built-in synths with descriptions |
| `with_fx :` | All 34 effects with parameters |
| `sample :` | All 96 samples grouped by category |
| `play 60,` | Param suggestions: `attack:`, `release:`, `cutoff:` … |

---

### 📖 Hover documentation

Hover over any `:synth_name`, `:fx_name` or `:sample_name` to see its description and parameter list inline — without leaving the editor.

---

### ✂️ Snippets

Type the prefix and press `Tab`:

| Prefix | Snippet |
|---|---|
| `ll` | `live_loop` with BPM and sleep |
| `lls` | `live_loop` + synth + play |
| `llb` | `live_loop` beats (drum pattern) |
| `fx` | `with_fx` block |
| `ws` | `with_synth` block |
| `th` | `in_thread` block |
| `pc` | `play_chord` |
| `ppt` | `play_pattern_timed` |
| `sa` | `sample` with amp and rate |
| `fxr` | `with_fx :reverb` |
| `fxe` | `with_fx :echo` |
| `fxd` | `with_fx :distortion` |
| `fxl` | `with_fx :lpf` |
| `rng` | `(ring ...)` |
| `tick` | `ring.tick` |
| `seed` | `use_random_seed` |

---

## Requirements

- [Sonic Pi](https://sonic-pi.net/) installed and running (for live execution)

## How live execution works

The extension reads the port and session token directly from the running Sonic Pi process — no manual configuration needed. It works on Windows (via WMI), macOS and Linux (via `ps`/`/proc`).

## Known limitations

- Live execution requires Sonic Pi to be already open
- The extension registers as a language for `.rb` files — if you also use a Ruby extension, IntelliSense may offer both providers

## License

MIT — made by [Zona Gris Digital](https://zonagris.digital)
