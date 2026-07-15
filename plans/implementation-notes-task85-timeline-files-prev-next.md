## 2026-07-15:00:40:00 — Task 85: timeline header Prev/Next over file-touching messages
Chat title: tackle-tasks 85
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/51af29c5-e4bd-449a-bcfb-3ba61a5d190b.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task85-timeline-files-prev-next.md

### Design decisions

- Candidate rows are `kind === AGENT_TURN_NODE_KIND && fileChanges.length > 0` — file chips only render inside agent-turn bubbles (timeline.ts renderer), so any other row could never "show the File chips" after expansion.
- Jump uses the existing `jumpToTimelineRow` (scroll + flash), not `selectTimelineRow`: the task asks to navigate and expand, not to change the selection or re-render the details pane. Sidebar session clicks already use the same primitive.
- "Click the expansion triangle" is implemented as `row.classList.add("expanded")` + `updateToggleLabel()` — byte-for-byte what the triangle's own click handler does, minus the toggle (re-visiting an already-expanded row must not collapse it).
- The navigation reference index follows the last manually selected row (`selectTimelineRow` updates it), so Prev/Next continue from wherever the user last clicked, not from the last button jump only.
- Buttons are unclassed so they inherit the shared header-button chrome (styles.css:86); no CSS change.
- New pure helper `findAdjacentFileTouchedIndex(nodes, fromIndex, direction)` is exported from the view-model half and unit-tested in tests/timeline-viewmodels.test.ts (4 tests, hand-built minimal wire-shape nodes).

### Deviations

- None from the plan. Per the tackle-tasks instruction, `npm test` was NOT run (only `npm run typecheck`, which passes); a PostToolUse hook did auto-run the suite after the test-file edit and confirmed the RED state before the export existed.

### Tradeoffs

- No disabled/hidden state on the buttons when no candidate exists in a direction — the click is a silent no-op (`findAdjacentFileTouchedIndex` returns undefined). ponytail: add disabled styling only if wanted.
- One direction-parameterized helper instead of separate findNext/findPrev functions — half the code, same tests.

### Open questions

- Should Prev/Next also select the row (rendering its details pane) rather than just scroll+flash+expand? Current behavior matches the task text; selecting is a one-line swap to `void selectTimelineRow(target)` if preferred.
