# Handoff: Implement `tools/probe-projects-v2.js` (per-file reconstruction probe, two lists + provenance)

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; the entire RevEng tree is
untracked — `common/`, `tools/`, `tests/`, `plans/` are all `??`/`M` in `git status`). Git history
tells you nothing; the real state is in the files.

## Documents I was given to read before starting (read these FIRST, in order)
1. **The prior session handoff**: `plans/handoff-develop-20260610-1350.md` — set up tasks #7 (path
   fields) and #9 (probe re-architecture). I executed from here.
2. **The original plan** (lives OUTSIDE the repo): `~/.claude/plans/two-new-cli-tools-snappy-ripple.md`
   — full Task Ledger + §#7 + §#9. Tasks #7 and #9a are now DONE; #9b/#9c are superseded by the v2
   plan below.
3. **The NEW v2 plan** (this is what you implement): `~/.claude/plans/let-s-build-probe-projects-v2-that-binary-perlis.md`
4. Prereqs for understanding: `plans/probe-vs-pipeline-divergence.md`,
   `plans/implementation-notes-two-new-cli-tools-snappy-ripple.md`, `tools/probe-mismatches.json`,
   `plans/task-ledger.md`.

## Goal
Build a NEW tool `tools/probe-projects-v2.js` that implements the probe's purpose as a clean
3-step sequence: **gather files referenced in JSONL → run the production reconstruction pipeline
per file → log success/fail per file.** It outputs TWO lists (files that exist in a project now vs
deleted/outside-project) with rich per-file provenance (which JSONL transcripts + which
snapshot/git reference were used, and which data sources were skipped) so failing-to-reconstruct
files are isolated and self-documenting, then fed into the `probe-mismatches.json` format for
root-cause diagnosis. v1 `probe-projects.js` stays intact.

## Current State (what I worked on this session — all DONE and green)
- **Task #7 (path fields rework) — COMPLETE.**
  - NEW `common/file-path-history.js` (+ `tests/test-file-path-history.js`):
    `buildFilePathHistoryIndex(projectsDir)` → `{samePathGraph, touchesByPath}`,
    `findEarliestFilePath(knownFilePaths, index)`, `findCurrentOnDiskPath(knownFilePaths, index)`.
  - `common/collect-touches.js`: `collectTouches` now stamps each touch with its record
    `timestamp` (for global temporal ordering); exported `collectAllJsonls` + `gatherAllOps`.
  - `tools/probe-projects.js`: emitted `fullPath` → `earliestSeenFullPath` (global) + new
    `lastSeenFullPath`; dropped `filename` from the JSON record (kept internally for the text
    report). Index built once in `runProbe`, threaded to all projects. Tests rewritten.
  - Regenerated `tools/probe-results.json`; refreshed `tools/probe-mismatches.json` (re-keyed
    `file`→`earliestSeenFullPath`, added `lastSeenFullPath`).
- **Task #9a (configurable snapshot dir) — COMPLETE.** `common/extract-file-state.js`: added
  `baseHistoryDir` param to `resolveHistoryDir`/`findLastSnapshotContent`/`extractSnapshotEdits`.
  `tools/probe-projects.js`: `--snapshots <path>` flag + `resolveSnapshotDir(opts)` (explicit →
  auto-derive `<projectsDir>/../file-history` → default `~/.claude/file-history`); held in
  module-global `snapshotBaseDir`. **Highly effective: 511 files recovered via snapshot
  corpus-wide.**
- **Task #9b Phase 1 — COMPLETE.** `verifyAllTargets` now verifies against `lastSeenFullPath`
  (current on-disk path after renames) instead of the stale first-seen path.
- **Tests: 260 passing / 0 failing** (full suite, verified just now). Was 247 before this session.
- **The v2 plan is written and APPROVED in spirit** (user gave two implementation steers, both
  folded in — see below).

