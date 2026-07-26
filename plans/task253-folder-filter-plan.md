# Task 253 — Layer 1 View: clicking a folder in File Nav filters the timeline to that folder's files

Repo: `jfred` (submodule of RevEng). All paths below are relative to `jfred/`.

## What must be true when this is done

1. Clicking a folder row in the Layer 1 File Nav pane makes the stage show only the
   bubbles/bucket rows for files at or below that folder, including nested subfolders.
2. The ruler is **recomputed over the filtered set** — the filtered view's first instant sits at
   `axisPx` 0 and the canvas is only as tall as the selected files' timestamp range. Leaving the
   full-project offsets in place is a failure.
3. Clicking the already-selected folder again restores the unfiltered view.
4. The folder's native `<details>` expand/collapse still works on the same click.
5. The File Nav itself keeps listing **every** file while a filter is active — it is the control
   surface for changing or clearing the filter, so it must not be re-rendered from the filtered set.
6. The two existing callers of `renderFileTreeNode` — `webapp/views/timeline.ts:211` and
   `webapp/views/details.ts:130` — are unchanged in behaviour and still typecheck.

## Architecture decision, and why

The page cannot reuse the server's `axisPx` values under a filter: `src/layer1_ruler_axis.ts`
**accumulates** gaps, so dropping instants changes every later offset. The layout must be re-run
client-side.

`layOutNodeLadders` is pure (its only import is `type Instant`, and `Instant = Date`). Rather than
copy ~60 lines of gap arithmetic into `webapp/` — where it would silently drift out of sync with
the server's ruler and produce a filtered view that disagrees with the unfiltered one — **move the
module into `webapp/` and have the server import it back**. The server already runs under `tsx`,
which resolves `../webapp/*.ts` at runtime, and root `tsconfig.json` is `noEmit` over both `src` and
`webapp`, so the cross-import typechecks. `tsconfig.webapp.json` has `rootDir: "webapp"`, which is
why the moved file must become self-contained (step 1).

The dependency direction (`src/` → `webapp/`) is inverted relative to the rest of the tree. That is
accepted deliberately: the alternative is two copies of the one algorithm whose whole job is to make
the server and the page agree on where a node sits.

Module graph after this work (no cycles):

```
layer1-page.ts ──► layer1-filenav.ts ──► views/sidebar.ts
      │                                        ▲
      ├──────────► layer1-filter.ts ───────────┘ (no edge; drawn only to show sidebar is a leaf)
      │                  └──► layer1-ruler-axis.ts   ◄── src/viewer_api_layer1.ts
      └──────────► layer1-wire.ts  ◄── layer1-filter.ts
```

`layer1-filter.ts` never imports `layer1-page.ts`. The page injects a callback into
`renderLayer1FileNav`, so the filter code never has to reach back up for a re-render function.

---

## Step 0 — line-cap budget (do this first, it decides step 5's shape)

`webapp/layer1-page.ts` is at **243 lines** against the project's 250-line cap. Step 3 moves ~28
lines of `Wire*` interfaces out of it and step 5 adds ~6, so it lands near 220. Confirm with
`wc -l` after step 5. If any file in this plan crosses 250, split it — never condense comments.

---

## Step 1 — move the ruler axis module into `webapp/`

**1a.** `git mv src/layer1_ruler_axis.ts webapp/layer1-ruler-axis.ts`
(kebab-case: every file already in `webapp/` uses it.)

**1b.** In the moved file, delete `import type { Instant } from "./layered_types.ts";` and declare
the alias locally, with a comment naming why:

```ts
// `Instant` is `Date` (src/layered_types.ts:13). Re-declared rather than imported because
// tsconfig.webapp.json's rootDir is "webapp": a src/ import — even a type-only one — puts a file
// outside the rootDir into the emitting program and tsc rejects it.
type Instant = Date;
```

Keep it unexported unless a consumer needs it; `NodeLadder` and `RulerPosition` already carry it
outward structurally.

**1c.** Update the three importers. Their symbol lists do not change, only the path:
- `src/viewer_api_layer1.ts:11` → `from "../webapp/layer1-ruler-axis.ts"`
- `src/viewer_api_layered.ts:7` → `from "../webapp/layer1-ruler-axis.ts"`
- `tests/layer1_ruler_axis.test.ts:22` → `from "../webapp/layer1-ruler-axis.ts"`

