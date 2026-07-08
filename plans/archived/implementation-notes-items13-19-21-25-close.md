## 2026-07-08:09:35:00 — TASKS items 13 (YAGNI close), 25 (investigation close), 19 (jump-to-snapshot button), 21 (formatted-text inspector mode)
Chat title: tackle next 4 easiest TASKS.md items → close 13/25/19/21
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/68626fd8-f014-417f-8bdb-c538aa92e5fe.jsonl

### References
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/items13-19-21-25-close.md (the plan implemented)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-item22-clear-console-item27-close.md (this session's earlier batch: items 8/20/22/27)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260707-1619.md (item 25's origin handoff)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (items 13, 19, 21, 25 closed)

### Design decisions
- **Item 25 verdict (the write-up the item asked for):** the zero-chip pickable turn is REAL
  and correctly pickable — it is the `apply_renames.py` script run rewriting
  `core_inventory.py` at 20:53:49.772Z. The step timeline (`reconstructStepTimeline`) and the
  file histories are separate replays; each stamps the same synthetic script-execution event
  with its own `randomUUID()` (`src/reconstruction_script_stage.ts:303`), so the step's
  changeId joins no revision (three probe runs produced three different uuids: `23e3c674…`,
  `43428f48…`, `4afa9da5…`). Documented best-effort at `reconstruction_json.ts:175-177` and
  `:216-218`. NOTE: the symptom lives at **Step 23** on current code, not Step 17 as the
  handoff said — step numbering shifted (git rows landed since). A real fix = deterministic
  synthetic changeIds shared by both replays; left as a user decision, not built.
- **Item 13 measurement:** `JSON.stringify(document)` on s84 = 0.5ms / 69KB (3 warm runs +
  1 spot-check). Closed as YAGNI; item 11 (disk-backed sandbox memo) remains the only real
  reload lever.
- **Item 19:** the button only renders when the changeId resolves to a surviving revision's
  1-based number (`computeSnapshotJumpRoute` → `findRevisionForChangeId`); re-stamped
  synthetic ids (item 25's class) and blob names without an anchored revision get NO button
  rather than a dead link. Navigation goes through `location.hash`, so the existing router
  renders the file-history drawer over the timeline and the URL stays bookmarkable.
- **Item 21:** the toggle lives in the inspector (the surface every "selected line" flows
  through — raw-lines rows, timeline steps), not in raw-lines.js; the nav bar's existing
  `line <n> / <total>` label is the "line 123 of 234 lines" context the item asked for.
  tool_use blocks render their STRING input fields verbatim under `--- <field> ---` dividers
  (a Write's content shows with real newlines); non-string inputs stay in the JSON view.
  Unknown block kinds become `[<type>]` placeholders so nothing silently vanishes. Mode is
  module-level session-sticky (same pattern as diff-vs-base's `diffDisplayMode`).

### Deviations
- None from the plan. The plan's `documentJson` placeholder in the item-19 wiring resolved to
  `reconstructionDocument` (the actual variable in `renderTimelineView`), as the plan
  instructed to verify.

### Tradeoffs
- Item 19's chip text is `⤷` (matching the terse `{ }` / `+/-` chip style) rather than a
  worded button; the title attribute carries the full "Jump to File History Snapshot" label.
- Item 21 renders formatted text as a plain `<pre class="inspector-text">` (styled identically
  to `.inspector-json`) with no jump-links inside — links remain a raw-JSON-view feature;
  formatted mode is for reading.

### Gates
- RED confirmed for both TDD tracks (missing-export SyntaxError each).
- `tests/timeline-viewmodels.test.ts`: 35/35 (was 32, +3).
- `tests/inspector-viewmodels.test.ts` (new): 7/7.
- Full suite: **507 passed / 0 failed** (baseline 497, +10 exactly as planned).
- Planning probe `probe-item13-item25.ts` deleted; nothing committed, all work staged.

### Open questions
- None blocking. If the item-25 chip gap should ever be FIXED (not just explained), the
  deterministic-changeId design (derive from target + run timestamp so both replays agree)
  needs a user go-ahead as a new TASKS item.
