---
# sonic-pi-1lg0
title: '- Verify E2E on live Sonic Pi 5.0 daemon + package patched vsix'
status: todo
type: task
priority: normal
created_at: 2026-11-03T14:40:48Z
updated_at: 2026-11-03T15:27:46Z
parent: sonic-pi-sawd
blocked_by:
    - sonic-pi-9qtk
    - sonic-pi-9uiy
    - sonic-pi-l3ab
---

# Task (triaged 2026-11-03)

After the three bug fixes land (serialized in wave 2, all touch main.ts): build, bump version 0.1.0 → **0.1.1**, package vsix (`vsce package` — vsix filename `sonic-pi-extension-0.1.1.vsix`), install into VS Code, uninstall jakearl.vscode-sonic-pi 0.0.10 leftover (already .obsolete — conflicts on language id + Alt+R/Alt+S).

## E2E proof — headless-first (researcher plan, binding)

1. **Headless protocol gate (no VS Code):** node script (lives in repo, e.g. `test/e2e/protocol.js`) spawns `ruby /usr/lib/sonic-pi/app/server/ruby/bin/daemon.rb`, parses stdout with the SAME logic as the patched extension (or imports the built out/ code), sends `/run-code` (token, `play :E4`) + `/stop-all-jobs` via osc-js from the repo's node_modules, asserts: token parsed (incl. negative), spider.log shows acceptance, no "Invalid token". Exit 0 = gate green.
2. **Packaging gate:** `vsce package` succeeds (publisher s00500 stays for local install; vsix version 0.1.1), `code --install-extension` succeeds.
3. **Final human smoke:** open a `.rb`, language=sonic-pi, F5 on `play :E4` — sound audible; Alt+S stops. (Only this step needs the user.)

**Stale-AC correction (researcher finding, binding):** 5.0 logs are `daemon.log / spider.log / supersonic.log` — there is NO `scsynth.log`; supersonic replaced scsynth. Cite supersonic.log for synth activity.

## AC

- [ ] Headless protocol gate green: run-code + stop-all-jobs accepted on live 5.0 daemon, logs captured (spider.log tail in PoW)
- [ ] `sonic-pi-extension-0.1.1.vsix` built (vsce) + installed in VS Code; jakearl leftover removed
- [ ] README fork notes: Sonic Pi 5 + Linux tested, upstream divergence documented (3 fixes + version bump), `.beans*` + `docs/research/` committed by lz8o noted
- [ ] F5/Alt+R run + Alt+S stop proven against live 5.0 daemon (user smoke; logs captured here as PoW)

## Skills for coder

- Read fully before editing: /home/blaze/.agents/skills/coding-rules/SKILL.md — gate: e2e script reads as intent at top level.
- Read fully before editing: /home/blaze/.agents/skills/tdd/SKILL.md — gate: protocol gate is a test, ships in the same commit as the packaging change it validates.

## Stop rule

If vsce refuses packaging (engine/publisher constraints), report the exact error + package.json diff needed — do NOT weaken engines or hack metadata silently.

Refs: sonic-pi-sawd
