# Editor run controls for Sonic Pi files — Phase A research (bean sonic-pi-qlkd)

Status: DRAFT for review (research only — no repo files touched, no commits)
Repo: /home/blaze/github/bmcszk/vscode-sonic-pi @ a571268
Date: research pass for Phase A

## TL;DR (decision summary)

* **No VS Code API lets an extension paint a *clickable* icon in the editor gutter.**
  `gutterIconPath` decorations are paint-only (no command, no click handler), and the
  left-of-line ▶ glyph the user is thinking of (test runner) is drawn by **VS Code core**
  from the **Testing API** (`TestController`), using core-internal glyph-margin options
  that are not in the public API (not even in a proposed `vscode.proposed.*.d.ts`).
* **What the user calls "controls on top of the text file"** = either a `contributes.menus`
  entry in `editor/title` (own icon button, `$(play)`) or in `editor/title/run`
  (core's own ▶ "Run or Debug…" split button submenu).
* **What the user calls "play button on the left of the text"** in C#/Java/Go/Jest is
  almost always a **CodeLens** rendered as its own line *above* the runnable line — that is
  the only extension-facing, persistent, clickable, icon-capable per-line control.
  Codicons in CodeLens titles work (`$(play) Run`) — proven in julia-vscode.
* **Notebook parity already exists** for `.pibook` (`NotebookController` in `src/notebook.ts`);
  per-cell ▶ buttons there are core-provided. The gap is only plain `sonic-pi` text files.
* **Recommended**: CodeLens provider (file-level lens at line 1 + per-cell lens) for text
  editors, plus an `editor/title` play button as the "top of file" control; optional
  "Run → Run cell at cursor" entries in `editor/context` and `editor/lineNumber/context`.
  Do **not** abuse the Testing API to fake a gutter glyph (decision table in §7).

---

## 1. CodeLens deep-dive (the API the user's "Run Tests" buttons mostly come from)

### 1.1 API surface (stable, no proposed flag)

```ts
vscode.languages.registerCodeLensProvider(
  selector: DocumentSelector,
  provider: CodeLensProvider,
): Disposable

interface CodeLensProvider {
  onDidChangeCodeLenses?: Event<void>;              // recompute trigger
  provideCodeLenses(document, token): ProviderResult<CodeLens[]>;
  resolveCodeLens?(lens, token): ProviderResult<CodeLens>;   // lazy title/command
}

class CodeLens {
  range: Range;            // "Should only span a single line."
  command?: Command;       // { title, command, arguments?, tooltip? }
  readonly isResolved: boolean;
}
```

Sources: `src/vscode-dts/vscode.d.ts` (VS Code `main`) and the identical local copy
`node_modules/@types/vscode/index.d.ts` (1.144.0):

* `CodeLens` class + doc comment "The commands will be shown as dedicated horizontal lines
  in between the source text" — index.d.ts:2850-2878.
* `CodeLensProvider` incl. optional `onDidChangeCodeLenses` — index.d.ts:2880-2950.
* Public docs: <https://code.visualstudio.com/api/references/vscode-api#CodeLensProvider>

Rendering facts (from VS Code core source, `src/vs/editor/contrib/codelens/browser/codelensWidget.ts`,
<https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/codelens/browser/codelensWidget.ts>):

| Fact | Evidence |
| --- | --- |
| Lenses render as their **own line above** the target line, not inline and not in the gutter | `codelensWidget.ts` — the widget is a `ContentWidget` positioned at the lens line |
| Several lenses on the same line are joined with ` \| ` | `codelensWidget.ts:~103` (`'\u00a0|\u00a0'`) |
| A lens with a command is clickable; with no command it renders as plain text (`no commands` placeholder otherwise) | `codelensWidget.ts:97-112`; ext-host side fills the internal command `id` via `CommandsConverter.toInternal` (`extHostLanguageFeatures.ts:144`) |
| **Codicons work in `command.title`** (`$(play) Run`) | `codelensWidget.ts:98` `renderLabelWithIcons(lens.command.title.trim())` |
| There is no `icon`/`image` field on `CodeLens`/`Command`; the icon must be embedded in the title string | `vscode.d.ts` class `CodeLens`, class `Command` |
| Codicon colour in lenses has history of theme quirks (icons inherit lens colour) | <https://github.com/microsoft/vscode/issues/89121> (closed, "codelens: don't apply icon color to codelens") |

Codicon-in-CodeLens is not just theoretical — **julia-vscode uses exactly the pattern we
would use** (`src/interactive/codecells.ts`, <https://github.com/julia-vscode/julia-vscode/blob/main/src/interactive/codecells.ts>):

```ts
// julia-vscode/src/interactive/codecells.ts:876-915
codeLenses.push(
  new vscode.CodeLens(cell.cellRange, {
    title: '$(run) Run',
    tooltip: 'Execute the cell in the Julia REPL',
    command: 'language-julia.executeCell',
    arguments: [cell, docCells],
  }),
  new vscode.CodeLens(cell.cellRange, { title: '$(run-above) Above', ... }),
  new vscode.CodeLens(cell.cellRange, { title: '$(run-below) Below', ... }),
  new vscode.CodeLens(cell.cellRange, { title: '$(debug-alt) Debug', ... }),
)
// provider registration: codecells.ts:805
vscode.languages.registerCodeLensProvider(['julia', 'juliamarkdown'], this)
```

That is a per-*cell* (block) `$(run) Run` lens — the closest existing analogue to what
Sonic Pi needs.

### 1.2 What the real "Run / Run Tests / Debug Test" play buttons actually are

| Product / extension | Mechanism | Evidence |
| --- | --- | --- |
| **C#** (`dotnet/vscode-csharp`) | CodeLens provider, `resolveCodeLens` fills title `'Run Test'` / `'Debug Test'` with commands `dotnet.test.run` / `dotnet.test.debug` (plain text titles, no icon) | `src/omnisharp/features/codeLensProvider.ts:109-131` (+ classes `RunTestsCodeLens`, `DebugTestsCodeLens`) |
| **Go** (`golang/vscode-go`) | CodeLens provider; file/package lenses (`run file tests`, `run package tests`) plus per-function `run test` / `debug test` lenses | `extension/src/goRunTestCodelens.ts:43` (`registerCodeLensProvider`), `:89-105` (file/package), `:126-137` (per test func) |
| **Java** (`microsoft/vscode-java-test`, `redhat-developer/vscode-java`) | **Testing API**, not CodeLens: `src/controller/testController.ts` (`vscode.tests.createTestController`); GitHub code search over the repo finds no `registerCodeLensProvider`; vscode-java only contributes references/implementation lenses (`package.json:1539-1553`) | gutter ▶ + Test Explorer |
| **Jest** (`jest-community/vscode-jest`) | **Testing API** for run (`src/test-provider/`), CodeLens only for coverage | `src/Coverage/CoverageCodeLensProvider.ts`, exported via `src/Coverage/index.ts`, registered from `src/extension.ts` (the only `registerCodeLensProvider` hit in the repo) |
| **rust-analyzer** (`rust-lang/rust-analyzer`) | **Testing API** only: `editors/code/src/test_explorer.ts` builds a `TestController`; code search finds no `registerCodeLensProvider` in `editors/code/src` and `editors/code/package.json` has no `codelenses` contribution | gutter ▶ is core Testing UI |
| **Julia** (`julia-vscode`) | CodeLens with `$(run)` codicons per cell + `editor/title/run` menu entries | `src/interactive/codecells.ts:876-915`, `package.json` `contributes.menus["editor/title/run"]` |
| **Code Runner** (`formulahendry/vscode-code-runner`) | The **top-of-editor ▶** : `contributes.commands[].icon = "$(play)"` + `contributes.menus["editor/title/run"]` and a Stop button in `editor/title` | `package.json` `contributes` |

Practical upshot: the buttons the user remembers are a **mix of two different subsystems**:
CodeLens (per-line text controls, above the line) from language extensions, and the core
Testing API's glyph-margin ▶ (Java/Jest/rust-analyzer). Sonic Pi is not a test runner, so the
Testing API is not the natural fit (§2.4, §7).

### 1.3 Constraints and granularity options for CodeLens

* **Placement**: above the line, always. Cannot be inline (end of line) and cannot be in
  the gutter. `range` should be single-line; the lens is anchored at the line of
  `range.start`.
* **Granularity** is entirely up to the provider — practical options:
  * one lens at `line 0` → file-level "Run" play button (works everywhere, no segmentation);
  * one lens per runnable symbol (Go/C# pattern: function range);
  * one lens per *cell* / block (Julia pattern) — needs a cell definition (§6);
  * a lens on the line of the current cursor position only (cheap, context-sensitive);
  * several lenses on the same line ("Run | Run selection | Stop") — they are joined with `|`.
* **Cost**: `provideCodeLenses` runs per document; use `resolveCodeLens` for anything
  expensive. Drive refreshes with `onDidChangeCodeLenses` (fire on
  `onDidChangeTextDocument`, config change, server state change — debounce).
* **Gating**: obeys the user setting `editor.codeLens` (`editor.codeLensFontSize`, ...).
  A user with CodeLens disabled sees nothing, so a keybinding/command-palette path must
  keep working (it already does in this extension).
* **Notebooks**: CodeLens providers registered with `DocumentSelector {language:'sonic-pi'}`
  also fire for **notebook cell documents**, which would duplicate the notebook's own ▶
  buttons — the selector can be narrowed, or the provider can early-return when
  `document.uri.scheme === 'vscode-notebook-cell'` (see §5).
* No manifest contribution is required; a plain
  `vscode.languages.registerCodeLensProvider({language:'sonic-pi'}, provider)` in
  `activate()` is enough (that is what vscode-go and julia-vscode do).

---

## 2. The left-of-line ▶ (gutter) — the key question

**Answer: an extension cannot render a clickable play button in the editor's left margin.
The only clickable left-margin ▶ in VS Code is painted and click-handled by VS Code core
for the Testing API and the debugger.**

### 2.1 What the extension-facing decoration API gives us

`DecorationRenderOptions` (stable) has exactly two gutter-related fields and **no way to
attach a command or click handler**:

```ts
// vscode.d.ts (stable, VS Code main) lines ~1090-1098 — identical in
// node_modules/@types/vscode/index.d.ts:1093-1102
gutterIconPath?: string | Uri;   // "An absolute path or an URI to an image to be rendered in the gutter."
gutterIconSize?: string;         // 'auto' | 'contain' | 'cover' | '<percentage>'

interface DecorationOptions {
  range: Range;
  hoverMessage?: MarkdownString | MarkedString | (MarkdownString | MarkedString)[];
  // ...no command / onClick
}
```

* Docs: <https://code.visualstudio.com/api/references/vscode-api#DecorationRenderOptions>
* Practical, long-standing consequence: a gutter decoration is pure paint — it even
  swallows clicks meant for breakpoints
  (<https://github.com/microsoft/vscode/issues/95992> "Can't click to set/clear breakpoint
  when a gutter decoration exists").
* Debugging feature requests for clickable gutter decorations go back years and are still
  open (e.g. <https://github.com/microsoft/vscode/issues/147251>).

Real extensions use `gutterIconPath` only for **status**, never for buttons:

| Extension | Gutter decoration | File |
| --- | --- | --- |
| vscode-jest | coverage indicator squares in the gutter | `src/Coverage/Formatters/GutterFormatter/index.ts` |
| vscode-go | coverage bars (`goCover.ts`) | `extension/src/goCover.ts` |
| gitlens / Vim / codetour | annotations, marks | `src/annotations/*`, `src/configuration/decoration.ts` |

### 2.2 How the real gutter ▶ is implemented (core only)

`src/vs/workbench/contrib/testing/browser/testingDecorations.ts`
(<https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/testing/browser/testingDecorations.ts>):

```ts
// testingDecorations.ts:709  createRunTestDecoration(...)
// :757  glyphMarginClassName = 'testing-run-glyph'
// :776  glyphMargin: { position: GLYPH_MARGIN_LANE },
// :777  glyphMarginClassName: `${ThemeIcon.asClassName(primaryIcon)} ...`
// :946  public click(e: IEditorMouseEvent): boolean {
// :947      if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || ...)
// :967      case DefaultGutterClickAction.Run: this.runWith(...)
```

Three facts follow:

1. The ▶ glyph is a **glyph-margin decoration** (`glyphMargin`, `glyphMarginClassName`,
   `glyphMarginHoverMessage`), i.e. it lives in the *left margin before the line number*,
   not in the gutter-proper where `gutterIconPath` paints.
2. Those three options **do not exist in the public API**: `vscode.d.ts` (main) contains
   only `gutterIconPath`/`gutterIconSize`; and a full download + grep of **all 184
   `src/vscode-dts/vscode.proposed.*.d.ts` files** (this research pass) yields **zero**
   matches for `glyphMargin`. It is core-internal, not even proposed for extensions.
3. Click handling is a workbench editor contribution (`click(e: IEditorMouseEvent)`), not an
   API surface.

The feature is user-configurable in core (`src/vs/workbench/contrib/testing/common/configuration.ts:19,137`):
`testing.gutterEnabled` and `testing.defaultGutterClickAction` — both Testing-API settings.

**Therefore: extension code that wants a clickable ▶ in the left margin must publish
`vscode.tests.createTestController` items (with `uri` + `range` per runnable).** That is how
Java (`vscode-java-test/src/controller/testController.ts`), Jest (`src/test-provider/`),
rust-analyzer (`editors/code/src/test_explorer.ts`) and the Vitest extension get their gutter
▶ for free (<https://github.com/microsoft/vscode/issues/330557> shows those buttons in the
Vitest extension). None of them draws a glyph itself.

### 2.3 Cheap fallbacks that are "at the left", and their limits

| Mechanism | Clickable? | Where it renders | Verdict for Sonic Pi |
| --- | --- | --- | --- |
| `gutterIconPath` decoration | **no** | left gutter | only as a passive "this line is runnable / currently playing" indicator |
| `before` decoration with `contentIconPath` + `isWholeLine` | **no** | at column 0 of the line, left of the text | looks like an inline ▶ but dead on click — reject (misleads users) |
| `contributes.menus["editor/lineNumber/context"]` | yes (right-click) | context menu on the line-number gutter; command receives `{uri, lineNumber}` | **good low-cost add-on**: "Sonic Pi: Run cell at this line". Docs: <https://code.visualstudio.com/api/references/contribution-points#contributes.menus> (line-number item example: commands get `uri` + one-based `lineNumber`, plus the `editorLineNumber` context key) |
| CodeLens | yes | own line **above** the anchor line, flush left | **primary** (§1, §7) — visually the "play control at the left of the code" people mean |
| Inlay hint label part with `command` | yes | inline at a text position (typically end of line) | not a left-margin button (§3) |
| `editor/title` / `editor/title/run` | yes | editor tab title bar | **top-of-file** ▶ (§7) |

### 2.4 Could we abuse the Testing API to get a true gutter ▶?

Mechanically yes: register a `TestController`, create one `TestItem` per runnable region with
`item.uri = doc.uri` and `item.range`, add a `TestRunProfile` whose handler sends the code to
Sonic Pi. VS Code would then paint the ▶ in the left margin and run our profile on click.

Cost / risks:
* every Sonic Pi "cell" would appear as a **test** in the Testing view, with pass/fail state
  semantics that make no sense for a music script (we would have to mark runs passed);
* `testing.gutterEnabled` is a *test* setting users may have turned off;
* the Testing UI adds "Run All Tests", coverage/debug affordances, and an "output" model we
  would have to fake;
* we would be squatting on a subsystem that the user does not think about when editing music
  (no "Testing" sidebar entry should appear because of a synth patch).

Judgement: **not recommended** unless the user explicitly wants the exact left-margin glyph
and accepts those costs. Keep it in the decision table (§7) as option **D**.

---

## 3. Inlay hints — clickable, but not in the left margin

* Registration: `vscode.languages.registerInlayHintsProvider(selector, provider)`;
  `InlayHintsProvider { onDidChangeInlayHints?: Event<void>; provideInlayHints(document, range, token); resolveInlayHint?(hint, token) }`.
  Docs: <https://code.visualstudio.com/api/references/vscode-api#InlayHintsProvider>
* `InlayHint` itself is **not** clickable — its properties are `position`, `label`,
  `kind`, `textEdits`, `tooltip`, `paddingLeft`, `paddingRight` (no `command`).
  Verified against the API reference text and `node_modules/@types/vscode/index.d.ts:5638-5700`.
* A **label part** can carry a command: `InlayHintLabelPart { value, tooltip?, location?, command? }`
  and the docs say "The editor renders parts with commands as clickable links"
  (`index.d.ts:5587-5633`). So interactivity is possible, but as inline link text.
* **Version question answered**: the *hint* still has no `command`; the clickable actor is the
  *label part*. That capability is plain stable API in the typings this repo already targets
  (`node_modules/@types/vscode` 1.144.0, `engines.vscode: ^1.144.0`) and in current `main` —
  no proposed flag, no engine bump needed. (I did not pin the exact release note that
  introduced it; the relevant fact for us is that it is stable in the version we build against.)
* **Placement**: `position` is a text position — hints render *inline in the text*
  (`paddingLeft`/`paddingRight` for spacing), typically at end of line. They cannot be
  placed in the gutter, and they cannot start a line with a glyph cleanly.
* **Gating**: `editor.inlayHints.enabled` (`'on' | 'onUnlessPressed' | 'offUnlessPressed' | 'off'`,
  default `on`) — `src/vs/editor/common/config/editorOptions.ts:3376-3387`; users also set
  per-language `[sonic-pi]` overrides and toggle all hints with a keybinding, which would
  silently remove any run control we put there; a language-can-have-multiple-providers model.

Verdict: inlay hints are the right tool for *hints* (e.g. "▶ 0.25s" timing annotations), not
for the primary run control. Not a "left play button".

---

## 4. Code actions (lightbulb) — fallback only

* API: `vscode.languages.registerCodeActionsProvider(selector, provider, { providedCodeActionKinds: [...] })`,
  returns `CodeAction { title, kind?, diagnostics?, edit?, command?, isPreferred? }`.
  Docs: <https://code.visualstudio.com/api/references/vscode-api#CodeActionProvider>
* Rendered inside the lightbulb menu / `Ctrl+.` quick pick, **only while the cursor sits on a
  line that has actions**; it is not persistent UI, and in a file with no diagnostics the
  lightbulb only appears for kinds the provider declares.
* **No codicon support in the title**: the action list renders `label` with
  `textContent` (`src/vs/platform/actionWidget/browser/actionList.ts:335`), and
  `codeActionMenu.ts:76-77` passes `label: action.action.title` straight through — a
  `$(play)` prefix would show up literally. `CodeAction` has no icon field.
* Useful role: a "Run cell at cursor" quick fix for discoverability from `Ctrl+.`, or a
  diagnostic-free `CodeActionKind.Empty` action that is always offered on the current line.

Verdict: optional third-tier affordance; never the primary control.

---

## 5. Notebook parity — already free for `.pibook`, and it is the actual gap

What the extension already has (all in this repo):

| Fact | File:line |
| --- | --- |
| Serializer registered for `sonic-pi-book` | `src/extension.ts:67` (`registerNotebookSerializer`) |
| `createNotebookController('sonic-pi-book-kernel', 'sonic-pi-book', 'Sonic Pi Player', handler)` | `src/notebook.ts:113-119` |
| Controller declares `supportedLanguages = ['sonic-pi']` | `src/notebook.ts:138` |
| Execution handler receives `NotebookCell[]`, queues each cell, triggers the runner | `src/notebook.ts:183-191` |
| Per-cell execution object (`createNotebookCellExecution`, `queueCell`) + live-run tracking | `src/notebook.ts:196-260` |
| Notebook document shows a per-cell ▶ in the cell toolbar, "Run All", and cell status bar — **core notebook UI, no code needed** | notebook UI is core; extension only supplies controller/handler (`notebook/cell/execute` menu is a core contribution point) |
| `.pibook` cell boundaries come from markdown fences + `#` headings, **not** blank lines | `src/notebook.ts:40-76` |

So in a notebook the user already gets exactly the UX being asked for. The gap is the plain
`sonic-pi` text editor, where the only controls are the keybindings in `package.json:171-211`.

Two sharp edges to fix while adding text-editor controls:

1. `vscode-sonic-pi.runCell` (`src/extension.ts:79-86`) resolves the "cell" from
   `vscode.window.activeTextEditor?.document.uri` and then calls
   `notebookController.playCellFromURI(...)`, which throws
   `'Can not find cell... please use the run button for first play of a cell rather than keybindings!'`
   (`src/notebook.ts:161-181`) when the URI is not a known notebook-cell document. In a
   notebook there is normally **no** `activeTextEditor` at all (notebooks are not text
   editors), so this command path looks dead for the notebook keybinding F5/Alt+R
   (`package.json:182-191`) — worth confirming in Phase B before reusing the name.
2. Any CodeLens/inlay provider registered for `{language:'sonic-pi'}` **also fires for
   notebook cell documents** (their language is `sonic-pi`). The provider must early-return
   for `document.uri.scheme === 'vscode-notebook-cell'` (or use a `scheme` filter) so cells
   do not get a second, competing ▶ above every line.

---

## 6. Sonic Pi semantics flight-check: what is the natural "unit"?

Run pipeline (repo evidence):

| Piece | Code |
| --- | --- |
| Run whole file: text of the **active document**, offset 0 | `src/source-runner/extension.ts:80-99` — `let code = doc.getText(); main.flashCode(textEditor, true); main.runCode(code)` |
| Run selection: `doc.getText(textEditor.selection)`, line offset = `selection.start.line` | `src/source-runner/extension.ts:101-153` — `main.runCode(code, textEditor.selection.start.line)` |
| Empty selection behaviour: ask / always / never via config `vscode-sonic-pi.runFileWhenRunSelectedIsEmpty` | `src/source-runner/extension.ts:118-149` |
| Transport: OSC `/run-code` with the GUI uuid; a run **replaces** "workspace nine" (comment at top of the file) | `src/source-runner/main.ts:516-530`; header comment `src/source-runner/extension.ts:23-25` |
| Offset is only used to remap **error line numbers** back into the document | `src/source-runner/main.ts:516-519`, used at `:335` and `:360` |
| Played-region flash: only two shapes — whole document or current selection | `src/source-runner/main.ts:532-553` (`flashCode(editor, isWhole)` → `getWholeRange` / `getSelectedRange`) |
| Run lifecycle events (per job number) | `main.ts:50-51` (`onRunStarted`, `onRunEnded`), fired at `main.ts:278-279` |

**There is no cell/block segmentation for text files.** `grep -i cell src/source-runner/` is empty;
the only "cell" logic in the whole extension is the `.pibook` markdown-fence deserializer
(`src/notebook.ts:40-76`) and the notebook controller (`src/notebook.ts:102-274`). Nothing
splits a `.pi` file on blank lines or on any marker.

So the natural units today are:

1. **whole file** (`vscode-sonic-pi.run`) — the canonical Sonic Pi "Run" (one buffer, one job);
2. **selection** (`vscode-sonic-pi.runselected`) — the canonical "run a fragment";
3. **notebook cell** — only inside `.pibook`, where a cell is a fenced block.

For per-cell controls in a text editor we must **invent** the cell unit (Phase B decision):

| Candidate cell rule | Pros | Cons |
| --- | --- | --- |
| blank-line-delimited blocks (Julia-like, but Julia actually uses `##` markers) | zero ceremony, matches how people write percussion/groove blobs | splits `with_fx :reverb do … end` / `live_loop … do … end` across cells → syntax errors; no user control |
| explicit marker comment, e.g. `# %%` (Jupyter/VS Code interactive-window convention) | user-controlled, unambiguous, works with nesting, easy to implement and document | requires markers in files; a bare `.pi` file has 0 cells (file-level lens still works) |
| Ruby block-aware segmentation (track `do/end`, `def/end`, `if/end`, nesting depth, skip strings/comments) | "just works" without markers | real parser work, will be wrong on edge cases; Ruby heredocs/quoted strings make it fiddly |
| "statement at/above cursor" (no explicit cells, Run = the top-level statement under the cursor) | no segmentation in the UI at all | needs the same block-aware logic, invisible boundaries |

Semantic constraint that matters for any per-cell design: each run is a **fresh** `/run-code`
job on the same buffer. A cell that is not a syntactically complete Ruby unit (e.g. the body
of a `do … end`) cannot be run alone, so whichever rule we pick must never offer a lens on
a fragment that would fail to parse. That alone argues against naive blank-line splitting.

Additional implementation gap for per-cell feedback: `flashCode` only supports "whole
document" or "current selection" (`main.ts:532`), so flashing the executed cell requires a
new range-based path; and `onRunStarted/onRunEnded` carry only a job number, so a
"this cell is playing" state needs new bookkeeping (the notebook tracks the mapping in
`notebook.ts:124-136`, text editors do not).

---

## 7. Recommendation for Sonic Pi

### 7.1 Chosen mechanism (recommended)

**Primary: a CodeLens provider for `sonic-pi` text documents** — it is the only
extension-facing mechanism that is persistent, per-line, clickable, icon-capable and
zero-risk:
* lens on **line 1**: `$(play) Run` → `vscode-sonic-pi.run` (file-level play button, always
  available, no segmentation needed);
* lens on **line 1**: `$(debug-stop) Stop` → `vscode-sonic-pi.stop`;
* *if and only if* a cell unit is defined (§6, Phase B decision): `$(play) Run cell` above
  each cell start line, and only when the document yields ≥ 2 cells (julia-vscode does the
  same: `if (docCells.length <= 1) return codeLenses`, `codecells.ts:864-868`).

**Secondary: the top-of-tab ▶** via `contributes.menus["editor/title"]` with
`"group": "navigation"`, command `icon: "$(play)"`, `when: "editorLangId == 'sonic-pi'"`.
(Code Runner does exactly this with `"icon": "$(play)"` and a Stop button gated on a
`codeRunning` context key; the docs example for the same slot is `markdown.showPreview`.)
Optionally *also* register in `editor/title/run` (julia-vscode, Dart-Code, Code Runner) so
the command shows up in core's "Run or Debug…" split-button dropdown. Core renders that ▶
itself (`debug.contribution.ts:258`, submenu `MenuId.EditorTitleRun`).

**Tertiary (cheap, high value): right-click entries** — `editor/context` ("Run selection",
"Run cell") and `editor/lineNumber/context` ("Run cell at this line", receives
`{uri, lineNumber}`), both gated on `resourceLangId == 'sonic-pi'`.

**Explicitly rejected**: gutter ▶ (impossible without the Testing API, §2), `before`-decoration
fake ▶ (dead on click), inlay hints as run control (§3), code actions as primary (§4).

### 7.2 Decision table (for the user to pick)

| # | Option | What the user sees | Effort | Risks | Recommendation |
| --- | --- | --- | --- | --- | --- |
| **A** | CodeLens: file lens (`$(play) Run`, `$(debug-stop) Stop`) only | one extra line above line 1 in every `.pi` file | S (~40 LOC + config + 1 menu) | `editor.codeLens:false` hides it; one extra visual line | **do it** |
| **B** | CodeLens per cell (`$(play) Run cell`) | ▶ Run above every cell/block | M (needs cell unit + refresh wiring + flash-range support) | wrong segmentation → Ruby syntax errors; noisy in dense files | **do it** *after* the cell rule is agreed |
| **C** | `editor/title` ▶ (and `$(debug-stop)` while running) | play button in the editor tab bar, top right | S | none serious; needs a `sonicPiRunning` context key for Stop | **do it** |
| **C2** | `editor/title/run` entries | commands inside core's "Run or Debug…" dropdown | XS | less discoverable (one click deeper) | optional, cheap |
| **D** | Testing API (`TestController`) to get the true left-margin ▶ | real glyph-margin play icon at the left of each cell + entries in the Testing view | M–L (controller, run profiles, pass/fail state to fake) | abuses a test subsystem; user's music shows up as "tests"; `testing.gutterEnabled` may be off; pass/fail semantics meaningless | **only if the user insists on the exact left-margin glyph** |
| **E** | `editor/lineNumber/context` + `editor/context` | right-click → "Run cell at this line" | XS | two clicks, hidden | **do it** (complement) |
| **F** | Inlay hint ▶ per cell | inline at line end | M | not left; hidden by `editor.inlayHints.enabled` | no |
| **G** | Code action / lightbulb | only with cursor on the line | S | invisible, no codicons in titles | no |

### 7.3 Gating / configuration decisions to confirm

* New setting `vscode-sonic-pi.showEditorControls` (boolean, default `true`), documented in
  README, because CodeLens permanently consumes one screen line per cell.
* All menu contributions gated with `when: "editorLangId == 'sonic-pi' && notebookType != 'sonic-pi-book'"`
  — notebooks already have their own ▶ (§5) and must not gain duplicates.
* CodeLens provider must early-return for notebook-cell documents
  (`document.uri.scheme === 'vscode-notebook-cell'`).
* Icons: `$(play)` for Run, `$(debug-stop)` for Stop, `$(run-above)`/`$(run-below)` if
  "run above/below" variants are ever added (all three names already used by julia-vscode).
* Refresh: fire `onDidChangeCodeLenses` (debounced ≥ 250 ms) on document change, on
  `onDidChangeActiveTextEditor`, and on configuration change.

### 7.4 Risks / open questions for Phase B

1. **Cell rule** (§6) — must be agreed before per-cell lenses ship; naive blank-line
   splitting will produce unparsable fragments inside `do … end` blocks.
2. **Feedback while playing** — `flashCode` only supports whole-file/selection
   (`main.ts:532`), and `onRunStarted/onRunEnded` carry only a job number
   (`main.ts:50-51,278-279`), so "this cell is playing" needs new bookkeeping.
3. **`vscode-sonic-pi.runCell` looks broken in notebooks** (§5, sharp edge 1) — decide whether to fix it
   in the same change or to introduce a distinct text-editor command name.
4. **CodeLens noise** in files where the user writes many short blocks; mitigate with the
   "≥ 2 cells" rule, a config toggle, and keeping the file lens to a single line.
5. Codicon colour inside lenses follows the lens theme colour (issue #89121) — verify
   legibility in light/dark before shipping screenshots in the README.

### 7.5 Sources (all read during this pass)

* VS Code API reference: <https://code.visualstudio.com/api/references/vscode-api> (CodeLens, CodeLensProvider, InlayHint, InlayHintLabelPart, DecorationRenderOptions, registerInlayHintsProvider)
* Contribution points (menus incl. `editor/title`, `editor/title/run`, `editor/lineNumber/context`): <https://code.visualstudio.com/api/references/contribution-points#contributes.menus>
* Language features index: <https://code.visualstudio.com/api/language-extensions/programmatic-language-features>
* Testing API guide: <https://code.visualstudio.com/api/extension-guides/testing>
* Notebook API guide: <https://code.visualstudio.com/api/extension-guides/notebook>
* Local type source of truth: `node_modules/@types/vscode/index.d.ts` (1.144.0)
* VS Code core: `src/vscode-dts/vscode.d.ts`, all 184 `src/vscode-dts/vscode.proposed.*.d.ts`,
  `src/vs/editor/contrib/codelens/browser/codelensWidget.ts`,
  `src/vs/workbench/contrib/testing/browser/testingDecorations.ts`,
  `src/vs/workbench/contrib/testing/common/configuration.ts`,
  `src/vs/workbench/contrib/debug/browser/debug.contribution.ts`,
  `src/vs/workbench/services/actions/common/menusExtensionPoint.ts`,
  `src/vs/editor/common/config/editorOptions.ts`,
  `src/vs/platform/actionWidget/browser/actionList.ts`,
  `src/vs/editor/contrib/codeAction/browser/codeActionMenu.ts`
* Extensions: `julia-vscode/julia-vscode` (`src/interactive/codecells.ts`, `package.json`),
  `golang/vscode-go` (`extension/src/goRunTestCodelens.ts`),
  `dotnet/vscode-csharp` (`src/omnisharp/features/codeLensProvider.ts`),
  `microsoft/vscode-java-test` (`src/controller/testController.ts`),
  `jest-community/vscode-jest` (`src/test-provider/`, `src/Coverage/`),
  `rust-lang/rust-analyzer` (`editors/code/src/test_explorer.ts`, `run.ts`),
  `formulahendry/vscode-code-runner` (`package.json`),
  `Dart-Code/Dart-Code` (`package.json` editor/title/run entries),
  `vitest-dev/vscode` (`packages/extension/src/extension.ts`)
* Tracking issues: microsoft/vscode#95992 (gutter decorations swallow clicks),
  #147251 (clickable gutter icon request), #330557 (Vitest gutter ▶ = Testing API).

---

## Appendix — method and evidence limits

* This pass was **read-only**: no repo file was edited, no commit, no `.beans` write.
  (`git status` in the repo shows only pre-existing `.beans/*` ledger changes from earlier
  sessions — nothing under `src/`, `package.json` or `test/`.)
* VS Code facts come from the stable typings shipped in this repo
  (`node_modules/@types/vscode` 1.144.0), the current `src/vscode-dts/vscode.d.ts` and **all
  184** `vscode.proposed.*.d.ts` files, plus the core implementation files cited above.
* Third-party extension facts come from each repo's default branch (`master`/`main`) at the
  time of this pass, located via the GitHub code-search API. Search indexes can lag/omit
  files, so "no `registerCodeLensProvider` in repo X" means "no hit found", not a proof of
  absence; the positive citations (file + line) are what the conclusions rest on.
* Line numbers in external repos will drift; repo-local line numbers are against
  `a571268` and are exact.
