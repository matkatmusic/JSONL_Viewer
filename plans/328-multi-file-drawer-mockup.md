# Task 328 — Multi-file Detail view, MOCKUP ONLY

Scope: `plans/layer2-mockup/` (app.js, index.html) plus visual checks in
`jfred/scripts/visual/`. NO `jfred/webapp/` changes — implementation is task 329,
blocked on this mockup being approved.

Goal: when the File Nav selection holds more than one target, the drawer shows the
current on-disk state of every selected target, one collapsible section per file,
alphabetical by path. A plain single click keeps today's behavior exactly.

## How the mockup works today (read these before editing)

- `plans/layer2-mockup/app.js` line ~30: `const selectedFolders = new Set()` — folder
  selection, paths as strings. Shift on a folder name toggles it (line ~611).
- Line ~624-639: file leaf rows (`renderNavLevel`). A leaf click has NO shift branch:
  it clears `.file-item.selected`, marks itself, `jumpToPath`, and clicks the file's
  `.node.n-disk:not(.n-created)` which routes into `openDrawer` (line ~863).
- `openDrawer(path, node, dot)` fills `#dpath`, `#dmeta`, `#dbody` for ONE node and
  calls `clearDiffPair()` + `setDrawerTools("none")`.
- File bytes come from `contentLines(path, node)` (line ~990) rendered through
  `highlightCode(source, path)` (line ~1025) into a `<pre>` in `#dbody`.
- Disk nodes live in the model from `buildModel()`; each `.filebox` carries
  `dataset.path`; the fixture's on-disk files are `DISK` in `fixture.js` (some have
  `deleted: true` variants surfaced as `.file-item.deleted`).

## Step 1 — file-leaf shift-click joins the selection (app.js)

In the leaf click handler (line ~632), add a shift branch BEFORE the existing body,
mirroring the folder handler's toggle shape and the real app's task-326 gesture
(`jfred/webapp/views/sidebar.ts`, `renderFileTreeLeaf`): on `event.shiftKey`, toggle
this row's `selected` class WITHOUT clearing others, WITHOUT `jumpToPath`, WITHOUT the
node click, then fall through to Step 3's drawer refresh. A plain click keeps the
existing clear-then-select-then-open behavior unchanged.

Track selected file paths the way folders are tracked: add
`const selectedFiles = new Set();` beside `selectedFolders`. The shift branch toggles
`file.path` in it; the plain-click branch does `selectedFiles.clear();
selectedFiles.add(file.path)`. When `renderNavLevel` builds a leaf, add the `selected`
class when `selectedFiles.has(file.path)` (folders already do this at line ~602), so
selection survives re-renders — do not rely on the DOM class alone.

## Step 2 — one function that names the whole nav selection (app.js)

Add `listNavSelectionTargets()`: the de-duplicated union of `selectedFiles` and every
`selectedFolders` entry expanded to its descendant file paths (walk the same tree
`renderNav`/`buildModel` uses, or filter all known file paths by
`path === folder || path.startsWith(folder + "/")` — the latter is one line and matches
`inSelection`'s existing test). Return it sorted with `.sort()` (plain lexicographic —
that IS alphabetical by path; do not invent a locale compare).

## Step 3 — the multi-section drawer body (app.js + index.html)

Add `openMultiDrawer(targets)` next to `openDrawer`:

- `clearDiffPair(); setDrawerTools("none"); byId("drawer").classList.add("open");`
- Header: `#dpath` = `` `${targets.length} files — Current on-disk state` ``,
  `#dmeta` = `working tree · ${targets.length} selected`.
- Body: `#dbody` gets one native `<details class="dfile" open>` per target, in the
  sorted order Step 2 already produced. `<summary>` = the full path. Section body:
  - a file with a disk node: `<pre>` of `highlightCode(contentLines(path, diskNode), path)`
    where `diskNode` is that path's latest on-disk node from the model — resolve it the
    same way the existing leaf click finds its `.n-disk:not(.n-created)` node, but from
    the MODEL, not the DOM, so a file filtered off the stage still renders.
  - a deleted file (no on-disk node): a one-line muted body, `Deleted — no on-disk
    state.` Do not skip the section; the selection said to show it.
- Native `<details>` IS the collapse mechanism — no toggle JS, no state store.
  (`views/sidebar.ts` uses the same trick for folders.)

Call sites: at the end of BOTH nav click handlers (folder name click at ~606, file leaf
click's shift branch from Step 1), compute `const targets = listNavSelectionTargets()`;
if `targets.length > 1` call `openMultiDrawer(targets)`; if `targets.length <= 1` do
nothing extra (plain single click already opened its node drawer; a shift-toggle that
shrank the selection to 1 or 0 leaves the drawer showing whatever it showed — matching
"until this lands, the drawer shows the last plainly-clicked file", now scoped to the
single case).

CSS, in index.html beside the existing `.drawer` rules (~line 474): `.drawer
details.dfile` — `border-bottom: 1px solid var(--border)`; `summary` in the same
monospace font as `.dpath`, `padding: 6px 12px`, `cursor: pointer`; keep the existing
`.drawer pre` rule doing the body styling (it already does). Nothing else.

## Step 4 — visual checks (jfred/scripts/visual/) — WRITE THESE FIRST (RED)

The mockup's check harness is the test: app.js is a browser-only IIFE reading
`document`, so there is no node-importable unit to test — the CDP checks are the
red-green vehicle here, and that is a deliberate, stated exception, not an oversight.
Author the check block BEFORE editing app.js (it fails against today's mockup = RED);
implementing Steps 1-3 turns it green. Do NOT execute the harness during the
implement pass (repo rule: typecheck only; the harness runs at close time) — the
red/green ordering is about authorship order and the checks' precise failure
expectations, which must be written down first. Each check gets a plain-English
comment stating what step is being proven, matching the `check("#328 ...")`
description idiom of the existing checks. Add ONE check block:

1. shift-click two file leaves in `#nav` (dispatch `click` with `shiftKey: true`) →
   assert `#drawer` has `open`, `#dbody` has exactly 2 `details.dfile`, and their
   `<summary>` texts are in sorted order.
2. click a folder name whose subtree has ≥2 files → assert section count equals that
   folder's file count.
3. `details.dfile` toggles: set `.open = false` on the first section → its `<pre>` is
   no longer visible (offsetHeight 0 is sufficient).

Home: `mockup-checks-nav.ts` if it stays under the 250-line cap AFTER the additions;
otherwise a new `mockup-checks-multi.ts` exporting one function, imported and awaited
in `mockup.ts` exactly where the other check modules are. Match the existing checks'
`check(...)`/`page.evaluate` idiom — read two neighboring checks first and copy their
shape.

## Order and verification

1. Step 4 checks authored first (RED), 2. Steps 1-3 (app.js + index.html), 3. typecheck
(`npm run typecheck` in jfred — app.js is plain JS but the check files are TS).
Do NOT run the visual harness or any test suite in the implement pass; that runs at
close time per the repo rule. The user reviews the mockup in the browser
(`plans/layer2-mockup/` over `python3 -m http.server`) before 329 unblocks.

## Traps

- app.js is exempt from the repo's 250-line cap? NO — it is already 1230 lines and
  grandfathered as a mockup; do not split it, but keep additions tight (~60 lines).
- The comment-reflow hook churns mockup files (memory: tasks 310-318) — if a hook
  rewrites comments, re-apply your edit, don't fight it.
- `.file-item.deleted` rows are selectable; Step 3 must not throw on them.
- Do not touch `diff.js` — pair-diff selection (`extendDiffSelection`) is a NODE
  gesture on the stage, unrelated to nav selection.
