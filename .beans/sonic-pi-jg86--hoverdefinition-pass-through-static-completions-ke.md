---
# sonic-pi-jg86
title: Hover/definition pass-through, static completions kept client-side (858b)
status: draft
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-16T13:32:15Z
parent: sonic-pi-858b
blocked_by:
    - sonic-pi-ce06
---

# Task: Hover/definition pass-through, static completions kept client-side (858b)

Route hover/definition to ruby-lsp; keep our synths/fx/samples completions (research: ours are richer).

## Acceptance criteria
- [ ] hover on plain Ruby works
- [ ] our completion provider still wins for Sonic Pi builtins
- [ ] no double-hover conflicts

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
