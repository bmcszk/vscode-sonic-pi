---
# sonic-pi-ghhu
title: Auto-run on save, config-gated default OFF (D6)
status: todo
type: feature
priority: normal
created_at: 2026-11-18T17:06:03Z
updated_at: 2026-11-18T17:07:08Z
parent: sonic-pi-6fiz
---

# D6: auto-run on save (roadmap F12, upstream issue #1902)

Setting vscode-sonic-pi.runOnSave (default false, stated in description); when on, saving a sonic-pi document runs it whole-file (Run-lens semantics). Notebook-cell saves excluded. Pattern: existing config getters (src/source-runner/config.ts).

## Tasks
- D6a config getter + onDidSaveTextDocument watcher; unit >=4 (off -> no send; on -> one /run-code per save; notebook-cell save excluded; whole-file text matches the Run lens path). Rides chain H (extension.ts + package.json config), wave 3.

## Acceptance criteria
- [ ] D6a completed with PoW
- [ ] Default OFF + unit >=4 proven

## Skills for coder
- /home/blaze/.agents/skills/coding-rules/SKILL.md (read fully before editing)
- /home/blaze/.agents/skills/tdd/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/typescript/SKILL.md
