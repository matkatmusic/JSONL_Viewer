# Plan: TASKS.md items 11, 12, 10(a–h)

User-approved 2026-07-08. Constraint from the user: **write tests but do NOT run any tests or
suites** — the user runs them afterward. Stage all changes at the end; do not commit.

Implementation order: Phase 1 (item 11, engine) → Phase 2 (item 12, diagram) →
Phase 3 (item 10 view-model fixes, TDD) → Phase 4 (item 10 CSS/DOM-only fixes) →
Phase 5 (TASKS.md close-outs + staging).

All coding follows `plans/coding-requirements.md` (domain types, vocabulary imports,
verb-named functions) and `~/.claude/guides/tdd.md` (RED tests written first with
plain-English step comments; GREEN code after — but never executed here).

---

## Phase 1 — Item 11: disk-backed sandbox memo

**Behavior (plain English):** the sandbox memo (`sandboxOutcomesByInput`,
`src/reconstruction_script_execution.ts:281`) currently dies with the process, so every
server restart re-pays ~100ms per distinct python run (7.3s cold s84 load). When the viewer
server opts in to persistence with a file path, every newly spawned outcome is saved to that
JSON file, and configuring the same path later seeds the memo from disk so those runs never
spawn again. The engine CLI and tests that never opt in keep today's memory-only behavior —
this keeps existing spawn-counting tests deterministic (a stale disk memo would otherwise
make `test_runScriptAgainstState_memoizes_identical_input` count 0 spawns).

### 1.1 RED tests — `tests/reconstruction_script_execution.test.ts`

Add three tests after the existing memo tests (last is at line 223). Reuse the existing
`collectSandboxSpawnLabels` helper (~line 185) and the temp-dir convention
`mkdtempSync(join(tmpdir(), "reveng-artifact-"))` from `tests/utilities.ts`. Import
`configureSandboxMemoPersistence` alongside `runScriptAgainstState` (import at line 8) and
`Path` from `../src/structures/domain.ts`.

Use a **unique script string per test run** (embed the temp dir path in a python comment,
e.g. `# ${tempDir}`) so a leaked memo entry from another test can never satisfy the lookup.

1. `test_configureSandboxMemoPersistence_writes_new_outcomes_to_disk`
   - Steps (as comments): configure persistence at `<tempdir>/memo.json` (file absent);
     run a script that writes one file; assert exactly 1 spawn label; assert the JSON file
     now exists, parses, and contains exactly one outcome whose `post` object holds the
     script-created file's path and content.
2. `test_configureSandboxMemoPersistence_seeds_memo_from_disk`
   - Steps: configure at file A; run script → 1 spawn (file A written). Configure at a
     different, absent file B → memo replaced with empty; run same script → 1 more spawn.
     Configure back at file A → memo seeded from disk; run same script → **0 new spawns**
     and the returned Map content equals the first run's content.
3. `test_persisted_failure_outcomes_round_trip`
   - Steps: configure at a fresh file; run a script that raises (`raise SystemExit(1)`) →
     1 spawn, result `undefined`; JSON file's single outcome has `post: null`. Configure at
     an absent file (clears memo), then configure back at the same file; run the failing
     script again → 0 new spawns and result is still `undefined` (memoized failure survives
     the round trip, distinguishable from a miss).

Each test ends by calling `configureSandboxMemoPersistence(undefined)` (also do this in a
`finally`-style pattern or `t.after`) so persistence never leaks into other tests.

### 1.2 GREEN — `src/reconstruction_script_execution.ts`

Add below the memo declarations (lines 280-282):

```ts
// Item 11: opt-in disk persistence for the sandbox memo. Only the viewer server configures a
// path (engine CLI + tests stay memory-only, keeping spawn-count tests deterministic). The
// whole memo is rewritten after each new spawn — a spawn costs ~100ms, the write is trivial.
let sandboxMemoFilePath: Path | undefined;

type PersistedSandboxOutcome = { post: Record<string, string> | null };

export function configureSandboxMemoPersistence(filePath: Path | undefined): void {
    sandboxMemoFilePath = filePath;
    sandboxOutcomesByInput.clear();
    if (filePath === undefined) { return; }
    loadSandboxMemoFromDisk(filePath);
}
```

