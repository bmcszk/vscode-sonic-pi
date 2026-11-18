---
# sonic-pi-2fkg
title: Live Link BPM and peer count in the statusbar, click to set the session BPM (F4)
status: completed
type: feature
priority: normal
created_at: 2026-11-16T13:30:27Z
updated_at: 2026-11-17T13:10:31Z
parent: sonic-pi-818h
---

# Feature (F4): Live Link BPM and peer count in the statusbar, click to set

User outcome: '♪ 122.4 · ⇄3' item, live-updating; click to set the session BPM.

## OSC surface (verified)
Pushes /link-num-peers(val), /link-bpm(val) [spider-server.rb:991-994]. Set path: NO incoming route exists - set via set_link_bpm! through a SILENT /run-code (core.rb:3993-3996, range 20..999).
CRITICAL subtlety (spider-server.rb:302-316): the silent flag (args[3]==1) is only honored when a workspace argument is present - the set-run must send /run-code(token, code, 'link-bpm-set', 1). And it must NOT stop the session -> needs the F2 no-replace variant.

## Structure
- task: Link telemetry receivers + silent BPM-set sender (blocked-by F2 task 1)
- task: Statusbar item + click-to-set
- task: Integration - pushes update the item, click sets bpm

## Proof of Work (2026-11-17)

Tasks completed: Link telemetry receivers + silent BPM-set sender (9x5q), statusbar item with click-to-set (27kb). Live pushes update the item; click opens input defaulting to current bpm; silent no-replace run. Residual: F4 t3 integration (6sux) remains in draft - it completes the feature's end-to-end proof.

## Completion update (2026-11-17): F4 t3 (6sux) landed

Link integration landed: pushes update the statusbar item; click-to-set sends the silent bpm run. All three tasks completed. End-to-end proven: live pushes -> item -> click -> silent run on the wire. Residual: none.
