# Handoff: scenario coverage checker shipped; golden-value test suite left red by an all-scenario re-run
Conversation name: api-from-scenarios scenario coverage checker
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/829f9c5e-d6c6-4c3a-856a-f5940b7b8d5c.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/i-need-a-script-peppy-twilight.md (the implemented plan)
Implementation notes: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-scenario-coverage-checker.md

## Branch
`api-from-scenarios` based on `master`. All work from this session is committed as `bc0fd42 scenario coverage checking`. Working tree is CLEAN. There is no `-plate` branch.

## Goal
Build a coverage tool that runs every executed scenario through the reconstruction engine per code-change step, diffs each engine step against its captured `.step_states` ground truth, and on a mismatch reports the scenario, step folder, differing file + first differing line, the best-matching engine step's triggering JSONL line, and (Phase 2) the reconstruction stage function responsible. This replaces the brittle hand-written per-scenario golden tests with a content-based, re-run-stable check.

## Current State
ALL plan phases are implemented, committed, and verified. `npx tsc --noEmit` is clean.

What works (run individually, all green):
- `scripts/check_scenario_coverage.ts` (+ `coverage_compare.ts`, `coverage_scenarios.ts`) — runs E2E: `npx tsx scripts/check_scenario_coverage.ts` exits 1, prints a matrix over 64 covered scenarios (8 concurrent multi-jsonl dirs are skipped + logged), reports 41 OK / 23 FAIL. s19 (the known-good control) is OK 4/4. Failures show per-step diff + JSONL line + provenance, e.g. s29 → `↳ completeElidedBeacons: … (changeId afa1ee3d…)`.
- Phase 0: `src/reconstruction_steps.ts` `pathAtTime` keys per-step snapshots by name-at-time (rename-correct).
- Phase 1: lifted helpers + `reconstructStepChanges` in `reconstruction_steps.ts`.
- Phase 2: `src/reconstruction_provenance.ts` sink (disabled by default) + `noteStage` instrumentation in `reconstruction_branches/sidecar/beacons/reseed.ts` + `renderStepProvenance` in the script.
- 26 new tests across 5 new test files — all pass.

Full suite (`npm test`): 593 tests, **233 pass / 360 fail**. The 360 failures are PRE-EXISTING golden-value drift (NOT from this work — see Context below); this session moved the numbers from 208→233 pass and 362→360 fail (no regressions; Phase 0 fixed 2).

## What Remains
The implementation is complete; "continue where I left off" means picking up from a clean, committed state. Concrete options, in priority order:

1. **(Standing item — biggest) Re-characterize or retire the ~360 red golden tests.** The user re-ran all 72 scenarios, regenerating every transcript with new uuids/timestamps; the hand-written per-scenario tests (`tests/reconstruction_engine_s*.test.ts`, `reconstruction_cli_s*.test.ts`, tree/graph suites) hardcode run-specific uuids, changeId short-ids (`#01TYChTi`), line counts, and rendered content from the OLD runs. They fail on assertion now, not paths. Decide per-file: regenerate goldens from the new runs, OR retire in favor of the new content-based coverage tool. The user EXPLICITLY deferred this ("build the tool, don't fix the 362 tests") — confirm before doing it.
2. **Wire the coverage tool into CI / `npm test`** if desired — currently it is a standalone `npx tsx` script (intentionally; it exits 1 because real engine gaps exist).
3. **Investigate the 23 real FAILs** the tool surfaces (these are genuine engine/harness signal, not stale tests): the script-rename family (s29/s32/s35/s37/s38 — beacon completion gaps), the git-baseline family (s40/s41/s42 etc. — reconstruct to 0 engine steps because they need a baseline session excluded), and the compact family (s63/s65/s66/s68/s71 — PARSER throws on an unmodeled `logicalParentUuid` key). Each is a distinct, real lead.