- `loadSandboxMemoFromDisk(filePath: Path)` (not exported): if the file doesn't exist,
  return. Otherwise `JSON.parse(readFileSync(...))` → `Record<string, PersistedSandboxOutcome>`;
  for each entry, `post === null` → `{ post: undefined }`, else
  `{ post: new Map(Object.entries(entry.post)) }`; `set` into `sandboxOutcomesByInput`.
  Wrap the read+parse in try/catch — a corrupt cache file must not kill the server; on
  catch, `console.error` once and continue empty.
- `persistSandboxMemoToDisk()` (not exported): no-op when `sandboxMemoFilePath` is
  undefined. Serialize every memo entry (`post` Map → `Object.fromEntries`, `undefined` →
  `null`), `mkdirSync(dirname, { recursive: true })`, `writeFileSync` the JSON. try/catch
  with `console.error` — persistence failure is tolerable, losing the reconstruction is not.
- In `runScriptAgainstState` (line 316), after `sandboxOutcomesByInput.set(...)` and
  `evictLeastRecentlyUsedEntries(...)`, call `persistSandboxMemoToDisk()` (persisting after
  eviction means the file mirrors the capped memo — the disk file inherits the 256 cap).
- `Path` is already the project's path domain type; `filePath.toString()` (or its raw
  accessor — match how other fs calls consume `Path`) feeds the fs calls.
- File stays under the 250-line cap? Current file is 345 lines — it is already over the cap
  from prior work; add no more than ~45 lines here. If the implementer judges the file too
  large, the extraction target is a new `src/reconstruction_sandbox_memo.ts`, but prefer
  in-place first (no forwarding layers).

### 1.3 Server opt-in — `src/viewer_server.ts`

In the module-level startup block (lines 256-261), before `createServer(...)`:

```ts
configureSandboxMemoPersistence(new Path(join(import.meta.dirname, "..", ".cache", "sandbox-memo.json")));
```

Import `configureSandboxMemoPersistence` and `Path`; `join` from `node:path` may already be
imported. `.cache/` is already gitignored (`.gitignore` lines 74/87) — verify with
`git check-ignore .cache/sandbox-memo.json` before finishing; if it is NOT ignored, add a
`.cache/` entry to the project tail of `.gitignore`.

---

## Phase 2 — Item 12: "Viewer request path" tab in `engine-pipeline-diagrams.html`

Static HTML only — no tests. Mirror tab 4's skeleton exactly (div @495-503, `<pre
class="mermaid">` @503, legend @623). The lazy renderer (`show()` + `rendered` Set,
lines 681-692) needs no changes for a new tab; no DRILL entry (leaf tab).

1. Add a nav button after line 34: `<button data-tab="t5">5 · Viewer request path</button>`.
2. Add `<div class="tab" id="t5">` after t4's closing `</div>` (@624), containing a caption
   paragraph, a `<div class="diagram"><pre class="mermaid">flowchart TD ... </pre></div>`,
   and a legend line (`Run: npx tsx src/viewer_server.ts · open http://127.0.0.1:<port>/`).
