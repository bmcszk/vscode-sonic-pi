---
# sonic-pi-7se3
title: 'Notebook: playing highlight wrong/intermittent; add per-cell playing indicator'
status: in-progress
type: bug
priority: normal
created_at: 2026-11-05T20:10:17Z
updated_at: 2026-11-05T20:15:23Z
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
