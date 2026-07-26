# Task 252 — Layer 1 View: File Nav tree left of the ruler

## What this changes

A File Nav pane on the LEFT of the Layer 1 page, left of the sticky ruler gutter, listing every
identified file — including repo files with no on-disk presence. It REUSES the existing tree
(user-confirmed 2026-07-25); no second tree is written.

## Facts the implementation relies on (verified, do not re-derive)

- The reusable halves are `buildFileTree(files: FileSidebarEntry[]) -> FileTreeNode[]`
  (`webapp/views/timeline-file-tree.ts:102`) and
  `renderFileTreeNode(node, callbacks, selectionRoot, coverage?)` (`webapp/views/sidebar.ts:106`).
  `coverage` is optional and Layer 1 passes nothing, exactly as `views/details.ts:130` does.
- `FileSidebarEntry` (`timeline-file-tree.ts:13`) is `{ target, revisionCount, isDeleted,
  originalPath, renameBadgeLabel }`. `buildFileTree` reads ONLY `target`; the leaf renderer reads
  `isDeleted`, `revisionCount`, `originalPath`, `renameBadgeLabel`. Layer 1 has no
  `WireTimelineDocument`, so the entries are constructed from the `/api/layer1-view` payload
  directly — `buildFilesSidebarViewModel` is NOT reused and must not be called.
- `sidebar.ts` MIRRORS the entry/node types rather than importing them (cycle). Nothing in this task
  adds a field, so that mirror stays untouched.
- `layer1.html` links `/app/layer1-styles.css` (line 7) — it is a real stylesheet, not an inline
  block. It does NOT load `styles.css`, which is where the tree's rules live
  (`styles.css:199-280`).
- `.stagewrap` is `display: flex; position: relative` (`layer1-styles.css:248`) holding
  `main.timelines` (the scroll container, `flex: 1`) and `.minimap`, which is
  `position: absolute; left: 12px; bottom: 12px` against `.stagewrap` (`layer1-styles.css:249`).
  A new pane as `.stagewrap`'s FIRST flex child therefore lands left of the whole scroll container,
  hence left of the sticky ruler — and the minimap must be shifted right by the pane's width or it
  will sit on top of the new pane.
- `webapp/layer1-page.ts` is at 238 lines against the 250-line cap, so this gets its own module.
- The Stop hook enforces `tests/<module>.test.ts` naming.

## Step 1 — RED: write the failing tests

Create `jfred/tests/layer1-filenav.test.ts`.

Model it on `tests/layer1-page-spans.test.ts` (`node:test`, `node:assert/strict`,
`setupLayer1Dom()` from `./webapp-dom-test-helpers.ts`). Call the new module's builder DIRECTLY
rather than booting the page — the behaviour under test is the payload→entries mapping and the
rendered tree, and a stubbed stream would only widen the failure surface.

Fixture — one pair, one repo-only path, one disk-only path, all sharing a directory prefix so the
tree's prefix stripping is exercised:

```ts
const NAV_VIEW = {
    pairs: [{ path: "src/kept.ts", commits: [{ hash: "a".repeat(40) }, { hash: "b".repeat(40) }] }],
    gitOrphans: [{ path: "src/gone.ts" }],
    diskOrphans: [{ path: "src/untracked.ts" }],
};
```

Tests, one behaviour each:

1. `test_every_identified_file_appears_in_the_file_nav`
   - Render the nav for `NAV_VIEW` into a container.
   - Assert the `.file-item` titles (which carry the full path) cover all three paths. This is the
     task's headline requirement: pairs AND both orphan directions.

2. `test_a_repo_file_with_no_on_disk_presence_renders_as_deleted`
   - Render the nav for `NAV_VIEW`.
   - Assert the leaf whose title names `src/gone.ts` carries the `deleted` class, and that the
     leaves for `src/kept.ts` and `src/untracked.ts` do NOT. This pins the mapping direction:
     gitOrphans (in the repo, absent from disk) are the deleted ones, and a swap with diskOrphans
     would otherwise be invisible.

3. `test_a_pairs_commit_count_is_its_revision_count`
   - Render the nav for `NAV_VIEW`.
   - Assert the `src/kept.ts` leaf's `.revcount` text is `(2)`.

