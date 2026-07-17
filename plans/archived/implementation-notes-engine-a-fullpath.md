## 2026-06-17:22:48:00 — Engine A: basename → full-path matching
Chat title: implement engine-a full-path migration
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/e93d89f4-4fa8-494b-98d6-01c2d438ba5c.jsonl

### References
- /Users/matkatmusicllc/.claude/plans/investigate-why-engine-a-purring-mitten.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260617-2245.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/unified-reconstruct-steps.js
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/api/unified-reconstruct.js
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/verify-unified-scenarios.js
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test-unified-reconstruct-steps.js

### Design decisions
- **`matchesTargetFile` → full-path equality only** (`filePath === targetFile`); `basename`
  param dropped and threading removed from `buildEditStep`, `checkReadToolUse`,
  `checkCatToolUse`, `appendEditSteps`, `appendReadSteps`, `appendSnapshotSteps`,
  `appendCatSteps`, and `extractStepsFromSingleJSONL`.
- **Snapshot keys** matched by a dedicated `snapshotKeyMatchesTarget(key, targetFile)` =
  exact OR full relative-path suffix (`targetFile.endsWith('/' + key)`). Snapshot
  `trackedFileBackups` keys are repo-relative, so a whole-relative-path suffix is required;
  a shared basename alone is rejected. Kept internal (not exported) — exercised through
  `getSnapshotContentForFile`.
- **Cat paths** resolved against session cwd via the already-exported `resolveAgainstCwd`
  (from `api/file-historical-lineage.js`) + `extractSessionMetadata` (from
  `api/transcript-parsers.js`); `cwd` threaded `extractStepsFromSingleJSONL → appendCatSteps
  → checkCatToolUse`.
- **Target canonicalized once at entry** (`reconstructFromFolder`,
  `reconstructFromJSONLTexts`) via `resolveSymlinksToRealPath` — deepest-existing-ancestor
  realpath that re-appends the non-existent tail, so a `/var/...` target lines up with
  JSONL paths recorded as `/private/var/...`. Per-event matching stays pure string equality
  (event paths are already real-resolved).
- **`mentionsFile` prefilter left basename-permissive** with a comment marking it
  non-authoritative; the full-path `matchesTargetFile` is the authoritative decision.
- **A/B gate** now passes the absolute in-session path `path.join(info.tmpdir, py)` instead
  of the bare basename `py`.

### Deviations
- **`resolveSymlinksToRealPath` placed as a LOCAL helper in `api/unified-reconstruct.js`,
  NOT in `api/file-historical-lineage.js`** as plan/handoff step 5 specified. Reason: a
  hard pre-commit hook enforces a 250-line file cap, and `file-historical-lineage.js` was
  already exactly at 250 — adding the helper there breached it. `unified-reconstruct.js`
  had room (189 → 218). The plan explicitly allowed a local helper as the fallback.
  Consequence: no new export on `file-historical-lineage.js`, so handoff verification
  step 4 ("re-run test-file-historical-lineage.js if the file gained an export") is moot —
  its suite was still run (green) as part of the full sweep.
- **The "~247 matched" gate expectation in the plan/handoff was wrong.** The gate's real
  population is **29 py-file results** (29 MATCH / 0 MISMATCH / 4 SKIPPED). I verified the
  baseline by restoring the original engine + original verify: it produced the SAME
  29/0/4, and the matched-file SETS are byte-identical between old and new (diff empty).
  So the change is behavior-preserving on every real fixture; 247 was a planning estimate
  error, not a regression signal.

### Tradeoffs
- Reused Engine B's `resolveAgainstCwd` rather than duplicating cwd-resolution logic in
  Engine A — single home for that utility, no new surface. Chose NOT to also relocate
  `resolveSymlinksToRealPath` there (cap), accepting a small duplication-of-spirit between
  the two path helpers living in different files.
- `unified-reconstruct-steps.js` remains over the 250-line **soft** cap (298; was 288
  before this change — net +10 for the import, snapshot matcher, and cat-resolution).
  Kept comments terse to minimise the increase. A file split to get back under the cap was
  out of scope for this change and is a pre-existing condition.

### Verification
- `node tests/test-unified-reconstruct-steps.js` → 25 passed, 0 failed.
- `node tests/test-unified-reconstruct.js` → 32 passed, 0 failed.
- `node tests/verify-unified-scenarios.js` (primary A/B gate) → 29 MATCH / 0 MISMATCH /
  4 SKIPPED; matched-file set byte-identical to the pre-change baseline.
- Hand spot-check: JSONL editing both `/a/x.py` and `/b/x.py`; reconstructing `/a/x.py`
  yields only `AAA from a`, `/b/x.py` yields only `BBB from b` — collision correctly
  separated (the old engine would have applied both).
- Full suite sweep over `tests/test-*.js` → **707 passed, 0 failed** (baseline 705; +2
  net-new tests).

### Follow-up: file split (done, at user request)
- `unified-reconstruct-steps.js` (298 lines, over the 250 cap) was split:
  - **New `api/unified-reconstruct-step-extractors.js`** (208 lines) — step factory,
    `matchesTargetFile` / `snapshotKeyMatchesTarget`, parsing primitives, and the
    edit/read/cat record extractors.
  - **`api/unified-reconstruct-steps.js`** (135 lines) — orchestration only
    (`append*Steps`, `extractStepsFromSingleJSONL`, `extractStepsFromJSONLs`); it requires
    the extractors module and **re-exports the same public surface**, so `unified-reconstruct.js`
    and all callers are unchanged.
- Test suite split to match (and to bring the 252-line test file under the cap):
  - **New `tests/test-unified-reconstruct-step-extractors.js`** (142 lines, 16 tests) —
    makeStep / matchesTargetFile / getSnapshotContentForFile / buildEditStep, importing the
    extractors module directly.
  - **`tests/test-unified-reconstruct-steps.js`** (127 lines, 9 tests) — orchestration/
    integration tests only.
- Verified after split: extractors suite 16/0, steps suite 9/0 (25 total, unchanged); A/B gate
  29 MATCH / 0 MISMATCH / 4 SKIPPED (unchanged); full sweep **707 passed, 0 failed**.

### Open questions
- None outstanding.
