# Task 93 — Retire `renderFileHistoryView`, repoint the `/file/` route at THE Revision View

User decision (locked): **option 1** — retire the File History view. Do NOT extract a
shared-helper layer; do NOT revisit the alternative.

## Verified context (do not re-derive)

- `webapp/views/file-history.ts` exports ONLY `renderFileHistoryView` (route
  `#/project/<p>/file/<path>[/rev/<n>]`). Its five per-revision actions duplicate the
  Revision View's rev-cards (`renderDetailsFileMode`, `webapp/views/details-revision-view.ts:35`).
- The route is dispatched in `webapp/app-drawer.ts:30-38` (`renderSubRouteDrawer`), which
  `webapp/app-router.ts:101` calls **after** `renderTimelineView` (line 100) — the timeline is
  ALWAYS rendered underneath every project sub-route, so a live `DetailsContext` exists when the
  `/file/` route fires. `renderSubRouteDrawer` already early-returns when no document is cached
  (consent not yet given), at `app-drawer.ts:15`.
- `DetailsContext` is built once per render pass at `webapp/views/timeline.ts:136-167` inside the
  `TimelineRenderContext` literal.
- `RevisionFocus = { changeId: string; mode: RevisionViewMode }` (`details-model.ts:54`).
  The route's anchor is a 1-based revision NUMBER — it must be mapped to a `changeId`.
- `computeAnchoredRevisionIndex(anchorRev, revisionCount)` in
  `webapp/views/file-history-model.ts` already validates/maps `"n"` → 0-based index (returns
  `undefined` for absent/garbage/out-of-range). REUSE it; do not rewrite that validation.
- Entry points that build the `/file/` route (via `routeToFileHistory` /
  `computeRevisionLinkRoute`) and need NO change because the route survives:
  `inspector.ts:100`, `inspector-json.ts:95`, `timeline-changes.ts:114`, `project.ts:93`,
  `conversation.ts:147`, `diff-vs-base.ts:160`.
- The Diff-vs-Base view (`#/.../vsbase`) STAYS. Its only entry button lives in the retired view
  (`file-history.ts:50`) and must move into the Revision View.
- `webapp/views/file-history-model.ts` STAYS (the Revision View already imports
  `buildFileHistoryViewModel` from it). `tests/viewer-file-history.test.ts` imports only the
  model — NO test imports the DOM view; no tests are archived.
- `tsconfig.json:18` already excludes `webapp/archive` — archiving the view file cannot break
  typecheck.
- No import cycle: nothing under `webapp/views/` imports `app-drawer.ts`, so `app-drawer.ts`
  may import from `timeline.ts` and `details-revision-view.ts`.

## Step 1 — RED: test `computeFileRouteFocus` (the one pure piece of new logic)

Append to `tests/details-revision-view.test.ts` (it already holds the Revision View's
view-model tests and a 3-revision `THREE_REVISION_HISTORY` fixture — reuse that fixture).
New helper under test: `computeFileRouteFocus(filesTouched, target, anchorRev)` →
`RevisionFocus | undefined`, to live in `webapp/views/details-model.ts`.

Four tests, one behavior each (`test_` naming, plain-English step comments per
`~/.claude/guides/tdd.md`):