4. `test_the_nav_renders_folders_as_native_details`
   - Render the nav for `NAV_VIEW`.
   - Assert one `details.file-folder` exists whose `summary` text is `src`. This proves the shared
     tree is what rendered, rather than a flat list quietly written in the new module.

## Step 2 — GREEN: the module

Create `jfred/webapp/layer1-filenav.ts`.

Header comment must state: reuses `buildFileTree` + `renderFileTreeNode`; entries are constructed
here because Layer 1 has no `WireTimelineDocument`; its own module because `layer1-page.ts` is at
the line cap.

```ts
import { buildFileTree } from "./views/timeline-file-tree.ts";
import { renderFileTreeNode } from "./views/sidebar.ts";
import { getRequiredElementById } from "./app-dom.ts";
import { jumpToNamedBubble } from "./layer1-find-file.ts";
```

Declare the payload shape STRUCTURALLY (the same mirroring reason as `layer1-tie-groups.ts`:
`layer1-page.ts` imports this module, so importing its `WireLayer1View` back would be a cycle):

```ts
// The slice of /api/layer1-view the nav reads. `commits` is only ever counted, so its element type
// is deliberately unspecified — layer1-page.ts's WireLayer1View satisfies this structurally.
export interface FileNavView {
    pairs: { path: string; commits: unknown[] }[];
    gitOrphans: { path: string }[];
    diskOrphans: { path: string }[];
}
```

Then:

- `function describeNavEntry(path: string, revisionCount: number, isDeleted: boolean)` returning a
  `FileSidebarEntry`-shaped object with `originalPath: undefined, renameBadgeLabel: undefined` —
  Layer 1 knows nothing about renames. One factory so the three call sites below cannot drift.
- `export function listFileNavEntries(view: FileNavView)` returning the concatenation of:
  - `view.pairs` → `describeNavEntry(pair.path, pair.commits.length, false)` (present on disk).
  - `view.gitOrphans` → `describeNavEntry(orphan.path, 0, true)` — in the repo tree, absent from
    disk; commit counts are not on the wire for an orphan, so 0 rather than a guess.
  - `view.diskOrphans` → `describeNavEntry(orphan.path, 0, false)` — on disk, so not deleted; it has
    no repo history, hence 0.
- `export function renderFileNavInto(container: HTMLElement, view: FileNavView): void` —
  `container.replaceChildren(...buildFileTree(listFileNavEntries(view)).map((node) =>
  renderFileTreeNode(node, { onFileClick: jumpToNamedBubble }, container)))`.
  `selectionRoot` is `container` so a click clears the selection in THIS tree and no further — the
  reason that parameter exists (`sidebar.ts:62`).
- `export function renderLayer1FileNav(view: FileNavView): void` — the page-facing wrapper:
  `renderFileNavInto(getRequiredElementById("filenav-tree"), view)`.

Add a `ponytail:` comment on the click wiring: `jumpToNamedBubble` takes the full path, which is a
substring of the bubble's `.fname` title, so a pair lands its bubble with no new lookup. An ORPHAN
has no bubble of its own (it lives in a bucket whose `.fname` is the bucket title), so clicking one
reports "no bubble matches" into the crumb — accurate, and scrolling to the owning bucket is
task 253-255's pane behaviour, not this task's.

## Step 3 — GREEN: the pane in `layer1.html`

Inside `.stagewrap` (line 63), BEFORE `main.timelines`:

```html
    <!-- Task 252: the File Nav. A flex sibling of the scroll container, so it sits left of the
         sticky ruler gutter without entering the zoomed `.canvas`. The tree is rebuilt on every
         load by webapp/layer1-filenav.ts. -->
    <aside class="filenav">
      <div class="filenav-title">File Nav</div>
      <div id="filenav-tree"></div>
    </aside>
```

## Step 4 — GREEN: draw it on every load

In `webapp/layer1-page.ts`:

- Import `renderLayer1FileNav` from `./layer1-filenav.ts` (alphabetically after `./layer1-find-file.ts`).
- In `renderLayer1View`, call `renderLayer1FileNav(view)` right after `renderRulerTicks(view.ruler)`
  — the nav is not measured by anything, so its position among the render calls is free; grouping it
  with the other gutter-side render keeps the function readable.
