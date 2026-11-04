---
# sonic-pi-h8vo
title: '[P6] Attach-to-running-app mode'
status: todo
type: feature
priority: normal
created_at: 2026-11-04T20:36:14Z
updated_at: 2026-11-04T23:29:50Z
parent: sonic-pi-q65q
---

Discover a user-run Sonic Pi server via /proc scan for spider-server.rb -u ports+token (sonic-pi-helper pattern, verified in its out/sonicPiConnection.js); use it instead of managing our own daemon. For users who keep GUI app + VS Code side by side.

Source: docs/research/feature-gaps.md (sonic-pi-q65q Phase A). No upstream PRs per user directive.

## AC

- [ ] Implemented on a branch with red->green where logic is testable (per repo gates: npm test suites + live e2e + vsce package)
- [ ] README/settings docs updated to match shipped behavior
- [ ] User sign-off obtained before merge

## Skills for coder

- /home/blaze/.agents/skills/coding-rules/SKILL.md — TypeScript source edits; package.json only via surgical text edits (a JSON round-trip reformats the file: established repo incident)

## Skills for coder (project skills)

- .agents/skills/typescript/SKILL.md - process discovery + attach wiring
- .agents/skills/vscode-ext-commands/SKILL.md - attach/detach command conventions
- .agents/skills/ruby/SKILL.md - reading spider-server.rb cmdline/args and daemon behavior
Precedence: repo local style (classes, tabs, established naming) outranks these skills' defaults - coding-rules conflict order.
