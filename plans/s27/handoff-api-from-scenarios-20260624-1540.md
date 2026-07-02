MUST READ: plans/script-handling.txt

# Handoff: IMPLEMENT Scenario S27 (`s27-script-rename-edited-before-run`) — a REAL ENGINE FIX (first in the script-rename series), NOT a char-lock. The plan is COMPLETE and authoritative at `plans/s27/s27-reconstruction-plan.md` — follow it verbatim. Baseline 371 → 371 + new tests.
Conversation name: api-from-scenarios — S27 planning (monitor-gated on S26 impl handoff)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/d3334df4-4c73-4b09-ac8d-b179300e2753.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s27/s27-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `ac598ad s26 handling implemented` (S1–S26 + m1–m7
committed; clean baseline of **371** tests). Working tree carries only the pre-existing
`src/Impl_template.md` / `src/Plan_template.md` edits and untracked monitor-helper files — do NOT stage
those. `git diff src/` is currently EMPTY (the S27 fix was prototyped live during planning then reverted).

## Goal
Make the engine reconstruct S27 byte-for-byte. S27 is a script rewrite where `python3 rename_inv.py`
renames symbols across `inventory.py` + `tests/test_inventory.py` (the script is edited 3× BEFORE it
runs). `tests/test_inventory.py`'s post-script `edited_text_file` beacon is **TRUNCATED** (a 50-line
prefix of the true 73-line file) and has **NO Edit after it**, so the engine adopts the truncated beacon
verbatim and the file is short by 23 lines. This is a NEW failure mode the existing backup-seed
machinery does not cover (S25 was rescued by a downstream Edit; S27 has none). The fix appends a terminal
`overwrite` from the file's final file-history backup (`df7b79499e8a9377@v3`).

## Current State
**Planning COMPLETE; nothing implemented; nothing committed.** The full implementation plan (event
ladder, verified revision ladders, the exact engine fix with code, file-organization for the 250-line
cap, the §2.7 capture command, and 7 engine + ~6 CLI lock tests) is written at
`plans/s27/s27-reconstruction-plan.md`. The fix was prototyped live and verified: S27 byte-perfect
(`test_inventory.py` `[write,user-edit,overwrite]`, 2215 bytes), full suite **371 pass / 0 fail**, `tsc`
clean — then fully reverted (`git diff src/` empty).

## What Remains
Execute the plan in order (it is the authority; this list is the index):
1. **Task 1** — baseline check (371 green, tsc clean), append `S27_JSONL` to `tests/fixtures.ts`, run
   the §2.7 capture command for the four ground-truth string literals.
2. **Task 2 (TDD)** — write the crux engine test FIRST and watch it FAIL, then apply the §3 fix:
   add `latestBackupWriteFor` to `src/reconstruction_sidecar.ts`; create `src/reconstruction_reseed.ts`
   (MOVE the stale-edit cluster out of `reconstruction_branches.ts` + ADD `beaconIsTruncated` /
   `completeTruncatedBeacon`); wire `completeTruncatedBeacon` into `reconstructFileOver`. **Every `src/`
   file must end ≤ 250 lines** (hook-enforced — that is why the new module exists).
3. **Task 3** — `tests/reconstruction_engine_s27.test.ts` (hermetic reader, mirrors S25): 7 tests
   incl. the crux overwrite, the reader-dependence "without reader is wrong" guard, and the poison guard.
4. **Task 4** — `tests/reconstruction_cli_s27.test.ts` (real reader, mirrors S25): DAG/list-branches/
   verbose; the verbose `test_inventory.py` final must show the COMPLETE file.
5. **Task 5** — docs: `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`,
   `plans/reconstruction-engine-design.md`.
6. **Task 6** — full verification (npm test all green, tsc clean, all `src/` ≤ 250, mutation probe on
   the crux for liveness).
