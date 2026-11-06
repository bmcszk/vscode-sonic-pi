---
# sonic-pi-x33z
title: 'Fix pipeline: vsix packaging smoke gate (node_modules in artifact, extension loads)'
status: in-progress
type: task
created_at: 2026-11-06T22:49:46Z
updated_at: 2026-11-06T22:49:46Z
---

[ ] Unit/integration gates stay as-is
[ ] NEW vsix packaging gate: package full vsix, extract, load out/extension.js in a nodevm with a vscode stub + resolvable node_modules - assert OK (catches missing runtime deps + module-load breaks INSIDE the real artifact)
[ ] Document: local dev installs must package WITH dependencies (--no-dependencies relies on marketplace-side npm Install that CLI --install-extension does not run)
[ ] ALSO: the shipped marketplace 0.2.2 works (marketplace ran dependency resolution), so keep --no-dependencies in publish.yml, but VERIFY by unzipping the built release artifact in release workflow (vsix smoke step before publishing)
