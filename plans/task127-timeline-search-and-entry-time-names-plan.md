# Task 127 — Timeline keyword search + entry-time file names

All work happens in `jfred/` (webapp + tests). Two independent parts; implement Part A first
because Part B's search haystack includes the new `displayPath` field.

**Test execution is deferred to the user** (task instruction: "Don't run any tests or suites").
Still write every test BEFORE its implementation code (RED), then write the implementation
(GREEN). Do not run `npm test`.

---

## Part A — entry-time file names (bug fix)

### Root cause

`recordHistoryRevisions` in `jfred/webapp/views/timeline-changes.ts:48-61` resolves every
revision's `path` to `history.target` — the file's FINAL path — unless the revision itself is
the rename (then `rename.to`). So an s87 entry from before the `inventory.py →
core_inventory.py` rename displays `core_inventory.py`. This is a bug, not a prior decision:
no plan/comment anywhere records "show final name in detail view".

`FileChange.path` is also a LOOKUP KEY (sidebar-entry maps in `details.ts:44`,
`chipLineLocations` keys, `/api/diff` fetches by target). Therefore: **do not change `path`**.
Add a separate display-only field `displayPath` (the name the file had at that revision) and
use it only where a name is shown to the user.

### Step A1 — RED: index carries entry-time paths

In `jfred/tests/timeline-changes.test.ts`, add a test against a literal document (no fixture
file needed):

```ts
test("test_indexRevisionsByChangeId_stamps_entry_time_display_paths", () => {
    // Scenario: a file edited under its original name, then renamed. The revision BEFORE the
    // rename must display the original name; the rename revision displays the new name.
    // Steps:
    // build a one-file document whose history is [edit inventory.py, rename -> core_inventory.py].
    const document = {
        filesTouched: [{
            target: "/repo/core_inventory.py",
            revisions: [
                { kind: "edit", changeId: "c1", timestamp: "t1" },
                { kind: "rename", changeId: "c2", timestamp: "t2", rename: { from: "/repo/inventory.py", to: "/repo/core_inventory.py" } },
            ],
        }],
        rewoundFilesTouched: [], messages: [], steps: [], commitMarkers: [],
    };
    const index = indexRevisionsByChangeId(document as WireTimelineDocument);
    // the pre-rename revision displays the name the file had THEN...
    assert.equal(index.get("c1")!.displayPath, "/repo/inventory.py");
    // ...while its lookup path stays the final target.
    assert.equal(index.get("c1")!.path, "/repo/core_inventory.py");
    // the rename revision displays the post-rename name (unchanged behavior).
    assert.equal(index.get("c2")!.displayPath, "/repo/core_inventory.py");
});
```

Add a second, separate test asserting `deriveFileChanges` copies `displayPath` onto the chip
(resolve a step whose `changeIds` is `["c1"]` through the same index and assert
`changes[0].displayPath === "/repo/inventory.py"`), and that a `changedPaths`-fallback chip
gets `displayPath === path`.

### Step A2 — GREEN: compute and carry `displayPath`

1. `jfred/webapp/views/timeline-types.ts`:
   - `RevisionIndexEntry` gains `displayPath: string;`
   - `FileChange` gains `displayPath: string;` (comment: entry-time name for display only —
     `path` stays the lookup/fetch key).
2. `jfred/webapp/views/timeline-changes.ts` — add above `recordHistoryRevisions`:

```ts
// Entry-time path per revision: walk backward from the final target, stepping each rename's
// `from` across it, so revisions before a rename display the name the file had at that time.
function computeEntryTimePaths(history: WireFileHistory): string[] {
    const entryTimePaths = new Array<string>(history.revisions.length);
    let currentPath = history.target;
    for (let index = history.revisions.length - 1; index >= 0; index -= 1) {
        entryTimePaths[index] = currentPath;
        const rename = history.revisions[index]!.rename;
        if (rename !== undefined) {
            currentPath = rename.from;
        }
    }
    return entryTimePaths;
}
```

