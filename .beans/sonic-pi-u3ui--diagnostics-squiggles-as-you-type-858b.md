---
# sonic-pi-u3ui
title: 'Diagnostics: squiggles as you type (858b)'
status: draft
type: task
priority: normal
created_at: 2026-11-16T13:32:00Z
updated_at: 2026-11-16T13:32:15Z
parent: sonic-pi-858b
blocked_by:
    - sonic-pi-ce06
---

# Task: Diagnostics - squiggles as you type (858b)

Wire pull or push per spike result; clear on close; enabledFeatures.diagnostics gate; linters off.

## Acceptance criteria
- [ ] syntax error squiggle in a .pi editor within ~1s of typing
- [ ] closing the file clears them
- [ ] no diagnostics for valid Sonic Pi DSL code

## Skills for coder
- /home/blaze/.agents/skills/typescript/SKILL.md
