## 2026-06-25:18:10:00 — Replace per-scenario fixture tests with a data-driven coverage suite
Chat title: api-from-scenarios: scenario tests → check_scenario_coverage
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ (latest *.jsonl in this dir for the live session)

### References
- /Users/matkatmusicllc/.claude/plans/all-scenario-based-tests-should-glistening-mccarthy.md (the plan this implements)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260625-1710.md (prior handoff: tool shipped at commit bc0fd42)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-scenario-coverage-checker.md (prior session notes on the tool itself)
- scripts/check_scenario_coverage.ts, scripts/coverage_scenarios.ts (the tool)
- tests/scenario_coverage.test.ts (the new suite)

### Design decisions
- **Tests call the tool in-process, not via subprocess.** `tests/scenario_coverage.test.ts` imports the exported `listCoveredScenarios()` + `checkScenarioResilient()` and asserts on the returned `ScenarioResult`. Spawning the CLI 56× would be slow and noisy; importing its logic IS "invoking check_scenario_coverage."
- **One data-driven suite, not one file per scenario** (confirmed with user). `for (const sc of listCoveredScenarios()) test(...)` — fewest files, auto-covers new scenarios (s40+, compact), no engine/cli duplication. Deleted 86 per-scenario files.
- **Used `checkScenarioResilient` (not `checkScenario`) in the suite** so a parser crash (compact family) becomes a clean failed assertion with the error message, not an uncaught throw. Exported it for this.
- **Single source for the executed root:** added `listCoveredScenarios()` to coverage_scenarios.ts; both `main()` and the test use it (DRY, per coding-requirements).
- **Single-scenario CLI:** `npx tsx scripts/check_scenario_coverage.ts <scenarioId|dirName>` filters to one scenario. Exit 0 reproduced / 1 mismatch / 2 no-match. Suppressed the "Uncovered" report under a filter (it otherwise listed every *other* scenario as uncovered — misinformation).

### Deviations
- **Restored a deleted test fixture (not in the plan).** The tool's own regression test `test_checkScenario_reports_a_mismatch_with_the_broken_fixture` was failing because `tests/fixtures/broken-step-states/.step_states/step-001/` was empty — the deliberately-mangled `scenario19.py` had been deleted from the working tree and was never committed (git has no record; not gitignored). User confirmed they likely deleted it. Recreated a clearly-labelled mangled `scenario19.py`; the test is green again (26/26 in that file). **This fixture is untracked — it must be committed this time or it will vanish again.**
- **Left `tests/fixtures.ts` untouched.** After deleting 86 files, most `S*_JSONL`/`M*_JSONL` exports are unused, but surviving tests still import several (S13 tree/graph, S29 provenance-wiring, S1–S9/S15 generic reconstruction tests). Pruning is deferred — harmless dead exports beat risking a broken import for no behavior change.

### Tradeoffs
- Replacing the per-scenario CLI tests drops the dedicated regression lock on `--verbose` line-numbered rendering. Accepted: the reconstruction *content* those tests depended on is now proven more robustly (content-based, re-run-stable) by the coverage suite; only the render surface is no longer scenario-pinned.
- "Let the gaps fail red" (user's choice) over a `todo` skip-list: `npm test` is red until the engine reproduces those scenarios, but every red is genuine engine signal with a per-step diff, and a regression in a currently-green scenario surfaces immediately.

### Update — generic reconstruction tests TRIMMED (resolves old open question 1)
User chose "trim, don't delete." Removed only the brittle, re-run-rotating assertions from the 5 generic
fixture-driven files and kept the re-run-stable structural assertions + synthetic-input unit tests:
- **reconstruction_cli.test.ts**: dropped every pinned `#<shortid>` / branch-tip-id assertion and the
  hard-coded tmp `--target` path; kept topology (branch wrappers, file names, turn kinds, ordering,
  linearity, rewound-branch counts) and the two synthetic `parseArgs` tests. Removed 3 tests that were
  *wholly* built on a rotated `--branch <tip-id>` selection (no stable assertion remained) — this drops
  direct coverage of `--branch <id>` rendering and `--target` narrowing (note below). `--branch` rejection
  of an unknown id is still covered (matcher relaxed to "throws").
- **reconstruction_extract.test.ts**: removed the pinned cp `changeId` suffix; kept `copies.length===1` +
  from/to.
- **reconstruction_engine.test.ts**: `histories.length === 3` → `>= 3` (the s3 re-run now yields **4**
  histories — one extra sibling file; the named source/copy/test assertions still pin the real shape).
- **reconstruction_branches.test.ts**: replaced two pinned-uuid set-membership checks with stable set-size
  assertions (S15 accepted = 1, S13 accepted = 0).
- **reconstruction_user_edit.test.ts**: replaced `recordWithUuidPrefix("d675bbfe"/"75934004")` lookups with
  structural ones (find the record `userEditEventFrom` recognizes; assert exactly one such record); changeId
  asserted against the record's own uuid, not a pinned literal.
All 5 files: 44/44 green, tsc clean.

Lost coverage to note: CLI `--verbose` line-numbered RENDERING and `--branch <id>`/`--target` render
narrowing no longer have a dedicated scenario lock (the reconstructed *content* is still proven by
scenario_coverage; `--target` parsing is still covered by the parseArgs unit test).

### Verification
- `npx tsc --noEmit` — clean.
- Single-scenario CLI: s19 → `OK s19 4/4`, exit 0; bad name → exit 2; s40 (gap) → exit 1.
- Tool's own suite (check_scenario_coverage + steps + provenance): 26/26 green.
- `npm test`: **232 tests, 198 pass, 34 fail.** The 34 = **23 intended** scenario-coverage engine-gap reds
  + **11 out-of-scope pre-existing** failures (see Open questions). All 22 brittle failures in the 5 trimmed
  files are now green.

### Open questions
1. **Parser / vocabulary tests fail on genuinely-new wire vocab — a real workstream, not brittleness.**
   `loadTranscript` (4), `parseRecord` (1), `session-meta`/`vocabulary` attachment-kind (≈2), `file-history`
   (1): the re-run introduced new keys/kinds (`command_permissions` attachment kind, `attribution_plugin`/
   `skill` and `mcp_attribution` assistant keys). These need actual parser allow-set / vocabulary additions
   (cf. the s32 `attributionMcp*` precedent). Deleting them would hide real parser gaps. Want these fixed?
2. **tree/graph (3 fails) — trim them too?** You chose to KEEP `reconstruction_tree`/`graph` (different
   module). They are red purely from pinned run-specific data (fork uuid `8faab841`, a "last assistant"
   structural pick). Same trim treatment would green them — want it, or leave as-is?
3. **Commit the untracked broken-step-states fixture** (`tests/fixtures/broken-step-states/.step_states/
   step-001/scenario19.py`) so the tool's own regression test can't silently break again.
