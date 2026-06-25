# Handoff: s31 (`s31-script-rename-many-rows`) — IMPLEMENTED. CHARACTERIZATION/REGRESSION LOCK, NO engine `src/` change. Twelve-row CSV bulk rename across textutil.py + tests/test_textutil.py; both HAS-BEACON (complete), reader-INDEPENDENT. Added fixture + engine/CLI test files; 424→436 green, tsc clean. Commit PENDING USER APPROVAL.
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S31 impl (/impl-scenario 31)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/cb097932-13ef-4d4e-9110-eaf2b8ecf4a1.jsonl
Plan file: plans/s31/s31-reconstruction-plan.md (AUTHORITATIVE — all literals re-verified live; one correction noted below)

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae`. The tree is NOT clean: S28+S29+S30 work is
implemented but UNCOMMITTED (modified `src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`,
`_user_edit.ts`; untracked `tests/reconstruction_{engine,cli}_{s28,s29,s30}.test.ts`, `plans/s28/`,
`plans/s29/`, `plans/s30/`; S28/S29/S30 doc edits in `plans/roadmap.md`, `plans/implementation-notes-…md`,
`plans/reconstruction-engine-design.md`; plus unrelated `src/Plan_template.md` + `src/Impl_template.md`
edits by other agents). **S31 added NO `src/` change on top of that** — `git diff -- src/` shows zero S31
hunks.

## Goal
Lock S31's byte-perfect reconstruction so a future change that breaks the many-row HAS-BEACON composition
is caught. S31 is the MANY-ROW sibling of S25/S26/S29: one `python3 bulk_rename.py` Bash run reads a 12-row
`many_renames.csv` and applies all twelve whole-word renames across `textutil.py` and
`tests/test_textutil.py`. Both files are HAS-BEACON with COMPLETE beacons, so the engine adopts the
fully-renamed state for free; the lock pins SCALE (no per-row degradation) plus the edit-ordering crux.

## Current State — IMPLEMENTED (all verified live)
- `npm test` → **436 / 0** (424 baseline + 12 new S31 tests). `npx tsc --noEmit` → clean.
- `git diff -- src/` → NO S31 hunks (only the pre-existing uncommitted S28/S29/S30 + template deltas).
- New/changed S31 files: `tests/fixtures.ts` (+`S31_JSONL`), `tests/reconstruction_engine_s31.test.ts`
  (T1–T6), `tests/reconstruction_cli_s31.test.ts` (C1–C6), `plans/roadmap.md` (S31 line, 424→436),
  `plans/implementation-notes-api-from-scenarios.md` (S31 entry prepended), `plans/reconstruction-engine-design.md`
  (S31 note after S30), `plans/s31/` (plan + this handoff).
- Engine ladders (live): `textutil.py` [write 193, edit `normalize` 205, userEdit `98ce2cbf` 205, edit
  `headline` 218] → 218 L; `tests/test_textutil.py` [write, userEdit `590f882d`] → 71 L; `many_renames.csv`
  [write] → 13 L; `bulk_rename.py` [write] → 54 L. All reader-INDEPENDENT; clean poison matrix.
- No rescue stage fires (beacons COMPLETE): `completeTruncatedBeacon` (S27), `completeElidedBeacons` (S28),
  `seedStaleEditBases` (S19) all inert.

## What Remains
1. **Commit — USER APPROVAL ONLY.** Stage EXACTLY these 7 paths, never `git add -A`, never any `src/*`:
   `tests/fixtures.ts`, `tests/reconstruction_engine_s31.test.ts`, `tests/reconstruction_cli_s31.test.ts`,
   `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`,
   `plans/reconstruction-engine-design.md`, `plans/s31/`. Message: `Implemented S31 handling` + standard
   Co-Authored-By / Claude-Session trailers.
2. **COORDINATION HAZARD — resolve before committing:** the three doc files ALSO carry uncommitted
   S28/S29/S30 doc edits, and `src/` carries uncommitted S28/S29/S30 engine work + unrelated
   `Plan_template.md`/`Impl_template.md` edits. The user must decide the commit-split (S28/S29/S30 may need
   to land first / separately). Do not assume; confirm.
3. **Next scenario: s32** (`s32-script-rename-many-rows`'s successor — inputs on disk). The s32 PLANNING
   monitor watches `./monitor-handoff.sh s31 impl`, which THIS handoff's title satisfies (first token `s31`
   + word `IMPLEMENTED`).

## Key Files
- `plans/s31/s31-reconstruction-plan.md` — AUTHORITATIVE plan (DAGs, ladders, T1–T6 / C1–C6, crux, commit hygiene).
- `plans/script-handling.txt` — the MUST-READ HAS-BEACON vs NO-BEACON premise (S31 is HAS-BEACON for both files).
- `tests/reconstruction_engine_s31.test.ts` / `tests/reconstruction_cli_s31.test.ts` — the locks.
- `tests/fixtures.ts` — `S31_JSONL` points at the sibling RevEng store (Desktop path), not the worktree copy.
- Ground truth: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s31-script-rename-many-rows/`.

## Context the Next Agent Won't Have
- **PLAN CORRECTION (the one deviation):** the plan §"What Remains" + the incoming planning handoff state
  `extractFileEvents` = "4w/**3e**/2ue/0ow". The REAL live multiset is **4 writes, 2 edits, 2 user-edits,
  0 overwrites** — the only edits are textutil.py's two bracketing Claude edits (`normalize` + `headline`);
  the conversationDAG confirms exactly `D edit` + `I edit`. T6 asserts **2 edits**. (Mirrors the S28 lesson:
  probe the engine at HEAD before trusting plan ladder claims.) Every OTHER plan literal matched live exactly.
- **Edit-ordering is the interesting part.** `normalize` was added BEFORE the run (body referenced old
  `trim`/`low`) → the script renamed its body → final references `trim_whitespace`/`lowercase`. `headline`
  was added AFTER the run → references the NEW `capitalize`/`slugify`, replays on top of the renamed beacon
  (rev 3). T4 / C4-C5 scope to the `def` block / final revision so ordering is proven, not co-presence.
- **Whole-word vs substring hazard.** `\bslug\b` legitimately appears TWICE in final `textutil.py` (English
  prose in `headline`'s post-rename docstring — NOT a missed rename); test fn names keep terse substrings
  (`test_cap_basic`/`test_rev_*`/`test_slug_*`, `_`-bounded). All absence assertions use `/\bname\b/`, never
  bare `includes()`.
- **Optional src mutation probe was intentionally SKIPPED** (logged in implementation-notes). Reason: it
  needs mutating shared engine `src/` that holds uncommitted S28/S29/S30 work, and the only clean revert
  (`git checkout -- src/<file>`) would DISCARD that work. The four-file byte-lock (T1) + def-scoped ordering
  crux (T4) already fail loudly on any regression, and `git diff -- src/` proving zero S31 hunks is the
  strongest char-lock guarantee.
- **Ground truth lives in the sibling RevEng project, not the worktree** — fixtures/tests point at the
  Desktop path (same convention as every prior scenario). The worktree `scenarios/executed/…` copy is
  byte-identical but tests use the Desktop path.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 436/0 (424 baseline + 12 S31)
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s31.test.ts   # 6/6 green
node --import tsx --test tests/reconstruction_cli_s31.test.ts      # 6/6 green
git diff -- src/    # NO S31 hunks (only pre-existing S28/S29/S30 + template deltas)
```
