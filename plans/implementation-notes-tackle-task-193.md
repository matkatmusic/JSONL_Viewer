## 2026-07-23:00:45:00 — Task 193: --until-revision bounded reconstruction
Chat title: tackle-task-193 (/taskTools:tackle-tasks 193)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/e20543bc-41f6-4b63-aaf4-0ff57bad79c9.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/193-until-revision-bound.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-per-file-target.md (task-182 attempt history that motivated this mode)

### Design decisions

- Flag spelling: `--until-revision <path>` + optional `--nth <n>` (1-based, default 1). The task
  sketched `--until-first-revision <file>`; the two-flag split keeps the generalized ordinal
  contract without a compound value syntax, and `--nth` alone is a usage error.
- The bound is INPUT truncation: the merged record stream is cut just before the first genuine
  main-chain user prompt strictly after the chosen revision's instant, before `buildSidecarReader`
  runs. Every view (--json, --file, --step, graphs) is bounded uniformly; no engine internals
  changed. The replay-window machinery the task named was treated as inspiration, not the lever —
  truncation makes every window small by construction.
- Turn boundary = `isGenuineUserPrompt(record) && record.isSidechain !== true`. A subagent's
  opening prompt happens inside the parent's turn and must not end it (pinned by
  test_bound_ignores_sidechain_prompts).
- A prompt stamped exactly at the revision instant stays inside the turn (strictly-after compare).
- Revision counting uses `extractFileEvents` (memoized, timestamp-sorted, includes Bash file ops,
  user edits, and script-rename recovery), filtered by exact-path equality — the same matching
  contract as --target/--file. The total is always reported on stderr so the user can pick `n`
  for the next invocation; stdout stays pure for --json consumers.
- `listEventPaths` was given one canonical home in reconstruction_bound.ts; viewer_api_repo.ts
  now imports it instead of keeping its private copy (no-forwarding-layers rule).

### Deviations

- Plan step 1 put the end-to-end CLI test in tests/reconstruction_cli.test.ts; that file hit the
  250-line cap (275), so the test moved to tests/reconstruction_bound.test.ts alongside the
  feature's unit tests. reconstruction_cli.test.ts is back to its pre-change 238 lines.
- To free line budget in reconstruction_cli.ts (was exactly 250), `formatProgressLine` and
  `buildStderrProgressSink` moved verbatim to reconstruction_progress.ts (their natural home;
  no test imported them by name). reconstruction_cli.ts now 233 lines.
- `buildPromptRecord` was added to tests/multi-source-test-helpers.ts (not kept test-local) since
  both the bound tests and future turn-shaped fixtures need genuine-prompt wire records.

### Tradeoffs

- Truncation-before-sidecar means post-bound evidence (e.g. s40-style out-of-window originalFile
  seeds living AFTER the bound) is invisible in bounded mode. Accepted: bounded mode is a
  viability/debug mode; exactness up to the bound uses the same mechanisms as a full run over a
  shorter transcript.
- ~~Turn boundaries scan the merged array in order; parallel-session multi-source streams could
  interleave turns.~~ RESOLVED same day (user: jot and RevEng have interleaved session data —
  build it now): the turn walk is now per-session. `findEventSessionId` maps the chosen
  revision's changeId back to its record (record uuid for user-edits, tool_use block id for
  everything else) to get the owning sessionId; `findTurnEndBoundary` only accepts THAT
  session's genuine prompts as the turn end; the cut is by WALL CLOCK (strictly before the
  boundary instant), so other sessions' in-window records survive — stamp-less records fall
  back to position-before-boundary. Events whose changeId maps to no record degrade to the
  session-agnostic walk. Pinned by test_bound_uses_owning_sessions_next_prompt_on_interleaved_streams.

### Open questions

- None blocking. Tests were written but NOT run (per instruction the user runs the suite);
  `npx tsc --noEmit` is clean and all touched files are ≤ 250 lines.
