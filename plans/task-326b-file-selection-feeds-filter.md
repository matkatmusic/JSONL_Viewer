# Task 326 addendum — file rows feed "Show Only Selected" (user-confirmed 2026-07-29)

Selection = union of selected folders' leaf files and individually selected
file rows. Plain file click = single-select that file (and open its drawer,
task 325). Shift-click a file row = toggle it into/out of the selection
WITHOUT opening the drawer (mirrors folder shift-click, task 255). Toggle ON →
timeline shows the union; nothing selected → everything. Multi-selection
rendering in the Detail view is a SEPARATE new task (needs a mockup) — until
it lands, the drawer keeps showing the last plainly-clicked file.

## Step 1 — test first (jfred/tests/layer1-folder-filter.test.ts)

- plain-click a file row → the spy receives `[thatFile]`;
- shift-click a second file row → spy receives both, alphabetic order not
  required (the page filters by Set);
- shift-click a folder after that → spy receives folder files ∪ selected files;
- shift-click a selected file → it leaves the union.

## Step 2 — jfred/webapp/views/sidebar.ts (shared, root fix)

- Leaf rows carry `"data-target": entry.target`.
- `listSelectedNavTargets(root)` = de-duped union of the existing
  `listSelectedFolderTargets` and `.file-item.selected` dataset targets;
  both the folder click and the leaf click report through it.
- Leaf click: shift → toggle `.selected` on the row, report, return (no
  drawer); plain → clear all, select, report, `onFileClick`.
- Classic webapp panes pass no `onFolderClick`, so they stay inert.

## Step 3 — verify

Typecheck, build, targeted tests; CDP: shift-click two files + toggle →
timeline shows exactly those two bubbles and the ruler shrinks; plain click a
third → only it remains shown and its drawer opens.
