# Research: Lint hardening plan for vscode-sonic-pi (bean sonic-pi-oow6, Phase A)

> Runtime note: this subagent has no git/shell tool, so branch `oow6-lint` + commit/push could
> not be performed here. This document is the complete content intended for
> `docs/research/lint-hardening.md`; Phase B (or the parent) should create the branch from
> `dev` and commit this file as-is with message
> `Research: lint hardening strategy (Phase A of sonic-pi-oow6)`.

## Summary

ESLint 10 removed eslintrc entirely, so the repo's ancient `.eslintrc` is a dead end: the fix is a fresh `eslint.config.mjs` on ESLint ^10 + `typescript-eslint` ^8.72 (which supports TypeScript `>=4.8.4 <6.1.0` and ESLint `^8.57 || ^9 || ^10`) with `parserOptions.projectService: true` for typed `no-floating-promises`. Prettier should move **out** of ESLint (official docs call eslint-plugin-prettier "generally not recommended") into a separate `prettier --check` step; the repo's existing `.prettierrc` already encodes `useTabs: true` so formatting parity is nearly free. Zero-findings is reachable because the rule's default `ignoreVoid: true` already accepts the repo's `void cmd()` fire-and-forget idiom — the 4 live findings are genuinely unhandled promises needing `await`/`.catch()` or an explicit `void` marker.

## Verified local facts (read this session)

| Fact | Evidence |
|---|---|
| `.eslintrc` exists, eslintrc format, plugins `@typescript-eslint` + `prettier` | read `.eslintrc` |
| Old config enables `@typescript-eslint/no-misused-promises` with `checksVoidReturn: false` | read `.eslintrc` |
| Old config `ignorePatterns: ["node_modules", "*.js"]` — **test JS files are NOT linted today** | read `.eslintrc` |
| `.prettierrc` exists: `useTabs:true, tabWidth:4, semi:false, singleQuote:true, printWidth:110, trailingComma:"all"` | read `.prettierrc` |
| **No** `.prettierignore` exists | read failed ENOENT |
| `tsconfig.json` excludes `**/*.test.ts` and `docs`; `rootDir: src`, `outDir: out`, CJS (`module: node16`) | read `tsconfig.json` |
| Unit tests are **plain CJS `.js` node scripts** (`test/unit/*.test.js`, `require('../../out/...')`), not TS/jest | read `test/unit/attach.test.js` |
| `src/extension.ts` already uses the `void vscode.commands.executeCommand(...)` idiom (tabs + no-semi confirmed) | read `src/extension.ts` |
| CI (`.github/workflows/ci.yml`): checkout@v7.0.1 (SHA-pinned), setup-node@v7.1.0 (SHA-pinned), node 22, `npm ci` → `npm run build` → `npm test`. No lint step. | read workflow |
| `.vscodeignore` excludes `src/**, test/**, docs/**, .github/**, .vscode/**, tsconfig.json, **/*.map` — but **not** `eslint.config.*`, `.prettierrc`, `.prettierignore`, `.eslintrc`, `package-lock.json` | read `.vscodeignore` |
| `package.json` scripts: `build`, `test` (long `&&` chain of 14 node test files), `test:e2e`. No lint/format scripts. | read `package.json` |

## Findings

### 1. Flat config migration (eslint.org, primary)

