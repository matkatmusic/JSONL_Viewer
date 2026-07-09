## 2026-07-08:21:40:00 — Item 43: inspector Prev/Next syncs the timeline's selected step
Chat title: tackle-tasks 41, 43, 44
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/37bc58a4-f924-416c-8397-ffd3b2cd570e.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item43-inspector-next-syncs-timeline-selection.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md

### Design decisions

- The fix is wiring only: `openTranscriptInspector`'s existing (previously unused)
  `onJumpToLine` hook is passed by a new `renderTimelineView` closure wrapper
  (`openTranscriptInspectorSynced`), so every one of the 7 timeline inspector-open sites
  syncs selection — not just the `Next ▶`/`◀ Prev` buttons, but also tool-result jumps,
  hook jumps, and clickable line links inside the inspector. No inspector.ts change.
- A shown line owned by NO node (summary records, snapshot lines whose changeIds were
  re-stamped) keeps the current selection instead of clearing it — clearing on every
  intermediate record would make the selection flicker off while stepping through a turn's
  tool_use/tool_result lines.
- The anchor route site (`/at/<line>`, timeline.ts anchor block) also gained the sync:
  jumping to the timeline from File History now both outlines (`.anchored`) AND selects
  the owning step from first paint. This is deliberate (plan step 2's note), matching the
  item's expectation that the Details view's item and the selected bubble always agree.

### Deviations

None from the plan. The plan itself deliberately skips auto-scrolling the newly selected
bubble into view (item 43 asks for selection, not centering) and any URL update per line
step.

### Tradeoffs

- No new tests: the one pure decision (raw line → owning node index, -1 when unowned) is
  `findTimelineNodeIndexForRawLine`, already covered by 4 tests in
  tests/timeline-viewmodels.test.ts (including the -1 case). The new code is DOM class
  swaps + `drawRail()` in the same style as the existing (untested) rowTop click handlers;
  a testable seam would have required a DOM shim the suite deliberately doesn't have.
- Verified with `npx tsc -p tsconfig.webapp.json --noEmit` (clean). Per the session's
  instruction, NO tests or suites were run — the user runs them.

### Open questions

- If stepping line-by-line should also scroll the newly selected bubble into view, add
  `row.scrollIntoView({ block: "nearest" })` inside `syncSelectedRowToShownLine` — one
  line, left out on purpose.
