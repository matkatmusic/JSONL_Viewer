# Implementation Notes: probe-projects-v2 (let-s-build-probe-projects-v2-that-binary-perlis)

Spec: `~/.claude/plans/let-s-build-probe-projects-v2-that-binary-perlis.md`
Running log of design decisions, deviations, tradeoffs, and open questions.

## 2026-06-10T16:20-07:00 — Session start

- Task list created (#1–#10): R1 → R2 → R3 → Phases A–F → end-to-end verification.
- TDD order per spec: refactor-safety tests first (R1/R2/R3), then v2 test files.
- Spec line refs verified against current sources: `cwdFromFolderName` is at
  `probe-projects.js:109` (spec says ~92 — drifted, same function); the two
  two JSONL-loading lines are `collect-touches.js:271-272` (spec says 270-271).
  No behavioral difference; noting so future line-ref mismatches don't confuse.

## 2026-06-10T16:25-07:00 — R1 + R2 complete (deviation: function name)

- R1 done: `cwdFromFolderName` exported from `tools/probe-projects.js`;
  asserted by `test_cwdFromFolderName_isExportedAndDecodesFolderName`.
- R2 done: the two cache-loading lines extracted; `findReferencingJsonls`
  gained the optional `cache` param; parity test green.
- **Deviation from spec naming (user-directed mid-session):** the spec names the
  extracted function `loadCorpusCache`. The user instructed: don't use the word
  'corpus' — use the phrase "all JSONL files in the project folder". Implemented
  as `loadAllJsonlFilesInProjectsFolder(projectsDir)` ("projects folder" because
  `projectsDir` is the folder CONTAINING per-project folders; singular "project
  folder" would misdescribe it). This name replaces `loadCorpusCache` everywhere
  the spec mentions it (R2, R3 fallback, Phase A).
- Consequence for Phase A: the spec's `buildCorpus(projectsDir)` will also be
  renamed — plan: `buildSharedJsonlScanState(projectsDir)` or similar
  self-describing name (it returns the once-per-run {cache, graph, index,
  projectRoots}). Final name recorded when Phase A lands.
- `collect-touches.js` is at exactly 300 lines (hook limit). Any future
  additions there must displace a line; new v2 logic goes in probe-projects-v2.js.

## 2026-06-10T16:50-07:00 — R3 + Phases A–D complete

- R3 done (parity + cache-actually-used tests). Phase A `scanProjectsFolderOnce`
  (renamed from spec's `buildCorpus`; fields: allJsonlFiles, samePathGraph,
  pathHistoryIndex, projectRoots). Phases B–D green.
- **Design decision (file split):** Phase D pushed probe-projects-v2.js to 371
  lines (hook limit 300), so reference probing/selection lives in its own
  module `tools/probe-reference-sources.js`; v2 re-exports `chooseReferenceSource`
  and `gatherReferenceSources`. Same rationale as file-path-history.js.
- **Design decision (R4 done after all):** the spec made "git ref in provenance"
  an optional follow-up. Implemented as `resolveGitContentWithRef` inside
  probe-reference-sources.js (tries `buildMultiRefs` candidates in order,
  returns {content, ref}) — no change to common/git-file-state.js.
- **Design decision (snapshot blob):** spec said use non-exported
  `findLastBackupFileName` + `extractSessionMetadata`; instead added ONE
  exported `findLastSnapshotBlob(jsonlText, target, baseHistoryDir)` →
  {sessionId, backupFileName, content} to common/extract-file-state.js, and
  rebased `findLastSnapshotContent` on it (no behavior change, tests green).
  Keeps the snapshot-store layout in one file.
- **Design decision (temp files):** authored paths under /tmp//var/folders are
  excluded from identity enumeration (same exclusion v1 applies). Without it,
  unrecoverable scratch files would flood list2 as NOT_FOUND noise.
- **Design decision (cp-copy merge):** with a directional `cp` edge, a copy and
  its source can share the same smallest alias path; such identities are merged
  (alias-path union) rather than emitted as duplicate identityKeys. Renames (mv)
  are unaffected. Flagging as a soft open question — see Open Questions.
- Additive export: `compareTouchOrder` now exported from file-path-history.js
  (Phase C ordering uses it).

## 2026-06-10T17:25-07:00 — Phases E/F + end-to-end; three harness bugs found & fixed

- Phase E split into `tools/probe-v2-report.js` (records, classification,
  summaries, mismatches skeleton) and Phase C into `tools/probe-v2-assembly.js`
  — the 300-line hook forced the split; probe-projects-v2.js re-exports all of
  it, so tests/callers have one entry point.
- **Deviation (test file names):** spec's `tests/test-probe-v2-record.js` became
  `tests/test-probe-projects-v2.js` (the repo lint hook looks for that exact
  name). All other spec test files exist under their spec names.
- **First e2e run: list1 62.9% (not "near 100").** Diagnosis found real bugs:
  1. **Snapshot edits carry REPO-RELATIVE paths** (`common/scripts/x.py`), so the
     full-path alias filter dropped them — they are the content checkpoints the
     replay needs. Fix: snapshot-sourced edits match by full path-suffix
     (`/x/y/z.py` ends with `/y/z.py`); shared basenames still rejected. 62.9→91.2.
  2. **cat/read-sourced 'update' edits counted as WRITE touches** in
     collect-touches, so cat-only files (.git/HEAD, settings reads) wrongly
     became probe targets. Fix: `extractBashCatEdits` now tags `source:'cat'`
     (behavior-neutral for replay — only read|snapshot are special-cased) and
     `touchKindForEdit` maps read/cat to kind 'read'. 91.2→94.6, removed 11
     read-only noise records.
  3. **Trailing cat observations are lossy** (piped/truncated cat output
     overrode the last authored state — e.g. plate-status-2026-04-14.md). Fix:
     if the FULL replay matches no source, retry once with the trailing
     observation run dropped (`dropTrailingObservationEdits`); a PASS records
     `replayVariant: 'trailing-observations-trimmed'`. Unconditional trimming
     was rejected — it broke one file (todo/SKILL.md) that NEEDS its trailing
     observation. 94.6→97.3, 7 records pass via the trimmed variant.
- **Final numbers across all 13 projects:** list1 148 files, 144 PASS, 4 MISMATCH (97.3%
  actionable). All 4 are v1-confirmed genuine residuals (settings.local.json is
  hook-churned; plate-assessment/test_util_terminal/plate_summary changed
  outside sessions). list2 802 files, 620 PASS / 114 MISMATCH / 68 NOT_FOUND
  (77.3%). Headlines verified: 4 distinct launch.json identities (3 PASS, no
  cross-contamination); js/* scaffold → NOT_FOUND in list2;
  jsonl-tree-viewer.html → list2, lastSeenFullPath "", PASSes via fallback
  source; jfred* multi-transcript files PASS.

## 2026-06-10T17:50-07:00 — Third replay variant: trailing-newline-restored

- Diagnosed the first list1 mismatch (jot/.claude/settings.local.json): the
  file's only evidence of final state is a plain `cat` from 2026-05-17, and the
  recorded Bash stdout TRIMS the file's final newline — replay was exactly one
  byte short (verified `catContent + "\n" === onDisk`).
- New retry (after the trimmed-observations retry): when the replay's FINAL
  authority is a cat/read observation and nothing matched, retry with the
  trailing newline restored. Gated on observation-final — an authored final
  state differing by a newline is a genuine outside-session change and stays
  MISMATCH (negative test covers this).
- Effect on the full run: list1 97.3% → **98.0%** (145/148); list2 77.3% → 77.9%
  (+5 PASS). Variant usage across all 950 records: 937 full, 7
  trailing-observations-trimmed, 6 trailing-newline-restored. Zero regressions
  (306/306 tests green).
- The 3 remaining list1 mismatches (plate_summary.py, plate-assessment md,
  test_util_terminal.py) are all v1-confirmed genuine outside-session changes —
  root-cause authoring in probe-mismatches-v2.json is the follow-up.

## Open questions (non-blocking)

1. **cp-copy identity merge:** if a session `cp a b` and then edits BOTH files,
   their kept-edit streams merge into one identity record. Rare in the recovered data;
   surfaced here for confirmation. Alternative: treat cp-dst as its own
   identity and use the cp edge only for transcript finding.
2. **Snapshot basename choice for renamed files:** snapshot lookup tries the
   current-name basename first, then every alias basename. If two aliases share
   a basename with DIFFERENT content epochs, the most-recent transcript wins.
3. **Project roots with spaces/dashes misclassify into list2:**
   `cwdFromFolderName` decodes `-Users-...-Desktop-claude-code-src-RevEng` to
   `/Users/.../Desktop/claude/code/src/RevEng` (every dash becomes a slash), so
   files in THIS repo ("claude code src" has spaces) never match a project root
   and land in list2 despite being on disk in a probed project. Same lossy
   decode exists in v1. Suggested follow-up: derive project roots from session
   `cwd` metadata (exact) instead of folder-name decoding.
4. **Overlapping/parallel sessions:** transcripts are concatenated whole, in
   first-touch order (per spec). Two sessions interleaving edits to one file
   can still replay wrong; per-EDIT global timestamp ordering would be the
   deeper fix if such cases appear in the residuals.
