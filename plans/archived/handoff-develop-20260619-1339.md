# Handoff: PLAN written for reconstruction-coverage report (which jot files reconstruct 100% from git SHA + JSONL corpus); next agent executes it
Conversation name: Plan — reconstruction-coverage report (jot SHA + JSONL → per-file 100%-reconstruct verdict)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/94b4b801-5382-4ed7-a171-37ebae113277.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/vectorized-launching-phoenix.md

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; all RevEng source is untracked/modified — nothing committed).
CWD: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

## Goal
Build a **batch coverage report** that answers, for every jot file: can its change history be reconstructed 100% from
(a) the jot git commit `793e25241902f276caf5f5c28d539269e7d36d11` as a per-file seed/starting point, and (b) the JSONL
corpus at `~/Programming/jot-recovery/claude-data/projects/`? For each file the report gives `success|fail|
indeterminate`, where reconstruction broke, the missing data preventing 100%, and the exact single-file command to
re-run that file through the engine to trace the gap. Purpose: enable per-file deep dives to close reconstruction gaps.

## Current State
**This session was PLANNING ONLY — no source code was written or changed by it.** Deliverable is the plan file
`/Users/matkatmusicllc/.claude/plans/vectorized-launching-phoenix.md`, written and verified to conform to
`~/.claude/guides/planning.md`, `tdd.md`, `coding-standards.md`, `single-condition-branching.md` (4-space, imperative
`for` loops not `.map`/`.flatMap`, verb-first names, one condition per `if`, `// Scenario:`/`// Steps:` test comments,
≤250-line files). Conformance was grep-checked: no functional-chaining or `&&`/`||` in any implementation snippet;
phases numbered 1→9.

The working tree carries the **prior session's Engine B Phase-1 git-seed work** (uncommitted; documented in
`RevEng/plans/handoff-develop-20260619-1310.md` and `implementation-notes-make-engine-b-the-main-engine.md`): new
`api/git-seed.js`, `readGitCommitTimestamp` in `api/git-file-state.js`, `opts.gitSeed` wired into `trackLineStates`,
and the `--seed-commit <SHA>` CLI flag in `tools/track-line-states.js`. That git-seed beacon is exactly what this plan
builds the batch report on top of. All its tests are green per that handoff.

## What Remains
Execute `vectorized-launching-phoenix.md` in its Build order, strict red-green TDD (each `test_<behavior>` written and
watched fail before minimum GREEN code):
1. **Phase 1** — `listFilesAtCommit(repoRoot, sha)` in NEW `api/git-tree-files.js` (`git ls-tree -r --name-only`).
2. **Phase 2** — `detectJotRoots(touchedPaths, jotTrackedFiles)` + `expandCrossRootAliases(repoRelPath, jotRoots)` in
   NEW `api/jot-roots.js` (cross-root evidence keying; basename-indexed overlap, `OVERLAP_MIN` start at 3).
3. **Phase 3** — extract `reconstructFileWithSeed(...)` into NEW `api/reconstruct-file.js`, accepting a preloaded
   corpus cache + `jotRoots`; refactor `tools/track-line-states.js runMain` to delegate to it (behavior identical).
