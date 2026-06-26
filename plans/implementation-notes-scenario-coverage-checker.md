## 2026-06-25:15:30:00 — Scenario coverage checker (per-step CLI vs `.step_states`)
Chat title: api-from-scenarios scenario coverage checker
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/829f9c5e-d6c6-4c3a-856a-f5940b7b8d5c.jsonl

### References
- /Users/matkatmusicllc/.claude/plans/i-need-a-script-peppy-twilight.md  (the plan being implemented)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/coding-requirements.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/tests/reconstruction_cli_s19_steps.test.ts  (reference per-step suite)

### Design decisions
- **Fixture resolution rewritten to be re-run-proof (Phase -1, not in the plan).** The user re-ran all 72
  scenarios with `.step_states` capture, which regenerated every transcript with a NEW `<uuid>.jsonl`
  filename and folded the old `m1`–`m7` scenarios into sequential numbering as `s46`–`s52`. Every
  hard-coded path in `tests/fixtures.ts` went stale → 485 ENOENT failures at session start. Per the user's
  direction, `tests/fixtures.ts` now resolves each `<SCENARIO>_JSONL` by its **directory name** via a new
  `findScenarioJsonl(dirName)` helper that scans the known roots (in-worktree capture dir first, then the
  Desktop dir) and returns the dir's single `*.jsonl`. This survives any future re-run. `M1_JSONL`–`M7_JSONL`
  are kept (user chose "keep, remap") and now resolve to the `s46`–`s52` dirs.
- **Phase 0 `pathAtTime`** added to `src/reconstruction_steps.ts`: the per-step snapshot now keys each file
  by the name it held at the step's instant (latest rename `to` at-or-before `when`; first rename `from`
  when `when` precedes all renames; else `history.target`). Only `produceRepoStateAtTime` changed.

### Deviations
- **The plan assumed `npm test` was green; it was not.** The all-scenario re-run left the suite at
  83/570 passing. The fixture-path fix raised it to 208/570. The remaining 362 failures are pre-existing
  golden-value drift (per-scenario tests hardcode run-specific uuids, changeId short-ids, line counts, and
  rendered content from the OLD runs). **Per explicit user instruction ("build the tool, don't fix the 362
  tests"), these 362 are OUT OF SCOPE.** New work is verified by running its own test files directly, not
  the full suite. The repo's Stop hook runs the full suite and will report these 362 as red; that is the
  known, accepted baseline state, not a regression from this work.

### Tradeoffs
- Considered re-characterizing the whole golden suite first (clean green baseline) vs building the coverage
  tool first. Chose the tool first (user's call): the tool validates engine output against `.step_states`
  (content-based, re-run-stable) and is the durable replacement for the brittle hardcoded-uuid goldens.

### Open questions
- None blocking. The 362 golden-value failures remain for a future re-characterization pass (or retirement
  in favor of the coverage tool); flagged here so they are not mistaken for regressions from this work.

### Phase 1 findings (the tool's first real run)
The script splits into three files to honor the 250-line cap (project rule "split, never condense"):
`scripts/coverage_compare.ts` (pure diff/select), `scripts/coverage_scenarios.ts` (discovery + IO),
`scripts/check_scenario_coverage.ts` (orchestration + main). Tests import each from its canonical home
(no forwarding layer). E2E run over all scenarios: **41 OK / 23 FAIL / 64 covered** (8 concurrent
multi-jsonl dirs skipped, logged), exit 1 — the tool works; not everything passes, as the plan expected.

Three deviations from the plan's spot-check expectations, all DATA/ENGINE realities not tool defects:
- **s2-move-file now passes 3/3** (plan predicted a `tests/test_s2_original.py` blank-line gap). Phase 0
  fixed the rename keying; the blank-line gap the plan expected is not present in the re-run's s2 data.
  s19 (the known-good control) passes 4/4 as specified.
- **6 git-baseline/compact scenarios reconstruct to 0 engine steps** (s40, plus compacts). `buildStepMismatch`
  now guards `steps.length === 0` and reports "engine produced 0 steps (scenario may need a baseline session
  excluded)" instead of crashing — these need `--excludeJSONL`, a known harness limit the plan names.
- **5 compact scenarios (s63/s65/s66/s68/s71) fail to PARSE**: `loadTranscript` throws on an unmodeled
  `logicalParentUuid` key in compaction system records. The resilient wrapper reports this as an ERROR row
  and continues. Fixing the parser for the s63+ compact era is OUT OF SCOPE for this plan (s1–s45 + per-step).

### Phase 2 findings (provenance)
- The provenance sink (`src/reconstruction_provenance.ts`) is a global, disabled-by-default singleton, so
  the six instrumented stages are a no-op in normal reconstruction — existing engine behavior is byte-
  identical (confirmed: full-suite failures went DOWN 362→360, never up).
- **Key wiring deviation:** the plan's wiring test named s19, but s19's STEP path (branch-agnostic, which
  the coverage tool uses) fires NOTHING — its `seedStaleEditBases` reseed fires only in the surviving-branch
  path. The instrumented stages that fire in the STEP path are the beacon-completion ones (s28/s29/s35
  script-renames: `completeElidedBeacons` / `completeTruncatedBeacon`). The wiring test therefore uses **s29
  via `reconstructStepStates`** — proving the sink is wired into the exact path `checkScenario` runs. This is
  more honest and tool-relevant than the s19 the plan assumed.
- E2E proof: s29 now reports `pkg/a.py @line 31: expected "def load_rows(text):" got "def preprocess(x):"`
  followed by `↳ completeElidedBeacons: … (changeId afa1ee3d…)` — the stage function responsible is named.

### End-to-end verification
1. `npx tsc --noEmit` — clean.
2. `npm test` — the 26 new tests all pass; the suite sits at 233 pass / 360 fail / 593 (the 360 are the
   pre-existing golden-value drift from the scenario re-run, OUT OF SCOPE per user instruction). No
   regressions from this work (failures fell 362→360, passes rose 208→233; none of the new test names
   appear among failures).
3. `npx tsx scripts/check_scenario_coverage.ts` — runs all 64 covered scenarios (8 concurrent multi-jsonl
   skipped/logged), exit 1, prints the matrix: s19 OK 4/4 (known-good control), 41 OK / 23 FAIL, with
   per-step diff + JSONL-line + provenance on the failures, and `Uncovered: none`.
4. `main()` exits 1 when any covered step fails or errors, 0 otherwise.

### Progress
- [x] Phase -1: fixture resolver (`findScenarioJsonl`) — 485 ENOENT cleared, typecheck clean.
- [x] Phase 0: name-at-time per-step keying — `tests/reconstruction_steps_name_at_time.test.ts` 3/3 green.
- [x] Phase 1 Task 1: lifted helpers + `reconstructStepChanges` — `reconstruction_steps_changes.test.ts` 7/7;
      s19 steps suite refactored to import them (regression guard green).
- [x] Phase 1 Task 2: `check_scenario_coverage.ts` (+ `coverage_compare.ts`, `coverage_scenarios.ts`) —
      `check_scenario_coverage.test.ts` 11/11; script runs E2E, exit 1, s19 OK, clean mismatch reporting.
- [x] Phase 2 Task 3: provenance sink — `reconstruction_provenance.test.ts` 4/4.
- [x] Phase 2 Task 4: instrumented the six stages — `reconstruction_provenance_wiring.test.ts` 1/1.
- [x] Phase 2 Task 5: `renderStepProvenance` + wired into `checkScenario` — 2 tests; provenance surfaces E2E.
- [x] E2E verification — typecheck clean, new tests green, script behaves per spec.
