---
# sonic-pi-1zc3
title: 'Spike: verify /supersonic/devices payload against the live daemon (F7 hard gate)'
status: todo
type: task
priority: normal
created_at: 2026-11-16T13:31:42Z
updated_at: 2026-11-16T13:32:21Z
parent: sonic-pi-kxiz
---

# Task: Spike - verify /supersonic/devices payload against the live daemon (F7 HARD GATE)

## Method (no production code)
Run the real Sonic Pi daemon, send /daemon/audio/request-devices with the token from the booter log, capture the pushes (host-side openOscReceiver script is the pattern). Notes go into THIS bean body (parent may move to docs/research).

## Acceptance criteria
- [ ] push address(es) + arg shapes recorded verbatim with line-cites
- [ ] decision recorded: parse format for the picker
- [ ] if payload differs per driver, note the union

## Skills for coder
- /home/blaze/.agents/skills/ruby/SKILL.md (read daemon.rb forwarding to target the capture)
- /home/blaze/.agents/skills/typescript/SKILL.md
