---
# sonic-pi-sawd
title: 'Fork s00500/vscode-sonic-pi: Sonic Pi 5 + Linux support'
status: todo
type: epic
priority: high
created_at: 2026-11-03T14:40:15Z
updated_at: 2026-11-03T15:28:24Z
---

# Goal

Fork https://github.com/s00500/vscode-sonic-pi (v0.1.0) into **bmcszk/vscode-sonic-pi** and make it work with **Sonic Pi 5.x on Linux** (pacman package `sonic-pi 5.0.0-1`, install root `/usr/lib/sonic-pi`).

Upstream claims "SonicPi v4 and up" but is broken on v5/Linux in 3 verified places (see child tasks — evidence from live testing on this machine, 2026-11-03).

## Verified facts (this machine, Sonic Pi 5.0.0)

- Layout: `/usr/lib/sonic-pi/app/server/ruby/bin/daemon.rb` (upstream hardcodes `/server/ruby/bin/daemon.rb` on Linux — wrong).
- Daemon stdout on 5.0 prints **6** values: `daemon gui-listen gui-send scsynth osc-cues token` (v4.6 printed 8 with tau/phx before token). Live capture: `38880 38877 38876 38878 4560 1411627710`.
- 5.0 spider-server OSC API is token-authenticated, args[0]=token: `/run-code` (token, code[, workspace, silent]), `/stop-all-jobs`, `/stop-job`, `/mixer-*`, `/ping` — same paths upstream sends, so protocol-compatible once token is right.
- Ruby on PATH is fine (`/usr/bin/ruby` 3.4); daemon spawns spider itself.
- Log path: `~/.sonic-pi/log/daemon.log` (upstream's dead log-parser has a stale `log: UTF-8, UTF-8, Token: ` prefix — dead code, `initAndCheckPorts` never called).

## Exit criteria

Patched extension installed in VS Code; opening a `.rb`, F5 runs code on the live 5.0 daemon (sound + spider.log proof), Alt+S stops. Packaged as vsix, version bumped so marketplace can't clobber.


## Rejected alternatives (researched 2026-11-03)

- **AUR `sonic-pi-cli` / `sonic-pi-tool`**: speak pre-4.x protocol (port 4557, no token) — incompatible with 5.0.
- **AUR `sonic-pi-git` (v4.6)**: redundant, user runs stable 5.0.
- **AUR `sonic-pipewire`**: unrelated (SonicDE).
- **jakearl.vscode-sonic-pi 0.0.10** (installed in VS Code): launches removed `sonic-pi-server.rb` — dead on 5.x; leftover folder already in `.obsolete`.
- **mactkg/vscode-sonic-pi**: pre-4.x, hardcoded GUI_ID=10, no token — dead.
- **ZonaGrisDigital Sonic Pi Helper 0.3.2**: attaches to running instance via /proc/+raw OSC — closest match but its regex expects v4's 8-arg spider cmdline (5.0 passes 6), no public repo, and attach-only (no server launch). Its 1-line regex fix (`/spider-server\.rb\s+-u\s+(\d+)(?:\s+\d+)*\s+(-?\d+)\s*$/`) is a good fallback reference if fork approach stalls — spares port/token discovery entirely.

## Test artifact references

- `docs/research/spfork-main.ts` — upstream source snapshot used for analysis (moved out of /tmp 2026-11-03, md5-identical)
- `docs/research/daemon-46.rb` — v4.6 daemon for stdout-layout comparison
- `docs/research/daemon-stdout.txt` — live 5.0 capture: `38880 38877 38876 38878 4560 1411627710`
- `docs/research/sph-vsix/` — Helper vsix extraction (regex audit)