## What Remains (execute the v2 plan, in this order)
Implement `~/.claude/plans/let-s-build-probe-projects-v2-that-binary-perlis.md`. Phases:
1. **Refactors (R1–R3), additive, keep v1 green:**
   - **R1** `tools/probe-projects.js`: export `cwdFromFolderName` (defined ~`:92`, not exported).
   - **R2** `common/collect-touches.js`: extract the two corpus-loading lines (`collect-touches.js:270-271`:
     `enumerateJsonlFiles` + `collectAllJsonls`) into `loadCorpusCache(projectsDir)`; give
     `findReferencingJsonls(targetPaths, projectsDir, cache)` an OPTIONAL `cache` param
     (`cache = cache || loadCorpusCache(projectsDir)`). Export `loadCorpusCache`. **This is the
     user's explicit instruction** — the 2-line extraction is the whole "scan once" fix.
   - **R3** `common/file-path-history.js`: give `buildFilePathHistoryIndex(projectsDir, cache)` the
     same optional `cache` param.
2. **Phase A** `buildCorpus(projectsDir)` → `{cache, graph, index, projectRoots}` (ONE corpus read
   via `loadCorpusCache`).
3. **Phase B** enumerate distinct file IDENTITIES keyed by rename/move alias set (`resolveAliases`),
   NOT basename; only write/edit/create files are targets. `buildPerTranscriptEdits(cache)` caches
   `extractEditsFromJSONL` + `analyzeJSONL` once per transcript.
4. **Phase C** per file: `findReferencingJsonls(seedPaths, projectsDir, cache)` → re-sort by the
   file's earliest touch TIMESTAMP per transcript → assemble kept edits filtered by
   `edit.filePath ∈ aliasSet` (full-path, kills basename collision) and kept status
   (`statusByLine[edit.line+1] !== 'ignored'`) → `replayEdits`.
5. **Phase D** reference + provenance: probe on-disk / snapshot / git for AVAILABILITY (no
   short-circuit); `comparedVia` + `dataSources{available,used,skipped[]}` + `snapshotBlob` +
   `gitRef`.
6. **Phase E** classify into list1 (on-disk AND in a project root) / list2 (deleted OR
   out-of-project); write `tools/probe-results-v2.json` (schema in the plan).
7. **Phase F** emit `tools/probe-mismatches-v2.json` skeleton for failures (existing mismatch shape).
8. **TDD throughout** — write tests first (see plan's TDD section: enumerate, assembly/collision,
   ordering, classify, provenance, record; plus R1/R2/R3 parity tests).

## Key Files
- `~/.claude/plans/let-s-build-probe-projects-v2-that-binary-perlis.md` — THE plan to implement.
- `tools/probe-projects-v2.js` — NEW, the tool to build.
- `common/collect-touches.js` — R2 (extract `loadCorpusCache`, optional cache on
  `findReferencingJsonls`); reuse `resolveAliases`, `buildLineageGraph`, `gatherAllOps`,
  `collectAllJsonls`, `enumerateJsonlFiles`, `selectReferencing`.
- `common/file-path-history.js` — R3 (optional cache); reuse `findEarliestFilePath`,
  `findCurrentOnDiskPath`, `compareTouchOrder`.
- `tools/probe-projects.js` — R1 (export `cwdFromFolderName`); reuse `discoverProjects`,
  `parseProbeArgs`, `resolveSnapshotDir`, `countByStatus`, `computeActionablePassRate`.
- `tools/reconstruct.js` — mirror `collectEditsFromTranscripts`/`extractKeptEditsForFile` (but v2
  must filter by FULL PATH, not the basename these use).
- `common/replay-edits.js` — `extractEditsFromJSONL`, `replayEdits` (exported).
- `common/classify-edits.js` — `analyzeJSONL` (kept/ignored; line is 1-indexed, reconcile with
  `edit.line+1`).
- `common/extract-file-state.js` — `findLastSnapshotContent(text, basename, baseHistoryDir)`,
  `findLastBackupFileName` (snapshot blob identity).
- `common/git-file-state.js` — `resolveGitContentMultiRef`, `buildMultiRefs`,
  `extractSessionMetadata`, `buildFilePathMap`, `resolveRepoRootWalkingUp`.
- `tests/test-helpers.js` — `run`/`summary`/`runWithContext` + JSONL line builders for tests.