3. In `recordHistoryRevisions`, call `computeEntryTimePaths(history)` once before the
   `forEach`, and set `displayPath: entryTimePaths[position]!` on the index entry. Leave the
   existing `path` line untouched.
4. In `deriveFileChanges`, copy `displayPath: revision.displayPath` onto the resolved chip;
   the `changedPaths` fallback push sets `displayPath: path`.
5. `jfred/webapp/views/details-revision-view.ts:129-136` (`showCardDiff`): the synthesized
   `FileChange` gains `displayPath: target` (this site builds its own `${target} — revision
   #n` label and never displays the change's path, so `target` is correct and sufficient
   to compile).
6. Chase the remaining compile errors: every `FileChange` literal in
   `tests/timeline-labels-pills.test.ts`, `tests/timeline-filter-model.test.ts`,
   `tests/timeline-sessions.test.ts`, `tests/timeline-labels-tags.test.ts`, and
   `tests/details-revision-view.test.ts` gains `displayPath` mirroring its `path`. Confirm
   with `npx tsc --noEmit` in `jfred/` (typecheck only — not a test suite).

### Step A3 — display sites switch to `displayPath`

1. `jfred/webapp/views/timeline-render-chips.ts:48-50` (`renderFileChip`): both label branches
   use `computeBaseName(change.displayPath)` instead of `change.path`.
2. `jfred/webapp/views/details.ts`:
   - `buildTouchedFileEntries`: keep the maps keyed by `change.path` (dedupe by real file),
     but the stored entry's visible `target` becomes the entry-time name — for the `known`
     branch store `{ ...known, target: change.displayPath }` (it's already copied at line 61,
     but the target override must happen at `set` time so `entriesByTarget`'s value carries
     it); for the fallback branch set `target: change.displayPath`.
   - `appendFileList`: the tree's `onFileClick` passes back `entry.target`, so key
     `changeByPath` by `change.displayPath` (must match what the tree displays/clicks). The
     inner `showFileDiff` keeps fetching by `change.path` — unchanged.
3. `jfred/webapp/views/details-diff.ts:206,209` (`showRevisionDiffInDetails`): the two pane
   labels become `change.displayPath` (`showTextInDetails(change.displayPath, …)`,
   `showDiffInDetails(change.displayPath, …)`).

Do not touch `computeSnapshotJumpRoute`, `chipLineLocations`, or any `/api` fetch — all keyed
by `path`.

---

## Part B — timeline keyword search

### Placement and behavior

A native `<input type="search">` rendered as the FIRST child of `#timeline-filter-bar`
(left of the mode buttons — "left of the filter chips in the timeline header"). Typing
filters rows live: a row stays visible iff it passes BOTH the active mode button AND the
search term. Clearing the input restores the mode-only view. Navigation already rebuilds the
bar (state is per-render), so the term resets on route change exactly like the mode does.

Session-end rows: the mode filter keeps them always-visible (they anchor sessions), but the
search HIDES non-matching ones — the task says "non-matching entries hidden", and a
session-end row carries no text to match.

### Step B1 — RED: pure predicate tests

Append to `jfred/tests/timeline-filter-model.test.ts` (reuse its existing fixture nodes;
every `FileChange` literal there now carries `displayPath` from step A2.5). One behavior per
test:

- `test_checkNodeMatchesSearchTerm_empty_term_matches_every_node` — `""` and `"   "` return
  true for `userTurn` and `commitNode`.
- `test_checkNodeMatchesSearchTerm_matches_turn_text_case_insensitively` — `userTurn` (text
  `"hi"`) matches `"HI"`, does not match `"inventory"`.
- `test_checkNodeMatchesSearchTerm_matches_tool_call_summary_and_name` — a `ToolCallNode`
  with `toolName: "Bash"`, `summary: "git mv inventory.py core_inventory.py"` matches
  `"bash"` and `"git mv"`.
- `test_checkNodeMatchesSearchTerm_matches_commit_detail` — a `CommitNode` with
  `detail: "wip"` matches `"wip"`.
