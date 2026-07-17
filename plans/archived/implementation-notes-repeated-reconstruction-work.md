## 2026-07-07:18:57:34 — Eliminate repeated deterministic reconstruction work
Chat title: repeated-reconstruction-work (session 9536c173-589b-4391-b814-962ae6fe6b1a)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/9536c173-589b-4391-b814-962ae6fe6b1a.jsonl

### References

/Users/matkatmusicllc/.claude/plans/2026-07-07-reveng-repeated-reconstruction-work.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/logs3.txt
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/reconstruction_repeated_work.test.ts

### Design decisions

- The replay-cutoff state (`activeLineageReplayCutoff`) lives in
  `src/reconstruction_script_stage.ts` next to `executionsByRecords`, with
  `enterLineageReplayWindow`/`restoreLineageReplayWindow` exported and called from
  `getLineageContentBefore` in `src/reconstruction_branches.ts`. This mirrors the existing
  `seedingLineages` module-state pattern and follows the existing import direction
  (branches → script_stage), avoiding both a new module and a cycle.
- The RED test for cause 1 failed with exactly the predicted count (actual 4 = 1 top-level +
  3 nested re-entries), confirming the cascade model before any fix was written.
- `collectProgressLabels` adapts to the real `ProgressSink` signature — it receives a
  `ProgressEvent` object (`event.label`), not a bare string as the plan's sketch assumed.
- The lineage-seed memo caches `undefined` results too, distinguished from a miss via
  `Map.has()`, and only caches replays that STARTED on a clean seeding stack — nested replays
  remain stack-dependent (cycle guards above them can degrade what they see).

### Deviations

- Baseline test run was skipped on explicit user instruction ("skip the baseline"). The final
  full-suite run shows 476/477 passing; the one failure (`s85 reproduces every captured step
  state`) matches the failure documented in project memory BEFORE this session (84/85 scenario
  coverage, observed 2026-07-07 6:14 PM), so it is treated as pre-existing, not a regression —
  but see Open questions.
- Task 3's RED test uses synthetic records instead of a JSONL fixture. Probing showed EVERY
  candidate fixture (S1, S18, S19, S21) drops ~10% of records in `selectLiveBranch` even with a
  single conversation branch (uuid'd sidechain/meta records off the trunk), so no real fixture
  exercises the nothing-dropped path. The plan anticipated this fallback.
- Implemented sequentially, not with parallel subagents: the plan's tasks are strictly
  interdependent (Task 2's RED count is only meaningful after Task 1 is GREEN) and all edits
  land in one tightly-coupled module cluster — parallel agents would have conflicted.

### Tradeoffs

- Cause 1 was fixed with a run-timestamp cutoff rather than an in-flight re-entrancy guard in
  `executeRunOnce`. A guard returning a stub `{pre: empty, post: undefined}` would poison the
  memo: a later run's execution computed beneath the stub would be cached WITHOUT the in-flight
  run's effects. The cutoff removes exactly the work whose output the strictly-before truncation
  provably discards (verified: `runForTarget` never matches a beacon earlier than its run), so
  recursion chains have strictly decreasing cutoffs and re-entrancy is impossible by
  construction.
- Cause 3's fix collapses array identity only when the branch filter drops NOTHING. Keying the
  execution memo on file-event-relevant content instead of array identity would also dedup the
  differing-content case, but is far more invasive and was scoped out in the plan. Given the
  fixture probe above, the collapse fires mainly for fully-linear transcripts; the dominant
  savings on real sessions come from Tasks 1+2 (each pass now costs 1 execution per run instead
  of 1 + seeded-file-count, and repeat lineage requests are memo hits).

### Open questions

- The `s85` scenario failure: memory records it failing before this session, and the failing
  assertion (`actual: 7, expected: 0` step-state mismatches) matches the earlier observation.
  If you want certainty it is untouched by this change, run
  `git stash && node --import tsx --test tests/scenario_coverage.test.ts && git stash pop` —
  I did not, because the baseline was skipped at your instruction.
- Real transcripts always carry off-trunk uuid'd records, so the cause-3 identity collapse
  rarely fires on them. If the branches-pass/steps-pass double reconstruction on real sessions
  is still too costly after Tasks 1+2, the follow-up would be content-keyed (not
  identity-keyed) memoization of `executeRunOnce` — flagging rather than building it (YAGNI
  until a new logs capture shows it matters).