1. **Claim:** Flat config is the default since ESLint v9.0.0; `npx @eslint/migrate-config .eslintrc.json` is the official starting point.
   **Sources:** [ESLint Configuration Migration Guide](https://eslint.org/docs/latest/use/configure/migration-guide). **Support:** direct evidence ("The flat config file format has been the default configuration file format since ESLint v9.0.0… This will create a starting point for your `eslint.config.js` file but is not guaranteed to work immediately without further modification"). **Confidence:** high.
2. **Claim:** ESLint v10.0.0 **completely removed** eslintrc: "`.eslintrc.*` and `.eslintignore` files will no longer be honored", `ESLINT_USE_FLAT_CONFIG` no longer honored, eslintrc CLI flags (`--env`, `--no-eslintrc`, `--ignore-path`, `--rulesdir`, `--resolve-plugins-relative-to`) removed, `/* eslint-env */` comments are errors, and config lookup now starts from each linted file's directory.
   **Sources:** [ESLint v10.0.0 release notes](https://eslint.org/blog/2026/02/eslint-v10.0.0-released). **Support:** direct evidence. **Confidence:** high.
   **Consequence (researcher inference):** the repo's `env: { node, es6, jest }` block and `ignorePatterns` cannot be carried over literally — they must become `languageOptions.globals` (via the `globals` package) and `globalIgnores(...)`. The "latest stable line is 10.x" (10.4.0 as of a 2026-05 issue) — [USWDS issue #6678](https://github.com/uswds/uswds/issues/6678) (secondary, corroborative only).
3. **Claim:** In flat config, plugins/parsers are JS objects (`import tseslint from 'typescript-eslint'`), not strings; `defineConfig()` + `files`/`extends` is the current documented quickstart shape.
   **Sources:** [typescript-eslint Getting Started](https://typescript-eslint.io/getting-started). **Support:** direct evidence (official quickstart `eslint.config.mjs` snippet: `import js from '@eslint/js'; import { defineConfig } from 'eslint/config'; import tseslint from 'typescript-eslint'; export default defineConfig({ files: ['**/*.{js,ts}'], extends: [js.configs.recommended, tseslint.configs.recommended] });`). **Confidence:** high.
4. **Claim:** `eslint.config.mjs` is safe for a CJS repo: the config file is loaded by ESLint itself and is never bundled into `out/` — ESM wrapper avoids needing `"type": "module"` in package.json. (Microsoft's own extension repos ship `eslint.config.mjs` in CJS projects.)
   **Support:** researcher inference from official docs (flat config file lives at project root and is consumed by the ESLint CLI) + practice in [microsoft/vscode-documentdb `.vscodeignore`](https://github.com/microsoft/vscode-documentdb/blob/main/.vscodeignore) listing `eslint.config.mjs`. **Confidence:** medium-high.

### 2. typescript-eslint v8 + typed `no-floating-promises`

5. **Claim:** The minimal typed setup for a small repo is: keep `tseslint.configs.recommended` and add the rule, with `languageOptions.parserOptions.projectService: true`. Official snippet (verbatim from docs):
   ```js
   export default defineConfig({
     files: ['**/*.{js,ts}'],
     extends: [js.configs.recommended, tseslint.configs.recommended],
     languageOptions: { parserOptions: { projectService: true } },
     rules: { '@typescript-eslint/no-floating-promises': 'error' },
   });
   ```
   **Sources:** [Linting with Type Information](https://typescript-eslint.io/getting-starting/typed-linting). **Support:** direct evidence (docs: "`parserOptions.projectService: true` indicates to ask TypeScript's type checking service for each source file's type information"). **Confidence:** high.
6. **Claim:** `projectService` is the recommended/fastest stable route vs manual `project`/`tsconfigRootDir` — it was stabilized as `projectService` in v8 ("typescript-estree: stabilize EXPERIMENTAL_useProjectService as projectService" in the v8 changelog).
   **Sources:** [typescript-eslint v8 changes list (tj-actions renovate PR quoting upstream changelog)](https://github.com/tj-actions/changed-files/pull/2220) — secondary mirror of upstream release notes. **Support:** interpretation (mirror of official changelog; primary page not fetched). **Confidence:** medium-high.
7. **Claim:** Supported ranges today: ESLint `^8.57.0 || ^9.0.0 || ^10.0.0`, TypeScript `>=4.8.4 <6.1.0`; unsupported TS logs a warning (can be made fatal via parserOptions for CI). Latest release line is v8 (v8.72.1, 2026-10-26) — no v9 stable yet.
   **Sources:** [Dependency Versions](https://typescript-eslint.io/users/dependency-versions), [Releases](https://github.com/typescript-eslint/typescript-eslint/releases). **Support:** direct evidence. **Confidence:** high.
   **Gap:** I could not read this repo's `devDependencies` (package.json read was truncated/deduped past the contributes block) — **the exact pinned TypeScript version is UNVERIFIED locally**. Phase B must confirm `typescript` is `<6.1.0` (anything ≥5.x recent is fine).
8. **Claim:** v8 removed all formatting/layout rules from `eslint-plugin` — this is why the "34 prettier formatting findings via eslint-plugin-prettier" pattern is obsolete and won't come back as tseslint rules.
   **Sources:** v8 changelog mirror ("eslint-plugin: remove formatting/layout rules"). **Support:** interpretation. **Confidence:** medium-high.
9. **Claim:** Accepted ways to "handle" a promise under `no-floating-promises`: `.then()` with two arguments, `.catch()` with one argument, `await`, `return`, or **`void`ing it**. Defaults: `ignoreVoid: true`, `ignoreIIFE: false`, `checkThenables: false` (v8), `allowForKnownSafePromises/Calls: []`.
   **Sources:** [no-floating-promises rule page](https://typescript-eslint.io/rules/no-floating-promises/). **Support:** direct evidence (rule page lists the five handling forms and `defaultOptions` with `ignoreVoid: true`). **Confidence:** high.
   **Consequence (researcher inference):** the VS Code extension idiom `void someCommand()` (already used throughout `src/extension.ts`) is **legal by default** — no rule option changes needed for it. The 4 live findings are promises with *no* marker: they need `await`, `.catch()`, or a deliberate `void` prefix.
10. **Claim:** The existing `@typescript-eslint/no-misused-promises` with `checksVoidReturn: false` is the standard allowance for passing async callbacks into void-returning VS Code APIs (`registerCommand`, event handlers) and should be preserved verbatim in the new config.
    **Support:** interpretation of the old `.eslintrc` (direct local evidence of the setting) + rule semantics; I did not fetch the misused-promises rule page this session — **verify option name on [the rule page](https://typescript-eslint.io/rules/no-misused-promises/) during Phase B**. **Confidence:** medium.

### 3. Prettier 3: separate from ESLint; tabs already configured

11. **Claim:** Prettier's official guidance is separation: "Use Prettier for code formatting concerns, and linters for code-quality concerns", recommending `eslint-config-prettier` to switch off conflicting rules; eslint-plugin-prettier is listed under "**generally not recommended**… these days you can run `prettier --check .`" with downsides (red squiggles, slower, extra layer that may break).
    **Sources:** [Integrating with Linters](https://prettier.io/docs/integrating-with-linters). **Support:** direct evidence (quotes above). **Confidence:** high.
12. **Claim:** eslint-config-prettier v10.x supports flat config; the `/flat` export adds a `name` for the config inspector while the default export still works: `import prettier from 'eslint-config-prettier'` → `extends: [prettier]` (or `eslint-config-prettier/flat`).
    **Sources:** [home-assistant/frontend renovate PR for eslint-config-prettier 10.1.8](https://github.com/home-assistant/frontend/pull/26246) quoting the package changelog. **Support:** interpretation (secondary mirror; changelog quote present). **Confidence:** medium-high.
13. **Claim:** Prettier 3 breaking changes relevant here: source became ESM (library still usable from CJS), `trailingComma` default changed to `"all"`, markdown formatting changed (CJK spacing). Repo's `.prettierrc` already sets `trailingComma: "all"`, `useTabs: true`, `tabWidth: 4` — so a Prettier 3 bump should be **config-neutral** for this codebase.
    **Sources:** [Prettier 3.0.0 blog](https://prettier.io/blog/2023/07/05/3.0.0.html) (direct: "the default value of `trailingComma` has been changed to `"all"`", "you can still use it as CommonJS as well"). **Confidence:** high.
14. **Claim:** To keep hand-authored markdown untouched, use `.prettierignore` (gitignore syntax; "It's recommended to have a `.prettierignore` in your project") with `*.md` — or scope the CLI to `src` and `test`. Default ignores: `node_modules` + VCS dirs; `.gitignore` rules are also followed.
    **Sources:** [Prettier ignore docs](https://github.com/prettier/prettier/blob/main/docs/ignore.md). **Support:** direct evidence. **Confidence:** high.
    **Researcher note:** README.md/CHANGELOG.md ship inside the VSIX and vsce enforces https image URLs in them — reformatting them adds risk with zero benefit. Excluding `*.md` from prettier entirely is the conservative choice for this repo.
15. **Claim:** Recommended script composition: `"lint": "eslint ."` + `"format:check": "prettier --check ."` (or scope globs), and wire both into CI. Modern community practice (Ember CLI blueprints, Jan 2025) removed eslint-plugin-prettier and added `prettier . --cache --check` as its own script.
    **Sources:** [Ember CLI PR #10596 context via dev.to writeup](https://dev.to/ijlee2/its-time-to-separate-lint-and-format-1oef). **Support:** interpretation (community practice corroborating #11; not an official standard). **Confidence:** medium.

### 4. Scope/exclusions

16. **Claim:** Flat-config equivalent of `ignorePatterns` is `globalIgnores([...])` (from `eslint/config` or inline `ignores` object). ESLint ignores `**/node_modules/**` by default in flat config.
    **Sources:** [Migration Guide](https://eslint.org/docs/latest/use/configure/migration-guide) (covers ignore-file migration). **Support:** interpretation + docs; exact snippet not quoted this session. **Confidence:** medium-high. (Phase B: confirm `globalIgnores` import from `eslint/config`.)
17. **Claim:** Must stay out of lint scope: `out/**` (emitted), `docs/` (already tsconfig-excluded), `node_modules` (default), plus the repo's historical `*.js` blanket ignore — note tests are `.js`, so keeping parity means **eslint scope = `src/**/*.ts` only**. Linting `test/unit/*.js` is desirable but is *new* scope and may surface findings beyond the known 38 — do it as a separate follow-up, not in the zero-findings Phase B.
    **Support:** direct local evidence (`.eslintrc` ignorePatterns, `test/unit/attach.test.js` is CJS JS). **Confidence:** high.
18. **Claim:** `projectService: true` requires each linted file to belong to a tsconfig project. `src/**` is covered by `tsconfig.json`; `test/unit/*.js` is NOT (no include, and `**/*.test.ts` is excluded). So typed rules must only apply to `src/**/*.ts`; a `test/unit` block, if added later, must be untyped (`languageOptions: { globals: { ...node } }`, no projectService).
    **Support:** researcher inference from local tsconfig + docs statement that projectService asks TS for each source file's project. **Confidence:** medium-high.

### 5. CI + VSIX packaging

19. **Claim:** Real-world extension repos run lint as its own CI step/job on ubuntu-latest, e.g. vscode-R: `lint` job → `npm install` → `npx eslint src --ext ts` (fail-fast by default: non-zero exit fails the job).
    **Sources:** [REditorSupport/vscode-R main.yml](https://github.com/REditorSupport/vscode-R/blob/fb06f4e32c55b8cf15541603e2d84a4a9f2154e2/.github/workflows/main.yml). **Support:** direct evidence (workflow YAML). **Confidence:** high.
    **Researcher note:** `--ext` is an eslintrc-only flag removed in ESLint 10 — with flat config, scope belongs in `eslint.config.mjs` `files`/`ignores`; the CI step is just `npm run lint`.
20. **Claim:** vsce does **not** automatically drop lint/format dotfiles: "You can create a `.vscodeignore` file to exclude some files… You should ignore all files not needed at runtime" — devDependencies are auto-ignored, but config files must be listed explicitly. Microsoft's own extensions list them, e.g. vscode-documentdb: `.eslintrc.js`, `.eslintignore`, `.prettierrc`, `eslint.config.mjs`, `prettier.config.mjs`, `.editorconfig`, `tsconfig.*`; vscode-azurestorage: `eslint.config.mjs`, `.nvmrc`.
    **Sources:** [vscecli docs](https://vscode-docs.readthedocs.io/en/stable/tools/vscecli) (direct: ".vscodeignore… exclude some files… ignore all files not needed at runtime"), [microsoft/vscode-documentdb .vscodeignore](https://github.com/microsoft/vscode-documentdb/blob/main/.vscodeignore), [microsoft/vscode-azurestorage .vscodeignore](https://github.com/microsoft/vscode-azurestorage/blob/main/.vscodeignore). **Support:** direct evidence (file contents). **Confidence:** high.
    **Direct consequence for this repo:** current `.vscodeignore` excludes `src/test/docs/.github/.vscode/tsconfig/**/*.map` but **leaks** `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.eslintrc` (until deleted), and `package-lock.json` into the VSIX. Phase B must append these.

## Contradictions

- **eslint-plugin-prettier:** the plugin's own README presents `plugin:prettier/recommended` as its blessed setup, while Prettier's docs say the plugin approach is "generally not recommended". Both are primary sources; the disagreement is real but low-stakes — Prettier's docs are the tool-owner's stance and match the v8-typescript-eslint direction (formatting rules removed), so **separation wins**. Sources: [plugin README](https://github.com/prettier/eslint-plugin-prettier/blob/main/README.md) vs [prettier.io integrations](https://prettier.io/docs/integrating-with-linters).
- **ESLint major choice:** v9 is in maintenance mode while v10 is stable (USWDS issue, corroborative). Pinning `^10` vs `^9` is a judgment call; ESLint 10 is the only version consistent with "eslintrc removed" and future-proofing. No primary contradiction found, only a version-strategy choice.

## Missing evidence / UNVERIFIED

- **`devDependencies` in package.json** (eslint/prettier/typescript exact pins) — the read was truncated; parent's statement (eslint ^7.23, tseslint ^4.19, prettier ^2.2) is trusted but not re-verified here. **The installed `typescript` version must be confirmed `<6.1.0`** before `npm i`.
- **Which 4 files/lines carry the `no-floating-promises` findings** — not run in this session (no shell tool). Classification below is by rule semantics, not file inspection.
- **`no-misused-promises` option shape in v8** (`checksVoidReturn`) — not fetched this session.
- **vsce default dotfile behavior** — docs say "ignore all files not needed at runtime" without enumerating defaults; the explicit Microsoft `.vscodeignore` entries are strong practice-based evidence but not a documented default list.
- Whether `npm test` chain extension vs a separate CI step is preferred — both are defensible; recommendation below is judgment.

## VERDICT — proposed Phase B patch (mechanical)

**Dependencies** (`npm i -D`): `eslint@^10`, `@eslint/js@^10`, `typescript-eslint@^8.72`, `eslint-config-prettier@^10`, `globals@^6`; `prettier@^3`. **Remove:** `eslint-plugin-prettier`, old `eslint@^7`, `@typescript-eslint/*@^4`, `eslint-config-prettier@^8`, `prettier@^2`. Delete `.eslintrc`.

**New `eslint.config.mjs`** (parity scope: src only; tabs untouched; zero-findings target):

```js
// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
	globalIgnores(['out/**', 'docs/**', 'test/**', '**/*.js']),
	{
		files: ['src/**/*.ts'],
		extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
		languageOptions: {
			parserOptions: { projectService: true },
			globals: { vscode: 'readonly' }, // ambient module import only
		},
		rules: {
			'no-unused-vars': 'off',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
		},
	},
);
```

**New `.prettierignore`** (protect hand-authored md + artifacts):

```
*.md
out/
docs/
```

**package.json scripts** (keep the long `test` chain intact; lint gates it):

```json
"lint": "eslint src",
"format:check": "prettier --check src",
"format": "prettier --write src",
"test": "npm run lint && npm run format:check && npm run build && node test/unit/attach.test.js && ..."
```

**CI patch** (`.github/workflows/ci.yml`, after `npm ci`, matching the repo's SHA-pinned action style):

```yaml
      - name: Lint (eslint + prettier, fail-fast)
        run: npm run lint && npm run format:check
```

**`.vscodeignore` additions**:

```
eslint.config.mjs
.prettierrc
.prettierignore
.eslintrc
package-lock.json
```

**Finding triage for the 4 `no-floating-promises` hits** (rule-semantic classification; verify per-site):
- **Keep legal via explicit `void` marker** (UI/status fire-and-forget where rejection is non-actionable): `vscode.window.showInformationMessage/showWarningMessage`, `vscode.commands.executeCommand('setContext', …)` — matches existing idiom in `src/extension.ts`.
- **Must be properly handled** (errors matter → `await` or `.catch()`): daemon start/stop, OSC send, file/process spawn, anything on `context.subscriptions` teardown. These are exactly the async-void bug class that shipped broken features today — do not blanket-`void` them.

## Sources

- Kept: [ESLint Configuration Migration Guide](https://eslint.org/docs/latest/use/configure/migration-guide) — official eslintrc→flat path + migrator.
- Kept: [ESLint v10.0.0 release notes](https://eslint.org/blog/2026/02/eslint-v10.0.0-released) — eslintrc removal, definitive for config + CLI choices.
- Kept: [typescript-eslint Linting with Type Information](https://typescript-eslint.io/getting-started/typed-linting) — exact minimal `projectService: true` snippet.
- Kept: [no-floating-promises rule](https://typescript-eslint.io/rules/no-floating-promises/) — the five legal handling forms + defaults (`ignoreVoid: true`).
- Kept: [typescript-eslint Dependency Versions](https://typescript-eslint.io/users/dependency-versions) — ESLint `^8.57||^9||^10`, TS `>=4.8.4 <6.1.0`.
- Kept: [typescript-eslint Getting Started](https://typescript-eslint.io/getting-started) — canonical flat-config quickstart shape.
- Kept: [Prettier: Integrating with Linters](https://prettier.io/docs/integrating-with-linters) — official "separate lint/format" recommendation, plugin discouraged.
- Kept: [Prettier 3.0.0 blog](https://prettier.io/blog/2023/07/05/3.0.0.html) — trailingComma "all", ESM/CJS, md changes.
- Kept: [Prettier ignore docs](https://github.com/prettier/prettier/blob/main/docs/ignore.md) — `.prettierignore` semantics for md exclusion.
- Kept: [vsce packaging docs](https://vscode-docs.readthedocs.io/en/stable/tools/vscecli) — .vscodeignore contract, devDeps auto-ignored.
- Kept: [microsoft/vscode-documentdb .vscodeignore](https://github.com/microsoft/vscode-documentdb/blob/main/.vscodeignore), [microsoft/vscode-azurestorage .vscodeignore](https://github.com/microsoft/vscode-azurestorage/blob/main/.vscodeignore) — first-party precedent for excluding eslint/prettier configs from VSIX.
- Kept: [REditorSupport/vscode-R workflow](https://github.com/REditorSupport/vscode-R/blob/fb06f4e32c55b8cf15541603e2d84a4a9f2154e2/.github/workflows/main.yml) — real lint-in-CI job for a VS Code extension.
- Rejected/deprioritized: Medium blog "Flat config: Setting up Eslint and Prettier" — personal-preference tutorial, contradicts Prettier's own guidance, SEO-ish. StackOverflow vsce entrypoint error thread — symptom-level, superseded by official docs. dev.to lint/format separation — kept only as corroboration, not as a standard. USWDS issue — third-party status report, corroborative only.

## Next steps (Phase B order)

1. Verify `devDependencies` (esp. `typescript <6.1.0`), then install the pinned set and delete `.eslintrc` + `eslint-plugin-prettier`.
2. Land `eslint.config.mjs`, `.prettierignore`, scripts, `.vscodeignore` additions, CI step — as one mechanical commit on `oow6-lint`.
3. Fix the 4 floating promises per triage (await/`.catch()` for daemon/OSC paths; `void` markers only for UI fire-and-forget) — no rule relaxations.
4. Re-run `npx eslint src` + `npx prettier --check src` to prove **0 findings**; wire both into `npm test` and CI.
5. Optional follow-up (not Phase B): extend eslint to `test/unit/*.js` with an untyped JS block — expect new findings; budget separately.
