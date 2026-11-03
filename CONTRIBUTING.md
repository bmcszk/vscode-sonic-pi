# Contributing

## Development setup

Requirements:

- Node.js with npm.
- For the live test only: `ruby` on `PATH`, a Sonic Pi 5 installation at the pacman path
  `/usr/lib/sonic-pi` (`test/e2e/protocol.js` hardcodes it), and a `~/.sonic-pi/log/spider.log` left
  behind by an earlier Sonic Pi run.

```bash
npm ci                 # install dependencies from package-lock.json
npm run build          # tsc -> out/
npm test               # build + unit tests in test/unit
npm run test:e2e       # build + live daemon protocol test in test/e2e
```

`npm test` needs no VS Code and no Sonic Pi. `npm run test:e2e` boots a real Sonic Pi daemon, reads
the port and token from its stdout, and asserts that `/run-code` and `/stop-all-jobs` are accepted
token for token; it fails without a local Sonic Pi 5 install.

Press `F5` in this folder to launch an Extension Development Host with the extension loaded.

## Repository layout

| Path | Contents |
| ---- | -------- |
| `src/` | extension entry point, completions, hovers, notebook support |
| `src/source-runner/` | server process, daemon stdout parsing, OSC sending, settings reader |
| `src/builtins/` | Sonic Pi sample, synth and FX data plus its generator |
| `test/unit/` | plain node tests of the daemon stdout parse and the start guard |
| `test/e2e/` | live daemon protocol test |
| `docs/research/` | committed research evidence: the Sonic Pi 5 `daemon.rb` and probe output the fork relies on |
| `.beans/` | issue ledger, one file per task, referenced from commits |
| `examples/`, `tutorial/`, `syntaxes/`, `img/` | bundled examples, tutorial notebooks, grammar, images |

`src/source-runner/README.md`, `src/source-runner/LICENSE` and the snapshots under `docs/research/`
are vendored copies. Leave them as they are; put current behavior in this repository's own docs.

## Change workflow

1. Find or open a bean in `.beans/` for the work and read its acceptance criteria before coding.
2. Branch off `master`.
3. Make the change with a test: for the daemon protocol, add or extend a case in `test/unit/` or
   `test/e2e/`.
4. Run `npm test`. Run `npm run test:e2e` too when you touch the daemon start, the stdout parsing or
   the OSC sending.
5. Commit with an imperative subject, and end the message with `Refs: <bean-id>`.

## Pull requests

- One bean per pull request; keep unrelated edits out.
- State the Sonic Pi version and platform you tested on. Only Sonic Pi 5.x on Linux is a supported
  target today, so note when you widen that.
- A new or renamed setting belongs in `package.json` (`contributes.configuration`) and in the README
  settings table, with the same key, default and wording.
- Keep the public surface additive where the s00500 fork already offers the same feature, so upstream
  diffs stay readable.
- Match the existing formatting: tabs, no semicolons, single quotes, 110 columns (`.prettierrc`), and
  `eslint` rules in `.eslintrc`.
- Contributors follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