**1d.** Rename the test file to match its subject: `git mv tests/layer1_ruler_axis.test.ts
tests/layer1-ruler-axis.test.ts`. The Stop hook enforces `tests/<module>.test.ts` naming.

**1e.** Add a paragraph to the moved file's header comment recording that it is now shared:

```
// This module lives in webapp/ rather than src/ because BOTH the endpoint (src/viewer_api_layer1.ts)
// and the page (webapp/layer1-filter.ts, task 253) must lay instants out identically — a folder
// filter re-runs this layout over the surviving instants client-side, and a second copy of the gap
// arithmetic would let the filtered ruler drift from the one the server shipped.
```

**Verify:** `npm run typecheck` and `npm run build:webapp` both clean. No behaviour changed yet.

---

## Step 2 — RED: tests for the filter + re-layout (`tests/layer1-filter.test.ts`)

Write these before any of step 4. They import `../webapp/layer1-filter.ts`, which does not exist
yet, so every test fails at import — that is the RED state.

None of these need a DOM: the functions under test are pure view → view transforms.

**Fixture.** Hand-build one `WireLayer1View` covering all three record kinds across two folders, and
compute its `axisPx` values by calling the shared `layOutNodeLadders` directly, exactly as
`src/viewer_api_layer1.ts:183-201` does — so the fixture *is* what the endpoint would have shipped,
not a guess. Put it in the test file (it is used by one test file only; `tests/fixtures.ts` is for
data shared across files).

```ts
// Two folders under one shared prefix so buildFileTree's prefix strip cannot collapse the tree to
// bare leaves, and so a filter has something to exclude.
//   src/keep/a.ts   — pair, 2 commits + on disk
//   src/keep/b.ts   — pair, 1 commit + on disk
//   src/drop/c.ts   — pair, 1 commit + on disk
//   src/drop/gone.ts — git orphan
//   src/keep/extra.ts — disk orphan
```

Tests:

- `test_filtering_to_a_folder_keeps_only_that_folders_pairs`
  Filter to the `src/keep/` targets; assert `pairs` holds exactly `a.ts` and `b.ts`, and that
  `gitOrphans` is empty (its only member is under `src/drop/`) while `diskOrphans` still holds
  `extra.ts`. Proves requirement 1 for all three record kinds.

- `test_filtering_keeps_files_in_nested_subfolders`
  Add `src/keep/deep/d.ts` to the fixture's pairs; filter on the `src/keep/` target set (which
  includes it, because the caller collects descendant leaves) and assert it survives.

- `test_the_filtered_ruler_holds_only_the_surviving_instants`
  Assert the filtered `ruler` length equals the number of distinct instants across the surviving
  records, and that no instant belonging solely to `src/drop/` appears.

- `test_the_filtered_ruler_starts_at_zero`
  Assert `filtered.ruler[0].axisPx === 0` even when the dropped files owned the earliest instant.
  This is the "resize to the selected range" requirement — if the code reused the server's offsets
  this assertion is what fails.

- `test_the_filtered_ruler_is_shorter_than_the_full_ruler`
  Assert `last(filtered.ruler).axisPx < last(full.ruler).axisPx`. Guards the canvas height half of
  requirement 2 (the width half falls out of rendering fewer bubbles and needs no assertion here).

- `test_a_filtered_pair_keeps_its_instants_and_takes_new_offsets`
  Assert the surviving pair's commit `instant` strings are untouched and its `axisPx` values differ
  from the full view's. Proves the re-layout re-stamps rather than re-times.

- `test_two_nodes_of_one_pair_at_the_same_instant_still_take_different_rows`
  Give one fixture pair a commit whose instant equals its `onDisk` instant; assert the two `axisPx`
  values differ by `RULER_NODE_ROW_PIXELS`. Proves the ladder order and per-ladder row slotting
  survived the wire round-trip (`ladderOffsetsPx` is positional — a set/Map here would break it).

- `test_an_empty_selection_reproduces_the_servers_own_layout`
  Filter with an empty target list and assert the result is deep-equal to the full fixture view.
  This is both the toggle-off behaviour (requirement 3) and the drift guard: the page's re-layout of
  the unfiltered set must land on exactly the offsets the endpoint shipped.

---

## Step 3 — extract the wire types (`webapp/layer1-wire.ts`)

