## 2026-07-13:17:35:00 — Item 78: timeline build-progress overlay for large sessions
Chat title: tackle-tasks 78,80,79,77
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/ (session 016rGRfYFCz2TiLT3A1naM3t)

### References
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item78-timeline-build-progress.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (item 78)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/views/timeline.ts (renderTimelineView row loop)

### Design decisions
- Gated overlay + chunked rendering on total `nodes.length >= 500`
  (`LARGE_TIMELINE_ROW_COUNT`), not numbered steps: per-row DOM work is the cost,
  and every node is a row. Below the threshold the loop runs synchronously with
  zero `await`s — behavior identical to the old `forEach`.
- Overlay is `position: fixed` on `document.body`, removed in a `finally`, so it
  stays centered regardless of appended rows and is cleaned up even if a row build
  throws.
- Yield via `requestAnimationFrame` (not `setTimeout`) so each 100-row batch's
  progress update is painted before the next batch blocks the thread.
- Overlay styled purely from existing palette CSS vars (`--bg`, `--panel`,
  `--border`, `--text`, `--accent`, `--code-bg`) → theme-aware, no dark override.
- Three pure helpers (`checkTimelineNeedsProgressOverlay`,
  `computeTimelineBuildProgressLabel`, `computeTimelineProgressFraction`) carry the
  logic and are unit-tested; the DOM/rAF wiring is browser-only (verified by
  typecheck, visual check pending).

### Deviations
- None from the plan. The `forEach`→`for (const [index, node] of nodes.entries())`
  conversion was confirmed safe: the loop body (timeline.ts:1651–1753) contains no
  `return` statement, so no control-flow change beyond enabling mid-loop `await`.

### Tradeoffs
- Progress covers the row-build loop only, not `buildTurnTimelineViewModel` (which
  must finish before the row count is known). That helper is pure array work; if it
  ever dominates on huge sessions, instrumenting it is a separate follow-up.
- Batch size 100 → ~12 paints for a 1200-row timeline: smooth bar without a paint
  per row.

### Follow-ups (2026-07-13, user-reported during testing)
- **Timeline showed through the overlay.** Original impl appended rows to `#view` live
  during the build, so the half-built timeline was visible behind the translucent bar. Fix:
  rows now accumulate in a detached `DocumentFragment` and are appended to `container` in a
  single `container.append(rowFragment)` after the loop — the timeline's first appearance in
  the live DOM is the moment it is complete (`renderRoute` also `replaceChildren()`s `#view`
  first, so nothing shows behind the bar).
- **Progress bar for the "reconstructing branches" phase (user request).** Extracted the
  overlay into a shared app.ts singleton `showLoadingProgress(text, fraction)` /
  `hideLoadingProgress()` (reusing the `.timeline-progress-*` CSS; `createTimelineBuildProgressOverlay`
  deleted, DRY). `fetchDocument` now drives the same centered bar from determinate stream
  progress lines (any `current`/`total` pair — chiefly `reconstruction_branches.ts:285`'s
  `reconstructing <file>` pass) via `reportStreamProgress`, and hides it in its `finally`. The
  item-78 row build reuses the same singleton via its (still-tested) label/fraction helpers.
  Overlay is now translucent so the loading console stays visible under the bar during the long
  reconstruction; box has `max-width: 60vw` + an ellipsized label for long paths.
- **Known seam:** between `fetchDocument`'s finally (hides the reconstruction bar) and the row
  build re-showing it, `buildTurnTimelineViewModel` runs synchronously with no bar (console
  still visible). Acceptable; unify into one continuous overlay lifecycle only if it reads as a
  flicker in practice.

### Open questions
- Visual/headless verification against the repro
  (`#/project/-Users-matkatmusicllc-Programming-jot-backup/timeline`) is deferred to
  the user's standing post-session pass (server + browse daemon not spun up here).
  Typecheck (`tsc --noEmit` main + `tsconfig.webapp.json`) and `build:webapp` are
  clean; the 5 helper tests were written but not run (user runs the suite).
- Threshold 500 and batch 100 are first-cut constants — trivially tunable if the
  overlay feels too eager or the bar too coarse.
