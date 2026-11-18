---
# sonic-pi-27kb
title: Statusbar item ♪ bpm ⇄ peers + click-to-set (F4)
status: completed
type: task
priority: normal
created_at: 2026-11-16T13:30:27Z
updated_at: 2026-11-16T19:21:15Z
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

## Proof of Work (2026-11-16, parent-verified)

Worker branch f4t2-link-item (ef2277f), merged to dev2 (75e7f40):
- link-label.ts: pure formatLinkLabel (bpm/peers -> '♪ 122.4 · ⇄3', undefined when no data) + linkBpmInputValue (default 60)
- statusbar: linkItem priority 97, hidden until first push, setLinkData(bpm, peers) live-updates
- package.json: vscode-sonic-pi.setLinkBpm command + activation entry (surgical)
- setLinkBpm command: cold-window silent no-op (activation-gate safe); with-server input defaults from linkBpmInputValue
- tests: link-label.test.js (formatter), statusbar.test.js (item lifecycle), activation.test.js (cold silent + default helper)

Gates: lint 0, prettier clean, npm test exit 0 / 0 not ok, integration green, suppressions 0.
Residual: the with-server input-box interaction itself is exercised in the F4 t3 integration bean (needs a booted daemon).