## Plan File
`~/.claude/plans/let-s-build-probe-projects-v2-that-binary-perlis.md`

## Context the Next Agent Won't Have
- **TWO user steers on R2 (do NOT deviate):** (1) `findReferencingJsonls` IS the JSONL finder to
  build on. (2) Just extract the two cache-loading lines (`collect-touches.js:270-271`) into one
  function and give `findReferencingJsonls` an optional `cache` param — that single change is the
  "scan once" fix. Don't over-engineer a bigger split.
- **Performance cliff:** `findReferencingJsonls` re-reads + `JSON.parse`s the ENTIRE corpus on every
  call (~4 min for the jot-recovery set). v2 loops over hundreds of files — you MUST build the cache
  ONCE and pass it in, or the run takes hours. The remaining per-call work (graph/aliases/select) is
  in-memory and fine.
- **Corpus is `~/Programming/jot-recovery/claude-data/projects` (13 projects), NOT `~/.claude/projects`
  (109).** Snapshots live ONE LEVEL UP at `~/Programming/jot-recovery/claude-data/file-history`. Always
  pass `--projects-dir ~/Programming/jot-recovery/claude-data/projects --snapshots ~/Programming/jot-recovery/claude-data/file-history`.
- **`collectEditsFromTranscripts` filters by BASENAME and concatenates by INPUT ORDER** — both wrong
  for v2. v2 must filter by full path (alias set) and order transcripts by timestamp. Timestamps now
  exist on touches (added this session).
- **Naming convention the user insists on:** name variables for what they ARE; avoid borrowed jargon
  (rejected: `corpus`→"all transcripts", `seed`→`knownFilePaths`, `lineage`→describe by behavior).
- **Genuine residuals are out of scope to "fix":** the 5 `js/*` scaffold files are deleted with NO
  on-disk/snapshot/git reference anywhere — they can never reach literal 100%; under v2 they land in
  list2 as NOT_FOUND. `jsonl-tree-viewer.html` moved to `viewer/` via a move NOT recorded in the
  corpus → `lastSeenFullPath=""`, surfaced in list2 (a basename+content fallback is a deliberate
  FOLLOW-UP, not core v2).
- **A repo lint hook (`jot:post_tool_use`) runs tests on every edit and warns at 300 lines/file.**
  `probe-projects.js` is already ~665 lines (pre-existing, accepted). Keep new modules focused; that's
  why `file-path-history.js` is its own file (the index helpers were moved out of `collect-touches.js`
  to stay under 300 lines).
- **Circular-require gotcha (already fixed, don't reintroduce):** `collect-touches.js` requires
  `discoverProjects` LAZILY inside `enumerateJsonlFiles`, and `probe-projects.js` puts
  `module.exports` ABOVE the `require.main` guard. Keep both when refactoring.
- **`extractEditsFromJSONL` ignores `--snapshots` for injected snapshot EDITS** (only the explicit
  `findLastSnapshotContent` reference honors `baseHistoryDir`). v2 uses snapshots only as reference
  content — fine. Threading `baseHistoryDir` into `extractEditsFromJSONL` is a follow-up.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# 1. Unit suite green (currently 260; add v2 tests, keep all green):
for t in tests/test-*.js; do case "$t" in *helpers.js|*output-data.js) ;; *) echo "$t: $(node "$t" 2>/dev/null | grep -E 'passed, [0-9]+ failed')";; esac; done
# 2. End-to-end (ONE corpus scan, ~minutes):
node tools/probe-projects-v2.js \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots   ~/Programming/jot-recovery/claude-data/file-history
# 3. Inspect the two lists:
node -e 'const r=require("./tools/probe-results-v2.json");console.log("list1",r.summary.list1,"\nlist2",r.summary.list2);'
```
Expected: `filesInProject` (list1) actionable pass rate near 100 (multi-session `jfred*` and
basename-collision `launch.json` now reconstruct via full-history assembly + full-path keying);
`filesNotInProject` (list2) holds the deleted/out-of-project residuals (`js/*` → NOT_FOUND;
cross-project `post_tool_use_hook.sh`; `jsonl-tree-viewer.html` with `lastSeenFullPath:""`).