4. **Phase 4** — `buildFileUniverse(repoRoot, sha, projectsDir, cache, jotRoots)` in NEW `api/reconstruction-coverage.js`.
5. **Phase 5** — `classifyVerdict(result)` (PASS/FAIL/INDETERMINATE) in `api/reconstruction-coverage.js`.
6. **Phase 6** — `diagnoseFailure(result)` (failure location + missing-data hypothesis + `contributingRoots`).
7. **Phase 7** — `buildRerunCommand(canonicalPath, sha, projectsDir)`.
8. **Phase 8** — `formatCoverageMarkdown` / `formatCoverageJson` in NEW `api/coverage-report-format.js`.
9. **Phase 9** — NEW CLI `tools/reconstruction-coverage-report.js` wiring (load cache ONCE → detect roots → universe →
   per-file reconstruct/classify/diagnose → write report) + the real-corpus E2E run.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/vectorized-launching-phoenix.md` — THE plan (full TDD breakdown, locked
  decisions, report schema, verification). Read first.
- `RevEng/plans/handoff-develop-20260619-1310.md` + `implementation-notes-make-engine-b-the-main-engine.md` — the
  git-seed foundation + its known limitations (READ for the seed-clobber caveat).
- `RevEng/api/git-seed.js` — `resolveSeedFromCommit`, `seedBeliefFromGitContent`, `filterEventsAfter`, `buildGitSeedRef` (reuse).
- `RevEng/api/git-file-state.js` — `computeRepoRelativePath(filePath, repoRoot)`, `readGitFileContent`, `readGitCommitTimestamp` (reuse).
- `RevEng/api/transcript-discovery.js` — `loadAllJsonlFilesInProjectsFolder(projectsDir)` (one 765 MB scan → cache),
  `findReferencingJsonls(targetPaths, projectsDir, cache)` (reuse; pass the cache).
- `RevEng/api/file-historical-lineage.js` — `buildLineageGraph`, `resolveAliases`, `collectTouches`, `doesEditBelongToFile` (reuse).
- `RevEng/api/file-events-extractors.js` — `extractFileEvents(jsonlPath, aliasPaths, snapshotsDir)` (reuse).
- `RevEng/api/track-line-states.js` (242/250) — `trackLineStates`; returns `{finalVerdict, conflicts, timeline}`.
- `RevEng/tools/track-line-states.js` (182L) — single-file CLI + `--seed-commit`; refactor target for Phase 3.

## Context the Next Agent Won't Have
- **Four decisions locked with the user (do NOT relitigate):** (1) **Scope = jot-repo files only** — union of files in
  git@`793e…` and JSONL-touched paths resolving under `~/Programming/jot`; the other 10 corpus subdirs are non-jot or
  excluded. (2) **PASS bar = "final state matches"** — `mismatched===0` AND full coverage AND `tailUncertain===false`;
  correct-but-`presumed` lines still count as PASS (presumed count reported as a secondary signal only). (3) **Ground
  truth = current on-disk jot file** (`comparedVia:'on-disk'`); files not on disk → **INDETERMINATE**, never silent
  pass/fail. (4) **Cross-root evidence = ALL jot-identity roots** — see next bullet.
- **The corpus has ~11 jot roots, not one** (verified via the project-subdir list): `…-Programming-jot` (real repo),
  `…-jot-recovery`, `…-jot-backup`, `…-jot-backup-tests-reverseAlgo`, `…-jot-plate-test`, `…-jot-testrepo`,
  `…-jot-ultraplan`, `…-jotVerifySequence`, `…-jot-worktrees-go-background-daemon`, `…-jot-worktrees-python-migration`,
  `…-jot-worktrees-python-migration-testrepo` (plus non-jot `…-claude-code-src`, `…-claude-code-src-RevEng`). The SAME
  repo-relative file is edited under several roots, each recording a different absolute path. The user explicitly
  required gathering evidence by **repo-relative path across every jot-identity root, merged chronologically** — NOT
  just paths literally under `~/Programming/jot`. Seed + ground truth stay anchored to the real repo; only event
  evidence fans out. This is why Phase 2 (`detectJotRoots`) exists.
- **Seed-clobber limitation (inherited, unfixed):** any post-seed Tier-1 beacon (`Write`/`snapshot` →
  `applyWrite`/`applySnapshotVerify` in `api/apply-one-event.js`) wipes `belief.entries`, clobbering the git seed. So
  the seed only repairs a gap when no post-seed beacon follows. The plan FLAGS `seedClobbered` per file rather than
  fixing it — fixing is the deferred "durable seed / option B" decision, OUT OF SCOPE here.
- **Performance is the load-bearing constraint:** corpus is 765 MB / 1,085 JSONL. The batch MUST call
  `loadAllJsonlFilesInProjectsFolder` ONCE and pass the cache to `findReferencingJsonls`/extraction for every file
  (pattern from `tools/probe-v2-assembly.js`). Per-file CLI shelling re-scans 765 MB each time — explicitly avoided by
  Phase 3's preloaded-cache path.
- **No batch/markdown tooling exists to reuse:** `tools/probe-engine-b.js` runs Engine B over many files but emits
  JSON-only and not this verdict; the `git ls-tree` wrapper is net-new; no CSV/markdown reporter exists anywhere.
- **macOS path trap:** `os.tmpdir()` is `/var/...` but git `--show-toplevel` is `/private/var/...`; `realpathSync` repo
  roots and temp dirs or `computeRepoRelativePath` returns null and files silently drop from the universe.
- **`OVERLAP_MIN` needs tuning against the real corpus:** too low pulls an unrelated repo sharing common filenames;
  too high drops a sparsely-touched worktree. The E2E must print detected roots + per-root match counts.
- **Indentation hook (PostToolUse):** keys on each file's DOMINANT indent. All NEW files in this plan are 4-space.
  Edits to existing 2-space files (`track-line-states.js`, `git-file-state.js`) must stay 2-space. Stop hook runs
  `tests/test-<basename>.js` on edit; exclude `tests/test-output-data.js` from `for f in tests/test-*.js` sweeps.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# Unit suites (Phases 1–8):
for t in test-git-tree-files test-jot-roots test-reconstruct-file test-reconstruction-coverage test-coverage-report-format; do
    node "tests/$t.js" || { echo "FAIL: $t"; exit 1; }
done

# Regression — engine + CLI behavior unchanged:
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" >/dev/null 2>&1 || { echo "FAIL: $f"; exit 1; }; done && echo "ALL JS PASS"
python3 -m pytest tests/test_run_all_scenarios.py

# Full report on the supplied seeds (Phase 9 E2E):
node tools/reconstruction-coverage-report.js \
    --repo ~/Programming/jot \
    --seed-commit 793e25241902f276caf5f5c28d539269e7d36d11 \
    --projects-dir ~/Programming/jot-recovery/claude-data/projects \
    --out /tmp/jot-reconstruction-coverage.md --format both

# Spot-check one file's row via its rerun command (should reproduce the row's status):
node tools/track-line-states.js --path ~/Programming/jot/common/scripts/util_lib.py \
    --seed-commit 793e25241902f276caf5f5c28d539269e7d36d11 \
    --projects-dir ~/Programming/jot-recovery/claude-data/projects --out /tmp/util_lib.json
```
Sanity: PASS+FAIL+INDETERMINATE == universe size; every FAIL/INDETERMINATE row has non-empty `missing data` + a rerun
command; `detectJotRoots` reports multiple roots and at least one row shows `contributingRoots > 1`.
