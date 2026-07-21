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

## 2026-07-21:13:05:00 — Task 64: public-repo CI workflow
Chat title: tackle-tasks 156 154 160 (same conversation, second invocation: tackle-tasks 64)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/b748e433-4c99-470d-a00f-ee74f5949a90.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-task-64-ci-workflow.md

### Design decisions

- One workflow file only (`jfred/.github/workflows/ci.yml`): checkout WITHOUT submodules on
  purpose — the suite is scenario-submodule-optional (task 59), so CI proves the bare-clone
  path a fresh contributor hits.
- Node 22 pinned (what `@types/node ^22` promises), `cache: npm` via setup-node, push CI on
  master + develop plus unfiltered pull_request. Step order: npm ci → typecheck → test →
  build:webapp (the task text's list).

### Deviations

- None from the plan. No local test exists for a workflow file (its only oracle is a real
  Actions run); local sanity = YAML parse check via `npx js-yaml` (6 steps parsed OK).

### Tradeoffs

- No matrix / release automation / README badge — task text defers all of it until the repo
  has users.

### Open questions

- Task 64 stays OPEN until the user pushes and a green Actions run confirms the workflow —
  the file's existence is not the closure gate.

## 2026-07-21:13:45:00 — Task 64 CI failure fix + task 156 root-cause diagnosis (task 162 filed)
Chat title: tackle-tasks 156 154 160 (same conversation, continued)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/b748e433-4c99-470d-a00f-ee74f5949a90.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/jfred-server.log (the user's piped phase-4 run; evidence for task 162)

### Design decisions

- CI run 29865002100 failed: 56 test files die at module load in tests/fixtures.ts:40
  ("scenario <name>: no .jsonl found under known roots") — task 59 (scenario-optional suite)
  was closed WITHOUT code, so the bare-clone premise in ci.yml was false. Fix: initialize
  ONLY the scenarios submodule (`git submodule update --init scenarios`; the repo is public,
  verified via ls-remote; the other three submodules aren't needed by the suite), and bump
  checkout/setup-node to @v5 to silence the runner's Node-20 deprecation warning.
- Reader-dependent tests synthesize their own temp file-history trees
  (tests/reconstruction_sidecar_reader.test.ts, overrides-test-helpers.ts), so no HOME
  dependency is expected on the runner; the next Actions run is the oracle.
- Task 156 diagnosis from jfred-server.log (user question: is
  plans/items29-30-31-32-close.md reconstructed multiple times? YES): 3 full
  reconstructions in the 70s window (13:20:05 / 13:20:27 / 13:20:52 — the ~9 stage lines per
  pass are stages, not extra passes), and project-wide 473 "replaying lineage of" headers
  over 140 distinct targets. Root cause: replayLineageContentBefore
  (src/reconstruction_branches.ts:199) replays the full per-target pipeline once per
  (target, before-timestamp) and its memo skips nested replays (enteredWithCleanStack gate).
  Filed as task 162 with fix directions; no engine change made in this session.
- The user's new mid-run tasks reused numbers 160/161 (already completed); renumbered to
  163/164 per the duplicate-159 precedent.

### Deviations

- None.

### Tradeoffs

- CI initializes the scenarios submodule instead of making the suite scenario-optional
  (task 59's original idea): one line vs. touching 56 test files' import-time behavior —
  and the user's decision record on task 59 says this repo goes private later anyway.

### Open questions

- Tasks 64 and 156 remain OPEN: 64 closes on a green Actions run after the user pushes the
  amended workflow; 156's verdict is now subsumed by task 162 (the stall is real and
  root-caused, not fixed).

## 2026-07-21 (later) — Task 64: CI still red; root cause was unpublishable captures, not submodule init

- CI run 29866226801 (after the submodule-init fix) still failed 56 test files with
  "scenario s1-delete-file: no .jsonl found under known roots". Root cause: `executed/` is in the
  scenarios repo's `.gitignore` — the 109MB of executed captures exist only on this machine and can
  never come from any checkout. They are also not publishable raw: nested `.git` dirs (s6, s41, s42,
  s44, s58, s62, s71, s72, s85, s87...), the user's email in git logs, home paths in 790 files.
- Decision: implement the item-59 route task 64's own text prescribes ("viable on a bare clone only
  after item 59 makes the suite scenario-submodule-optional"; 59 was closed without code).
- Design: capture-dependence = a test file's relative-import closure reaches `tests/fixtures.ts`
  (throws at import on a captureless clone), OR the file directly imports
  `scripts/coverage_scenarios.ts` (its scan is lazy, so transitive reachability via
  check_scenario_coverage helpers is harmless — proven by the CI run where those files passed).
- Moves: `jsonlPathsForScenario`, `resolveScenarioDir`, `listScenarioJsonlPaths` moved from
  tests/utilities.ts → tests/fixtures.ts so utilities.ts (and its ~29 capture-free importers) stays
  runnable; six test files re-import `jsonlPathsForScenario` from fixtures. Old bodies left
  commented in utilities.ts per comment-out-don't-delete; delete after a green run.
- New: `scripts/list_capture_free_tests.ts` (BFS + direct-import check, exports testable functions)
  and `tests/list_capture_free_tests.test.ts` (5 classifier pins). `npm run test:ci` feeds the list
  to the runner; ci.yml runs it and drops the now-useless `git submodule update --init scenarios`.
- Verified: excluded set == the 55 CI-failing files + reconstruction_script_stage.test.ts (its s37
  subtest needs captures at runtime) — nothing over- or under-excluded; typecheck green.
  Gotcha: JS `.sort()` and shell `sort` disagree on `-` vs `_`, which made an earlier `comm` diff
  fabricate 29 phantom over-exclusions; re-sort both sides with the same tool before comm.
- Open: task 64 closes on the next green pushed run. If the full suite should ever run in CI, the
  captures need a sanitized publish (separate task — not filed, user to decide).
