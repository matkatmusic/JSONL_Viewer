# Handoff: Convert Engine A (unified-reconstruct) from basename matching to full-path matching

## Branch
`develop` based on `develop` (single-commit repo; entire working tree is untracked except `.gitignore`)

## Goal
Engine A — the unified reconstruction engine (`api/unified-reconstruct.js` +
`api/unified-reconstruct-steps.js`) — decides which JSONL events belong to the file it is
reconstructing using **basename matching**. This conflates same-basename files in different
directories. Engine B (`api/track-line-states.js` via `api/file-historical-lineage.js`) already
matches on full paths and explicitly calls basename matching "the collision bug v2 exists to
kill." The goal is to bring Engine A to full-path matching (Engine B parity) so there is no
confusion about which file is being reconstructed.

## Current State
- **No code changed yet.** This was a planning session; the implementation plan was written and
  is ready to execute. The ExitPlanMode approval was interrupted (user ran /handoff-prompt), so
  implementation has not started.
- Root cause is fully traced and confirmed against real fixtures.
- The single basename-matching decision point is `api/unified-reconstruct-steps.js:37-39`:
  ```js
  function matchesTargetFile(filePath, targetFile, basename) {
    return filePath === targetFile || filePath.endsWith('/' + basename);
  }
  ```
- Two user decisions are locked: (a) **Engine B parity** for tricky cases (not strict
  exact-only), and (b) **resolve all symlinks to real on-disk locations** to reconcile
  `/var` vs `/private/var`.

## What Remains
Execute the plan in this order:

1. **`api/unified-reconstruct-steps.js`** — `matchesTargetFile` → full-path equality only
   (`return filePath === targetFile;`), drop the `basename` param.
2. **Same file** — snapshots: add `snapshotKeyMatchesTarget(key, targetFile)` returning
   `key === targetFile || targetFile.endsWith('/' + key)` (snapshot keys are repo-relative);
   use it in `getSnapshotContentForFile`'s loop instead of `matchesTargetFile`.
3. **Same file** — cat: relative `cat` paths must be resolved against session cwd before the
   exact match. Reuse `resolveAgainstCwd` (exported from `api/file-historical-lineage.js`) and
   get session cwd via `extractSessionMetadata` (`api/transcript-parsers.js`). Thread `cwd`
   through `extractStepsFromSingleJSONL → appendCatSteps → checkCatToolUse`.
4. **Same file** — remove `basename` threading from `buildEditStep`, `checkReadToolUse`,
   `appendEditSteps`, `appendReadSteps`, `appendCatSteps`, `appendSnapshotSteps`, and the
   `var basename = targetFile.split('/').pop()` in `extractStepsFromSingleJSONL`.
5. **`api/file-historical-lineage.js`** — add and export `resolveSymlinksToRealPath(p)`: realpath
   the **deepest existing ancestor** and re-append the non-existent tail (plain `fs.realpathSync`
   throws ENOENT because scenario tmpdirs are deleted; `/var` still resolves to `/private/var`).
6. **`api/unified-reconstruct.js`** — canonicalize `targetFile` **once** at `reconstructFromFolder`
   and `reconstructFromJSONLTexts` entry via `resolveSymlinksToRealPath`. Event paths from the
   JSONL are already real-resolved, so keep per-event matching as pure string comparison. Leave
   `mentionsFile`/`getJsonlFilesForFile` basename-permissive (it is a non-authoritative candidate
   recall filter); add a one-line comment saying so.
7. **`tests/verify-unified-scenarios.js:87`** — change `reconstructFromJSONLTexts(jsonlTexts, py)`
   to pass `path.join(info.tmpdir, py)` (absolute in-session path). Keep reading expected content
   from `path.join(filesDir, py)`. **This is make-or-break** for the gate.
8. **`tests/test-unified-reconstruct-steps.js`** — drop basename args from call sites; **invert**
   `matchesTargetFile matches by basename` (line 147) to expect `false`; rewrite
   `getSnapshotContentForFile finds basename match` (line 80) to repo-relative-suffix semantics +
   add a negative for a different-dir absolute key; add a cat-relative-path-resolved test.

## Key Files
- `api/unified-reconstruct-steps.js` — step extraction + the `matchesTargetFile` decision point (288 lines, already over the 250 soft cap — keep additions minimal).
- `api/unified-reconstruct.js` — entry points (`reconstructFromFolder`, `reconstructFromJSONLTexts`), `mentionsFile`/`getJsonlFilesForFile` prefilter.
- `api/file-historical-lineage.js` — Engine B's full-path matcher `editBelongsToFile` (line 232) and `anyAliasPathEndsWith` (line 219) to mirror; `resolveAgainstCwd` (line 34, exported) to reuse; add `resolveSymlinksToRealPath` here.
- `api/transcript-parsers.js` — `extractSessionMetadata` for session cwd.
- `tests/verify-unified-scenarios.js` — the A/B gate (passes basename today at line 87).
- `tests/test-unified-reconstruct-steps.js` — unit tests asserting basename matching.
- `/Users/matkatmusicllc/.claude/plans/investigate-why-engine-a-purring-mitten.md` — the full plan.

## Plan File
`/Users/matkatmusicllc/.claude/plans/investigate-why-engine-a-purring-mitten.md`

## Context the Next Agent Won't Have
- **Confirmed from real fixtures** (`plans/scenarios/executed/m1-cp-fork-run-*.txt` + its JSONL):
  Edit `toolUseResult.filePath` and Read `input.file_path` are **absolute**
  (`/private/var/folders/.../run-scenario.xxx/m1_base.py`); snapshot `trackedFileBackups` keys are
  **repo-relative** (`"m1_base.py"`, `"tests/test_x.py"`). This is why snapshots need a relative
  *suffix* match, not exact equality.
- **The `/private` symlink trap:** JSONL paths are `/private/var/folders/...` but the recorded
  `tmpdir:` in the executed `.txt` is `/var/folders/...` (macOS `/var → /private/var`). Naïve exact
  equality fails across this. The engine must canonicalize the target (deepest-existing-ancestor
  realpath, because the tmpdir is long deleted).
- **Renames are NOT affected** by this change. Basename matching never bridged a rename (old/new
  basenames differ) and Engine A has no lineage. Only same-basename-*different-directory*
  collisions change behavior — exactly the bug being fixed. The gate's ~247-matched count should
  hold; a wave of mismatches means the `/private` canonicalization is not lining up — debug that
  first.
- **Do NOT make the coarse `mentionsFile` prefilter strict.** It only selects candidate JSONLs;
  making it full-path-only would drop JSONLs that reference the file solely via a repo-relative
  snapshot key or relative `cat`. The authoritative decision is the full-path `matchesTargetFile`.
- User decisions captured live: Engine B parity (chosen over strict exact-only) and "resolve all
  symlinks to their real on-disk locations" (chosen over gate-only canonicalization).

## How to Verify
Run from `RevEng/` (Node directly — no npm test script):
1. `node tests/test-unified-reconstruct-steps.js` — all green.
2. `node tests/test-unified-reconstruct.js` — all green.
3. **Primary gate:** `node tests/verify-unified-scenarios.js` — expect the same pass profile as
   before (≈247 MATCH, 0 MISMATCH). Mismatch wave ⇒ `/private` canonicalization is off.
4. If `file-historical-lineage.js` gained an export, re-run `node tests/test-file-historical-lineage.js`.
5. Hand spot-check: craft a JSONL editing both `/a/x.py` and `/b/x.py`, reconstruct `/a/x.py`,
   confirm only `/a/x.py` events apply.