- `test_checkNodeMatchesSearchTerm_matches_file_chip_paths` — the driving use case: an agent
  turn whose `fileChanges` has `path: "/repo/core_inventory.py"`,
  `displayPath: "/repo/inventory.py"`, `renamedFrom: "/repo/inventory.py"` matches
  `"inventory"`; a turn with no chips does not.
- `test_checkNodePassesFilters_requires_both_mode_and_term` — the file-chip agent turn passes
  (`files` mode, `"inventory"`); fails (`git` mode, `"inventory"`); fails (`files` mode,
  `"zzz"`).
- `test_checkNodeMatchesSearchTerm_hides_session_end_rows` — a `SessionEndNode` does not
  match `"inventory"` (no session-end exemption, unlike the mode predicate).

### Step B2 — GREEN: implement in `timeline-filter-model.ts`

```ts
// Everything a row can visibly say, lowercased once: turn text, tool name/summary, commit
// detail + hash, and each file chip's names (final, entry-time, renamed-from).
function computeNodeSearchHaystack(node: TimelineNode): string {
    const parts: string[] = [];
    if (node.text !== undefined) {
        parts.push(node.text);
    }
    if (node.summary !== undefined) {
        parts.push(node.toolName ?? "", node.summary);
    }
    if (node.detail !== undefined) {
        parts.push(node.detail);
    }
    if (node.resultHash !== undefined) {
        parts.push(node.resultHash);
    }
    for (const change of node.fileChanges ?? []) {
        parts.push(change.path, change.displayPath, change.renamedFrom ?? "");
    }
    return parts.join("\n").toLowerCase();
}

// The search predicate: does `node` stay visible under `term`? Blank matches everything;
// otherwise a case-insensitive substring test over the node's visible text.
export function checkNodeMatchesSearchTerm(node: TimelineNode, term: string): boolean {
    const normalizedTerm = term.trim().toLowerCase();
    if (normalizedTerm === "") {
        return true;
    }
    return computeNodeSearchHaystack(node).includes(normalizedTerm);
}

// A row stays visible iff it passes BOTH the active mode button and the search term.
export function checkNodePassesFilters(node: TimelineNode, mode: TimelineFilterMode, term: string): boolean {
    if (!checkNodeMatchesFilterMode(node, mode)) {
        return false;
    }
    return checkNodeMatchesSearchTerm(node, term);
}
```

### Step B3 — DOM wiring in `timeline-render-filterbar.ts`

Rework `renderTimelineFilterBar` to hold `{ mode, term }` closure state; both the buttons and
the input route through one apply function:

```ts
// Hide every row failing the combined mode+search predicate; restore the rest.
function applyTimelineFilters(context: TimelineRenderContext, mode: TimelineFilterMode, term: string): void {
    for (const [index, node] of context.nodes.entries()) {
        const row = context.nodeRows.get(index);
        if (row === undefined) {
            continue;
        }
        row.classList.toggle(FILTERED_OUT_ROW_CLASS, !checkNodePassesFilters(node, mode, term));
    }
}
```

In `renderTimelineFilterBar`: `let activeMode = TIMELINE_FILTER_MODES.all;` and
`let searchTerm = "";`. Button `onclick` sets `activeMode` then calls
`applyTimelineFilters(context, activeMode, searchTerm)` (replaces the old
`applyTimelineFilterMode` call — delete that function). Build the input:

```ts
const searchInput = el("input", { class: "timeline-search", type: "search", placeholder: "🔍 search" }) as HTMLInputElement;
searchInput.oninput = () => {
    searchTerm = searchInput.value;
    applyTimelineFilters(context, activeMode, searchTerm);
};
```

`bar.replaceChildren(searchInput, ...buttons);` — input first = left of the chips.

### Step B4 — CSS

`.filter-bar input` (styles.css:875) already styles it (mono font, control colors). Add one
rule next to the `#timeline-filter-bar` block (styles.css:1048):

```css
/* task 127: two ~9-letter words + the 🔍 emoji wide */
.timeline-search { width: 20ch; }
```

---

## Part C — find widget in the detail view's header row (user addition, mid-task)

