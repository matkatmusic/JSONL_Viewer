# Task 326 — File Nav "Show Only Selected" toggle

Settled design (user, 2026-07-29): folders only; timeline-only. Folder clicks
STOP filtering instantly — selection is only stored. The timeline filters only
while the toggle is ON, using the selected folders' leaf paths. OFF, or ON with
nothing selected, shows all files. The session (JSONL) filter stays independent
and still intersects.

Files: `jfred/webapp/layer1.html`, `jfred/webapp/layer1-page.ts`,
`jfred/webapp/layer1-styles.css` (only if the button needs an active style not
already covered), `jfred/tests/layer1-folder-filter.test.ts`.

## Step 1 — update the folder-filter test first

`jfred/tests/layer1-folder-filter.test.ts` asserts a folder click filters the
stage. Change it to assert the NEW contract:
1. folder click alone → stage unchanged (all bubbles present);
2. click `#filenav-only-selected` → stage shows only that folder's files;
3. click the toggle again → all bubbles return;
4. toggle ON with no folder selected → all bubbles present.

## Step 2 — layer1.html

In the `filenav-title` row of `#pane-files` (line ~128), add
`<button id="filenav-only-selected" title="Filter the timeline to the selected folders' files">Show Only Selected</button>`.

## Step 3 — layer1-page.ts

Next to `folderTargets`, add `let onlySelectedIsOn = false;`. In `redrawStage`,
pass `onlySelectedIsOn ? folderTargets : []` into `intersectFilterTargets`. In
`renderLayer1View`, wire the button once per render (property assignment, like
the nav search box): flip the flag, `classList.toggle("current", flag)`, call
`redrawFiltered()`. The `renderLayer1FileNav` callback keeps storing
`folderTargets` and still calls `redrawFiltered()` — with the toggle off that
redraw is now a no-op filter (targets []), which also repaints after a
selection is cleared while the toggle is on.

Reset `onlySelectedIsOn = false` (and un-paint the button) where
`folderTargets` is reset on a new load (line ~145), so a fresh project never
starts silently filtered.

## Step 4 — verify

Typecheck, build:webapp, CDP: folder click alone leaves the bubble count
unchanged; toggle shrinks it; toggle off restores it. Screenshot each state.
