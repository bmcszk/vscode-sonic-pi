---
# sonic-pi-9qtk
title: '- Linux daemon path wrong: root+/server/ruby/bin vs actual app/server/ruby/bin'
status: todo
type: bug
priority: normal
created_at: 2026-11-03T14:40:48Z
updated_at: 2026-11-03T15:27:46Z
parent: sonic-pi-sawd
blocked_by:
    - sonic-pi-lz8o
---

# Bug (verified live + source-quoted, triaged 2026-11-03)

`constructor()` Linux: `this.daemonLauncherPath = this.rootPath + '/server/ruby/bin/daemon.rb'` (upstream `src/source-runner/main.ts` ~L110); only win32 gets the `/app` segment (`~L112-114`). Pacman's Sonic Pi 5.0 root is `/usr/lib/sonic-pi` with layout `app/server/ruby/bin/daemon.rb` (verified on disk, 1263-line ruby file) → file-not-found.

**Researcher finding (binding):** no config-only workaround — `samplePath` (~L119, expects `/usr/lib/sonic-pi/etc/samples`) and the daemon launcher need *different* rootPath values, so code must change, not just defaults.

## Fix

Try `{root}/app/server/ruby/bin/daemon.rb` first (exists on pacman layout; macOS/Windows app layout too), fall back to `{root}/server/ruby/bin/daemon.rb`. Default `sonicPiInstallDir` on Linux: `/usr/lib/sonic-pi`.

## AC

- [ ] No config change needed on Arch (pacman): detects `/usr/lib/sonic-pi/app/server/ruby/bin/daemon.rb`
- [ ] Upstream macOS/Windows defaults unchanged (win32 still gets /app variant; mac default untouched)
- [ ] Both paths' existence checked at runtime via fs.existsSync, upstream order preserved where valid

## Skills for coder

- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md — gate: minimal diff, only the path-selection block changes.
- Do not refactor beyond the fix; the same file is edited by serialized siblings 9uiy and l3ab.

## Stop rule

All edits confined to `src/source-runner/main.ts` path-selection + config default. Anything else → new draft bean.

Refs: sonic-pi-sawd