- In `loadLayer1View`, the clear-before-load block (line ~200) currently empties `#stage` only. Add
  `getRequiredElementById("filenav-tree").replaceChildren();` beside it, for the reason already
  stated there: the previous view's contents are stale the moment a new load starts.

## Step 5 — the styles

Add to `jfred/webapp/layer1-styles.css`, immediately before the `.stagewrap` rule (line ~248) so the
pane reads next to the container it sits in.

Declare the pane width once, as `--filenav-w: 232px`, on the `.filenav` rule, and reuse it in the
minimap shift below — the two values must not be able to drift apart.

```css
  /* Task 252: the File Nav — every identified file, including repo files with no on-disk presence.
     A flex sibling of `main.timelines`, so it is left of the sticky ruler with no involvement in
     the zoomed canvas. `overflow: auto` gives it its own scroll: a real project lists ~800 files
     and the pane must not stretch the page column. */
  .filenav { --filenav-w: 232px; flex: none; width: var(--filenav-w); overflow: auto;
    border-right: 1px solid var(--border); background: var(--surface); }
  .filenav-title { padding: 8px 10px 6px; font-size: 10px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
```

Then shift the minimap so it does not sit on top of the new pane — it is absolutely positioned
against `.stagewrap`, whose left edge is now the nav's, not the timeline's. Edit the existing
`.minimap` rule's `left: 12px` to `left: calc(232px + 12px)` and note in its comment that the first
term is `.filenav`'s width (a custom property set on `.filenav` is not in scope on `.minimap`, which
is why the number is repeated with a comment rather than shared).

Bring the tree's own rules across from `styles.css:199-280`, rewritten against this page's token set
— `styles.css`'s `--mono/--text/--sel/--sel-hover/--guide/--orange` do not exist here, and adding
six tokens to carry rules verbatim is the larger change:

```css
  /* Task 252: the shared file tree's rules (webapp/styles.css:199-280), retargeted at this page's
     tokens — layer1.html does not load styles.css. A folder is a native <details open>, so the
     pane needs no toggle JS; decorations sit in fixed-width columns so names at one depth share a
     left edge. The rename-badge and coverage-strip rules are deliberately NOT brought across:
     Layer 1 sets neither originalPath nor coverage, so they would be dead. */
  .file-item { padding: 3px 10px; font: 11px ui-monospace, Menlo, monospace; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; cursor: pointer; color: var(--ink); }
  .file-item::before { content: "📄"; display: inline-block; width: 21px; margin-left: 13px; }
  .file-item:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); }
  .file-item.selected { background: var(--sel-edge); color: #fff; }
  .file-item .revcount { color: var(--muted); margin-left: 6px; }
  .file-item.selected .revcount { color: #e8f6f0; }
  /* A repo file with no on-disk presence: still listed, shown as gone. */
  .file-item.deleted { text-decoration: line-through; opacity: 0.55; }
  .file-folder > summary { padding: 3px 10px; font: 600 11px ui-monospace, Menlo, monospace;
    color: var(--ink); cursor: pointer; white-space: nowrap; list-style: none; }
  .file-folder > summary::-webkit-details-marker { display: none; }
  .file-folder > summary::before { content: "▸ 📁"; display: inline-block; width: 34px;
    color: var(--muted); }
  .file-folder[open] > summary::before { content: "▾ 📁"; }
  .file-folder > summary:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); }
  .file-folder > .file-folder-kids { margin-left: 16px; border-left: 1px solid var(--grid); }
```

## Step 6 — verify

- `npm run typecheck` must pass.
- Confirm `webapp/layer1-page.ts` is still under 250 lines.
- Do NOT run the test suite — the user runs tests.

## Explicitly out of scope

- Folder-filter behaviour (tasks 253, 254, 255) — this task only hosts the pane.
- Any change to `views/timeline-file-tree.ts` or `views/sidebar.ts`. Nothing here adds a field, so
  their deliberate type mirror stays untouched.
- Scrolling to an orphan's bucket on click (see the ponytail note in Step 2).
