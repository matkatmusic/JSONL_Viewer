## 2026-07-23:09:05:00 — Task 192 bounded single-file performance (Phases 1/2/3/6 + counters + bench)
Chat title: codex-controlled task 192
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/5a4b7232-0c63-4285-93e2-14fc3cfe80ed.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/192-bounded-single-file-performance.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/optimizations.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/releaseProximity.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/terminalLaunchCommands.txt

### Design decisions

- (2026-07-23) Phase order follows optimizations.md's implementation order but stops at the
  measurement decision point: Phases 4 (semantic execution-cache scopes) and 5 (tree-index
  caching) are deferred until the user's real-corpus benchmark counters show they are dominant.
  The 11,980x-executed run in the task-192 evidence is a Bash compound command, which the
  Phase-2 executor-kind gate skips outright; the Phase-1 fast path hands the engine a single
  records identity, so the execution memo cannot churn on the bounded command.
- (2026-07-23) Bash gate placed BEFORE the read-only static gate in executeRunOnce: cheaper
  (no regex pass) and the distinct "skipping non-python sandbox run" label is the observable
  Phase-2 contract. Bash read-only runs change label; result (post: undefined) is unchanged.
- (2026-07-23) Counters are emitted via process.stderr.write in runCli, NOT through
  reportReconstructionProgress — the progress contract test pins the sink's line sequences.

### Deviations

- (2026-07-23) ScriptRun.executorKind is OPTIONAL (absent = executes like python, the
  pre-gate behavior) instead of the plan's required field: every synthetic test-run literal
  in the suite keeps compiling, and the default is documented on the type itself.
- (2026-07-23) The lineage counters are incremented inside reconstruction_lineage_memo.ts
  (recordLineageKeyQuery / noteLineageCacheServe — each called exactly once per
  replayLineageContentBefore entry/serve) instead of reconstruction_branches.ts, which sits
  at the 250-line cap. The memo module's "no imports" header note was amended.
- (2026-07-23) Line-cap splits the plan pre-authorized or forced:
  refForTarget/runTouchesTarget/runForTarget moved to new src/reconstruction_script_probe.ts;
  renderHistories/filterByTarget/renderChosen moved from reconstruction_cli.ts to
  reconstruction_render_list.ts; the interleaved-sessions bound test moved to new
  tests/reconstruction_bound_sessions.test.ts (the subagent's new bound test pushed
  reconstruction_bound.test.ts to 269 lines).
- (2026-07-23) tests/reconstruction_cli.test.ts:211 (test_file_flag_filters_ladder_on_
  multi_source_fixture) was NOT rewritten: it drives bare `--json --file` (the
  ReconstructionDocument path), which the plan explicitly leaves unchanged — its
  "reconstructed but filtered out" contract is still true there. The new work-scoping
  contract is pinned in tests/reconstruction_target.test.ts instead.
- (2026-07-23) Equivalence fixtures implemented: simple write, rewind, rename-into-target,
  absent target, old rename source, plus CLI-level JSON/text on a two-source fixture. The
  glob-move / copy-seeded / bounded-multi-source categories from optimizations.md are not
  separately fixture-built: the fast path shares reconstructFileOver and
  appendScriptMoveRenames verbatim with the all-files path (divergence risk is confined to
  target SELECTION, which the implemented fixtures pin), and the capture scenarios (s85 et
  al.) cover those replay mechanics in the full suite.
- (2026-07-23) The new bound test's RED phase could not run in isolation (a concurrent
  refactor transiently broke the import graph); the red evidence is the previous test's old
  pinned assertion, which demonstrably returned the last-kept-record stamp.



### Tradeoffs

- (2026-07-23) reconstructFileHistoryOver returns undefined for a script-born target that
  reconstructs to zero revisions, where the all-files path would emit an empty history via
  discoverScriptCreatedPaths. Accepted: keeping discovery out of the fast path is the whole
  point; no scenario exercises that corner (ponytail comment marks it).

### Open questions

