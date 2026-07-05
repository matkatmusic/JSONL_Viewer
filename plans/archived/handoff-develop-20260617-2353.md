# Handoff: Engine A (unified-reconstruct) migrated from basename to full-path matching, then split under the file-size cap
Conversation name: implement engine-a full-path migration
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/e93d89f4-4fa8-494b-98d6-01c2d438ba5c.jsonl

## Branch
`develop` based on `develop` (single-commit repo `1a9f098 Initial commit`; the entire `api/`, `tests/`, `plans/` tree is UNTRACKED — only `.gitignore` is tracked, so there is no git history or diff to inspect for this work)

## Goal
Engine A — the unified reconstruction engine (`api/unified-reconstruct.js` + the step extractors) — decided which JSONL transcript events belonged to the file being reconstructed using **basename matching** (`filePath.endsWith('/' + basename)`). That conflated two different files that share a filename in different directories (e.g. `/a/x.py` and `/b/x.py`). Engine B (`api/track-line-states.js` via `api/file-historical-lineage.js`) already matches on full absolute paths and labels basename matching "the collision bug v2 exists to kill." This work brought Engine A to **full-path (Engine B) parity** so there is no ambiguity about which file is being reconstructed. A follow-up then **split the over-cap step-extraction file** to satisfy the repo's 250-line-per-file hook.

## Current State
**COMPLETE and verified.** All work is implemented; no code is left in a partial state.

