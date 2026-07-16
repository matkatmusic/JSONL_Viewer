## 2026-07-15:14:30:00 — Task 93: retire renderFileHistoryView, repoint the /file/ route at THE Revision View
Chat title: task93-retire-file-history-view
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/fab739cd-34df-4dfa-bb7d-c4aa4ea3efee.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task93-retire-file-history-view.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-item84-unify-bottom-pane.md

### Design decisions

- The `#/project/<p>/file/<path>[/rev/<n>]` ROUTE survives; only its landing changed. This let all six
  route-building entry points (inspector.ts:100, inspector-json.ts, timeline-changes.ts
  computeSnapshotJumpRoute, project.ts, conversation.ts, diff-vs-base.ts back link) stay untouched, and
  keeps revision links shareable as URLs.
- The Revision View needs the timeline's per-render `DetailsContext`; since app-router.ts always runs
  `renderTimelineView` before `renderSubRouteDrawer`, timeline.ts now publishes it as a module-level
  `export let activeDetailsContext` (live ES-module binding) that app-drawer.ts imports.
- `/rev/<n>` anchors map to a `RevisionFocus` in **content** mode (`computeFileRouteFocus`, new in
  details-model.ts, TDD'd with 4 tests) — mirroring the retired view's auto-expanded content pane.
  A bare `/file/<path>` route gets no focus → card #1 in diff mode (the Revision View's default),
  whereas the old view showed a collapsed list; judged equivalent-or-better, not a regression.
- `computeAnchoredRevisionIndex` (file-history-model.ts) is REUSED for anchor validation rather than
  rewritten; file-history-model.ts stays live (the Revision View already consumes it).
- The "Diff vs Base" entry button moved into `renderDetailsFileMode`, placed AFTER the no-revisions
  early return (vsbase is meaningless with zero revisions — the old view showed the button
  unconditionally; deliberate small behavior change).
- Labels renamed for honesty: "View in File History" → "View in File Revisions" (inspector-json.ts),
  "← file history" → "← file revisions" (diff-vs-base.ts). `routeToFileHistory` keeps its NAME —
  renaming would touch 8 files for zero behavior.

### Deviations

- None from the plan. The plan's Step 4 inline branch was extracted into a top-level
  `renderFileRouteInRevisionView` helper in app-drawer.ts because the jot post-edit hook flagged the
  inline version's nesting depth.

### Tradeoffs

- Module-level mutable `activeDetailsContext` vs threading the context through the router: the
  variable is one line and matches the established "timeline owns the context" shape; threading would
  have changed renderRoute/renderSubRouteDrawer signatures for no behavioral gain.
- If the consent dialog (or a build error) owns the view, the /file/ route early-returns exactly as
  the old drawer did (`peekCachedDocument` guard, plus a new `activeDetailsContext === undefined` guard).

### Open questions

- The bare `/file/<path>` route (no /rev anchor) now opens revision #1 in DIFF mode instead of the old
  collapsed all-revisions list. If the collapsed-list overview mattered, say so — the rev-card list on
  the left is the intended replacement.
- tests/viewer-file-history.test.ts keeps its name though it tests file-history-model.ts (comment
  updated); rename was skipped to keep the diff minimal.

### Verification

- `npm run typecheck` exit 0; `npm run build:webapp` exit 0.
- `node --import tsx --test tests/details-revision-view.test.ts`: 15/15 pass (4 new
  computeFileRouteFocus tests). Full suite deliberately NOT run (user runs it post-session).