An editor-style find tool for the file contents shown in the details pane's right column:
an input, an `n/N` match counter, and `<` / `>` buttons that jump the view between matches.
It searches whatever `#details-right-body` currently shows (revision content, diff, fallback
text) and lives in `#details-right-header`, between `#details-right-label` and
`#diff-mode-toggle` (`jfred/webapp/index.html:50-55`).

Highlighting uses the native CSS Custom Highlight API (`CSS.highlights` +
`::highlight(...)`) — no DOM mutation, so it works over hljs-highlighted content and diff
grids without touching their markup. Matches are found by walking `#details-right-body`'s
text nodes with a `TreeWalker`; the match-finding itself is pure and tested.

### Step C1 — RED: pure model tests

New file `jfred/tests/details-find-model.test.ts`, one behavior per test, literal fixtures:

- `test_findMatchesInTextNodeValues_blank_term_finds_nothing` — `""` and `"  "` over
  `["def restock():"]` return `[]`.
- `test_findMatchesInTextNodeValues_matches_case_insensitively_with_offsets` —
  `"INVENTORY"` over `["import inventory", "x = 1"]` returns
  `[{ nodeIndex: 0, start: 7, end: 16 }]`.
- `test_findMatchesInTextNodeValues_finds_every_occurrence_in_one_value` — `"in"` over
  `["in in"]` returns two matches (starts 0 and 3).
- `test_computeWrappedMatchIndex_wraps_both_directions` — `(2, 3, +1) → 0`,
  `(0, 3, -1) → 2`, `(0, 0, +1) → -1`.
- `test_computeMatchCounterLabel_formats_n_of_N` — `(-1, 0) → "0/0"`, `(2, 7) → "3/7"`
  (display is 1-based, state is 0-based).

### Step C2 — GREEN: pure model

New file `jfred/webapp/views/details-find-model.ts` (DOM-free, same split convention as
`timeline-filter-model.ts`):

```ts
// One find-widget match inside the details right pane's text: which text node (in TreeWalker
// document order) and the [start, end) character span inside its value.
export type TextNodeMatch = { nodeIndex: number; start: number; end: number };

// Every case-insensitive occurrence of `term` across the pane's text-node values, in document
// order. Blank terms match nothing (the widget's idle state).
// ponytail: a match spanning two text nodes (e.g. across hljs spans) is not found; rebuild
// over concatenated values with a node-offset map if that ever matters.
export function findMatchesInTextNodeValues(values: string[], term: string): TextNodeMatch[] {
    const normalizedTerm = term.trim().toLowerCase();
    if (normalizedTerm === "") {
        return [];
    }
    const matches: TextNodeMatch[] = [];
    for (const [nodeIndex, value] of values.entries()) {
        const lowerValue = value.toLowerCase();
        let searchFrom = 0;
        while (true) {
            const start = lowerValue.indexOf(normalizedTerm, searchFrom);
            if (start === -1) {
                break;
            }
            matches.push({ nodeIndex, start, end: start + normalizedTerm.length });
            searchFrom = start + normalizedTerm.length;
        }
    }
    return matches;
}

// The next current-match index after stepping `delta` (+1 next / -1 prev), wrapping at both
// ends; -1 when there are no matches.
export function computeWrappedMatchIndex(current: number, total: number, delta: number): number {
    if (total === 0) {
        return -1;
    }
    return (((current + delta) % total) + total) % total;
}

// The widget's "n/N" counter text (1-based for display; current is the 0-based state, -1 = none).
export function computeMatchCounterLabel(current: number, total: number): string {
    if (total === 0) {
        return "0/0";
    }
    return `${current + 1}/${total}`;
}
```

### Step C3 — DOM widget

1. `jfred/webapp/index.html`: between `#details-right-label` and `#diff-mode-toggle` insert:

```html
<span id="details-find">
    <input id="details-find-input" type="search" placeholder="🔍 find">
    <span id="details-find-count">0/0</span>
    <button id="details-find-prev" title="Previous match">&lt;</button>
    <button id="details-find-next" title="Next match">&gt;</button>
</span>
```

