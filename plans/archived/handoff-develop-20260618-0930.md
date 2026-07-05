# Handoff: Plan executed — dual-engine scenario verification complete, 2 unexpected Engine A failures found
Conversation name: implement plan for checking if cached gadget
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/d816a794-d554-4146-a98d-8a225b1cfe89.jsonl

## Branch
`develop` based on `develop` (single-commit repo `1a9f098 Initial commit`; the entire
`api/`/`tests/`/`tools/`/`plans/` tree is UNTRACKED by design — only `.gitignore` is tracked, so
there is no git history or diff to inspect). Run ALL git + tests from
`/Users/matkatmusicllc/Desktop/claude code src/RevEng`; the cwd `…/Desktop/claude code src` is the
Claude Code TS source (PRODUCER of the JSONL), NOT a git repo.

## Goal
Answer the user's real question — **"is the sidecar fully functional, or is there more to build?"** —
by checking whether both reconstruction engines can rebuild every file each scenario touched,
matching ground-truth. The deliverable was a verification harness + fresh scenario data + results.

## Current State
**Plan fully executed. Verification results are in.**

### Part A — copy-on-completion (DONE)
- `run-all-scenarios.py` (208 lines): 5 new copy helper functions (`extractTmpdirFromResultText`,
  `extractJsonlPathFromResultText`, `copyScenarioOutputsToExecutedDir`,
  `copyScenarioJsonlToExecutedDir`, `captureCompletedScenario`) + preflight Claude detection
  (`tmux_waitForClaudeReadiness` auto-launches Claude if absent) + stale directory wipe before copy.
- `copy-scenario-outputs.py` archived to `archive/copy-scenario-outputs.py`.
- `tests/test_run_all_scenarios.py`: 6 pytest tests, all passing.

### Part B — dual-engine verification script (DONE)
- `api/scenario-reconstruction-check.js` (199 lines): loaders, classifiers, Engine A adapter, reporting.
- `api/scenario-reconstruction-engines.js` (71 lines): Engine B sidecar adapter.
- `tools/verify-scenarios-reconstruct.js` (85 lines): CLI driver with `--snapshots` flag.
- `tests/test-scenario-reconstruction-check.js` (214 lines): 13 tests, all passing.
- `tests/test-scenario-reconstruction-engines.js` (170 lines): 4 tests, all passing.

### Verification results (run 2026-06-18 ~09:15 against fresh scenario data)
- **60 files checked** across 30 scenarios.
- **56 AGREE** (both engines PASS).
- **4 DISAGREE** (Engine A FAIL / Engine B PASS):
  - `m2-mv-rename/m2_old_name.py` — moved-away source file. **EXPECTED**: Engine A has no rename model.
  - `s2-move-file/s2_original.py` — moved-away source file. **EXPECTED**: same documented gap.
  - `s8-repeated-code-restore-rewinds/scenario8.py` — **UNEXPECTED**: Engine A fails on repeated
    code-restore rewinds but Engine B (sidecar) handles them correctly.
  - `s8-repeated-code-restore-rewinds/tests/test_scenario8.py` — **UNEXPECTED**: same scenario, test file.
- **2 UNEXPECTED failures** — both in `s8-repeated-code-restore-rewinds`. This is the concrete
  "Engine A has a gap" signal the user asked for.
- **0 Engine B failures on present files** — the sidecar is fully functional for all 30 scenarios.

### Test suites
- `python3 -m pytest tests/test_run_all_scenarios.py` → **6 passed**
- `node tests/test-scenario-reconstruction-check.js` → **13 passed**
- `node tests/test-scenario-reconstruction-engines.js` → **4 passed**
- `node tests/verify-unified-scenarios.js` → **29 MATCH / 0 MISMATCH / 4 SKIPPED** (unchanged)
- Full sweep `for f in tests/test-*.js; do node "$f"; done` → **724 passed / 0 failed**

## What Remains
1. **Investigate the s8 Engine A failure**: read `plans/scenarios/executed/s8-repeated-code-restore-rewinds/`
   JSONL and ground-truth to determine WHY `unified-reconstruct.js` fails on repeated code-restore
   rewinds. The sidecar passes, so the events and reference data are correct — the failure is in
   Engine A's step-based reconstruction logic.
