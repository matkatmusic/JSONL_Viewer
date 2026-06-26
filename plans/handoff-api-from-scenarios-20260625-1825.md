# Handoff: scenario tests rewired to run through check_scenario_coverage; 3 decisions left for the user
Conversation name: api-from-scenarios: scenario tests → check_scenario_coverage
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/f7ad55b4-dab8-43df-a818-577dc514ea67.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/all-scenario-based-tests-should-glistening-mccarthy.md
Implementation notes: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-scenario-tests-to-coverage-tool.md

## Branch
`api-from-scenarios` based on `master`. Last commit is `bc0fd42 scenario coverage checking`. **NOTHING from this session is committed** — the entire working tree below is uncommitted. There is no `-plate` branch.

## Goal
Replace the brittle, hand-written per-scenario tests (which hard-coded run-specific uuids, changeId short-ids, line counts, and rendered text and broke on every scenario re-run) with a content-based check: each scenario's reconstruction is verified by proving every captured `.step_states/step-NNN` folder is reproduced byte-for-byte by some engine step. The reconstruction tool `scripts/check_scenario_coverage.ts` already does this; this session (1) let it check a single scenario, and (2) rewired the test suite to drive it instead of asserting on rotating data.

## Current State
All planned + user-approved work is DONE and verified. `npx tsc --noEmit` is clean.

