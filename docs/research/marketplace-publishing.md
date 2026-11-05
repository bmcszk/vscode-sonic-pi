
## Local audit findings (parent, 2026-11-05)

- Debug residue removed from docs/research/ (daemon-46.rb, daemon-stdout.txt, spfork-main.ts, sph-vsix/ — probe artifacts from the crash-mitigation period, unreferenced).
- manifest gaps: license field missing (LICENSE file exists, MIT, upstream copyright — legal question for fork publishing), keywords/homepage missing, name "sonic-pi-extension" collides with upstream listing s00500.sonic-pi-extension.
- CHANGELOG.md is a stub ("Initial release") — 0.2.0 entry needed.
- vsix bloat: src/, test/, docs/ ship in the package; .vscodeignore extended below.
