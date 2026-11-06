---
# sonic-pi-fear
title: 'Gate gap: e2e does not cover cold-window command palette activation (manifest gap shipped despite green battery)'
status: completed
type: bug
priority: normal
created_at: 2026-11-06T14:38:47Z
updated_at: 2026-11-06T23:35:19Z
---

# Lesson-bean: how did a green battery ship a manifest gap?

## What happened
'vscode-sonic-pi.docs' said 'command not found' for the user in a fresh window although
unit + integration suites were green. Root cause: 6 contributed commands had no
onCommand activationEvents. The integration suite only ever ran after calling
extension.activate() directly through the host API, so manifest-level activation gaps
(the real-world 'user opens command palette with no file open') were invisible to every test layer.

## Fix shipped
- All 6 onCommand entries added (docs/stop/restartserver/stopNotebook/togglerecording/beautify)
- New unit gate: every contributed command must appear in activationEvents (red->green)

## Remaining work (this bean)
- [ ] Integration suite analog: BEFORE activateExtension(), executeCommand each contributed
      command id and assert it is registered (commands.getCommands filtered) in a truly cold window
- [ ] Consider asserting the same for keybindings/menus targets in the manifest

## Completed (2026-11-07 00:30, parent-local finish after worker timeout)

Cold-window activation e2e delivered and merged to dev (760a3ae):
- activation.integration.js runs FIRST in the extension window and never calls activateExtension.
- Proves: (1) a cold host registers NO contributed commands (getCommands empty), (2) dispatching each contributed command works without 'command not found' (real handlers run against the fake daemon seam; one window-replacing command is asserted registered instead of dispatched), (3) after dispatch the extension is active and the whole command surface is registered.
- vsix smoke gate surfaced + fixed VSIX packaging of the worktree symlink (.vscodeignore entry).
- Gates on dev: npm test green through the vsix gate (0 not ok), integration 19+2 passing, lint clean.