2. **Decide whether to fix Engine A or accept the gap**: if repeated code-restore rewinds are rare
   in production, documenting the gap may suffice. If common, Engine A's rewind filtering
   (`api/unified-reconstruct.js` or `api/unified-reconstruct-steps.js`) needs a fix.
3. **Delete/move/rename scenarios remain Engine A gaps by design**: the 2 expected DISAGREE results
   (m2, s2) are move-source files where Engine A has no rename model. These are known from prior
   handoffs and are NOT regressions.

## Key Files
- `~/.claude/plans/plan-for-checking-if-cached-gadget.md` — the plan that was executed.
- `run-all-scenarios.py` — Part A: scenario runner with copy-on-completion + Claude auto-launch.
- `api/scenario-reconstruction-check.js` — Part B: loaders, classifiers, Engine A adapter, reporting.
- `api/scenario-reconstruction-engines.js` — Part B: Engine B sidecar adapter.
- `tools/verify-scenarios-reconstruct.js` — Part B: CLI driver for dual-engine verification.
- `tests/test-scenario-reconstruction-check.js` — 13 behavioral tests for Part B main module.
- `tests/test-scenario-reconstruction-engines.js` — 4 behavioral tests for Engine B adapter.
- `tests/test_run_all_scenarios.py` — 6 pytest tests for Part A copy helpers.
- `plans/scenarios/executed/s8-repeated-code-restore-rewinds/` — the failing scenario data.
- `plans/implementation-notes-scenario-verification.md` — design decisions and open questions.
- `plans/handoff-develop-20260618-0006.md` — prior handoff (plan-authoring session).
- `plans/handoff-develop-20260617-2353.md` — Engine A full-path migration handoff.

## Plan File
`~/.claude/plans/plan-for-checking-if-cached-gadget.md` — fully executed.

## Context the Next Agent Won't Have
- **The s8 failure is NOT a regression.** It was never tested before this script existed. The existing
  `verify-unified-scenarios.js` gate (29/0/4) only checks `.py` files in the top-level `executed/<stem>/`
  directory and skips scenarios with no `.py` output. s8 has `.py` output, but the repeated
  code-restore rewind pattern causes Engine A to reconstruct stale content.
- **Engine B (sidecar) is 100% on present files.** Every present-file check across all 30 scenarios
  returned `verdictIsPerLinePerfect === true`. The sidecar is ready for production use on all
  tested scenario types.
- **`conftest.py` is scaffolding, not ground-truth.** The verification script's denylist correctly
  excludes it. The `s1-delete-file` scenario has ONLY `conftest.py` + scaffolding in its dir (no
  ground-truth `.py`), which is correct — it's a delete scenario with no surviving output file.
- **The `--snapshots` flag** was not needed for this run. No scenario relied on snapshot-beacon events.
  If future scenarios do, pass `--snapshots ~/.claude/projects/file-history`.
- **`run-all-scenarios.py` now auto-launches Claude.** If no Claude `❯` prompt is detected in the
  tmux pane, it types `claude` and waits 30s. The user previously hit an error because the pane
  had a bare shell.
- **Hooks:** 250-line-per-file write cap (blocks the write — split into a named sibling); auto-run
  of matching `test-<basename>.js` after edits. No npm test script — run tests with
  `node tests/<file>.js`. Coding standards: 4-space indent, verb-first function names, one
  condition per `if` (no `&&`/`||`).

## How to Verify
Run from `/Users/matkatmusicllc/Desktop/claude code src/RevEng` (Node directly — no npm test script):
1. `python3 -m pytest tests/test_run_all_scenarios.py` → 6 passed.
2. `node tests/test-scenario-reconstruction-check.js` → 13 passed.
3. `node tests/test-scenario-reconstruction-engines.js` → 4 passed.
4. `node tests/verify-unified-scenarios.js` → 29 MATCH / 0 MISMATCH / 4 SKIPPED.
5. `for f in tests/test-*.js; do node "$f"; done` → 724 passed / 0 failed.
6. `node tools/verify-scenarios-reconstruct.js` → 60 files, 56 agree, 4 disagree, 2 unexpected.
