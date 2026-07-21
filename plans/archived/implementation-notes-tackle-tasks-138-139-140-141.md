## 2026-07-21:07:55:00 — Tasks 138/139/140/141 (jfred webapp + engine)
Chat title: tackle-tasks 138 139 140 141
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/15ebb9e3-68f4-41ff-a77c-0860516a67cc.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-138-139-140-141-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/app-router.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/src/regex_script_detection.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/src/reconstruction_script_prestate.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/inspector.ts

### Design decisions

- Task 138: the task's "generation counter checked after each await" alone cannot fix the
  duplication — the duplicate appends happen INSIDE `renderProjectsView` (all its DOM appends
  land synchronously after its own `await fetchJson`), before control ever returns to
  `renderRoute` for a staleness check. The implemented latest-wins therefore has two parts:
  (1) each run renders into its OWN fresh pane swapped into `#view` atomically
  (`view.replaceChildren(pane)`), so a superseded run's late appends land in a detached,
  invisible element; (2) the generation counter guards the one post-await step that touches
  SHARED chrome (`renderSubRouteDrawer` in `renderProjectRoute`). Verified no CSS keys off
  `#view`'s direct children or `#view:empty`, so the wrapper pane is visually inert.
- Task 140: instead of the task's suggested unhide-in-timeline-render, the header visibility is
  set in `renderRoute` from `checkRouteIsTimeline(segments)` — one line next to the existing
  `project-route` class toggle that uses the SAME predicate and lifecycle. Markup ships the
  header `hidden` so it never flashes before boot's first render. The projects view keeps its
  own "Projects" pane title (asserted in the new test).
- Task 141: kept the 0-based convention (timeline `/at/<line>` anchors and rev-card "L:n" are
  raw-line indexes) and made the label range-explicit instead: `line 5 of 0–98`. New exported
  one-liner `formatInspectorLineCounter` so the format is testable without opening the pane.
- Task 139: `shellWritePrimitive` covers the verb list from the task (`mv cp rm mkdir touch tee
  ln`, `sed -i`) plus redirects, but a redirect only matches when its target looks like a file
  path (contains "." or "/", excluding `/dev/null`; `2>&1` can never match). A bare `>` check
  would have reclassified every python analysis script containing a comparison as may-write and
  gutted the item-68 skip.

### Deviations

- Task 140's "unhide where renderTimelineFilterBar unhides the filter bar" was replaced by the
  route-predicate toggle in renderRoute (above) — smaller diff, same predicate the layout
  already trusts, and it makes the header state testable through renderRoute alone.
- Added `clear()` to `FakeXtermTerminal` in tests/webapp-dom-test-helpers.ts — the project-route
  test path reaches `progressTerminal.clear()`, which the fake did not yet cover.
- tests/inspector-line-counter.test.ts was renamed to tests/inspector.test.ts to satisfy the
  repo hook's `<module>.test.ts` naming check for webapp/inspector.ts.
- Added tests/regex_script_detection.test.ts (direct regex tests) for the same hook convention;
  the gate-level behavior is also covered in tests/reconstruction_script_prestate.test.ts.

### Tradeoffs

- Task 139 accepts false may-writes (shell verbs inside python strings, float comparisons like
  `x > 0.5`) per the item-68 rule "narrow read-only, never widen" — each costs one wasted
  sandbox attempt, never evidence. Marked with a `ponytail:` ceiling comment on the regex.
- Task 138's stale-run guard only covers renderRoute-level shared chrome. A stale
  `renderTimelineView` still renders the fork sidebar into the global `#drawer` if a navigation
  lands mid-timeline-render; that pre-existing exposure is unchanged (the reported bug — and the
  common race — is on `#/`, whose renders are now fully pane-owned).

### Open questions

- None blocking. If the wasted-sandbox cost on shell runs ever matters, the upgrade path is a
  shell-vs-python discriminator on ScriptRun rather than a wider regex.
