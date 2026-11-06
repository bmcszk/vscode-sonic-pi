---
# sonic-pi-x33z
title: 'Fix pipeline: vsix packaging smoke gate (node_modules in artifact, extension loads)'
status: completed
type: task
priority: normal
created_at: 2026-11-06T22:49:46Z
updated_at: 2026-11-06T22:59:36Z
---

[ ] Unit/integration gates stay as-is
[ ] NEW vsix packaging gate: package full vsix, extract, load out/extension.js in a nodevm with a vscode stub + resolvable node_modules - assert OK (catches missing runtime deps + module-load breaks INSIDE the real artifact)
[ ] Document: local dev installs must package WITH dependencies (--no-dependencies relies on marketplace-side npm Install that CLI --install-extension does not run)
[ ] ALSO: the shipped marketplace 0.2.2 works (marketplace ran dependency resolution), so keep --no-dependencies in publish.yml, but VERIFY by unzipping the built release artifact in release workflow (vsix smoke step before publishing)

## Completed (2026-11-06)

Delivered + verified on dev (5589322 merged):
- test/vsix-smoke.test.js in the npm test chain: packages the real artifact, asserts runtime deps bundled (osc-js/utf8/uuid), loads out/extension.js under a vscode stub in a child process - the tests now test the shipped thing.
- publish.yml: pre-publish verification step unzips the build vsix and require.resolve's the deps before publishing (marketplace --no-dependencies + --oidc unchanged).
- Rule documented in docs/research/testing-strategy.md: local dev installs package WITH deps; CLI --install-extension does not resolve package.json dependencies (marketplace does).
Root cause of the user's load crash confirmed: my local vsce --no-dependencies package omitted node_modules; marketplace 0.2.2 was unaffected.
