## 2026-07-29:09:45:00 — Tasks 324, 325, 326, 327 (Layer 1 review feedback batch)
Chat title: tackle-tasks [325,326,327] + 324
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/13072f49-55f1-4b9e-a388-503560e954a9.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-324-pair-cycling-arrows.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-325-filenav-click-opens-drawer.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-326-show-only-selected.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-327-selection-bracket-geometry.md

### Design decisions
- 324 movement rules (left definable by the task): lane DOM order skipping `n-created` (323's rule), STOP at lane ends, and an arrow disables when its step would land on the other endpoint — base and target can never collide or swap.
- 324: `full content` became a real `<input type="checkbox">` (`#dfull`), matching the `[√]` in the sketch; the 320 handler now listens on `change` and mirrors `checked`.
- 325: the nav leaf click dispatches a synthetic click on the bubble's `.n-disk` dot, so the stage's existing delegated drawer handler does the deselect + open work — no second code path.
- 326: per the user's choice — folders only, and folder clicks no longer filter instantly; the stored selection applies only while `#filenav-only-selected` is toggled on. The toggle resets on every new project load. The JSONL session filter still intersects independently.
- 327: bracket geometry only (`width 4→3px`, `margin 2→1px`); the right bracket now ends ~13.5px from the rail, clear of the label that starts at 14px (CDP-measured gap 2.5px).

### Deviations
- 324: the Close button stays in header row 1 rather than the sketch's row 2 — it serves every drawer mode (single node, image, diff), and moving it per-mode would make it jump around.
- 326 plan step 1 assumed tests/layer1-folder-filter.test.ts asserts stage filtering; it only asserts nav REPORTING, so it needed no change and none was made.

### Tradeoffs
- 326's toggle state lives in layer1-page.ts module scope next to `folderTargets` instead of a new module — same lifetime, no new file.
- layer1-filenav.ts's long rationale comments were compressed to one-liners because the comment-length hook blocks edits to the file otherwise (also serves task 293).

### Open questions
- 324: should the pair label and arrows also live in row 1 for the sketch's exact left-to-right order (`name [^][v] hashes [^][v]`)? Current layout keeps that order but right-aligns the arrow/label group in the header row.
- 326: should the File Nav folder selection highlight look different while the toggle is OFF (selection stored but inert)?
