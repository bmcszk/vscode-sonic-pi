---
# sonic-pi-27kb
title: Statusbar item ♪ bpm ⇄ peers + click-to-set (F4)
status: todo
type: task
priority: normal
created_at: 2026-11-16T13:30:27Z
updated_at: 2026-11-16T15:07:04Z
parent: sonic-pi-2fkg
blocked_by:
    - sonic-pi-9x5q
---

# Task: Statusbar item - live bpm + peers, click-to-set (F4)

## Files
- src/statusbar.ts (new item priority 97, label from pure formatter)
- new src/link-label.ts (pure: formatLinkLabel(bpm?, peers?) -> '♪ 122.4 · ⇄3' / hidden when no data)
- package.json (SURGICAL: command vscode-sonic-pi.setLinkBpm + activation entry)

## Acceptance criteria (extend statusbar.test.js + new link-label.test.js)
- [ ] item hidden until the first push arrives, then live-updates on each push
- [ ] command opens an input box defaulting to the current bpm; Enter sends the set-run
- [ ] cold-window dispatch safe

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
- /home/blaze/github/bmcszk/vscode-sonic-pi/.agents/skills/vscode-ext-commands/SKILL.md
