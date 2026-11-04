---
# sonic-pi-dgis
title: Highlight currently-playing lines in the editor (like the Sonic Pi GUI's colored line background)
status: todo
type: task
created_at: 2026-11-04T13:00:49Z
updated_at: 2026-11-04T13:00:49Z
---

# Playing-line highlight in VS Code (like the Sonic Pi app's colored line backgrounds)

User (2026-11-04): "Sonic Pi window shows colored text background for lines that are currently playing at this moment. Is it possible to have the same in VS Code editor window while playing? Do online deep research and local deep research."

## Phase A - dual research (contract)

### A1. LOCAL deep research (the ground truth is on disk)
- Sonic Pi 5 install at /usr/lib/sonic-pi (Ruby). Find the GUI's line-highlight mechanism in source: how the app knows which lines are playing (search for highlight / flash / trace / line in the Qt app + server/plugin code), and WHICH OSC messages carry the line info (message names, arguments - line numbers? thread/GUID ids? run ids?).
- OUR extension's existing receiving side: src/ osc/cue handling (the Cues output channel), how the udp osc listener is wired (osc-js? port? host?), and whether the playing-line messages already arrive and are being dropped as noise today.
- Check daemon/spider logs (~/.sonic-pi/log/) while playing for the relevant message traffic to confirm message shape live.

### A2. ONLINE deep research (primary sources)
- sonic-pi.net tutorial/docs + github.com/sonic-pi-net/sonic-pi (source, issues, PRs) on the GUI line-highlighting and its protocol messages; Sonic Pi forum threads where the dev team discusses line-highlight messages or external GUIs replicating it.
- VS Code feasibility: TextEditorDecorations (createTextEditorDecorationType + setDecorations) are PUBLIC render-only API (unlike glyphMargin click handling, see docs/research/editor-run-controls.md). Verify no approval/proposed-API dependency for a background color on line ranges.
- Prior art: other extensions that decorate playing/editing lines in real time.

### Deliverable
docs/research/playing-line-highlight.md in-repo (durable, never /tmp): protocol findings with citations + local file paths/line refs, message-shape samples from live logs, feasibility verdict, recommended implementation sketch (decoration types, lifecycle: clear on stop/server-loss per 1gye recovery, timing/lag notes).

## Phase B - implementation (only after Phase A accepted by user)
Separate contract, will be written into this bean after Phase A sign-off.

## AC
- [ ] Phase A report committed with primary-source citations AND local source refs (file:line)
- [ ] Live message shape captured from real playback logs
- [ ] Feasibility verdict + implementation sketch

## Skills for researcher
- /home/blaze/.agents/skills/research/SKILL.md (report-first: write the file as you go)

Stop rule Phase A: ONLY docs/research/playing-line-highlight.md (+ its commit). Anything else -> STOP.
