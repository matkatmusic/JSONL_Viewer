MUST READ: plans/script-handling.txt

# Handoff: Scenario s29 (`s29-script-rename-repo-walk`) IMPLEMENTED — CHARACTERIZATION/REGRESSION LOCK, NO engine src change. Composition of S27 (truncated) + S28 (elided) + no-beacon vendor CONTROL under one `os.walk` script run; all 8 files byte-perfect; 398→412 green (8 engine + 6 CLI); both crux mutations proven RED→GREEN. Next: s30.
Conversation name: api-from-scenarios — S29 impl (/impl-scenario 29)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/294e0115-5544-4846-986b-dca3ff1c22d2.jsonl
Plan file: plans/s29/s29-reconstruction-plan.md  (AUTHORITATIVE — every value below re-verified LIVE against the real sidecar reader before being baked into tests)

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae`. The tree is NOT clean: the S28 work is
implemented but UNCOMMITTED (modified `src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`,
`_user_edit.ts`; untracked `tests/reconstruction_engine_s28.test.ts`, `tests/reconstruction_cli_s28.test.ts`,
`plans/s28/`; and S28 doc edits already present in `plans/roadmap.md`,
`plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`). S29 added NO
`src/` change on top of that.

## Goal
Lock S29's byte-perfect reconstruction and prove which existing engine code makes it work, so a future
change that breaks the S27/S28/vendor-skip composition is caught. S29 is the COMPOSITION test: one
`python3 walk_rename.py` Bash run (`os.walk`, skipping `vendor/`) renames `helper`→`compute_value` across
the package and emits SIX `edited_text_file` beacons in every shape the engine already handles — 1
COMPLETE, 4 TRUNCATED (S27), 1 ELIDED (S28) — while the two `pkg/vendor/*` files get NO beacon and must
keep `helper` (the control). No new engine code needed or wanted.

## Current State — COMPLETE (everything below verified this session)
- `npm test` → **412 / 0** (was 398 at S29 start with S28 present). `npx tsc --noEmit` → clean.
- **ZERO S29 `src/` change** proven: `git diff src/` is byte-identical to the S29-start snapshot
  (`/tmp/s29-src-before.diff`); `git diff --stat src/` shows ONLY the 4 pre-existing S28 files.
- New engine test `tests/reconstruction_engine_s29.test.ts` (8 tests) — all green.
- New CLI test `tests/reconstruction_cli_s29.test.ts` (6 tests) — all green.
- `S29_JSONL` added to `tests/fixtures.ts` (after `S28_JSONL`, Desktop canonical path).
- 3 doc edits added (S29 entries): `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`,
  `plans/reconstruction-engine-design.md`.
- **Mutation probes (§9) proven RED→GREEN and restored byte-identically:**
  - Probe A — neutralize `completeTruncatedBeacon` (branches.ts line 56): ONLY engine test T3
    (`test_S29_three_truncated_beacons_completed_bytelock`) went RED; the other 7 stayed green (T7/`pkg/b.py`
    stayed GREEN — its truncated beacon is independently repaired by `seedStaleEditBases` via the later
    `pipeline` Edit). Restored from `/tmp/branches.bak`, diff-clean.
  - Probe B — neutralize `completeElidedBeacons` (branches.ts line 54): ONLY engine test T5
    (`test_S29_elided_beacon_completed_version_selected_by_content`) went RED; the other 7 stayed green.
    Restored from `/tmp/branches.bak`, diff-clean.
  - After both: `cp /tmp/branches.bak src/reconstruction_branches.ts`, `npm test` → 412 green, `git diff src/`
    identical to the S29-start baseline.

## What Remains
1. **COMMIT (USER-APPROVAL-ONLY).** Nothing is committed. `git status` first. Stage **exactly** the S29
   files: `tests/fixtures.ts`, `tests/reconstruction_engine_s29.test.ts`,
   `tests/reconstruction_cli_s29.test.ts`, `plans/roadmap.md`,
   `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, and
   `plans/s29/`. **NEVER `git add -A`.** Do NOT stage `src/*` (there must be no src change), nor
   `src/Plan_template.md` / `src/Impl_template.md`, `monitor-handoff.sh`, `plans/monitor-handoff-spec.md`,
   or any uncommitted S28 files (`plans/s28/`, the two S28 test files). **COORDINATION HAZARD:** the three
   doc files ALSO carry S28's uncommitted doc edits, so staging them brings the S28 doc content too — confirm
   with the user how to split the S28 vs S29 commits before committing. Message: `Implemented S29 handling`
   plus the standard Co-Authored-By / Claude-Session trailers.
2. Proceed to **s30** (script-rename-count-mismatch); its planning monitor watches for THIS handoff.

## Key Files
- `plans/s29/s29-reconstruction-plan.md` — AUTHORITATIVE plan (§2 = all exact literals; §5/§6 = the two test
  files; §9 = the mutation proof).
- `plans/script-handling.txt` — the MUST-READ HAS-BEACON vs NO-BEACON premise.
- `tests/reconstruction_engine_s29.test.ts` (8 tests) + `tests/reconstruction_cli_s29.test.ts` (6 tests) —
  the new locks.
- `tests/fixtures.ts` — `S29_JSONL` (Desktop canonical path).
- `scenarios/s29-script-rename-repo-walk.txt` + `scenarios/executed/s29-script-rename-repo-walk/` — scenario
  + executed transcript and the 3 rendered files (`main.py`, `walk_rename.py`, `tests/test_pkg.py`).
- `~/.claude/file-history/543492c4-1d45-47b7-a4a1-a2d14857161f/` — backups; source of the 4 inline blobs
  (`38dbed748662c3cb@v3/@v4`, `e5663c2564dcb2d1@v2/@v3`).

## Context the Next Agent Won't Have
- **NO engine change. This is a char-lock.** Byte-perfect reconstruction already holds on the post-S28
  engine. If a lock fails, the bug is in a test literal/reader, NOT `src/`.
- **GROUND-TRUTH GAP (differs from every prior script-rename scenario):** the executed-scenario folder
  captured only `main.py`, `walk_rename.py`, `tests/test_pkg.py`; the entire `pkg/` subtree was NOT rendered
  to disk. So the `pkg/a.py`/`pkg/b.py` cruxes are locked via INLINE file-history backup blobs in the engine
  test (captured raw, embedded as escaped string literals); the CLI test covers `pkg/*` via the real reader.
- **Version selection is by CONTENT, not recency:** `pkg/a.py` picks `@v4` over the SAME-128-line `@v3`
  (both differ only by `helper`→`compute_value`); `pkg/b.py` picks `@v3` over the same-101-line `@v2`, then
  the `pipeline` Edit replays on top. The hermetic engine-test reader serves BOTH the rejected and chosen
  versions so the choice is proven.
- **`pkg/b.py` LEAKS poison** under a degenerate reader via the pre-existing `seedStaleEditBases` (S19/S23)
  path for the `pipeline` Edit's stale base — identical to S28's `catalog_view`. Prior-scenario behaviour,
  NOT introduced by S29. `pkg/b.py` is EXCLUDED from poison asserts; the clean poison guards are `pkg/a.py`
  (elided) and the 3 truncated files.
- **`pkg/b.py` is NOT a unique `completeTruncatedBeacon` crux** (Probe A left it green) — the unique S27
  cruxes are `main.py` / `tests/test_pkg.py` / `walk_rename.py`. The unique S28 crux is `pkg/a.py`.
- **`walk_rename.py` is SELF-MODIFYING** (the walk renames its own string literals): its final revision
  shows `'compute_value' -> 'compute_value'` and no bare `helper`.
- **CLI test `finalRevisionSlice` helper:** `pkg/a.py`'s INTERMEDIATE revision (the elided beacon)
  legitimately carries a windowed `| ...` line, so the "no window survived" check is scoped to the FINAL
  revision slice, not the whole verbose block.
- LESSON (S22/S26): the handoff TITLE drives the next monitor; the next-scenario token (`s30`) is kept ONLY
  in the title, never in the body, to avoid false-fires.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 412 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s29.test.ts   # 8 green
node --import tsx --test tests/reconstruction_cli_s29.test.ts      # 6 green
diff /tmp/s29-src-before.diff <(git diff src/)                     # identical → zero S29 src change
```