2. New file `jfred/webapp/views/details-find.ts` — module-local state
   `let matchRanges: Range[] = [];` and `let currentMatchIndex = -1;`, plus:
   - `collectPaneTextNodes(): Text[]` — `document.createTreeWalker(rightBody,
     NodeFilter.SHOW_TEXT)` over `#details-right-body`, collected in order.
   - `applyFindHighlights(): void` — registers `CSS.highlights.set("details-find",
     new Highlight(...matchRanges))` and `"details-find-current"` with only
     `matchRanges[currentMatchIndex]`; guarded by `if (CSS.highlights === undefined) return;`
     (counter + scroll still work without the API).
   - `runDetailsFind(term: string): void` — collect text nodes, call
     `findMatchesInTextNodeValues(nodes.map((n) => n.data), term)`, build one `Range` per
     match (`range.setStart(nodes[m.nodeIndex]!, m.start)` / `setEnd(..., m.end)`), set
     `currentMatchIndex` to 0 when matches exist else -1, then
     `updateFindCounterAndScroll()`.
   - `stepDetailsFind(delta: number): void` — `currentMatchIndex =
     computeWrappedMatchIndex(currentMatchIndex, matchRanges.length, delta)`, then
     `updateFindCounterAndScroll()`.
   - `updateFindCounterAndScroll(): void` — counter text from `computeMatchCounterLabel`,
     re-`applyFindHighlights()`, and scroll the current match into view:
     `(matchRanges[currentMatchIndex]!.startContainer.parentElement)?.scrollIntoView({
     block: "nearest" })`.
   - `resetDetailsFind(): void` (exported) — clear both highlight registrations, empty
     `matchRanges`, `currentMatchIndex = -1`, counter "0/0". The input's text is kept so
     Enter re-runs the search against newly shown content.
   - `initDetailsFind(): void` (exported) — wires `#details-find-input` `oninput` →
     `runDetailsFind(value)`; `onkeydown` Enter → `stepDetailsFind(+1)`, Shift+Enter →
     `stepDetailsFind(-1)` (re-running the search first when `matchRanges` is empty);
     `<` / `>` buttons → `stepDetailsFind(∓1)`.
3. `jfred/webapp/app.ts` bootstrap block (`app.ts:63-80`): add `initDetailsFind();` next to
   the other one-time chrome wiring.
4. `jfred/webapp/views/details-diff.ts` `clearRightPaneBody()` (line 42): call
   `resetDetailsFind()` before `body.replaceChildren()` — the single choke point every
   right-pane render routes through, so stale `Range`s never survive a re-render.

### Step C4 — CSS

Next to the `#details-right-header` block (styles.css:584):

```css
/* task 127: the right pane's find widget (input + n/N + prev/next) */
#details-find { display: inline-flex; gap: 4px; align-items: center; margin-left: auto; }
#details-find input { width: 14ch; }
#details-find button { cursor: pointer; }
#details-find-count { color: var(--muted); font-size: 11px; }
::highlight(details-find) { background: #7c6f2a; }
::highlight(details-find-current) { background: #c9a227; color: #000; }
```

(`#details-find input`/buttons inherit the pane's control styling where `.filter-bar` rules
don't reach; if the header's flex layout already right-aligns the toggle via `margin-left:
auto` on `#diff-mode-toggle`, drop the widget's own `margin-left: auto` so it sits between
label and toggle — check styles.css:584-599 at implementation time.)

---

## Verification (no test runs — user's job)

1. `npx tsc --noEmit` in `jfred/` compiles clean (typecheck only).
2. Self-review: every `FileChange` construction site sets `displayPath`; no `/api` call or
   map key switched off `path`.
3. Stage everything in `jfred/`; do not commit. Leave `tasks.json` untouched — task 127
   closes after the user runs the suite and commits.

## Out of scope

- Searching transcript/inspector text not on the row (script code bodies, raw JSONL).
- Persisting the term across navigation (matches the mode buttons' per-render reset).
- The Files sidebar tree (whole-project view) — it correctly shows final names with
  rename badges; only the per-entry chip/detail displays change.
