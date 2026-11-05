# Change Log

All notable changes to the "sonic-pi-extension" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.2.0] - unreleased

### Added
- Editor run controls for Sonic Pi files: **▶ Run / ■ Stop** CodeLens above the file, **▶ Run cell**
  above each playable blank-line block (comment-only, settings-only, assignment-only and `define`
  blocks get sensible treatment — definitions offer **≡ Load def** to (re)load functions into the
  running session), and a **▶** button in the editor title bar. Toggle everything with
  `sonic-pi.showEditorControls` (surgical, per-block runs send their file position so daemon
  flash/error lines stay on the right editor lines).
- **Playing-line highlight**: the source lines currently making sound light up while playing,
  like the Sonic Pi app (same `/flash` protocol; 250 ms pulse per trigger;
  `sonic-pi.showPlayingLineHighlight`).
- **Restart Server** command + audio-server-loss detection: when the SuperSonic audio server dies
  mid-session, the extension offers a one-click recovery instead of silent breakage.
- Activation smoke gate in CI: the built extension is loaded and activated in tests, so
  module-load regressions fail CI instead of shipping.
- `license`, `homepage`, `keywords` manifest fields; `.vscodeignore` slims the package
  (317 files / 586 KB vs 431 / 825 KB).

### Changed
- Dependencies refreshed to latest CJS-compatible majors (TypeScript 6, osc-js 2.4.1, uuid 11),
  engines `vscode ^1.144.0`.
- `npm audit` clean: 16 → 0 vulnerabilities (unused mocha/chai toolchain removed,
  `minimatch` override).

### Fixed
- Linux: daemon path resolved for pacman-installed Sonic Pi 5 (`/usr/lib/sonic-pi`, `app/` layout).
- Linux: daemon token parsing for 5.x stdout (6 values, garbage-safe).
- Dead startup port-check code removed.

## [0.1.2] - 2026-11-03

Audio-loss detection + Restart Server recovery. **Known broken release:** a TypeScript 6 module
change broke activation (commands never registered). Fixed in 0.1.3 — do not use 0.1.2.

## [0.1.1] and earlier

Upstream s00500/vscode-sonic-pi releases. This fork adds Sonic Pi 5 + Linux support on top.
