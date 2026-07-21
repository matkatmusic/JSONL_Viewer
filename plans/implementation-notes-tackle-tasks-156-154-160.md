## 2026-07-21:12:30:00 — Tasks 154 + 160 implementation, task 156 verification
Chat title: tackle-tasks 156 154 160
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/b748e433-4c99-470d-a00f-ee74f5949a90.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-tasks-154-160-156.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-tackle-tasks-131-135-136-137.md (task 154 origin)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-tasks-149-152.md (task 156 origin)

### Design decisions

- Task 160 fix 3 does NOT use `WireLineVerdict.line` to open the inspector (the task text
  suggested it). That field is an index into the MERGED multi-file records array (and skips
  tolerant-mode dropped lines), so it is wrong as a file line number. Instead the engine now
  stamps each verdict with its true `RecordSource` (`{filePath, lineNumber}`, already tracked
  per record by `loadTranscript`'s WeakMap) and the webapp opens the transcript inspector
  directly at `lineNumber - 1` in the file's raw lines. `line` stays untouched/display-only.
- `LineNode` gained `sourceJsonlName` / `sourceLineIndex` as real (non-optional) fields
  accessed only after `kind` narrowing — no `?: undefined` mirrors added to the other node
  kinds, keeping timeline-types.ts under its 250-line cap.
- `SCHEMA_VERSION` in reconstruction_document_cache.ts bumped 2 → 3: persisted documents
  without verdict sources must miss the cache (the webapp has a graceful uuid-scan fallback
  for them anyway, via `openLineRowInspector` → `openTurnInspector`).
- Task 160 fix 1 colors the whole raw-line row text (`role-line` class, `--lane-violet`)
  rather than splitting a pill: the row's entire text IS the classification, so a distinct
  text color satisfies "color the classification distinctly" with the smallest diff.
- Task 160 fix 2 is renderer-only: `parseRecord` already hydrates `timestamp` generically
  for ANY record carrying a string `timestamp`, so the task's engine-side ask was already
  satisfied; timestamp-less records (summary lines) genuinely carry no date field.
  `formatRowTimestamp` also applied to `details-model.ts`'s header (same `node.when` render,
  same Invalid-Date bug for a selected raw-line row).
- Task 154 keeps the fetched rows in a module-level variable and re-renders through the
  filter on `input` — no refetch per keystroke, matching the file's existing module-state
  pattern (`activeProjectName`).

### Deviations

- Tests were WRITTEN red-first but not run by me directly — the user asked that tests/suites
  be left to them. The repo's Stop hook auto-ran the suite after each edit batch regardless;
  its output confirmed the RED phases and subsequent passes (final hook runs reported only
  pre-existing test-file-naming warnings for timeline-labels.ts / timeline-render-rows.ts /
  details-model.ts, whose tests live in split files by convention).
- happy-dom rejects Node's global `Event` in `dispatchEvent`; the new task-154 test uses a
  `dispatchInputEvent` helper constructing the event from the happy-dom window global.

### Tradeoffs

- `sourceLineIndex = lineNumber - 1` assumes no interior blank lines in a .jsonl
  (`fetchRawRecords` drops blanks without renumbering; `loadTranscript` numbers before
  dropping them). Real transcripts have none; marked with a `ponytail:` comment naming the
  renumbering upgrade path.
- Task 156 measured via the streaming `/api/document` API directly (cold server,
  `--resetDocumentCache`, `allowScripts=1&preBaseline=1` — the consenting user's path from
  the task-149 report) instead of driving the browser UI: same server-side build path the
  phase-4 overlay reports on, with exact per-label timestamps.

### Task 156 measurement

ABORTED at the user's request mid-build — the user is testing the app directly instead.
Task 156 stays OPEN. Partial timing log (per-record parse events only, no phase-4 stages
reached) at the session scratchpad's document-timing.log; the measurement server (port 7399)
was killed and its `--resetDocumentCache` start already wiped `.cache/built-documents`, so
the user's next app load is a genuine cold build. The task-160 SCHEMA_VERSION bump (2 → 3)
would have invalidated pre-existing cached documents regardless.

### Open questions

- Task 156's yes/no verdict (did the task-150 garbage-target fix shrink the 500+ second
  phase-4 stall on the 451-target RevEng project?) now comes from the user's direct app run.