7. **Task 7 — `create handoff`** — on user approval ONLY, commit EXACTLY the new/changed files
   (message `Implemented S27 handling`); then write the S27 **IMPLEMENTED** completion handoff via
   `/jot:handoff-prompt` (line 1 `MUST READ: plans/script-handling.txt`, title line 3
   `# Handoff: Scenario s27 (...) IMPLEMENTED …`) so the downstream S28 planning monitor fires.

## Key Files
- `plans/s27/s27-reconstruction-plan.md` — THE plan (verified ladders, exact fix code, §2.7 capture cmd,
  full test specs). Follow verbatim.
- `plans/script-handling.txt` — HAS-BEACON vs NO-BEACON premise (READ FIRST).
- `src/reconstruction_branches.ts` (`reconstructFileOver` pipeline), `src/reconstruction_sidecar.ts`
  (backup helpers), `src/reconstruction_replay.ts` (`userEditRevision` / `writeRevision`),
  `src/reconstruction_replay_edit.ts` (`splitLines`) — the fix touches/cites these.
- `tests/reconstruction_engine_s25.test.ts` / `tests/reconstruction_cli_s25.test.ts` — the reader-
  DEPENDENT pattern to mirror (hermetic backup map, poison reader, "without reader is wrong").
- `scenarios/executed/s27-script-rename-edited-before-run/` — JSONL + rendered ground truth; backups at
  `~/.claude/file-history/d1b02f2f-eda1-49f1-9cc7-075bf02104c2/` (`df7b79499e8a9377@v3` = complete).

## Context the Next Agent Won't Have
- **The fix is VERIFIED, not speculative.** Prototype results (then reverted): `test_inventory.py` →
  `[write, user-edit(51c639d6…, 50 lines), overwrite(df7b79499e8a9377@v3, 73 lines)]`, final 2215;
  `inventory.py` (8442) and `rename_inv.py` (1449) byte-perfect and reader-INDEPENDENT.
- **Trigger restriction is load-bearing:** `completeTruncatedBeacon` fires only when the file's LAST
  event is a `user-edit`. That excludes `inventory.py`/`rename_inv.py` (end on Edit) AND S25's
  `geo_report` (ends on the `totals` Edit) — so no prior scenario regresses.
- **Use a LINE-COUNT guard, not raw byte length.** `splitLines` drops one trailing newline; a backup
  that differs from a COMPLETE beacon only by a trailing newline must NOT count as truncated, or it
  would add an `overwrite` revision to complete-beacon files (e.g. S25 `test_geo_core`) and break their
  `[write, userEdit]` kind asserts. Guard = `backup.startsWith(beacon) && splitLines(backup).length >
  splitLines(beacon).length`. The `startsWith` half also makes a poison/garbage reader a no-op.
- **Select the file's LATEST backup (highest version), not a timestamp-relative one.** `@v3` lands ≈ the
  beacon time; "latest non-null in the timeline" robustly picks the complete post-script version and
  sidesteps the m6-style ms-timing fragility.
- **250-line cap is enforced by a Stop hook** (`jot:post_tool_use`), and `reconstruction_branches.ts` is
  already AT 250. You cannot add the wiring without first moving code out — hence the new
  `reconstruction_reseed.ts`. Let `tsc`'s unused-symbol errors drive the import cleanup in branches.ts.
- **Handoff/monitor convention:** `MUST READ:` is line 1, the `# Handoff:` title is line 3. Monitors
  must scan the TITLE line, not literal line 1 — the S26 impl monitor failed to auto-fire for exactly
  this reason; the same likely applies to the S27 impl monitor `bngc9pjwm`, so it may need a manual
  nudge or respawn.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
node --import tsx --test tests/reconstruction_engine_s27.test.ts   # 7 green (after Task 3)
node --import tsx --test tests/reconstruction_cli_s27.test.ts       # green (after Task 4)
npm test          # 371 + new ; 0 fail
npx tsc --noEmit  # No errors found
wc -l src/reconstruction_*.ts   # each ≤ 250
```