Behavior change (what the engine now does):
- Edits/reads match by **exact full path**; the `basename` parameter and all its threading were removed.
- Snapshot keys (repo-relative in the JSONL) match by **exact OR full relative-path suffix** via a new `snapshotKeyMatchesTarget` — a shared basename alone is rejected.
- Relative `cat` paths are **resolved against session cwd** before matching (reuses Engine B's `resolveAgainstCwd` + `extractSessionMetadata`).
- The target is **canonicalized once at entry** (`resolveSymlinksToRealPath`) so a caller's `/var/...` lines up with JSONL paths recorded as `/private/var/...` (macOS symlink).

File split (follow-up, at user request):
- `api/unified-reconstruct-steps.js` (was 298 lines, over the 250 cap) → split into the orchestration module (135 lines) + a new **`api/unified-reconstruct-step-extractors.js`** (208 lines) holding the step factory, matchers, and edit/read/cat extractors. The orchestration module re-exports the identical public surface, so all callers are unchanged.
- The unit test file was split to match: new `tests/test-unified-reconstruct-step-extractors.js` (16 tests) + slimmed `tests/test-unified-reconstruct-steps.js` (9 integration tests).

Verification results (current):
- `node tests/test-unified-reconstruct-step-extractors.js` → 16 passed, 0 failed
- `node tests/test-unified-reconstruct-steps.js` → 9 passed, 0 failed
- `node tests/test-unified-reconstruct.js` → 32 passed, 0 failed
- `node tests/verify-unified-scenarios.js` (A/B gate) → **29 MATCH / 0 MISMATCH / 4 SKIPPED**
- Full sweep over `tests/test-*.js` → **707 passed, 0 failed**
- All touched source + test files are now under the 250-line cap (208 / 135 / 142 / 127).

## What Remains
None for this task — it is finished and green. If continuing related work, candidate next steps (NOT started, optional):
1. Consider applying the same full-path discipline audit to any other consumer of `matchesTargetFile`-style logic (none found in this session, but not exhaustively swept outside the unified-reconstruct trio).
2. If the project later adds a git-tracked baseline, re-run the A/B gate after any scenario regeneration to keep the 29/0/4 profile honest.

## Key Files
- `api/unified-reconstruct-step-extractors.js` — NEW. Step factory (`makeStep`), matchers (`matchesTargetFile` full-path-only, `snapshotKeyMatchesTarget` relative-suffix), parsing primitives, and the edit/read/cat record extractors. Exports the primitives the orchestration module imports.
- `api/unified-reconstruct-steps.js` — orchestration only (`append*Steps`, `extractStepsFromSingleJSONL/JSONLs`); requires the extractors module and re-exports the unchanged public API.
- `api/unified-reconstruct.js` — entry points (`reconstructFromFolder`, `reconstructFromJSONLTexts`); holds the local `resolveSymlinksToRealPath` helper and canonicalizes the target once at both entries; `mentionsFile` is annotated as a non-authoritative recall prefilter.
- `api/file-historical-lineage.js` — UNCHANGED. Source of the reused, already-exported `resolveAgainstCwd`; its `editBelongsToFile` is the Engine B full-path matcher this work mirrors. (It sits exactly at the 250-line cap — do NOT add to it.)
- `api/transcript-parsers.js` — `extractSessionMetadata` (returns `{gitBranch, cwd, sessionId}`); used for cwd resolution.
- `tests/verify-unified-scenarios.js` — the A/B gate; line ~87 now passes the absolute in-session path `path.join(info.tmpdir, py)` (was the bare basename `py`).
- `tests/test-unified-reconstruct-step-extractors.js` / `tests/test-unified-reconstruct-steps.js` — the split unit suites.
- `plans/implementation-notes-engine-a-fullpath.md` — full design decisions, deviations, tradeoffs, and the split record.

## Plan File
`/Users/matkatmusicllc/.claude/plans/investigate-why-engine-a-purring-mitten.md` (the original implementation plan). Implementation notes: `RevEng/plans/implementation-notes-engine-a-fullpath.md`.

## Context the Next Agent Won't Have
- **The plan/handoff predicted "~247 matched" on the A/B gate — that number was WRONG (a planning-time estimate error).** The gate's real population is **29 py-file results (29/0/4)**. Do NOT treat 29 as a regression. This was confirmed empirically: the original engine (basename) + original verify were restored and produced the SAME 29/0/4, and the matched-file SETS were byte-identical old↔new. The change is behavior-preserving on every real fixture; it only changes behavior for same-basename-different-directory collisions (which had no real fixtures, hence identical totals).
- **`resolveSymlinksToRealPath` was deliberately placed as a LOCAL helper in `api/unified-reconstruct.js`, NOT in `file-historical-lineage.js`** as the original plan specified. Reason: `file-historical-lineage.js` was already exactly at the hard 250-line hook cap; adding it there breaks the commit. The plan explicitly allowed a local helper as the fallback. Consequence: no new export was added there, so the plan's "re-run test-file-historical-lineage.js if it gained an export" step is moot (its suite was still run, green).
- **`resolveSymlinksToRealPath` must realpath the deepest EXISTING ancestor and re-append the non-existent tail.** Plain `fs.realpathSync` throws ENOENT because scenario tmpdirs are long deleted; only `/var` (→`/private/var`) still resolves. The implemented helper climbs `path.dirname` until realpath succeeds.
- **Three distinct matching contexts, three rules:** edit/read events = exact absolute equality; snapshot `trackedFileBackups` keys = repo-relative, so full relative-path SUFFIX match (not exact, not basename); `cat` commands = resolve relative path against session cwd, then exact. Confirmed from real fixtures in `plans/scenarios/executed/`.
- **Do NOT make `mentionsFile`/`getJsonlFilesForFile` strict.** It is a coarse recall prefilter for selecting candidate JSONLs; tightening it to full-path-only would drop JSONLs that reference the file only via a repo-relative snapshot key or a relative cat. The authoritative decision is the full-path `matchesTargetFile`. There is a comment saying so.
- **Hooks in this environment:** a Stop/PostTool hook enforces a 250-line-per-file cap (it blocks but edits still land) and auto-runs the matching `test-<basename>.js` after edits. There is NO npm test script — run tests with `node tests/<file>.js` directly.
- **The repo is almost entirely untracked** — there is no meaningful `git diff`/`git stash` baseline; to compare against "before," files must be hand-restored from known content.

## How to Verify
Run from `RevEng/` (Node directly — no npm test script):
1. `node tests/test-unified-reconstruct-step-extractors.js` — expect 16 passed, 0 failed.
2. `node tests/test-unified-reconstruct-steps.js` — expect 9 passed, 0 failed.
3. `node tests/test-unified-reconstruct.js` — expect 32 passed, 0 failed.
4. **Primary A/B gate:** `node tests/verify-unified-scenarios.js` — expect `MATCH: 29 / MISMATCH: 0 / SKIPPED: 4`. A wave of mismatches means the `/private` canonicalization is not lining up — debug `resolveSymlinksToRealPath` first.
5. Full sweep: `for f in tests/test-*.js; do node "$f"; done` — expect 707 passed, 0 failed total.
6. Hand spot-check (collision): craft a JSONL with create edits to `/a/x.py` and `/b/x.py`, reconstruct each via `reconstructFromJSONLTexts`, and confirm `/a/x.py` yields only its own content (the old engine would have applied both).
