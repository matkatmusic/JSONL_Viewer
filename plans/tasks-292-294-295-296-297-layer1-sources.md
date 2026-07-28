# Plan — tasks #292, #294, #295, #296, #297 (Layer 1 View: JSONL pane, syntax highlighting, source pickers, saved settings)

Reference render: `plans/layer1-mockup.html` (user-approved, 2026-07-27). Every visual and
interaction rule below is already implemented there — when this plan and the mockup disagree, the
mockup wins. Line numbers cited as `mockup:NNN` are into that file.

All work is in the `jfred` submodule. Repo-relative paths below are relative to `jfred/`.

Mandatory: `plans/coding-requirements.md` (domain types, enum comparisons, verb-named functions,
no re-export shims, DRY helpers). `webapp/` may NOT import from `src/` — wire shapes are re-declared
in `webapp/layer1-wire.ts`.

**Do not run the test suite.** Write the tests, leave them for the user to run.

---

## Order of work

Phase A (#294) is independent of everything else — do it first, it is the smallest.
Phase B (server) must land before Phase D (#292 client) because D fetches B's endpoint.
Phase C (#295/#296/#297 client) must land before Phase D, because D reads the JSONL source list
Phase C owns.

- **A.** #294 — syntax highlighting in the Detail View drawer.
- **B.** Server: `/api/layer1-sessions`, `/api/scan-source`, `/api/layer1-settings`.
- **C.** #295/#296/#297 — the shared path-picker modal, the two buttons, saved settings.
- **D.** #292 — the JSONLs pane, the session filter, the range bar + wash.

---

## Phase A — #294: syntax highlighting in the Detail View drawer

The original webapp's mechanism is `webapp/highlight.ts`'s `renderCodeInto`, which runs the
vendored `webapp/vendor/highlight.min.js` global (`hljs`) and falls back to plain text when the
global is absent or the extension is unknown. `webapp/webapp_old.html:154-158` is the existing
example of how that vendored asset is loaded. Reuse both — write no tokenizer.

### A1. Load the vendored highlighter on the Layer 1 page

In `webapp/layer1.html`, inside `<head>` and AFTER the existing
`<link rel="stylesheet" href="/app/layer1-styles.css">`, add exactly the three tags
`webapp/webapp_old.html:154-156` uses for highlighting, minus the xterm ones:

```html
<link rel="stylesheet" href="/app/vendor/highlight-github.min.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="/app/vendor/highlight-github-dark.min.css" media="(prefers-color-scheme: dark)">
<script src="/app/vendor/highlight.min.js"></script>
```

Order matters: the vendor stylesheets come AFTER `layer1-styles.css` so the hljs token colours win
inside `.hljs`, and the `<script>` is a plain (non-module) tag so `hljs` is a global by the time the
deferred `layer1-page.js` module runs.

### A2. Keep the line-number gutter, highlight the whole file in one pass

`webapp/layer1-file-view.ts` currently emits one `.dline` row per line with plain `textContent`.
Per-line highlighting is WRONG here — a block comment or template literal spanning lines would be
mis-tokenised on every line but the first. Restructure `renderFileContentInto` to a two-column
layout so hljs sees the whole file at once:

- New signature: `renderFileContentInto(host: HTMLElement, content: string, path: string): void`.
- Split `content` on `"\n"`; drop a single trailing empty element exactly as today (the guard at
  `layer1-file-view.ts:19-21` stays).
- Build two children of `host`:
  - `el("div", { class: "dgutter" })` whose `textContent` is `lines.map((_, i) => i + 1).join("\n")`.
  - `el("code", { class: "dcode" })`, then call `renderCodeInto(codeElement, lines.join("\n"), path)`
    (import from `./highlight.ts`).
- `host.replaceChildren(gutter, code)`.

Delete the now-inaccurate paragraph of the module header that says the hljs half was deliberately
not copied, and replace it with one sentence saying the highlighting is `renderCodeInto`'s.

Update the caller `webapp/layer1-drawer.ts:73` to pass `path` as the third argument.

### A3. Stylesheet

In `webapp/layer1-styles.css`, replace the two `.dbody .dline` / `.dbody .dln` rules at the end of
the file with:

```css
  /* The drawer's file body: a plain line-number column beside ONE hljs-highlighted block, so the
     highlighter sees the whole file and a multi-line string is tokenised once (task 294). */
  .dbody { display: flex; align-items: flex-start; gap: 12px; }
  .dbody .dgutter { flex: none; text-align: right; color: var(--muted); user-select: none; }
  .dbody .dcode { flex: 1; min-width: 0; }
```

`.dbody` already carries the monospace font, the line-height and `white-space: pre` — both children
inherit them, which is what keeps the two columns' rows aligned. Do NOT add `overflow` to the
children; `.dbody` already scrolls.

### A4. Tests

`tests/layer1-file-view.test.ts` — create it if absent, extend it if present. Under happy-dom (see
any existing `tests/layer1-*.test.ts` for the harness), with NO `hljs` global defined:

1. `renderFileContentInto(host, "a\nb\nc\n", "x.ts")` puts `"1\n2\n3"` in `.dgutter` and `"a\nb\nc"`
   in `.dcode` — proving the trailing-newline guard survived and the gutter counts real lines only.
2. The same call leaves `.dcode` free of any `<span>` (the plain-text fallback path), because
   `renderCodeInto` bails when `hljs` is undefined.
3. `computeLanguageForPath("notes.txt")` returns `undefined` — the unknown-extension case task 294's
   mockup calls out (mockup:1436).

If an existing test asserts on `.dline` / `.dln` / `.dcode` rows, update it to the new shape rather
than keeping the old rendering alive.

---

## Phase B — server routes

Three new routes. Each gets its own handler module and one `else if` branch in
`src/viewer_server.ts`'s `handleRequest` (which is near its 250-line cap — add branches only, put
every line of logic in the new modules).

### B1. `src/viewer_api_layer1_sources.ts` — `GET /api/scan-source`

Query: `path` (required, a folder), `kind` (required, `jsonl` or `filehistory`).

Answers `200 { found: <number> }` — how many matching files exist at ANY nesting depth under
`path`. Refuse a missing/unreadable path with `400` and the message as the body, matching every
other Layer 1 route's refusal shape.

- `jsonl` counts files whose name ends `.jsonl`.
- `filehistory` counts every regular file (a file-history store's snapshot names are hashes with no
  common extension).
- Walk with `readdirSync(dir, { withFileTypes: true })` recursively. **Stop counting at 1**: the
  only question the client asks is "is this folder empty of what I want", so return as soon as the
  first match is found rather than walking a 12,000-file store. Name the helper
  `countSourceFilesUnder(root: Path, kind: SourceKind, limit: number): number`.
- `SourceKind` is a string enum in `src/structures/vocabulary.ts`
  (`export enum SourceKind { jsonl = "jsonl", fileHistory = "filehistory" }`) per coding-requirements
  §2, and the handler compares with enum members per §4.

### B2. `src/viewer_api_layer1_sessions.ts` — `GET /api/layer1-sessions`

Query: `jsonl` — REPEATABLE (`url.searchParams.getAll("jsonl")`), each value a folder to scan.
At least one is required; zero is a `400`.

Answers `200 { sessions: Layer1WireSession[] }`, where:

```ts
export interface Layer1WireSession {
    file: string;      // basename, e.g. "0f3c9a7e.jsonl"
    fullPath: string;  // absolute path, the wire identity used for de-duplication
    title: string;     // first user prompt, trimmed and truncated to 70 chars, "" if none
    started: string;   // ISO instant of the FIRST record
    ended: string;     // ISO instant of the LAST record
    paths: string[];   // every file path the session touched
}
```

Build it by:

1. Collecting `*.jsonl` files under each `jsonl` folder recursively (reuse the walker from B1 —
   generalise it to `listSourceFilesUnder(root, kind)` and have `countSourceFilesUnder` be the
   early-exit caller, per coding-requirements §3). De-duplicate by absolute path across folders.
2. Per file: `loadProjectRecords([path])` from `src/viewer_api_records.ts`.
3. `started` / `ended` = min / max of the records' timestamps.
4. `paths` = `computeReconstructionPrescan(records).map((entry) => entry.path)` — reuse
   `src/viewer_api_prescan.ts`'s exported function, do not re-derive touched paths.
5. `title` = the first user-text record's text, `.trim().slice(0, 70)`. Check
   `src/reconstruction_prompts.ts` for an existing first-prompt helper and use it if one exists;
   otherwise add one there and name it with a verb (`readFirstUserPrompt`).
6. Skip — do not throw — a JSONL that parses to zero records or throws while loading. One corrupt
   transcript must not blank the whole pane.
7. Sort ascending by `started`.

### B3. `src/viewer_api_layer1_settings.ts` — `GET` + `POST /api/layer1-settings`

The task-#297 config file. Store it at `join(homedir(), ".jfred-layer1-settings.json")` — the user's
home, not the repo, because a settings file is per-user state and must not become a git diff.

Shape on disk:

```jsonc
{
  "lastDir": "/Users/…/code/demo-app",
  "projects": {
    "/Users/…/code/demo-app": {
      "dir": "…", "repo": "…", "branch": "…", "ref": "…",
      "jsonl": ["…"], "fileHistory": ["…"]
    }
  }
}
```

- `GET` with no query → `200` the whole file, or `200 { lastDir: null, projects: {} }` when the file
  does not exist or does not parse. A settings file is a convenience; a corrupt one must never stop
  the page loading.
- `POST` body = one project entry plus its `dir`. Merge it into `projects` under its own `dir` key,
  set `lastDir` to that `dir`, write the whole file back with `writeFileSync(..., JSON.stringify(x, null, 2))`,
  answer `200 { saved: true }`. Read-modify-write, so saving project A never drops project B.
- Follow `handleConfigUpdate` (`src/viewer_server.ts:126-136`) for the POST body-accumulation
  pattern; it is the existing precedent in this codebase.

### B4. Wiring

In `src/viewer_server.ts`'s `handleRequest`, beside the existing `/api/layer1-*` branches:

```ts
} else if (request.method === "POST" && url.pathname === "/api/layer1-settings") {
    handleLayer1SettingsUpdate(request, response);
} else if (url.pathname === "/api/layer1-settings") {
    handleLayer1SettingsRequest(response);
} else if (url.pathname === "/api/layer1-sessions") {
    handleLayer1SessionsRequest(response, url.searchParams);
} else if (url.pathname === "/api/scan-source") {
    handleScanSourceRequest(response, url.searchParams);
```

The POST branch MUST precede the GET branch for the same path — that is how `/api/config` is
already ordered at `src/viewer_server.ts:169-173`.

### B5. Tests

`tests/viewer_api_layer1_sessions.test.ts` — spawn a server on its own port using the pattern in
`tests/layer1-view-test-helpers.ts` (spawned process, own tmpdir). Fixture: a tmp folder holding
`a/one.jsonl` (nested, to prove the recursive walk) and `two.jsonl`, each a handful of hand-written
records with STATED timestamps and one `Write` tool_use apiece.

Assert:
1. Both sessions come back, sorted by `started`.
2. `started`/`ended` are the fixture's first/last record instants, exactly.
3. `paths` holds the written file's path.
4. `GET /api/scan-source?path=<the tmp folder>&kind=jsonl` reports `found >= 1`; an empty sibling
   folder reports `found: 0`.
5. `GET /api/layer1-sessions` with no `jsonl` param answers `400`.

`tests/viewer_api_layer1_settings.test.ts` — point the handler at a tmp home (extract the settings
file path into an exported, overridable module-level value so the test can redirect it; do NOT write
to the real home from a test). Assert: GET on a missing file returns the empty shape; POST then GET
round-trips; a second POST for a DIFFERENT `dir` leaves the first project's entry intact.

---

## Phase C — #295 / #296 / #297: source pickers and saved settings

### C1. `webapp/layer1.html` — the buttons

On the existing `.sources` row (`layer1.html:61-65`), after the Project-folder `<label>`, add
exactly (mockup:499-503):

```html
    <button id="pick-jsonl">JSONL sources</button>
    <button id="pick-fh">File History Snapshots</button>
    <button id="save-settings" disabled>Save project settings</button>
    <span class="savednote" id="saved-note"></span>
```

At the END of `.viz-root`, after `.stagewrap`'s closing `</div>`, add the shared modal exactly as
mockup:579-592 (ids `pathpicker`, `pp-title`, `pp-list`, `pp-alert`, `pp-add`, `pp-remove`,
`pp-cancel`, `pp-ok`). ONE dialog serves both lists — different title, different array.

### C2. `webapp/layer1-styles.css` — the modal

Append the mockup's `.savednote`, `.modal-wrap`, `.modal`, `.mtitle`, `.mlist`, `.mbuttons`,
`.mspacer`, `.malert` rules verbatim from mockup:406-428. They use only tokens the Layer 1
stylesheet already defines (`--surface`, `--border`, `--page`, `--ink`, `--ink2`, `--muted`,
`--sel-edge`, `--c-anchor`); confirm each is present before pasting and do not invent new tokens.

### C3. `webapp/layer1-source-paths.ts` — the two lists and their defaults (NEW)

Owns the state, not the DOM:

- `export enum SourceKind { jsonl = "jsonl", fileHistory = "filehistory" }` — re-spelled in
  `webapp/` because webapp cannot import from `src/`, the same constraint `TIME_SOURCE_VALUES` in
  `layer1-sources.ts:15` already lives under. Comment it that way.
- Module state: `{ [SourceKind.jsonl]: { paths: string[]; touched: boolean }, [SourceKind.fileHistory]: … }`,
  both starting `{ paths: [], touched: false }`.
- `export async function seedSourceDefaults(): Promise<void>` — `fetch("/api/config")` once, keep
  `projectsDir` and `fileHistoryDir` in module state. This is the real page's stand-in for the
  mockup's hardcoded `deriveFor` (mockup:1498-1500).
- `export function syncSourceButtons(): void` — for each kind, if `touched` is false, re-derive
  `paths` from the current `#dir` box:
  - jsonl → `[`${projectsDir}/${dir.replaceAll("/", "-")}`]` (Claude Code's own mangling: a project
    folder's absolute path with every `/` replaced by `-`).
  - fileHistory → `[fileHistoryDir]`.
  Then write the counts onto the buttons: `JSONL sources (N)` and `File History Snapshots (N)`
  (mockup:1506-1512). If `/api/config` has not answered yet, leave `paths` empty and print `(0)` —
  never throw.
- `export function readSourcePaths(kind: SourceKind): readonly string[]`
- `export function writeSourcePaths(kind: SourceKind, paths: string[]): boolean` — stores, sets
  `touched = true`, returns whether the list actually changed (compare `join("\n")`, mockup:1567).

### C4. `webapp/layer1-path-picker.ts` — the modal (NEW)

A straight port of mockup:1519-1572. It edits a COPY; cancel drops it, "set and close" commits.

- Module state: `draftKind`, `draftPaths: string[]`, `draftPick: number`, `alertTimer`.
- `openPicker(kind)` — copy the live list into `draftPaths`, `draftPick = -1`, set `#pp-title` from
  a `PICKER_TITLES` map (`jsonl` → `"JSONL Source Paths"`, `filehistory` → `"File History Snapshot Paths"`),
  **hide `#pp-alert`** (mockup:1527 — a warning about the previous list is not about this one),
  unhide `#pathpicker`, render.
- `renderPicker()` — one `<div>` per path, `.picked` on `draftPick`, click sets `draftPick`;
  an empty list draws one `<div class="mempty">no source folders</div>`. `#pp-remove.disabled = draftPick < 0`.
- `[+]` — `await fetch("/api/pick-folder?current=" + encodeURIComponent(draftPaths[draftPick] ?? ""))`.
  This is the existing native folder chooser (`src/viewer_server.ts:138`, osascript, folder-only) —
  reuse it, do not add a second picker route. An empty `path` means cancelled: do nothing.
  Already in the list: do nothing. Otherwise `await fetch("/api/scan-source?path=…&kind=…")` and
  **refuse a folder whose `found` is 0** by flashing `#pp-alert` for 2600 ms with
  `"no JSONL files found"` / `"no snapshots found"` (mockup:1541-1547) and NOT adding it.
- `[−]` — splice `draftPick` out, clamp `draftPick` to the new last index, re-render.
- `[cancel]` — hide the dialog, change nothing.
- `[set and close]` — `writeSourcePaths(draftKind, draftPaths)`, hide the dialog, and if it returned
  `true` call the two callbacks the wiring passed in: `markSettingsDirty()` and `reload()`.
- `export function wirePathPickers(onChanged: () => void): void` — attaches the six listeners once,
  from boot. `onChanged` is passed in rather than imported, for the same no-cycle reason
  `wireFolderPickers` takes `afterPick` (`layer1-sources.ts:79-80`).

### C5. `webapp/layer1-settings.ts` — #297 (NEW)

- `let settingsDirty = false`.
- `export function markSettingsDirty(): void` — set the flag, enable `#save-settings`, clear
  `#saved-note` (mockup:1513-1517).
- `export function wireSettingsSave(): void`:
  - `#save-settings` click → `POST /api/layer1-settings` with
    `{ dir, repo, branch, ref, jsonl: readSourcePaths(jsonl), fileHistory: readSourcePaths(fileHistory) }`
    read from the boxes. On success: clear the flag, disable the button, write `saved` into
    `#saved-note`. On failure: write the error text into `#saved-note` — the button stays enabled,
    because nothing was saved.
  - `addEventListener("beforeunload", (event) => { if (settingsDirty) event.preventDefault(); })`
    — the browser words the prompt; "discard" is the reader leaving anyway (mockup:1587).
  - `input` on `#dir`, `#repo` and `change` on `#branch`, `#commit`, `#ref` → `markSettingsDirty()`.
    The task says the button enables "when the user changes any data source list"; the boxes on the
    same row are part of the same saved record, so they arm it too.
- `export async function restoreSavedSettings(): Promise<boolean>` — `GET /api/layer1-settings`;
  if `lastDir` is null or absent, return `false` and change nothing. Otherwise fill `#dir`, `#repo`,
  `#ref` and seed the two source lists as `touched: true` (mockup:1588-1594), and return `true`.
  **The URL wins over the file**: if `location.search` already carries `dir` or `repo`, return
  `false` without touching anything — a shared link must render what it names.

### C6. Boot wiring in `webapp/layer1-page.ts`

`layer1-page.ts` is AT the 250-line cap. Before adding anything, move `buildPairWidget`,
`appendAxisNode`, `buildOrphanBucket`, `buildStagePairs` and `SHORT_HASH_LENGTH` out into a new
`webapp/layer1-widgets.ts`, exporting `buildStagePairs` and `buildOrphanBucket`; `renderLayer1Stage`
imports them. That is a pure move — no behaviour change — and it buys ~70 lines for Phases C and D.

Then in `bootLayer1Page`, before the existing `void loadLayer1View()` at the end:

```ts
await seedSourceDefaults();          // /api/config, so the derived defaults are real paths
const restored = await restoreSavedSettings();
syncSourceButtons();
wirePathPickers(() => { markSettingsDirty(); void loadLayer1View(); });
wireSettingsSave();
```

`bootLayer1Page` becomes `async` and the module-scope call at `layer1-page.ts:250` becomes
`void bootLayer1Page();`. Everything currently in the function stays where it is; the `await`s go
FIRST so the boxes hold their restored values before `fillSourceBoxesFromUrl`… no — keep
`fillSourceBoxesFromUrl()` first as it is today, and let `restoreSavedSettings` bail when the URL
already carries `dir`/`repo` (C5). That ordering is why C5's URL-wins rule exists.

Call `syncSourceButtons()` at the top of `loadLayer1View` too, so a new project folder brings its
own derived defaults with it (mockup:822 calls it from `render`).

### C7. Send the picked sources to the view build

`readSourceParams()` in `webapp/layer1-sources.ts` is what builds `?dir=&repo=&ref=`. Extend it to
also append one repeated `jsonl=` param per JSONL source path and one repeated `filehistory=` param
per file-history path, so the URL is still the whole shareable state (S18's "one shareable link").

`GET /api/layer1-view` reads NO JSONL and NO file-history, so `src/viewer_api_layer1_route.ts` must
simply IGNORE both — do not add validation that would reject them. Phase D's `/api/layer1-sessions`
is the only consumer of `jsonl=`; `filehistory=` is carried for layers 2/3 and for the settings
record. Add a one-line comment in `readSourceParams` saying exactly that, so the next reader does
not "fix" it.

`fillSourceBoxesFromUrl` must read them back: `params.getAll("jsonl")` / `params.getAll("filehistory")`
into the source lists as `touched: true` when either is non-empty.

### C8. Tests

`tests/layer1-path-picker.test.ts` (happy-dom, stub `globalThis.fetch`):
1. `[+]` on a folder whose `/api/scan-source` says `found: 0` does NOT add a row and unhides
   `#pp-alert`.
2. `[+]` on a folder with `found: 3` adds the row and selects it.
3. `[cancel]` after adding leaves `readSourcePaths(kind)` unchanged.
4. `[set and close]` after adding commits it and calls the `onChanged` callback exactly once.
5. Opening the picker for the OTHER kind hides a `#pp-alert` left visible by the first.

`tests/layer1-settings.test.ts` (happy-dom, stub `fetch`):
1. `markSettingsDirty()` enables `#save-settings` and blanks `#saved-note`.
2. A successful save POSTs the six fields, disables the button and writes `saved`.
3. `restoreSavedSettings()` returns `false` and leaves `#dir` alone when `location.search` carries
   `dir`.

`tests/layer1-source-paths.test.ts`:
1. `syncSourceButtons()` with an untouched jsonl list derives
   `<projectsDir>/-Users-you-code-demo-app` from `#dir` = `/Users/you/code/demo-app`.
2. After `writeSourcePaths`, `syncSourceButtons()` does NOT overwrite the list (the `touched` rule).
3. `writeSourcePaths` returns `false` when handed the same list again.

---

## Phase D — #292: the JSONLs pane, the session filter, the range bar

### D1. `webapp/layer1.html` — the pane and the two canvas layers

Split the existing `<aside class="filenav">` into two stacked panes with a drag grip between them,
mirroring mockup:528-548. Keep the existing ids — `filenav-search`, `filenav-search-clear`,
`filenav-tree` — untouched so `layer1-filenav.ts` and its tests keep working. Add:

```html
      <div class="pane-grip" id="navpane-grip" title="drag to resize"></div>
      <section class="navpane" id="pane-sessions">
        <div class="filenav-title">JSONLs
          <button id="clear-sessions" disabled>All sessions</button>
        </div>
        <div id="sessions"></div>
      </section>
```

with the existing File Nav contents wrapped in `<section class="navpane" id="pane-files">`.

Inside `.canvas` (`layer1.html:117-121`), add two layers between `.leaders` and `.ruler`:

```html
      <div class="washes" id="washes"></div>
      <div class="ranges" id="ranges"></div>
```

The wash rides BEHIND the bubbles and the bars in FRONT of the lane — that is what
mockup:286-292's `z-index: -1` vs `z-index: 7` encode, and it is why they are two elements and not
one.

Add the legend chip mockup:522 uses (`JSONL range`) to `.legend`.

### D2. `webapp/layer1-styles.css`

Append verbatim from the mockup: `.navpane`, `.pane-grip` (mockup:143-148), `#pane-sessions`
flex share (mockup:145), `.session-item` and its `.sname`/`.smeta` children (mockup:179-186),
`.ranges`, `.washes`, `.range-wash`, `.range` and `.ruler .tick.inrange` (mockup:286-307).

Also apply the 2026-07-27 transparency fix already in the mockup: the `.filebox` background is
semi-transparent so the wash reads through it. Copy the mockup's `.filebox` background value rather
than guessing an alpha.

### D3. `webapp/layer1-wire.ts`

Add the client mirror of B2's payload:

```ts
export interface WireSession {
    file: string;
    fullPath: string;
    title: string;
    started: string;
    ended: string;
    paths: string[];
}
```

### D4. `webapp/layer1-sessions.ts` — the pane (NEW)

Port mockup:1250-1271.

- Module state: `sessions: WireSession[]` and `selected = new Set<string>()` keyed by `fullPath`
  (a Set of objects would not survive a re-fetch).
- `export async function loadLayer1Sessions(): Promise<void>` — `GET /api/layer1-sessions` with one
  `jsonl=` param per `readSourcePaths(SourceKind.jsonl)` entry. No source paths → empty list, no
  fetch. A failed fetch writes the error into the pane as a `.navempty` row and leaves the timeline
  alone — the session pane is an accessory, never a reason the view cannot draw.
- `export function renderSessionPane(onChange: () => void): void` — one `.session-item` per session:
  `.sname` = `file`, a `.smeta` line = `<date> · N files`, a second `.smeta` = `title`;
  `title` attribute = the mockup's three-part tooltip (mockup:1257-1258).
  Selection rules, exactly the folder tree's: plain click picks one; plain click on the only picked
  one clears it; shift-click toggles that one and keeps the rest. Then `onChange()`.
  `#clear-sessions.disabled = selected.size === 0`; its click clears and calls `onChange()`.
- `export function listSelectedSessions(): WireSession[]`
- `export function listSessionFilterTargets(): string[]` — the UNION of every selected session's
  `paths`; empty array when nothing is selected.

### D5. Combining the two filters

The mockup's rule is `isShown = inSelection(path) && touchedBySelection(path)` (mockup:683) — a file
is drawn only when BOTH pickers admit it. `filterLayer1ViewByTargets(view, targets)` already treats
an empty `targets` as "no filter", so implement the combination as an INTERSECTION of the two target
lists, computed in `webapp/layer1-page.ts`:

```ts
// Empty means "this picker is not filtering", so an empty list contributes nothing and two
// non-empty lists intersect — the mockup's `inSelection && touchedBySelection`.
function intersectFilterTargets(folders: readonly string[], sessions: readonly string[]): string[] {
    if (folders.length === 0) return [...sessions];
    if (sessions.length === 0) return [...folders];
    const bySession = new Set(sessions);
    return folders.filter((path) => bySession.has(path));
}
```

Hold the last folder selection in a module-level `let folderTargets: string[] = []` in
`layer1-page.ts`, set by the File Nav callback. Both the folder callback and the session pane's
`onChange` then call one shared `redrawFilteredStage(view)` that recomputes the intersection, calls
`filterLayer1ViewByTargets`, and calls `renderLayer1Stage`.

`renderLayer1View` gains: after `renderLayer1FileNav(...)`, wire the session pane with that same
callback, then `void loadLayer1Sessions().then(() => renderSessionPane(...))` so the pane fills
without delaying the stage.

Reset `folderTargets` and the session selection at the top of `loadLayer1View`, beside the existing
`#stage` / `#filenav-tree` clears — a filter from the previous project must not survive a new load.

### D6. `webapp/layer1-ranges.ts` — the bar and the wash (NEW)

Port mockup:715-726 and mockup:871-895. This is the only new arithmetic on the page, and it exists
because a session opens and closes BETWEEN events, not on them.

```ts
// Where an ARBITRARY instant sits on an axis built from events. The ruler is capped and floored
// rather than linear in time, so the position has to be interpolated between the two ticks the
// instant falls between (mockup:715-726).
export function resolveAxisPixelsAt(instantMs: number, ticks: readonly WireRulerTick[]): number
```

- Before the first tick → the first tick's `axisPx`. After the last → the last tick's `axisPx`.
- Exact hit → that tick's `axisPx`.
- Otherwise linear interpolation between the bracketing ticks' `axisPx` by the time fraction.

```ts
export function renderSessionRanges(sessions: readonly WireSession[], ticks: readonly WireRulerTick[]): void
```

- Clears `#ranges` and `#washes` first, and returns early when `ticks` is empty.
- Per session, at slot index `i`:
  - BAR: `--axis-px` = `resolveAxisPixelsAt(started)`, `--span-px` = `resolveAxisPixelsAt(ended)` minus
    that, `--slot` = `i`, `title` = `` `${file}\n${started} → ${ended}` ``, class `range`.
  - WASH: the ticks whose instant falls inside `[started, ended]`. **None → no wash, bar only.**
    Otherwise top = first covered tick's `axisPx − RULER_NODE_ROW_PIXELS / 2`; foot = last covered
    tick's `axisPx + (rows at that tick − 1) × RULER_NODE_ROW_PIXELS + RULER_NODE_ROW_PIXELS / 2`.
    Import `RULER_NODE_ROW_PIXELS` from `./layer1-ruler-axis.ts` — do not re-spell 22.
    "rows at that tick" is not on the wire; use `1`, and leave a `ponytail:` comment saying the
    wash's foot is a half-row short on a tick that stacks nodes, and that the fix is to put the row
    count on `WireRulerTick` if the user ever reports it. Everything else in the mockup's geometry
    is reproduced exactly.
- Also add `.inrange` to every `#ruler .tick` whose `data-instants` holds an instant inside any
  selected session's window (mockup:865-867). `layer1-page.ts`'s `renderRulerTicks` must therefore
  write `dataset.instants` — check whether `makeRulerTickClickable` already does; if it does, read
  that, and if not, set it there rather than adding a second attribute.

Call `renderSessionRanges(listSelectedSessions(), view.ruler)` from the END of `renderLayer1Stage`,
after `markMultiEventTicks()` and before `drawLayer1Minimap()` — the wash is measured against the
ruler the stage was just drawn with, and the minimap measures the finished canvas.

### D7. `webapp/layer1-filenav-resize.ts`

Add the horizontal grip between the two panes (`#navpane-grip`), mirroring the existing vertical
`#filenav-grip` logic in that file: drag sets a `--files-share` custom property on `.filenav` that
`#pane-files` / `#pane-sessions` read as their flex-grow (mockup:143-145). Reuse the existing
pointer-capture drag helper in that module rather than writing a second one; if there is no
extractable helper, factor one out and drive both grips from it (coding-requirements §3).

### D8. Tests

`tests/layer1-sessions.test.ts` (happy-dom):
1. Plain click selects one; plain click on the same one again clears it; shift-click on a second
   keeps both.
2. `listSessionFilterTargets()` returns the union of the selected sessions' `paths`, de-duplicated.
3. `#clear-sessions` is disabled at rest, enabled once a session is picked, and clears the set.

`tests/layer1-ranges.test.ts`:
1. `resolveAxisPixelsAt` on an instant exactly halfway between two ticks 100 px apart returns their
   midpoint — proving the interpolation is over the OFFSETS and not over time.
2. An instant before the first tick clamps to the first tick's `axisPx`; after the last clamps to
   the last.
3. `renderSessionRanges` with a session whose window covers no tick appends a `.range` and NO
   `.range-wash`.
4. A covering session's `.range-wash` spans from half a row above the first covered tick to half a
   row below the last.

`tests/layer1-filter.test.ts` — extend with `intersectFilterTargets`: empty + non-empty returns the
non-empty one; two non-empty return only their shared paths.

---

## Definition of done

- `npm run typecheck` is clean and `npm run build:webapp` succeeds. (Running the TEST suite is the
  user's job — do not.)
- `webapp/layer1-page.ts` is still at or under 250 lines after the C6 extraction.
- No `webapp/` file imports from `src/`.
- The mockup is unchanged — it is the reference, not a build output.
