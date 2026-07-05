# Handoff: batch reconstruction-coverage report built + redesigned to full-path/lineage identity; engine-b-mismatches formatter tool added
Conversation name: Implement — reconstruction-coverage report (jot SHA + JSONL → per-file 100%-reconstruct verdict)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/8273d833-f339-4292-8a9a-5d0962bfce61.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/vectorized-launching-phoenix.md

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; ALL RevEng source is untracked/modified — nothing from this work is committed). CWD for all work: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

## Goal
Build a batch coverage report that answers, for every jot file: can its line history be reconstructed 100% from a git seed commit + the JSONL corpus, and where/why does it fall short? Each row gives `PASS|FAIL|INDETERMINATE`, a missing-data hypothesis, and the exact single-file rerun command. Purpose: enable per-file deep dives to close reconstruction gaps.

## Current State
COMPLETE and verified. The plan `vectorized-launching-phoenix.md` was implemented in 9 phases, THEN redesigned per the user (see "Context" below).
- New API modules: `api/git-tree-files.js` (`listFilesAtCommit`), `api/reconstruct-file.js` (`reconstructFileWithSeed`, `buildSeedAliases`, `loadCombinedCache`, `collectDistinctTouchedPaths`, `chooseReference`), `api/reconstruction-coverage.js` (`buildFileUniverse`, `summarizeVerdict`, `classifyVerdict`, `diagnoseFailure`, `buildRerunCommand`), `api/coverage-report-format.js` (`formatCoverageMarkdown`/`formatCoverageJson`).
- New CLIs: `tools/reconstruction-coverage-report.js` (batch), `tools/format-engine-b-mismatches.js` (formats `engine-b-mismatches.md` from `probe-results-engine-b.json`).
- Refactored: `tools/track-line-states.js` now delegates to `reconstructFileWithSeed` and re-exports `chooseReference`.
- DELETED: `api/jot-roots.js` + `tests/test-jot-roots.js` (the filename-overlap root heuristic — replaced by full-path lineage identity).
- Tests: all suites green — `test-git-tree-files` (2), `test-reconstruct-file` (7), `test-reconstruction-coverage` (10), `test-coverage-report-format` (4), `test-format-engine-b-mismatches` (2); FULL JS regression green (`for f in tests/test-*.js; do [ "$f" = tests/test-output-data.js ] && continue; node "$f"; done`); pytest `tests/test_run_all_scenarios.py` 6 passed (run via `~/.pyenv/shims/pytest`).
- Authoritative E2E (seed `793e6524…`): 569 files — PASS 160 / FAIL 69 / INDETERMINATE 340; sum checks out; every non-PASS row has a missing-data hypothesis + rerun command. Report at `/tmp/jot-reconstruction-coverage.md` (+ `.json`). README.md → PASS (was a cross-root false-positive FAIL pre-redesign); util_lib.py → PASS (470/470).
- `engine-b-mismatches.md` regenerated from a fresh `probe-engine-b.js` run: now 248 MISMATCH (159 in-project, 89 not-in-project) vs the stale 99 — the corpus changed; this is expected, not a regression.

## What Remains
All OPTIONAL (the feature is done and verified). In priority order:
1. Decide whether to scope the universe tighter: 340 of 569 rows are INDETERMINATE because they are paths touched under the repo but not currently on disk (no ground truth). If undesired, add a one-line filter in `buildFileUniverse` (`api/reconstruction-coverage.js`) to drop entries that are neither `inGitAtSha` nor `onDisk`, or expose a `--only-ondisk` flag on `tools/reconstruction-coverage-report.js`.
2. Filter junk paths from the universe (e.g. a file literally named `1` from a bash-redirect artifact shows as INDETERMINATE noise). Decide a rule (e.g. require an extension or git-tracked) before adding it.
3. If the user wants the seed-clobber gap closed for FAIL rows flagged `seeded=clobbered`, that is the deferred "durable seed / option B" decision — out of scope here; see `implementation-notes-make-engine-b-the-main-engine.md`.
4. Commit the work if desired (nothing is committed; create a branch off `develop` first — do not commit to `develop` per repo convention unless told).

