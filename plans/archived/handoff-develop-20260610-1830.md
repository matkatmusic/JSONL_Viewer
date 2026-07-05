# Handoff: probe-projects-v2 built and verified (98% list1) — close the gap to 100%

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; the whole RevEng tree is
untracked — `common/`, `tools/`, `tests/`, `plans/` show as `??` in `git status`). Git history
tells you nothing; the real state is in the files.

## Goal
`tools/probe-projects-v2.js` is DONE and verified: a per-file reconstruction probe that scans all
JSONL files in the projects folder ONCE, replays every authored file through the production
pipeline (full-path identity, timestamp-ordered transcripts), verifies against on-disk → snapshot
→ git with full provenance, and emits two lists. The remaining work is closing the last gap to
100%: author root-cause findings for the residual failures, fix the project-root decode bug that
misclassifies 90 files into list2, and triage list2's remaining mismatches.

## Current State
- **306/306 tests green** (`tests/test-probe-v2-*.js`, `tests/test-probe-projects-v2.js`,
  `tests/test-probe-v2-report.js` + all pre-existing suites).
- **End-to-end run** (~108s): list1 `filesInProject` 148 files — 145 PASS / 3 MISMATCH (**98.0%**
  actionable). list2 `filesNotInProject` 802 files — 625 PASS / 109 MISMATCH / 68 NOT_FOUND (77.9%).
- New files this session: `tools/probe-projects-v2.js` (orchestration + CLI),
  `tools/probe-v2-assembly.js` (ordering + kept-edit assembly + observation trim),
  `tools/probe-reference-sources.js` (source gathering + selection),
  `tools/probe-v2-report.js` (records, two-list classification, summaries, mismatches skeleton).
- Refactors landed: `cwdFromFolderName` exported (probe-projects.js);
  `loadAllJsonlFilesInProjectsFolder` extracted + optional `cache` param on
  `findReferencingJsonls` (collect-touches.js); optional `cache` on `buildFilePathHistoryIndex`
  + `compareTouchOrder` exported (file-path-history.js); `findLastSnapshotBlob` added
  (extract-file-state.js); cat edits now tagged `source:'cat'`; read/cat-sourced edits map to
  touch kind `'read'` (collect-touches.js).
- Three replay variants exist, recorded per file as `replayVariant`:
  `full` (937), `trailing-observations-trimmed` (7), `trailing-newline-restored` (6).
- Outputs regenerated: `tools/probe-results-v2.json`, `tools/probe-mismatches-v2.json`
  (skeleton entries for every non-PASS record; `findings` fields are empty strings awaiting
  human/agent root-cause authoring).

## The 3 list1 MISMATCHes (all confirmed genuine outside-session changes)
All three were also MISMATCH (or absent) under v1; no transcript contains the changes. Diagnosed
byte-for-byte this session:
1. **`~/Programming/jot/common/scripts/plate/plate_summary.py`** — replay 7708ch/249L vs on-disk
   7707ch/248L. The ONLY difference: replay has TWO blank lines after the import block
   (`...import Path\n\n\nsys.path.insert...`), on-disk has ONE. A whitespace-only cleanup
   (formatter or hand edit) done outside any session. Snapshot available but stale; no git.
2. **`~/Programming/jot/plans/plate-assessment-2026-04-28.md`** — replay 2023ch/60L vs on-disk
   12951ch/284L. The document was massively extended after the last recorded session touch
   (2026-04-28). Snapshot and git both available but both predate the growth.
3. **`~/Programming/jot/tests/test_util_terminal.py`** — replay 3078ch/60L vs on-disk 122ch/5L.
   The file was gutted to a 5-line stub after the last recorded touch (2026-05-08). Snapshot and
   git available but match neither.

These cannot PASS from transcript data alone — the content evidence does not exist anywhere in
the recovered data. Options for "100%": (a) author their root causes into
`probe-mismatches-v2.json` and define the actionable target as "all failures documented", or
(b) add a distinct status (e.g. `CHANGED_OUTSIDE_SESSIONS`) when the replay exactly matches a
historical reference (snapshot/git) but not on-disk — note none of these 3 currently match their
snapshots either, so (b) helps reporting clarity, not the pass rate.