## Key Files
- `scripts/check_scenario_coverage.ts` — orchestrator: `checkScenario`, `buildStepMismatch`, `renderStepProvenance`, `main()`.
- `scripts/coverage_scenarios.ts` — discovery + IO: `findCoveredScenarios`, `buildUuidLineIndex`, `readStepStateFiles`, `stepFolders`.
- `scripts/coverage_compare.ts` — pure diff/select: `firstLineDifference`, `selectBestEngineStep`, `firstDifferingFile`.
- `src/reconstruction_steps.ts` — `pathAtTime`, `reconstructStepChanges`, lifted `snapshotFileText`/`stripTrailingNewline`/`someStepReproduces`.
- `src/reconstruction_provenance.ts` — the global opt-in provenance sink.
- `tests/fixtures.ts` — NOW resolves scenarios by DIRECTORY NAME via `findScenarioJsonl(dirName)` (root-cause fix for re-run drift); `M1_JSONL`–`M7_JSONL` map to the renumbered `s46`–`s52` dirs.
- `plans/i-need-a-script-peppy-twilight.md` — the plan. `plans/implementation-notes-scenario-coverage-checker.md` — full session notes + deviations.

## Context the Next Agent Won't Have
- **The whole suite was red at session start (487/570) purely from the re-run.** `scenarios/executed/` is UNTRACKED in git; the user re-ran every scenario with `.step_states` capture, giving each a NEW `<uuid>.jsonl` and folding old `m1`–`m7` into `s46`–`s52`. The fix was making `tests/fixtures.ts` resolve by dir name (this cleared 485 ENOENT). Do NOT reintroduce hardcoded uuid paths.
- **Phase 0's plan spot-check expectation was WRONG for the re-run data:** the plan predicted s2-move-file would fail on a `tests/test_s2_original.py` blank-line gap; in the current data s2 passes 3/3 (Phase 0 fixed the rename keying; the blank-line gap isn't present in this run). Don't chase it.
- **The wiring test uses s29, not s19 (deviation from the plan).** s19's STEP path (branch-agnostic, which the coverage tool uses via `reconstructStepStates`) fires NO rescue stage; its `seedStaleEditBases` fires only in the surviving-branch path (`reconstructBranches`). The beacon stages (`completeElidedBeacons`/`completeTruncatedBeacon`) are what fire in the step path, on the script-rename scenarios — so s29 is the honest fixture for proving provenance is wired into the path the tool runs.
- **Engine instrumentation is a no-op by default.** `noteStage` only records when `enableProvenance()` is called (the coverage script does it per-scenario, then `disableProvenance()`); normal reconstruction is byte-identical. This is why instrumenting core engine files didn't regress anything.
- **The repo enforces a 250-line-per-file cap and a >3-indent nesting rule via a Stop hook** (`jot:post_tool_use`). The coverage script was split into 3 files to stay under 250; several helpers were extracted to flatten nesting. Keep new files under 250 and avoid 4-deep nesting.
- **The test runner is `node --import tsx --test tests/*.test.ts`** (NOT vitest). Tests live in `tests/` with `.test.ts` suffix. Scripts in `scripts/` are not auto-run as tests.
- **`?? "json\n"` in earlier git status was a pre-existing stray file, not from this work.**

## How to Verify
From `/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios`:
- `npx tsc --noEmit` — must be clean.
- The new work green in isolation: `node --import tsx --test tests/reconstruction_steps_name_at_time.test.ts tests/reconstruction_steps_changes.test.ts tests/check_scenario_coverage.test.ts tests/reconstruction_provenance.test.ts tests/reconstruction_provenance_wiring.test.ts tests/reconstruction_cli_s19_steps.test.ts` — expect all pass.
- The tool itself: `npx tsx scripts/check_scenario_coverage.ts` — expect exit 1, `OK   s19   4/4`, and a matrix of 41 OK / 23 FAIL.
- `npm test` — expect 233 pass / 360 fail; the 360 are the known pre-existing golden-value drift, NOT regressions.