## Key Files
- `/Users/matkatmusicllc/.claude/plans/vectorized-launching-phoenix.md` — the original plan (read for full TDD breakdown + locked decisions). NOTE: its cross-root "jot roots" design was superseded.
- `RevEng/plans/implementation-notes-vectorized-launching-phoenix.md` — the running notes: design decisions, deviations, the redesign rationale, and the E2E results. READ FIRST.
- `RevEng/api/reconstruct-file.js` — per-file engine; `buildSeedAliases` = lineage/provenance closure of the canonical full path (the heart of the redesign).
- `RevEng/api/reconstruction-coverage.js` — `buildFileUniverse` (git tree ∪ touches under the single real repoRoot; excludes directories), `classifyVerdict`, `diagnoseFailure`, `buildRerunCommand`.
- `RevEng/tools/reconstruction-coverage-report.js` — batch CLI.
- `RevEng/tools/format-engine-b-mismatches.js` + `RevEng/plans/engine-b-mismatches.md` — the probe-mismatch formatter and its output.

## Context the Next Agent Won't Have
- **Seed SHA typo:** the plan said `793e25241902f276…` which DOES NOT EXIST. Correct seed is `793e65241902f276caf5f5c28d539269e7d36d11` → commit `793e652 "Fix /jot+/todo hook orchestrator path resolution"` (185 files). Use the `793e6524…` form.
- **Why the root heuristic was removed (the big one):** the original Phase-2 `detectJotRoots`/`expandCrossRootAliases` inferred "jot roots" by filename overlap and merged evidence across same-name files under every root. A real trace of `README.md` showed this turns a clean PASS (198/198) into FAIL (0/2/196) by merging RevEng's README, the python-migration worktree's README, etc. into jot's reconstruction. It corrupts even LEGITIMATE jot worktrees because their copies have DIVERGED — merging divergent versions chronologically is unsound by construction. Threshold/deny-list/git-identity tuning can't fix that. The fix: identify each file by its canonical full path; merge cross-copy evidence ONLY through recorded `cp`/`mv` lineage (`resolveAliases([canonical], graph)`); scope the universe by full-path containment under the single real repoRoot. Do NOT reintroduce filename-based root inference.
- **`contributingRoots` was renamed to `contributingPaths`** everywhere (they are provenance alias paths, not roots).
- **EISDIR bug found by the E2E:** a directory got into the universe and `chooseReference` did `readFileSync` on it. Fixed via `isExistingFile` guard in `chooseReference` and a directory-skip in `buildFileUniverse`. Keep both.
- **CLI pipeline fidelity:** `reconstructFileWithSeed` reproduces the track-line-states CLI's FULL pipeline (alias-windows + combined main/subagent cache + reference ladder + gitSeed), parameterized by a preloaded cache — NOT the plan's simplified Phase-3 sketch. The plan's invariant "existing CLI tests stay green" required this; `test_reconstructFileWithSeed_matchesCliVerdict` locks it.
- **Performance:** coverage E2E ~112s (569 files); `probe-engine-b.js` ~5min (1281 identities). Run node with `--max-old-space-size=8192`. The 765 MB corpus is scanned ONCE via `loadCombinedCache`.
- **Environment gotchas:** macOS `/var`↔`/private/var` — `realpathSync` repo roots and temp dirs (tests already do). `git status --short` here floods with `.plate/captures/*` and a piped `rtk`/rust tool panics with "Broken pipe" — harmless. Stop hook runs `tests/test-<basename>.js` after each edit (RED phases trip it — expected). Indentation hook keys on dominant indent: all new files are 4-space; edits to existing 2-space files stay 2-space. Exclude `tests/test-output-data.js` from test sweeps.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# Unit suites:
for t in test-git-tree-files test-reconstruct-file test-reconstruction-coverage test-coverage-report-format test-format-engine-b-mismatches; do node "tests/$t.js" || { echo "FAIL $t"; exit 1; }; done
# Full JS regression + pytest:
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" >/dev/null 2>&1 || { echo "FAIL: $f"; exit 1; }; done && echo "ALL JS PASS"
~/.pyenv/shims/pytest tests/test_run_all_scenarios.py -q
# Authoritative coverage report (re-run end-to-end):
node --max-old-space-size=8192 tools/reconstruction-coverage-report.js --repo ~/Programming/jot \
  --seed-commit 793e65241902f276caf5f5c28d539269e7d36d11 \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --out /tmp/jot-reconstruction-coverage.md --format both
# Regenerate engine-b-mismatches.md (two steps):
node --max-old-space-size=8192 tools/probe-engine-b.js --projects-dir ~/Programming/jot-recovery/claude-data/projects --snapshots ~/Programming/jot-recovery/claude-data/file-history
node tools/format-engine-b-mismatches.js
```