## What Remains (to 100%)
1. **Fix project-root misclassification (biggest win, +90 files to list1).**
   `cwdFromFolderName` decodes `-Users-...-Desktop-claude-code-src-RevEng` to
   `/Users/.../Desktop/claude/code/src/RevEng` — every dash becomes a slash, so paths with
   spaces ("claude code src") or dashes never match a root. 90 list2 records are actually on
   disk under `~/Desktop/claude code src/` (89 already PASS, 1 MISMATCH: `jfred-load.js` family).
   Fix: in `scanProjectsFolderOnce` (tools/probe-projects-v2.js), derive each project's root from
   its transcripts' session `cwd` metadata (`extractSessionMetadata(text).cwd` — exact, no
   decoding) instead of `cwdFromFolderName(p.name)`; the per-transcript text is already read in
   `buildPerTranscriptEdits`, or read just the first lines of one JSONL per project. Keep
   `cwdFromFolderName` as fallback for projects whose transcripts lack `cwd`. TDD: a project
   folder whose decoded name mismatches its session `cwd` classifies by the cwd.
   Expected after fix: list1 ≈ 238 files at ≈ 98.3%.
2. **Author root-cause `findings` for the 3 list1 residuals** in
   `tools/probe-mismatches-v2.json` using the diagnoses above (verbatim acceptable).
3. **Triage list2's 108 remaining MISMATCHes** (excluding the 90 misclassified). Use each
   record's `dataSources`/`transcriptsUsed` provenance. Known candidate causes to check first:
   transcripts in OTHER project folders not in the jot-recovery set (cross-project files like
   `post_tool_use_hook.sh`), unrecorded moves (`lastSeenFullPath: ""` but file exists elsewhere
   — the deliberate follow-up is a basename+content fallback), and lossy cat captures beyond the
   trailing-newline case (truncated/piped output mid-stream).
4. **Decide the 68 NOT_FOUND records** (includes the 5 `js/*` scaffold files): they have no
   reference content anywhere (deleted, no snapshot, no git). They can never literally PASS;
   either accept NOT_FOUND as terminal-documented or exclude them from the actionable
   denominator with a recorded reason.
5. **Optional cleanups deferred:** thread `baseHistoryDir` into `extractEditsFromJSONL` (snapshot
   EDITS still read `~/.claude/file-history` by default — worked here because the local machine
   has the blobs; breaks on a foreign machine); retain raw text in
   `loadAllJsonlFilesInProjectsFolder` to avoid Phase B re-reads; per-EDIT global timestamp
   ordering if overlapping-session interleaving shows up in step 3's triage.

## Key Files
- `tools/probe-projects-v2.js` — orchestration, CLI, per-file probe, replay-variant retries.
- `tools/probe-v2-assembly.js` — transcript ordering, kept-edit assembly (full-path + snapshot
  path-suffix matching), `dropTrailingObservationEdits`, `isObservationEdit`.
- `tools/probe-reference-sources.js` — on-disk/snapshot/git gathering, `chooseReferenceSource`.
- `tools/probe-v2-report.js` — record shape, `isInProject`/`groupRecordsIntoLists`, summaries,
  `buildMismatchesSkeleton`.
- `tools/probe-results-v2.json` / `tools/probe-mismatches-v2.json` — regenerate on every run.
- `common/collect-touches.js` — touch kinds, lineage graph, `findReferencingJsonls` (+cache).
  EXACTLY 300 lines (hook limit) — any addition must displace a line.
- `common/file-path-history.js` — path-history index, earliest/current path, `compareTouchOrder`.
- `common/extract-file-state.js` — `findLastSnapshotBlob`, cat `source` tagging.
- `tests/test-probe-v2-*.js`, `tests/test-probe-projects-v2.js`, `tests/test-probe-v2-report.js`
  — all v2 suites.
