---
# sonic-pi-dgis
title: Highlight currently-playing lines in the editor (like the Sonic Pi GUI's colored line background)
status: completed
type: task
priority: normal
created_at: 2026-11-04T13:00:49Z
updated_at: 2026-11-05T21:20:45Z
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

- [x] Phase A report committed with primary-source citations AND local source refs (docs/research/playing-line-highlight.md)
- [x] Live message shape captured from real playback logs (/flash captures, probes 1-7)
- [x] Feasibility verdict + implementation sketch (public-API-only verdict; decoration sketch)
- [x] Phase B implemented (playing-lines.ts, user-trialed; fragment-offset bug spun out as sonic-pi-kpif, fixed variant A)
- [ ] User sign-off on the shipped behavior (pending re-test of cloud_beat.pi on variant A build)

## Skills for researcher
- /home/blaze/.agents/skills/research/SKILL.md (report-first: write the file as you go)

Stop rule Phase A: ONLY docs/research/playing-line-highlight.md (+ its commit). Anything else -> STOP.

## Phase A COMPLETE (2026-11-04)

Researcher run 17a69b08 delivered the local ground truth despite missing shell/web tools (report salvaged from artifact); parent closed the two gaps: live /flash capture on a real daemon ([[0,'eval',4] x4 — 1-based line, workspace='eval', one flash per trigger]) and the online pass (upstream wiki + mainwindow.cpp handler + mactkg prior art + vendored d.ts decoration verification).

Verdict: FEASIBLE, public API only. /flash (jobid, workspace, line) already arrives on our bound port and is silently dropped; render via createTextEditorDecorationType({backgroundColor,isWholeLine}) + setDecorations (in-repo precedent: main.flashCode). Report: docs/research/playing-line-highlight.md (committed).

NEXT: user review -> then Phase B contract.

## Phase B contract (user green light: yes — 2026-11-04)

Implement playing-line highlight per docs/research/playing-line-highlight.md §3:
1. Subscribe existing osc-js listener to /flash (workspace==='eval' filter; line is 1-based).
2. src/playing-lines.ts: PlayingLineHighlighter — one isWholeLine decoration type colored from existing sonic-pi.flashBackgroundColor (+flashTextColor); add Range(line-1,0,line-1,1000) per flash to active set, setDecorations, per-range TTL 250ms sweep (refresh not stack); clear().
3. Lifecycle: clear() on stop command and in server-loss recovery (restartServer path); no clear on /run/ended (TTL handles it).
4. Gate: new setting vscode-sonic-pi.showPlayingLineHighlight (boolean, default true); package.json surgical (settings + test script += new suite); README settings row.
5. test/unit/playing-lines.test.js: pure add/expire/clear logic vs fake editor, red->green; wired into npm test.

AC: [ ] red->green; [ ] npm test all suites green incl. new; [ ] e2e live gate green; [ ] local vsix installed for user trial before release 0.2.0. STOP: playing-lines.ts (new), source-runner wiring, playing-lines.test.js, package.json (surgical), README — nothing else.

## Phase C opened: fragment-offset bug spun to its own bean (see bug); upstream caller-depth limitation documented in research doc update. This bean stays open until both Phase B features get user sign-off.

## Final note (2026-11-05): shipped features (playing-line highlight, controls, per-cell items) all live in the store + dev build; upstream depth-cap item remains tracked at sonic-pi-net/sonic-pi#3606 (no PR per user directive).