3. Diagram content (facts verified against `src/viewer_server.ts` 221-254 and
   `src/viewer_api.ts`):
   - Subgraph **BROWSER** (`webapp/`): `index.html + app.js` node, noting static serving via
     `serveStaticFile` (`/` and `/app/*`, path-escape guard).
   - Subgraph **ROUTES** (`viewer_server.ts handleRequest`): one node per route —
     `POST/GET /api/config`, `GET /api/projects`, `GET /api/document` (+ `progress=1`
     NDJSON), `GET /api/raw`, `GET /api/blob`, `GET /api/diff`, `GET /api/range-patch`;
     a 400 trust-boundary catch node.
   - Subgraph **API** (`viewer_api.ts`): `resolveJsonlPaths` → `loadProjectRecords` →
     `decideDocumentResponse` (consent gate: scripts present + !allowScripts → consent
     payload, no build) → `buildDocumentWithConsent` → `buildProjectDocument`
     (`buildSidecarReader` → `reconstructBranches` → `buildReconstructionDocument`).
   - Subgraph **CACHES**: `parsedRecordsCache` (LRU 8, key = transcript-set stamp; hit
     replays per-record progress and returns the SAME array so engine WeakMap memos stay
     warm) and `builtDocumentCache` (LRU 8, key = `stamp|allowScripts|target`); both bounded
     by `ARTIFACT_CACHE_CAPACITY` via `cache_lru.ts` primitives. Add the sandbox memo node
     (LRU 256, content-keyed, **disk-backed at `.cache/sandbox-memo.json` — item 11**)
     reachable from `buildProjectDocument`.
   - Edges: document/diff/range-patch routes → API chain; raw/blob → their direct reads.
4. Reuse the existing node `style` color conventions from tab 3 (e.g.
   `style ... fill:#ede9fe,stroke:#7c3aed` for cache nodes) so the tab reads as part of the
   same document.

---

## Phase 3 — Item 10 view-model fixes (TDD; tests written, never run)

### 3(f) Persist diff display mode in localStorage