`layer1-filter.ts` and `layer1-page.ts` both need `WireLayer1View`. The page cannot export it to the
filter module (the page imports the filter module), so it moves to a module both can import.

Cut `WireInstant`, `WireCommit`, `WirePair`, `WireOrphan` and `WireLayer1View` verbatim out of
`webapp/layer1-page.ts:26-52` — comments included — into `webapp/layer1-wire.ts`, `export`ed, and
import them back into `layer1-page.ts`. Keep the existing header comment explaining that these are
`JSON.parse` shapes (`Path` as string, `Instant` as ISO text) and not `src/viewer_api_layer1.ts`'s
`Layer1Wire*` types.

Do **not** touch `webapp/layer1-filenav.ts`'s structural `FileNavView`. It is deliberately narrower
than `WireLayer1View`, and `tests/layer1-filenav.test.ts`'s `NAV_VIEW` fixture omits `instant`,
`axisPx`, `onDisk` and `ruler` — widening the parameter type would break `npm run typecheck`.

**Verify:** `npm run typecheck` clean; `wc -l webapp/layer1-page.ts` now ~215.

---

## Step 4 — GREEN: `webapp/layer1-filter.ts`

Two exported pure functions. Both take and return `WireLayer1View`, so the page's existing render
path consumes the result unchanged.

**4a. `filterLayer1ViewByTargets(view: WireLayer1View, targets: readonly string[]): WireLayer1View`**

- An empty `targets` returns the *re-laid-out* full view (not `view` itself) — one code path, and
  the round-trip is what `test_an_empty_selection_reproduces_the_servers_own_layout` pins.
- Otherwise build a `Set` of targets and keep `pairs`/`gitOrphans`/`diskOrphans` whose `path` is in
  it. **Exact membership, never a prefix test on the path string** — the caller already resolved the
  folder to its descendant leaves, and a `startsWith` here would make `src/drop` match
  `src/dropped.ts` (the same class of bug task 278 fixed in the find-file box).
- Hand the survivors to `relayOutLayer1View`.

**4b. `relayOutLayer1View(view: WireLayer1View): WireLayer1View`**

Mirror `src/viewer_api_layer1.ts:183-201` over wire types. The ladder order is load-bearing —
`ladderOffsetsPx` comes back parallel to what went in, by outer *and* inner index:

```ts
// Pair ladders FIRST and in `pairs` order, each = every commit oldest-first then the on-disk node,
// so ladderOffsetsPx[i] is pair i's own rows and its last entry is that pair's on-disk node. Each
// orphan follows as a ONE-node ladder: a bucket row flows inside its bucket rather than being
// pinned to the axis, so it must bound the ruler without being charged a stacked row.
const pairLadders = view.pairs.map((pair) =>
    [...pair.commits.map((commit) => commit.instant), pair.onDisk.instant].map(readWireInstant));
const layout = layOutNodeLadders([
    ...pairLadders,
    ...view.gitOrphans.map((orphan) => [readWireInstant(orphan.instant)]),
    ...view.diskOrphans.map((orphan) => [readWireInstant(orphan.instant)]),
]);
```

- `readWireInstant(text: string): Date` — the one place ISO text becomes a `Date`, so the
  string→object hydration has a single home (coding-requirements §1, "parsing hydrates").
- Re-stamp each pair positionally: `commits[n].axisPx = ladderOffsetsPx[pairIndex][n]`,
  `onDisk.axisPx = ladderOffsetsPx[pairIndex].at(-1)`.
- Orphans read the **tick** offset for their instant, not a node row — build
  `new Map(layout.ticks.map((tick) => [tick.instant.getTime(), tick.offsetPx]))` and look up.
  Throw on a miss with the instant in the message, as `placeInstantOnAxis` does; every instant here
  was part of the layout's own input, so a miss is a bug in this module, not bad input.
- `ruler` becomes `layout.ticks.map((tick) => ({ instant: tick.instant.toISOString(), axisPx: tick.offsetPx }))`.
  **Trap:** the wire carries `instant` as a string, and the fixture in step 2 must therefore compare
  against `toISOString()` output, not against the original literal, unless the fixture's literals are
  already in that exact form. Write the fixture's instants as full ISO-8601 UTC strings
  (`"2026-07-01T10:00:00.000Z"`) so the round-trip is byte-identical and the deep-equal test in
  step 2 is meaningful.
