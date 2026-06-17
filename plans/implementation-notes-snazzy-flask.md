# Implementation Notes: Diagnostic Probe + File State History + Git Branch Initial State

Spec: `/Users/matkatmusicllc/.claude/plans/yes-start-phase-1-snazzy-flask.md`

## Design Decisions

### 2026-06-05T14:12 — `buildFileStateHistory` goes in a new module, not `replay-edits.js`

The plan says to add `buildFileStateHistory` to `replay-edits.js`, but that file is at 470/500 lines. Adding the function + helpers would push it well past the 500-line limit. Creating `file-state-history.js` as a new module instead. It imports `applySingleEdit` from `replay-edits.js` (which needs a new export). This matches the existing module pattern (`extract-file-state.js`, `classify-edits.js` are standalone modules consumed by `replay-edits.js`).

**Why**: 500-line hard limit per file. Phase 2b will also add ~30 lines to `replay-edits.js` for git fallback, so the budget is already tight at 470.

### 2026-06-05T14:25 — `replay-edits.js` lands at exactly 500 lines after Phase 2b

After threading git fallback (import, `buildGitOpts`, `tryGitFallback`, and parameter additions to 6 existing functions), `replay-edits.js` is at exactly 500 lines. No room for further additions to this file without extracting something.

### 2026-06-05T14:30 — Scenario count is 30, not 29

The handoff doc says "29/29 scenarios" but this counts MATCH results, not scenario files. There are 30 `.txt` scenario files (s1-s23 + m1-m7). Some multi-file scenarios produce 2 results (m1, s3, m6), and 4 scenarios are correctly SKIPPED (delete/redirect/no-post-edit). All 30 are verified.

## Deviations

### `tryGitAfterSnapshotFallback` inlined instead of separate function

The plan specified a `tryGitAfterSnapshotFallback` function. I inlined its logic (3 lines) directly into `verifyOnDiskFile` to save line budget in `replay-edits.js` (at 500-line limit). The behavior is identical: after both on-disk and snapshot fail, try git; accept if it matches.

## Tradeoffs

### `gitShowFile` uses `JSON.stringify` for path quoting instead of shell escaping

The `git -C <path> show <ref>:<file>` command constructs the path argument via `JSON.stringify(repoPath)`, which handles spaces and special characters. This is simpler than a full shell escaping library but could break on paths containing literal double-quote characters. Acceptable for this codebase's path patterns.

### 2026-06-05T14:45 — Fixed skip-files comparison: per-session repo-relative path resolution

Added `buildSessionRepoPathMap` and `buildSessionPathMaps` to compute repo-relative paths per JSONL session (not globally) using `computeRepoRelativePath`. Each probe result now carries a `repoPath` field, and `compareWithSkipFiles` matches on `repoPath` first, falling back to `filename`. This avoids cross-session basename collisions (e.g., two sessions editing different files both named `config.json`). The fix reads JSONL files a second time for path resolution — acceptable overhead for a diagnostic tool. Result: 190 skip_files matches (was 25 before fix).

### 2026-06-05T15:10 — Replaced `batchVerify` with full-path verification in probe

Root cause analysis showed 80%+ of "single-session high-edit mismatches" were actually files in subdirectories (e.g., `skills/debate/scripts/debate.sh`) that the old probe couldn't find because `batchVerify` checks `path.join(repoRoot, basename)`. Replaced `batchVerify` call with a per-JSONL verification loop (`probeSingleJsonl`) that uses the full absolute `filePath` from edit objects. Also added `NOT_FOUND` status to distinguish genuinely deleted files from real reconstruction failures. Result: true MISMATCH dropped from 517 to 81, 22 new PASS, 414 correctly reclassified as NOT_FOUND.

## Open Questions

(none)

## Probe Results Summary (2026-06-05)

| Project | JSONL | Tested | PASS | MISMATCH | Rate |
|---|---|---|---|---|---|
| jot | 150 | 579 | 271 | 308 | 47% |
| jot-backup | 16 | 125 | 123 | 2 | 98% |
| jot-backup-tests-reverseAlgo | 6 | 13 | 13 | 0 | 100% |
| jot-plate-test | 2 | 4 | 0 | 4 | 0% |
| jot-recovery | 5 | 32 | 28 | 4 | 88% |
| jot-testrepo | 3 | 0 | 0 | 0 | — |
| jot-worktrees-go-background-daemon | 6 | 8 | 0 | 8 | 0% |
| jot-worktrees-python-migration | 105 | 279 | 88 | 191 | 32% |
| jot-worktrees-python-migration-testrepo | 12 | 0 | 0 | 0 | — |
| jotVerifySequence | 28 | 27 | 27 | 0 | 100% |
| **TOTAL** | **333** | **1067** | **550** | **517** | **52%** |