1. `test_computeFileRouteFocus_maps_anchor_number_to_that_revisions_changeId_in_content_mode`
   — `filesTouched = [THREE_REVISION_HISTORY]`, target `"src/orders.py"`, anchorRev `"2"` →
   `{ changeId: "toolu_second", mode: RevisionViewMode.content }` (content mode because the old
   view auto-expanded the anchored revision's content pane — the repoint preserves that).
2. `test_computeFileRouteFocus_returns_undefined_without_an_anchor` — anchorRev `undefined` →
   `undefined` (bare `/file/<path>` route: `renderDetailsFileMode` already defaults to card #1
   in diff mode when focus is undefined).
3. `test_computeFileRouteFocus_returns_undefined_for_an_unknown_target` — target not present in
   `filesTouched` → `undefined`.
4. `test_computeFileRouteFocus_returns_undefined_for_an_out_of_range_anchor` — anchorRev `"9"`
   on the 3-revision history → `undefined`.

Run ONLY this test file (`node --test tests/details-revision-view.test.ts`) to see the four
tests fail (module has no such export yet). Do not run the full suite.

## Step 2 — GREEN: implement `computeFileRouteFocus` in `details-model.ts`

In `webapp/views/details-model.ts` (the DOM-free tested half), add:

```ts
// task 93: the /file/<path>/rev/<n> route carries a 1-based revision number; the Revision
// View focuses by changeId. Content mode mirrors the retired File History view's anchored
// auto-expand. No anchor / unknown target / out-of-range number → no focus (card #1, diff).
export function computeFileRouteFocus(
    filesTouched: WireFileHistory[], target: string, anchorRev: string | undefined,
): RevisionFocus | undefined {
    const history = filesTouched.find((entry) => entry.target === target);
    if (history === undefined) {
        return undefined;
    }
    const revisionIndex = computeAnchoredRevisionIndex(anchorRev, history.revisions.length);
    if (revisionIndex === undefined) {
        return undefined;
    }
    return { changeId: history.revisions[revisionIndex]!.changeId, mode: RevisionViewMode.content };
}
```

Import `computeAnchoredRevisionIndex` from `./file-history-model.ts`. Use whatever
file-history array type `details-model.ts` already names for `document.filesTouched`
(`buildRevisionCards`'s parameter type) — match the existing type name, do not invent a new one.
Re-run the one test file; all four pass.

## Step 3 — export the live `DetailsContext` from the timeline render pass

In `webapp/views/timeline.ts`:

- At module level (near the top, by the other module state if any):
  ```ts
  // task 93: the /file/ drawer route (app-drawer.ts) renders THE Revision View, which needs
  // the current render pass's DetailsContext. renderTimelineView always runs before
  // renderSubRouteDrawer (app-router.ts), so this is set whenever the route fires.
  export let activeDetailsContext: DetailsContext | undefined;
  ```
- Immediately after the `const context: TimelineRenderContext = { ... }` literal closes
  (after line ~168), assign: `activeDetailsContext = context.detailsContext;`
- Import the `DetailsContext` type from `./details-model.ts` if not already imported.

## Step 4 — repoint the route in `app-drawer.ts`

In `webapp/app-drawer.ts`:

- Replace the import of `renderFileHistoryView` with imports of `renderDetailsFileMode`
  (from `./views/details-revision-view.ts`), `computeFileRouteFocus` (from
  `./views/details-model.ts`), and `activeDetailsContext` (from `./views/timeline.ts`).
- In the `segments[2] === "file"` branch, keep the `vsbase` sub-branch EXACTLY as is, and
  replace the `else` (lines 35-38) so the file route short-circuits into the Revision View
  instead of building a drawer. Per the user's comment-out convention, keep the two old lines
  as `// task 93: was —` comments:
  ```ts
  } else {
      // task 93: the File History view is retired (webapp/archive/) — the route lands in
      // THE Revision View instead, focused on the anchored revision when /rev/<n> is present.
      // task 93: was — headerText = `File history — ${target}`;
      // task 93: was — renderContent = (content: HTMLElement) => renderFileHistoryView(content, project, target, segments[4] === "rev" ? segments[5] : undefined);
      if (activeDetailsContext === undefined) {
          return;
      }
      const anchorRev = segments[4] === "rev" ? segments[5] : undefined;
      const focus = computeFileRouteFocus(activeDetailsContext.document.filesTouched, target, anchorRev);
      renderDetailsFileMode(target, activeDetailsContext, focus);
      return;
  }
  ```
  (`renderDetailsFileMode` reveals the details pane and sets its own
  "File Revisions — <target>" header; the drawer's `openInspectorPane`/`headerText` tail must
  NOT run for this branch — hence the `return`.)
- If `activeDetailsContext`'s `document` field type differs from what `computeFileRouteFocus`
  expects, pass `activeDetailsContext.document.filesTouched` through the same wire type both
  sides already share — both come from `WireTimelineDocument`; no casts should be needed.

## Step 5 — move the "Diff vs Base" entry point into the Revision View

In `webapp/views/details-revision-view.ts`, inside `renderDetailsFileMode`, AFTER the
no-revisions early return (line ~44) — vsbase is meaningless with zero revisions — append a
button to `left` right after the `pane-title` row:

```ts
// task 93: the Diff-vs-Base entry moved here from the retired File History view.
left.append(el("button", {
    class: "row-btn",
    text: "Diff vs Base",
    onclick: () => { location.hash = `${routeToFileHistory(context.project, target)}/vsbase`; },
}));
```

Import `routeToFileHistory` from `../app-routes.ts`. Note the local `el` wrapper's attr type in
this file — it accepts `class`/`text`/`onclick` via `app-dom.ts`'s `el`; match the surrounding
call style.

## Step 6 — label updates on surviving links (routes unchanged)

- `webapp/views/diff-vs-base.ts:160`: back-link text `"← file history"` → `"← file revisions"`
  (its `href` still points at `routeToFileHistory(...)`, which now opens the Revision View).
- `webapp/inspector-json.ts:93`: button text `"View in File History"` → `"View in File Revisions"`;
  adjust the comment at lines 66-68 accordingly (`[View in File History]` → `[View in File Revisions]`).
- Update stale comments that name the retired route/view where they now mislead:
  `webapp/views/file-history-model.ts` header comment (it says the DOM half lives in
  `file-history.ts` — point it at the archive), and `webapp/views/timeline-changes.ts:99`
  ("file-history route" → "file route (Revision View)"). Leave `app-routes.ts`'s
  `routeToFileHistory` NAME alone — renaming it would touch 8 files for zero behavior.

## Step 7 — archive the retired view

- `git mv "webapp/views/file-history.ts" "webapp/archive/file-history-pre-task93.ts"`
  (follows the `webapp/archive/timeline-pre-item66.ts` precedent; `tsconfig.json` already
  excludes `webapp/archive`).
- Prepend one comment line to the archived file: retired by task 93, route now lands in
  `renderDetailsFileMode` (details-revision-view.ts).
- Verify nothing live still imports it: `grep -rn "views/file-history\.ts" webapp tests --include="*.ts" | grep -v archive` must return nothing (`file-history-model.ts` hits are fine — different module).

## Step 8 — verify (no test suite runs)

- `npm run typecheck` — must exit 0.
- Re-run ONLY `node --test tests/details-revision-view.test.ts` — all green.
- Do NOT run the full `npm test` or any other suite; the user runs tests afterward.

## Step 9 — bookkeeping + staging

- Move task 93's object from `tasks.json` to `completedTasks.json`: add
  `"completionDate": "2026-07-15"`, no `commitHashes` (work is staged, not committed), and a
  `closureNote` — one sentence: option 1 implemented; `renderFileHistoryView` archived, the
  `/file/` route now renders THE Revision View via `activeDetailsContext`, Diff-vs-Base button
  relocated into the Revision View.
- `git add` exactly: `tests/details-revision-view.test.ts`, `webapp/views/details-model.ts`,
  `webapp/views/timeline.ts`, `webapp/app-drawer.ts`, `webapp/views/details-revision-view.ts`,
  `webapp/views/diff-vs-base.ts`, `webapp/inspector-json.ts`,
  `webapp/views/file-history-model.ts`, `webapp/views/timeline-changes.ts`,
  the archived file move (both sides), `tasks.json`, `completedTasks.json`, and this plan +
  its implementation notes. Do NOT commit.