Implemented:
- **Single-scenario CLI.** `scripts/coverage_scenarios.ts` gained `listCoveredScenarios()` (one home for the executed root). `scripts/check_scenario_coverage.ts` exported `checkScenarioResilient` and `main()` now takes an optional `argv[2]` scenario filter (matches `scenarioId` or `dirName`). `npx tsx scripts/check_scenario_coverage.ts s19-user-edit-conv-rewind` → `OK s19 4/4`, exit 0; unknown name → exit 2; a gap scenario (e.g. s40) → exit 1. The "Uncovered" report is suppressed when a filter is active.
- **New data-driven suite** `tests/scenario_coverage.test.ts`: imports `listCoveredScenarios()` + `checkScenarioResilient()` in-process and emits one test per covered scenario asserting `total > 0` and zero mismatches. Auto-covers new scenarios.
- **Deleted 86** per-scenario files: `tests/reconstruction_{engine,cli}_s*.test.ts` and `_m*.test.ts` (incl. `reconstruction_cli_s19_steps.test.ts`).
- **Trimmed (not deleted)** the 5 generic fixture-driven files — removed only the rotating `#<shortid>`/uuid/changeId pins, kept re-run-stable structural assertions + synthetic-input unit tests. All 5 now green (44/44): `reconstruction_cli` (kept topology + the 2 parseArgs tests; removed 3 wholly `--branch <tip-id>`-based tests), `reconstruction_extract`, `reconstruction_engine` (`histories.length === 3` → `>= 3`; the s3 re-run now yields 4 histories), `reconstruction_branches` (uuid-membership → set-size 1/0), `reconstruction_user_edit` (uuid-prefix lookup → structural find).
- **Restored a deleted fixture** the user suspected: `tests/fixtures/broken-step-states/.step_states/step-001/scenario19.py` (empty folder → tool's own test `test_checkScenario_reports_a_mismatch_with_the_broken_fixture` was failing). Recreated a clearly-mangled file; tool's own suite is 26/26 again. **This fixture is UNTRACKED.**

`npm test`: **232 tests, 198 pass, 34 fail.** The 34 = **23 intended** scenario-coverage engine-gap reds (rename s29/32/35/37/38; git-baseline s40-47; compact s63-72) + **11 out-of-scope pre-existing** failures: 8 real parser/vocab gaps (`loadTranscript` ×4, `parseRecord` ×1, `session-meta`/`vocabulary` attachment-kind, `file-history`) and 3 tree/graph (`reconstruction_tree` ×2, `reconstruction_graph` ×1) the user chose to keep.

## What Remains
The user was asked 3 decisions at session end and has NOT yet answered. Do these only on their instruction:
1. **Fix the real parser/vocab gaps (8 failing tests).** The all-scenario re-run introduced new wire vocabulary the parser doesn't model: `command_permissions` attachment kind, and `attribution_plugin`/`attribution_skill`/`mcp_attribution` assistant keys. Add them to the allow-sets/vocabulary (follow the s32 `attributionMcpServer`/`attributionMcpTool` precedent in `src/parse/loadTranscript.ts` and `src/structures/vocabulary.ts`). These are genuine gaps — do NOT delete the tests.
2. **Decide on tree/graph (3 failing tests).** User kept `reconstruction_tree`/`graph` as a different module. They are red only from pinned run-specific data (fork uuid `8faab841`, a "last assistant" structural pick). Either apply the same trim (de-pin → green) or leave red — user's call.
3. **Commit.** Nothing is committed. When the user approves, commit the working tree on `api-from-scenarios` (branch is not master, safe to commit). Ensure the untracked `tests/fixtures/broken-step-states/` and `tests/scenario_coverage.test.ts` are staged so the broken fixture cannot vanish again.

## Key Files
- `scripts/check_scenario_coverage.ts` — the tool; `checkScenario`/`checkScenarioResilient` (exported), `main()` single-scenario filter.
- `scripts/coverage_scenarios.ts` — `listCoveredScenarios()`, discovery/IO (`findCoveredScenarios`, `stepFolders`, `readStepStateFiles`).
- `tests/scenario_coverage.test.ts` — the new data-driven suite (the deliverable).
- `tests/reconstruction_{cli,extract,engine,branches,user_edit}.test.ts` — the 5 trimmed files.
- `tests/fixtures.ts` — left untouched; `S*_JSONL`/`M*_JSONL` resolve scenarios by dir name. Many are now unused but harmless (S13/S29 etc. still imported by survivors).
- `plans/implementation-notes-scenario-tests-to-coverage-tool.md` — full per-decision notes for this session.

## Context the Next Agent Won't Have
- **User decisions made mid-session (binding):** (a) ONE data-driven suite, not one file per scenario; (b) let the engine-gap scenarios fail RED — NO skip-list/`todo`; (c) KEEP the tree/graph tests (different module); (d) for the generic reconstruction tests, TRIM (de-pin) rather than delete — keep stable structural + synthetic unit tests.
- **The 23 scenario_coverage reds are the POINT, not a regression.** They are genuine engine/parser gaps the content-based check surfaces (the tool itself exits 1 by design). Do not "fix" them by weakening `tests/scenario_coverage.test.ts`.
- **`scenarios/executed/` and `tests/fixtures/broken-step-states/` are UNTRACKED in git** (not gitignored). The broken fixture was lost once already because it was never committed — that caused the tool's own test to fail this session. Commit it.
- **Tests invoke the tool IN-PROCESS** (import its exported functions), NOT via subprocess — intentional (56 subprocess spawns would be slow/noisy). "Invoking check_scenario_coverage" = calling `checkScenarioResilient`.
- **8 multi-jsonl concurrent dirs (s53-62 subset) are auto-skipped** by `findCoveredScenarios` (`expected exactly one .jsonl`) and print `skip …` lines on every run — expected, not errors.
- **Repo enforces a 250-line/file cap + >3-indent rule via a PostToolBatch Stop hook.** It re-runs the full (currently-red) suite after edits and emits "Tests FAILED" — that is the pre-existing drift, NOT your change; the explicit `npm test` is authoritative. Keep new files <250 lines.
- **Test runner is `node --import tsx --test tests/*.test.ts` (NOT vitest).** Glob-based — new `tests/*.test.ts` files are auto-discovered.
- **`rtk` shell aliases hijack bare `grep`** in this environment; use `/usr/bin/grep` when scripting log analysis.

## How to Verify
From `/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios`:
- `npx tsc --noEmit` — must be clean.
- `npx tsx scripts/check_scenario_coverage.ts s19-user-edit-conv-rewind` — `OK s19 4/4`, exit 0.
- `node --import tsx --test tests/reconstruction_cli.test.ts tests/reconstruction_extract.test.ts tests/reconstruction_engine.test.ts tests/reconstruction_branches.test.ts tests/reconstruction_user_edit.test.ts` — 44 pass / 0 fail.
- `npm test` — 232 tests, 198 pass, 34 fail; the 34 are 23 intended scenario-coverage gaps + 11 out-of-scope (8 parser/vocab + 3 tree/graph). No other reds.