- Do not mutate `view` or anything reachable from it — return fresh objects. The page holds the full
  view in a closure and re-filters from it on every folder click; mutating would corrupt the second
  click.

Run `tests/layer1-filter.test.ts` — all green.

---

## Step 5 — RED then GREEN: the folder click

### 5a. RED — `tests/layer1-folder-filter.test.ts`

Uses `setupLayer1Dom()` from `tests/webapp-dom-test-helpers.ts` (`el()` needs a document), and
renders through `renderFileNavInto` from `webapp/layer1-filenav.ts` with a spy callback, following
`tests/layer1-filenav.test.ts`'s `renderNavIntoNewContainer` pattern.

- `test_clicking_a_folder_reports_every_file_at_or_below_it`
  Render a nav whose fixture has `src/keep/a.ts`, `src/keep/deep/d.ts` and `src/drop/c.ts`; click
  the `keep` summary; assert the spy received exactly the two `keep` targets, sorted-compared.
  Nested inclusion is the point of this test.

- `test_clicking_a_folder_leaves_the_native_details_toggle_working`
  Assert the click handler did not call `preventDefault` — simplest observable form: dispatch a
  cancelable `MouseEvent` on the summary and assert `event.defaultPrevented === false` after
  dispatch.

- `test_clicking_the_selected_folder_again_reports_an_empty_selection`
  Click the same summary twice; assert the spy's second call received `[]`. That empty array is what
  `filterLayer1ViewByTargets` reads as "no filter".

- `test_selecting_a_folder_marks_only_that_row_selected`
  Click `keep`, then `drop`; assert exactly one `.selected` element exists in the container and it
  is the `drop` summary. Guards the shared-selection change in 5b.

### 5b. GREEN — `webapp/views/sidebar.ts`

- Widen the callbacks type; optional so the two existing callers compile untouched:

```ts
export type FileTreeCallbacks = {
    onFileClick: (target: string) => void;
    // task 253: a folder click hands over the full paths of every LEAF at or below it, rather than
    // the folder's own path — buildFileTree strips the common prefix and folder nodes carry no path,
    // so descendant targets are the only full paths the tree actually holds. Optional: the Files
    // sidebar (views/timeline.ts) and the details pane (views/details.ts) have no folder behaviour.
    onFolderClick?: (targets: string[]) => void;
};
```

- Add a module-level helper beside `renderFileTreeNode`:

```ts
// Every file leaf at or below `node`, as full paths.
function listDescendantTargets(node: FileTreeNode): string[] {
    if (node.entry !== undefined) {
        return [node.entry.target];
    }
    return node.children.flatMap(listDescendantTargets);
}
```

  Branch on `node.entry !== undefined` rather than on `kind`, per
  `~/.claude/guides/single-condition-branching.md`: `entry` is what the leaf renderer actually
  requires (`node.entry!` at sidebar.ts:120), so the two stay in step.