- `plans/implementation-notes-let-s-build-probe-projects-v2-that-binary-perlis.md` — full
  decision log: 3 harness bugs found+fixed, deviations from spec, open questions.

## Plan File
`~/.claude/plans/let-s-build-probe-projects-v2-that-binary-perlis.md` (implemented; notes file
above records every deviation). No new plan file for the remaining steps — this handoff is it.

## Context the Next Agent Won't Have
- **VOCABULARY (user directive, given twice):** never use the word "corpus". Say "all JSONL
  files in the projects folder" / "the recovered data". Code names follow this:
  `loadAllJsonlFilesInProjectsFolder`, `allJsonlFiles`, `scanProjectsFolderOnce`. Also avoid
  borrowed jargon generally — name things for what they ARE (`seed`→`knownFilePaths`).
- **Coding style (user guides, enforced):** strict red-green TDD (write the failing test FIRST,
  watch it fail, then implement); ONE condition per `if` — nest, never chain with `&&`/`||`
  (ternaries only for value selection); name functions for what they do.
- **A lint hook runs the matching test file on every edit** and complains >300 lines/file and on
  >3-deep nesting. probe-projects.js (666) and extract-file-state.js (394) are pre-existing
  exceptions. The hook looks for `tests/test-<basename>.js` — that's why
  `tests/test-probe-projects-v2.js` carries the record tests.
- **Run e2e with BOTH flags** or results are garbage:
  `--projects-dir ~/Programming/jot-recovery/claude-data/projects --snapshots ~/Programming/jot-recovery/claude-data/file-history`.
  Snapshots live one level UP from the projects dir; auto-derive also finds them.
- **Three harness bugs were found e2e and fixed (62.9% → 98.0%)** — do not reintroduce:
  (1) snapshot edits carry REPO-RELATIVE paths → matched by full path-suffix in
  `editBelongsToFile`, never by basename; (2) cat/read edits are observations, kind `'read'` —
  treating them as writes floods the target list with read-only files; (3) recorded Bash stdout
  TRIMS the file's final newline → `trailing-newline-restored` retry, gated on the final
  authority being an observation.
- **Unconditional trailing-observation trimming is WRONG** — it regresses `todo/SKILL.md`,
  which NEEDS its trailing observation to pass. The retry ladder must stay: full → trimmed →
  newline-restored, each attempted only if the previous found no PASS.
- **`probeOneFileIdentity` can be tested directly with a hand-built identity** — enumeration
  excludes temp paths (`/var/folders`, `/tmp`), so fixtures under `ctx.tempDir()` never survive
  `enumerateFileIdentities`; bypass it in tests exactly as `tests/test-probe-projects-v2.js` does.
- **Circular-require rule:** `collect-touches.js` lazily requires probe-projects inside
  `enumerateJsonlFiles`; `module.exports` sits ABOVE the `require.main` guard in both probe
  tools. Keep both when touching them.
- **cp-copy identity merge open question:** `cp a b` with both edited merges into one identity
  (alias-path union). Rare; flagged in the notes file — confirm with the user before changing.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# 1. Unit suite (expect 306 passing, 0 failing; add new tests for step 1):
for t in tests/test-*.js; do case "$t" in tests/test-helpers.js|*output-data.js) ;; *) echo "$t: $(node "$t" 2>/dev/null | grep -E 'passed, [0-9]+ failed')";; esac; done
# 2. End-to-end (~2 min, ONE scan of all JSONL files):
node tools/probe-projects-v2.js \
  --projects-dir ~/Programming/jot-recovery/claude-data/projects \
  --snapshots   ~/Programming/jot-recovery/claude-data/file-history
# 3. Summaries (current baseline: list1 145/148 PASS 98.0%; list2 625 PASS / 109 MISMATCH / 68 NOT_FOUND):
node -e 'const r=require("./tools/probe-results-v2.json");console.log("list1",r.summary.list1,"\nlist2",r.summary.list2);'
# After step 1 (root decode fix): expect ~90 records to move list2 → list1, list1 ≈ 238 files ≈ 98.3%.
```
