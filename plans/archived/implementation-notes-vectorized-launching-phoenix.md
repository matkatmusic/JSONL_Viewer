# Implementation notes — reconstruction-coverage report

## 2026-06-19:13:45:00 — Begin executing vectorized-launching-phoenix.md
Chat title: Implement — reconstruction-coverage report (jot SHA + JSONL → per-file 100%-reconstruct verdict)
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/8273d833-f339-4292-8a9a-5d0962bfce61.jsonl

### References
- /Users/matkatmusicllc/.claude/plans/vectorized-launching-phoenix.md  (THE plan)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260619-1339.md  (handoff that launched this work)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260619-1310.md  (git-seed Phase-1 foundation)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-make-engine-b-the-main-engine.md  (git-seed limitations / seed-clobber)

### Design decisions
- **Phase 3 reconstructFileWithSeed reproduces the CLI's FULL pipeline**, not the plan's simplified GREEN sketch. The plan sketch used only `buildLineageGraph`+`resolveAliases`+on-disk-or-none reference. The CLI's actual pipeline (and thus the behavior the `matchesCliVerdict` lock-test + the invariant "existing CLI tests stay green" demand) also uses: time-aware **alias windows** (`api/alias-windows`), **subagent** transcripts, and the full **reference ladder** (on-disk→snapshot→git→none, `api/reference-ladder`). I extracted that full pipeline, parameterized by a preloaded cache + cross-root `jotRoots`. The CLI now delegates to it and re-exports `chooseReference`.
- **Cache contract = combined main+subagent cache** (`loadCombinedCache`), scanned once. Reused for BOTH alias-window ops (`gatherAllOps`) and discovery (`findReferencingJsonls(cache)`). The old CLI rescanned the 765 MB corpus TWICE (once for windows, once inside `findReferencingJsonlsIncludingSubagents`); the batch needs one scan.
- **`seedClobbered` computed in reconstructFileWithSeed** (events+seed only known there) and attached to the result; Phase 6 `diagnoseFailure` just surfaces `result.seedClobbered`.
- **Extra result fields** attached by reconstructFileWithSeed: `contributingRoots` (plan-named), `seedClobbered` (plan-named), and `seed` `{applied,sha,seedMs,postSeedEventCount}` (glue for the CLI seed summary + report).
- **`buildCrossRootSeeds` always includes the canonical path first**, then every jot-root alias (deduped), so on-disk/canonical events still match even if `jotRoots` is passed without the real repo root.

### Deviations
- Helpers not named in the plan but required: `loadCombinedCache`, `collectDistinctTouchedPaths` (feeds jot-root detection in CLI + Phase 4), `buildSeedSummary`.
- The alias-window ops set now includes **subagent** ops (combined cache), where the old CLI used main-cache ops only. Minor fidelity improvement; no existing test regressed (full JS suite green after refactor).
- CLI stdout "Transcripts:" line dropped the raw `events:` count (events are now internal to reconstructFileWithSeed) and added a `contributing roots:` count. No test asserts CLI stdout text.

### Tradeoffs
- Per-file event extraction still re-reads each *referencing* transcript's text (for the git rung) and re-parses it in `extractFileEvents`, as the CLI did. The plan's one-scan optimization targets the corpus touch/op index (the 765 MB pass), which is now done once; the small per-file referencing set is accepted.

### Phase 9 E2E findings (2026-06-19)
- **Implementation status:** ALL 9 phases implemented. ALL unit suites green (test-git-tree-files, test-jot-roots, test-reconstruct-file, test-reconstruction-coverage, test-coverage-report-format), FULL JS regression green, pytest `tests/test_run_all_scenarios.py` 6 passed. Synthetic E2E (temp repo + corpus) produces a correct PASS/FAIL/INDETERMINATE report with table, per-failure detail, rerun command, and JSON sidecar.
- **Real-corpus tooling validated** against the 765 MB / 1,085-jsonl corpus: one scan, cross-root detection, universe build, per-file reconstruction all run end-to-end.
- **Diagnostic improvement made:** `detectJotRootsWithCounts` added (jot-roots.js) and the CLI now prints the true tracked-file overlap count per root (the metric OVERLAP_MIN thresholds on), not the raw touched-path count.

### Resolution (2026-06-19, from user)
- **Correct seed = `793e65241902f276caf5f5c28d539269e7d36d11`** (commit `793e652 "Fix /jot+/todo hook orchestrator path resolution"`, 185 files, util_lib.py present). The plan's `793e2524…` was a transcription typo (`2524`→`6524`). Authoritative run will use this SHA.
- **Root-scoping direction (user):** the false-positive roots are a SYMPTOM, not to be patched with deny-lists/thresholds. Full/canonical paths must be used everywhere; an existing resolve-to-full-path facility must run as the FIRST step when a file touch is detected, so the whole algorithm operates on fixed full paths and ambiguous roots never arise. → Investigating the existing resolver before changing the detection approach. The `detectJotRoots` filename-overlap heuristic (Phase 2) is likely the wrong mechanism and may be replaced by canonical path resolution at touch time.