Behavior: the inline/side-by-side toggle (`webapp/views/diff-vs-base.js:114-116`,
module-level `let diffDisplayMode`, explicitly flagged "add localStorage if
reload-stickiness is ever wanted" — it is now wanted) survives reloads.

RED (in `tests/viewer-viewmodels.test.ts`): import `resolveInitialDiffDisplayMode` from
`../webapp/views/diff-vs-base.js`.
- `test_resolveInitialDiffDisplayMode_returns_stored_mode` — passing `"inline"` returns
  `DiffDisplayMode.inline`.
- `test_resolveInitialDiffDisplayMode_defaults_to_split` — `null` and garbage (`"weird"`)
  both return `DiffDisplayMode.split`.

GREEN (`webapp/views/diff-vs-base.js`):
```js
const DIFF_MODE_STORAGE_KEY = "diffDisplayMode";

export function resolveInitialDiffDisplayMode(storedValue) {
    if (storedValue === DiffDisplayMode.inline) { return DiffDisplayMode.inline; }
    return DiffDisplayMode.split;
}

let diffDisplayMode = resolveInitialDiffDisplayMode(readStoredDiffMode());
```
`readStoredDiffMode()` returns `undefined` when `typeof localStorage === "undefined"`
(node test runner has no DOM) else `localStorage.getItem(DIFF_MODE_STORAGE_KEY)`. In the
toggle's onclick (lines 156-166), after flipping the mode, write it back guarded the same
way (`writeStoredDiffMode(mode)` — small named helpers, verbs in names). Export
`DiffDisplayMode` if not already exported so the tests compare enum members, not strings.

### 3(b) Selection drag over timeline background must not close the inspector

Behavior: finishing a text-selection drag over empty timeline background fires a `click` on
the container; today that closes the inspector (`webapp/views/timeline.js:1092-1098`). A
click that ends with a non-collapsed selection is a selection, not a close request.

RED (in `tests/timeline-viewmodels.test.ts`): import `checkSelectionBlocksBackgroundClose`
from `../webapp/views/timeline.js`.
- `test_checkSelectionBlocksBackgroundClose_blocks_when_selection_is_active` — fake
  selection `{ isCollapsed: false }` → `true`.
- `test_checkSelectionBlocksBackgroundClose_allows_plain_clicks` — `{ isCollapsed: true }`
  → `false`; `null` → `false` (browsers may return null).

GREEN (`webapp/views/timeline.js`): export the predicate; in the `container.onclick`
handler add, before the close:
```js
if (checkSelectionBlocksBackgroundClose(window.getSelection())) { return; }
```

### 3(d) Tag unattributed steps with their event kind

Behavior: steps in the `(unattributed)` lane (label `UNATTRIBUTED_SESSION_LABEL`,
`timeline.js:516`; lane header hidden via `styles.css:269`) show only a muted rail dot. Give
each such row an inline `timeline-tag` (same pattern as the "orphaned" tag,
`timeline.js:1062`) naming what the step is: its chips' event kind(s), humanized —
`user-edit` → `user edit`, `script-execution` → `script run`, `write` → `write`, etc.

RED (in `tests/timeline-viewmodels.test.ts`): import `computeUnattributedStepTag`.
- `test_computeUnattributedStepTag_names_a_single_event_kind` — `["user-edit"]` →
  `"user edit"`; `["script-execution"]` → `"script run"`.
- `test_computeUnattributedStepTag_joins_distinct_kinds` — `["user-edit", "user-edit",
  "write"]` → `"user edit · write"` (deduped, insertion order).
- `test_computeUnattributedStepTag_returns_undefined_for_no_kinds` — `[]` → `undefined`.

GREEN (`webapp/views/timeline.js`): export `computeUnattributedStepTag(eventKinds)`:
dedupe via `Set`, map `script-execution` → `script run`, otherwise replace `-` with a
space, join with `" · "`, return `undefined` for empty input. At the row-render site
(rows built at ~995-1075, tags ride `.timeline-row-top` next to the step label): when the
row's session label is `UNATTRIBUTED_SESSION_LABEL`, collect the row's chips' `eventKind`s,
and if the tag text is defined append
`el("span", { class: "timeline-tag", text: tagText, title: "attributed to no session — " + tagText })`.
The `title` doubles as the tooltip the task asked about. Match how the render site actually
exposes the session label + chips when editing (read the surrounding code first — the
grouping variable names near line 995 are authoritative, not this plan).

---

## Phase 4 — Item 10 CSS/DOM-only fixes (no view-model surface → no new tests; this
project's established test boundary is pure functions only)

### 4(a) Keyboard-accessible inspector collapse/reopen rail

Facts: the collapse control IS already a real `<button>` (`inspector.js:273`) but it sets
`.hidden` (`display:none`, `styles.css:143`) — a collapsed inspector leaves NO reopen
affordance at all; `handleInspectorRailClick` (`app.js:351-362`) can never fire on a
`display:none` pane and is dead code.

Fix (same-button toggle keeps keyboard focus on the one control):
- `inspector.js:273`: change the button to toggle a `collapsed` class instead of adding
  `hidden`, flipping its glyph/title: when collapsing → text `«`, title "Expand inspector";
  when expanding → text `»`, title "Collapse inspector". Extract a tiny named handler
  (verb-named, e.g. `toggleInspectorCollapsed(pane, button)`) inside inspector.js.
- `webapp/styles.css`: add, next to the `.inspector-pane` rules (~119-131):
  ```css
  .inspector-pane.collapsed { flex: 0 0 24px; min-width: 24px; padding: 8px 2px; }
  .inspector-pane.collapsed .inspector-content { display: none; }
  .layout.timeline-route .inspector-pane.collapsed { flex: 0 0 24px; }
  ```
  (last rule must appear AFTER the line-128 timeline-route width rule so specificity+order
  beat the `calc(...)` flex-basis; mirrors the Files drawer's 24px rail, `styles.css:100`).
- `app.js`: delete `handleInspectorRailClick` (351-362) and its registration (504) — dead
  code either way once collapse no longer uses `.hidden`. `.hidden` remains in use for the
  background-click close (timeline.js:1096) and route renders; do not touch those.

### 4(c) Wider inspector drawer on the timeline route

`webapp/styles.css:128-130`: change the multiplier `0.4` → `0.5` in
`flex: 0 0 calc((100% - var(--drawer-width)) * 0.4);` and update the adjacent comment
(122-127) if it names the old ratio. One value; conversation text gets ~25% more width.

### 4(e) De-noise `@@` hunk header rows

Keep `computeSplitRows`/`renderInlineDiffLines` emitting hunk rows unchanged (existing
tests at `tests/viewer-viewmodels.test.ts:371-433 assert the row shape — view-model stays
stable; the counters seeded from the header regex still work). Hide the text visually,
keep a separator so skipped-context gaps stay perceptible. Add to `styles.css` near the
diff rules (~234-238):
```css
/* Item 10e: hunk headers read as noise — render them as a thin gap separator instead.
   font-size 0 hides the "@@ -a,b +c,d @@" text; the row itself stays for row structure. */
.diff-line-hunk { font-size: 0; height: 9px; border-bottom: 1px dashed var(--border); margin: 2px 0 4px; }
```
Check for any existing `.diff-line-hunk` rule first and merge rather than duplicate.

### 4(g) Fix the snapshot-drawer 50/50 split

`styles.css:124` — `.inspector-content` is a plain block; two children capped at
`max-height: 50%` don't split reliably without a flex column with a definite height.
Change the snapshot-drawer rules (140-142) to:
```css
.inspector-pane.snapshot-drawer .inspector-content { display: flex; flex-direction: column; }
.inspector-pane.snapshot-drawer .inspector-json { max-height: 50%; overflow-y: auto; flex: 0 1 auto; }
.snapshot-pane { border-top: 1px solid var(--border); overflow-y: auto; flex: 1 1 0; min-height: 0; }
```
(`.snapshot-pane` drops its own `max-height: 50%` in favor of `flex: 1 1 0; min-height: 0`
— it takes the remaining half and scrolls; keep the `.snapshot-pane-header` rule as is.)
Leave the base `.inspector-content` rule (124) untouched — the flex column applies only
when the drawer is open.

### 4(h) Style the [View in File History] button

`webapp/inspector.js:305-315`: the button is appended inside the JSON `<pre>` and inherits
monospace/preformatted context. Add class `snapshot-history-btn` to its `class` list
(keep `row-btn`), and add to `styles.css` (near `.jump-link`, ~268):
```css
/* Item 10h: the history jump button sits inside the JSON <pre>; give it button typography. */
.snapshot-history-btn { display: block; margin: 8px 0 4px; font-family: system-ui, sans-serif; }
```

---

## Phase 5 — Close out TASKS.md and stage

1. `TASKS.md`: mark items 10, 11, 12 `[x]` with dated close notes:
   - 11: disk-backed memo shipped — `configureSandboxMemoPersistence` +
     `.cache/sandbox-memo.json`, viewer-server-only opt-in, 3 tests (not run per user
     instruction).
   - 12: tab 5 "Viewer request path" added to `engine-pipeline-diagrams.html`.
   - 10: all sub-items (a)–(h) shipped in one pass; note the (a) premise correction (no
     pseudo-element existed; the real gap was no reopen affordance) and that (d)'s tag text
     doubles as the tooltip.
2. `git add` every touched file (src, webapp, tests, TASKS.md, engine-pipeline-diagrams.html,
   the plan + implementation-notes files). **Do not commit. Do not run tests.**

## Risks / checks before finishing

- Item 11 load/replace semantics: `configureSandboxMemoPersistence` CLEARS the memo every
  call — that is what makes the seeding test writable without exporting the key function.
- Phase 4(a): grep for other users of `inspector-close` / `.hidden` on the pane
  (`pane.classList`) before editing — `openInspectorPane` recreates content per open; the
  collapsed class must not leak across re-opens (add `collapsed` removal on
  `openInspectorPane` entry if the pane element is reused).
- Phase 3(d): the exact shape of row/chip data at the render site is authoritative; the
  plan's function contract (string[] in, string|undefined out) is fixed, the wiring line
  adapts to the code found there.
