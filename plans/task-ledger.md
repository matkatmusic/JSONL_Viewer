# Task Ledger — probe path-fields rework (#7) + probe re-architecture to 100% (#9)

Mirror of the Task Ledger in `~/.claude/plans/two-new-cli-tools-snappy-ripple.md` (which lives
outside the repo). This is the in-repo single source of truth; kept updated as work proceeds.

Spec: `~/.claude/plans/two-new-cli-tools-snappy-ripple.md`
Notes: `plans/implementation-notes-two-new-cli-tools-snappy-ripple.md`

## Status legend
✅ done · 🔄 in progress · ⏳ planned

| # | Status | Task | Notes |
|---|--------|------|-------|
| 1 | ✅ | Thread fullPath through probe-projects.js | Pre-existing; superseded by #7's rename. |
| 2 | ✅ | Add fullPath unit test | Pre-existing; rewritten by #7 for the new fields. |
| 3 | ✅ | Regenerate probe-results.json | Pre-existing; regenerated again under #7c. |
| 4 | ✅ | Audit non-passing files | `tools/probe-mismatches.json` — 11 entries; 0 engine bugs. |
| 5 | ✅ | Verify end-to-end | Suite green. |
| 6 | ✅ | Confirm fullPath semantics | First-seen/per-session; superseded by global earliest. |
| 7 | ✅ | Rework path fields + drop filename | See breakdown below — DONE. |
| 8 | ✅ | Explain probe-vs-pipeline divergence | `plans/probe-vs-pipeline-divergence.md`. |
| 9 | 🔄 | Fix the 4 probe defects → 100% | See breakdown below. |

## #7 — Path fields rework (DONE)

- **#7a ✅** — `common/file-path-history.js` (NEW module) + `tests/test-file-path-history.js`:
  `buildFilePathHistoryIndex(projectsDir)` → `{samePathGraph, touchesByPath}`,
  `findEarliestFilePath(knownFilePaths, index)`, `findCurrentOnDiskPath(knownFilePaths, index)`.
  `common/collect-touches.js`: `collectTouches` now stamps each touch with its record
  `timestamp`; exports `collectAllJsonls`/`gatherAllOps`. (Moved out of collect-touches.js to
  respect the 300-line lint standard — see implementation notes for the why.)
- **#7b ✅** — `tools/probe-projects.js`: emitted `fullPath` → `earliestSeenFullPath` (global)
  + new `lastSeenFullPath`; `filename` dropped from the JSON record (kept internally for the
  text report). Index built once in `runProbe`, threaded to every project. Tests rewritten.
  Fixed a load-time circular require (probe→file-path-history→collect-touches→probe) via a
  lazy `discoverProjects` require + moving `module.exports` above the `require.main` guard.
- **#7c ✅** — Regenerated `tools/probe-results.json` (jot-recovery projects); verified
  `0 | 0 | 0` for missing-earliest / missing-last / stray-filename; `projects[0]` unchanged at
  204 tested / 11 failing (field-only change, verdicts intact). Refreshed
  `tools/probe-mismatches.json`: entries re-keyed `file` → `earliestSeenFullPath`,
  `lastSeenFullPath` added (11/11), JSON valid. Suite green (252 passing).

## #9 — Re-architect probe to 100% (PLANNED / IN PROGRESS)

- **#9a ⏳** — Make file-history snapshot dir configurable: `baseHistoryDir` param on
  `resolveHistoryDir` / `findLastSnapshotContent` / `extractSnapshotEdits` in
  `common/extract-file-state.js`; thread `--snapshots <path>` CLI flag through the probe
  (auto-derive `<projectsDir>/../file-history`, else `~/.claude/file-history`; explicit wins).
- **#9b ⏳** — Per-file transcript sourcing via `findReferencingJsonls` +
  `collectEditsFromTranscripts`; compare against `lastSeenFullPath`. Resolve cross-session
  temporal ordering. Phase 1 (snapshots + lastSeenFullPath), Phase 2 (transcript sourcing),
  Phase 3 (full-path target keying).
- **#9c ⏳** — Regenerate with `--snapshots`, assert every project `numFailing === 0` (or
  document residuals), refresh `probe-mismatches.json` to empty/residual.

### Open risk carried into #9 (raise with user, with data, after Phase 1)
Files whose move into a subdir was **not recorded** as an mv/cp/git-mv in any jot-recovery
transcript (e.g. `jsonl-tree-viewer.html` → `RevEng/viewer/…`, reorg done in sessions outside the
13 projects) get `lastSeenFullPath === ""`. Lineage-following alone cannot reach the on-disk
file. Reaching literal 100% may require a basename+content fallback to locate the current file,
or these stay documented residuals. Decision deferred until Phase-1 residual counts are known.