### Redesign (2026-06-19, user-directed) — full-path identity, no root heuristic
Tracing one real failing file (`README.md`: CLEAN PASS 198/198 vs POLLUTED FAIL 0/2/196) showed the corruption was not unresolved relative paths but the Phase-2 `detectJotRoots`/`expandCrossRootAliases` heuristic manufacturing same-name aliases across roots — and that it corrupts even *legitimate* jot worktrees, because their copies have **diverged** (merging divergent versions chronologically is unsound). Reasoning through nested skill READMEs further showed the lineage-filtered expansion is redundant (`expanded ∩ lineageClosure ⊆ resolveAliases([canonical])`). Decision: **remove the root heuristic entirely.**
- **Seeds** = `resolveAliases([canonicalFullPath], buildLineageGraph(allOps))` — the provenance (cp/mv) closure. New `buildSeedAliases(canonicalPath, lineageGraph)` in `api/reconstruct-file.js`. Cross-copy evidence merges ONLY where a recorded op proves shared bytes.
- **Universe** = git tree at SHA ∪ touched paths whose full path is under the single real `repoRoot` (`computeRepoRelativePath` containment; no detected roots). Directories are excluded (`buildFileUniverse` skips on-disk dirs; `chooseReference` now guards `isExistingFile` — found via an `EISDIR` crash in the first E2E).
- **Deleted** `api/jot-roots.js` + `tests/test-jot-roots.js`. Removed all `jotRoots` params/threading from both CLIs. Renamed `contributingRoots`→`contributingPaths` (they are provenance alias paths, not roots) across reconstruct-file, reconstruction-coverage, coverage-report-format, and both CLIs.
- **Tests:** `buildSeedAliases` (closure with/without lineage), `reconstructFileWithSeed` excludes non-lineage copies / merges lineage-linked copy, `buildFileUniverse` repo-root containment + directory exclusion, `chooseReference` directory guard. All suites green; full JS regression green; pytest 6/6.

### Authoritative E2E result (correct seed 793e6524…, new design)
`node tools/reconstruction-coverage-report.js --repo ~/Programming/jot --seed-commit 793e65241902f276caf5f5c28d539269e7d36d11 --projects-dir ~/Programming/jot-recovery/claude-data/projects --out /tmp/jot-reconstruction-coverage.md --format both` → ~112s.
- **569 files — PASS 160, FAIL 69, INDETERMINATE 340** (sum = 569 ✓).
- Every one of the 409 non-PASS rows has a missing-data hypothesis AND a rerun command (✓ sanity).
- README.md now PASS (was the false-positive FAIL); util_lib.py PASS (470/470). Single-file rerun of util_lib.py reproduces PASS (✓ sanity).
- Report: `/tmp/jot-reconstruction-coverage.md` (+ `.json`).
- Note: 340 INDETERMINATE = files touched under the repo path but not currently on disk (no ground truth) — correctly flagged, never silently pass/fail per the locked decision. A few junk paths (e.g. a file literally named `1` from a bash-redirect artifact) appear as INDETERMINATE noise.

### Open questions (superseded — kept for history)
1. **Seed commit `793e25241902f276caf5f5c28d539269e7d36d11` does NOT exist in the jot repo.** `git cat-file`/`git ls-tree` return nothing for it (there is a *different* commit `793e652`, not a prefix). Current HEAD is `698308f` on branch `recovery-test-plate_ops_trash` (230 uncommitted changes). The HEAD-seed run was only a tooling-validation. **Need the correct seed commit before the authoritative report.**
2. **OVERLAP_MIN=3 admits false-positive jot roots.** Real overlap counts vs 187 HEAD-tracked files: jot 127, python-migration 82, jot-backup 26, /home/user/repo 15, **RevEng 7 (false positive)**, plugins/cache/.../jot/1.1.5 7, **jot/skills/plate 6 (nested subdir, false positive)**, go-background-daemon 5. RevEng (the tool's own repo) and the nested `jot/skills/plate` cannot be separated from legit copies by a single threshold (RevEng 7 ties plugin-cache 7, exceeds go-daemon 5). Candidate fixes: (a) exclude roots that are descendants of another detected root (kills `jot/skills/plate`); (b) add an explicit deny-list for non-jot roots (RevEng) and decide whether the published plugin-cache + /home/user/repo count; (c) raise OVERLAP_MIN (loses /home/user/repo and go-daemon). **Need a tuning decision before trusting verdicts.**
