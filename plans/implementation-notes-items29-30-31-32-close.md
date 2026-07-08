## 2026-07-08:10:30:00 — TASKS.md items 29, 30, 31, 32 close-out
Chat title: tackle-tasks 29-32
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/08a4ebb7-72bd-42b8-a3fc-73da7426f163.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/items29-30-31-32-close.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-s40-timeline-session-attribution.md

### Design decisions

- Item 29 label: user picked **"Jump to timeline step"** via AskUserQuestion (options were
  "Jump to timeline", "Jump to step", "Jump to timeline step", keep).
- Item 30: exported a small pure helper `computeRevisionLinkRoute(project, revisionLink)` in
  `webapp/inspector.js` rather than inlining the string build, so the route shape is unit-tested
  DOM-free (same pattern as `computeSnapshotJumpRoute`). Did NOT reuse
  `computeSnapshotJumpRoute` (timeline.js): it resolves changeId→link itself and requires a
  revisionNumber, and importing timeline.js into inspector.js would create a circular import
  (timeline.js already imports inspector.js).
- Item 32 contract change: the per-record walk belongs to `loadProjectRecords`; the route
  composes exactly one walk per request; `buildDocumentWithConsent`/`buildProjectDocument`
  emit stages + deep-engine progress only. Three tests in `tests/viewer-progress.test.ts`
  encoding the old double-walk contract were rewritten to the new one.

### Deviations

- Item 31 is closed as **won't-do**, not implemented: the task's premise ("s40 fix made the
  rule defunct") is wrong. A sweep of all 85 covered scenarios (buildProjectDocument +
  buildTurnTimelineViewModel per scenario, exec gate default-ON) found 29 scenarios each with
  exactly ONE unattributed agent-turn: s23, s29, s32, s34, s35, s37, s38, s41, s42, s43, s44,
  s50, s51, s54, s55, s56, s57, s58, s59, s60, s62, s72, s73, s74, s75, s82, s83, s84, s85.
  These are the script-execution turns whose synthetic changeIds are per-replay `randomUUID()`
  (TASKS item 34). The CSS rule at `webapp/styles.css:262-264` is load-bearing; removing it
  would re-show the "(unattrib" lane header in all 29 scenarios. Re-check after item 34.

### Tradeoffs

- Item 30's hash navigation costs a full timeline re-render per revision-link click (the old
  code swapped drawer content in place). Accepted per the task's own framing: URL consistency
  and shareable revision links outweigh the re-render on a localhost viewer.
- Item 32: on the consent-required path the console still shows the full per-line walk (the
  route's own pre-build `loadProjectRecords` call is untouched); only the second, duplicate
  walk from the build/cache-hit path is gone.

### Open questions

- None blocking. Item 31's real fix is item 34 (deterministic synthetic changeIds) — already
  tracked in TASKS.md "Decision needed".