- Add `const SELECTED_CLASS = "selected";` beside the existing `FOLDER_NODE_KIND` constant and use
  it in the three places the literal now appears (`clearFileSelectionIn`'s selector,
  `renderFileTreeLeaf`'s `classList.add`, and the new folder handler) — a class name shared by two
  renderers and a query selector is exactly the repeated constant coding-requirements §3 names.

- In `renderFileTreeNode`'s folder branch the `<summary>` is currently built inline inside the
  `<details>` child array. Hoist it to a `const summary = el("summary", ...)` so the listener can be
  attached, then pass the variable into the array. Attach the listener **only when the callback is
  present**, and do not call `preventDefault` or `stopPropagation` — the native `<details>` toggle is
  a default action on `<summary>` and requirement 4 keeps it:

```ts
// No preventDefault: the <details> open/close is this same click's default action and must survive.
// Toggling off is read from the DOM rather than held in a module variable — the summary's own
// `selected` class already is the state, and it is cleared with every other selection below.
if (callbacks.onFolderClick !== undefined) {
    summary.addEventListener("click", () => {
        const wasSelected = summary.classList.contains(SELECTED_CLASS);
        clearFileSelectionIn(selectionRoot);
        summary.classList.toggle(SELECTED_CLASS, !wasSelected);
        callbacks.onFolderClick!(wasSelected ? [] : listDescendantTargets(node));
    });
}
```

- `clearFileSelectionIn` currently queries `.file-item.selected`. Change the selector to `.selected`
  so one call clears whichever kind of row was marked. Safe for the two existing callers: their
  trees contain no other `.selected` elements. Record that in the function's comment.

### 5c. GREEN — `webapp/layer1-filenav.ts`

Give `renderFileNavInto` and `renderLayer1FileNav` a second parameter:

```ts
onFolderSelect: (targets: string[]) => void
```

and pass it through as `onFolderClick`. Keep `onFileClick: jumpToBubbleAtPath` unchanged.
`FileNavView` stays as-is (step 3's note).

### 5d. GREEN — `webapp/layer1-page.ts`

Split the existing `renderLayer1View` in two. The stage half becomes exported so the filter can
redraw it *without* redrawing the File Nav — re-rendering the nav under a filter would both shrink
it to the filtered set (breaking requirement 5) and wipe the folder's `selected` class and the
`<details>` open/closed state the user just set.

```ts
// Everything the ruler and the stage draw for ONE view. Exported so a folder filter (task 253)
// redraws the timeline over its own filtered, re-laid-out view while the File Nav — which is the
// control that SET the filter, and must keep listing every file — is left standing.
export function renderLayer1Stage(view: WireLayer1View): void {
    // ...the current body of renderLayer1View, minus the renderLayer1FileNav call...
}

export function renderLayer1View(view: WireLayer1View): void {
    // The nav is drawn from the FULL view and only here, on a fetch. `view` is captured by the
    // callback, so every later folder click re-filters from the unfiltered payload rather than from
    // whatever the last filter left on screen.
    renderLayer1FileNav(view, (targets) => renderLayer1Stage(filterLayer1ViewByTargets(view, targets)));
    renderLayer1Stage(view);
}
```

The crumb currently reports full-view counts. Leave it inside `renderLayer1Stage` so it re-reports
the filtered counts — that is the only on-screen indication of how much the filter removed, and it
costs nothing.

`drawLayer1Minimap()` is the last call in the stage body and measures widgets already in the DOM, so
it re-measures the filtered stage for free. `wireBucketJumpButtons` / `wireFindFileBox` /
`makeRulerTickClickable` all read the live DOM at click time; nothing needs re-wiring.

**Verify:** `wc -l` on every touched file stays ≤ 250.

---

## Step 6 — the selected-folder style

`webapp/layer1-styles.css` — add beside the existing `.filenav` rules (~line 259):

```css
  /* Task 253: the folder driving the current timeline filter. Matches the .file-item.selected
     treatment already in the sheet so the pane has one selection language. */
  .filenav .file-folder-name.selected { background: var(--sel-edge); color: #fff; }
```

`var(--sel-edge)` is the token `.file-item.selected` already uses at `layer1-styles.css:274`, so the
pane has one selection language and no new colour is introduced. Scoped under `.filenav` so the two
other trees — which live on `index.html` and load `styles.css`, where `.file-item.selected` uses a
different token (`--sel`) — are untouched.

---

## Step 7 — final checks

- `npm run typecheck` — clean.
- `npm run build:webapp` — clean (this is what regenerates `webapp/dist`; the page will not pick the
  change up without it).
- `wc -l` on `webapp/layer1-page.ts`, `webapp/layer1-filter.ts`, `webapp/layer1-filenav.ts`,
  `webapp/views/sidebar.ts`, `webapp/layer1-ruler-axis.ts` — all ≤ 250.
- **Do not run the test suites.** The user runs them.
- **Do not start a server or take screenshots.** Visual verification is the user's job. Report to
  the user: rebuild happened, hard-reload `layer1.html` and check that clicking a folder shrinks the
  timeline and clicking it again restores it.

---

## Deliberately not built

- **Multi-folder selection.** Task 255 owns shift-click. `onFolderClick` already hands over a
  *list* of targets and `filterLayer1ViewByTargets` already takes a list, so 255 becomes a union in
  the sidebar handler plus the `MouseEvent` it will need — no rework of the filter or the layout.
- **A "clear filter" button.** Re-clicking the selected folder is the whole affordance
  (requirement 3). Add a button only if the user asks.
- **Filtering by clicking a file leaf.** Leaf clicks keep their task-278 jump behaviour.
- **Persisting the filter in the URL.** S18's shareable link carries `?dir=&repo=&ref=` only; a
  filter is a transient view state.
