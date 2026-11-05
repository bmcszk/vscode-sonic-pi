---
# sonic-pi-7se3
title: 'Notebook: playing highlight wrong/intermittent; add per-cell playing indicator'
status: completed
type: bug
priority: normal
created_at: 2026-11-05T20:10:17Z
updated_at: 2026-11-05T21:20:45Z
---

# Notebook playing-line highlight wrong/intermittent (user report 2026-11-05)

live_loop cell (tutorial first cell) shows no highlights; other cells highlight only sometimes.

## Root cause (code + API facts)
- playing-lines.ts editor()=activeTextEditor. Notebook displays are NOT text editors (NO NotebookEditor.setDecorations in @types/vscode 1.144 - verified). Highlights appear only when a cell is clicked into editing (VS Code spawns an embedded cell text editor), and lines then land wrongly: flashes carry lines of the JOINED executed script, not the single cell - hence 'sometimes'.
- Notebook run path: controller sends the whole joined script of executed cells.

## Fix contract (TDD)
1. Cell-offset map: NotebookController already builds the joined script; record per-cell [startLine,endLine) offsets (src/notebook.ts). Expose a pure resolver joinedLine -> cell (new src/cell-flash-map.ts).
2. NotebookCellStatusBarItemProvider (public API verified): cell currently making sound shows '$(sync~spin) playing'; per-cell 250ms TTL like playing-lines; refresh via onDidChangeCellStatusBarItems event.
3. Cell-editor highlight: when activeTextEditor is a vscode-notebook-cell document, map joined flash line -> that cell's local line (in-cell) for the highlighter; other lines ignored. playing-lines gets mapping via a deps hook (pure tested).
4. Gates: new pure suites red->green; npm test all; e2e green; package + install locally.

## AC
- [ ] red->green pure tests: offset map + provider state + in-cell mapping
- [ ] flibble cell shows the playing item while audible; cross-cell stray highlights gone
- [ ] .pi file highlighting unchanged

Skills: /home/blaze/.agents/skills/coding-rules/SKILL.md, .agents/skills/typescript/SKILL.md. package.json surgical edits only (none expected).
Stop rule: src/notebook.ts, src/playing-lines.ts, src/source-runner/extension.ts, src/cell-flash-map.ts (new), src/cell-flash-provider.ts (new), test/unit/cell-flash-map.test.js, test/unit/notebook.test.js, package.json. Anything else -> STOP.

## Field evidence from user session (2026-11-05 21:14)

User's notebook runs DO execute: supersonic.log 21:12 shows cloud_beat sample buffers loading (vinyl_hiss, drum_cymbal_closed, sn_dub) - sound was live; user stop at 21:14 visible as /n_free not-found. Empty 'Sonic Pi Log' in user's window explained: MULTIPLE VS Code windows attach to the same daemon and bind the same gui-listen UDP port; only one loses-out window sees no datagrams (whichever bind wins is opaque). Interim user guidance: one window holding Sonic Pi content. Multi-window log fan-out (broadcast or single-host arbitration) = candidate future feature; not in this bean's stop rule.

## Sequel: multi-window takeover honesty (2026-11-05, user 'it works in another window')

Field findings: (1) my attach remap was WRONG - spider-server.rb:112 governing truth is server_port=argv[1] (receives /run-code), gui_port=argv[2] (replies): the remap sent runs to the scsynth port everywhere. Reverted (commit e6ca2c3) with fixture expectations back to source truth. (2) 'works in another window' root: second host binding the daemon reply port gets EADDRINUSE (probed dgram directly) -> deaf console + never-resolving resolvers + empty Log in the loser window while runs may still execute via the command port. Fixed: ensureServerReady gates plays on isReceiving(): loser window gets ONE error notice ('close the other window, Restart Server here to take over'), runs refused cleanly (cells ended, not spinning); bind state change auto-resumes (TDD cases for both). Gates: 15 suites (107 ok), e2e green, packaged+installed.

## Exclusive bind (2026-11-05 evening, user 'worked a moment then stopped + logs disappeared')

Root at packet level: osc-js UDP binds default SO_REUSEADDR (exclusive:false) -> several windows bind the same reply port; Linux delivery flips to the newest binder mid-session; that is the momentary-work-then-deaf cycle. Fix (dcf61d6): setupOscReceiver binds exclusive:true -> deterministic first-binder ownership; losers get EADDRINUSE instantly and route through the existing takeover-notice path instead of half-working then breaking. Gates: 15 suites (107 ok), e2e gate green, packaged+installed.

## Final note (2026-11-05): superseded by the takeover-architecture session

All three of this bean's surfaces shipped AND evolved: per-cell 'playing' indicator (cd03cbb), in-cell flash mapping, and the multi-window root-cause chain (EADDRINUSE fill-> takeover-on-play jnrs, exclusive bind dcf61d6). Closed: the tactics inside are now part of the deterministic-ownership architecture; remaining UX is carried by jnrs/'notebook UX' polish under normal use.
