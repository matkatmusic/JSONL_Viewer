MUST READ: plans/script-handling.txt

# Handoff: Scenario s27 (`s27-script-rename-edited-before-run`) IMPLEMENTED — a REAL ENGINE FIX (first in the script-rename series): the TERMINAL TRUNCATED BEACON completion. Suite 371 → 384 green (7 engine + 6 CLI). NOTHING committed (awaiting explicit user approval). Next: s28.
Conversation name: api-from-scenarios — S27 impl (/impl-scenario 27)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/c640dd17-a9c5-4fe2-bf93-8ef7b736debc.jsonl

## Branch
`api-from-scenarios` based on `master`. HEAD = `ac598ad s26 handling implemented` (S1–S26 + m1–m7
committed). The S27 work is UNCOMMITTED in the working tree (commit gated on explicit user approval).

## What S27 was
A single `python3 rename_inv.py` Bash run rewrote `inventory.py` + `tests/test_inventory.py` (three
whole-word renames: `qty_chk→check_quantity`, `add_item→insert_item`, `rm_item→remove_item`). The rename
script was WRITTEN then EDITED TWICE before the run; `inventory.py` got a `restock` Edit after. The new
failure mode: `tests/test_inventory.py`'s post-script `edited_text_file` beacon is TRUNCATED (a 50-line
prefix of the true 73-line file) AND it is the file's LAST event (no downstream Edit to reseed against —
the S25 `geo_report` rescue path never engages), so the engine adopted the truncated snippet verbatim
and the file was short by 23 lines / 621 bytes (1594 vs 2215).

## Current State — DONE, GREEN, byte-perfect, NOT committed
- Full suite **384 pass / 0 fail** (`npm test`); `npx tsc --noEmit` clean; every `src/` file ≤ 250 lines
  (new `reconstruction_reseed.ts` = 120; `reconstruction_branches.ts` 250 → 181; `reconstruction_sidecar.ts`
  198 → 230).
- `tests/test_inventory.py` reconstructs byte-for-byte (2215, `[write,userEdit,overwrite]`) WITH a reader;
  `inventory.py` (8442) and `rename_inv.py` (1449) byte-perfect and reader-INDEPENDENT.
- Mutation probe PASSED: neutralizing `beaconIsTruncated` turned EXACTLY the two crux tests RED
  (`test_S27_test_inventory_terminal_beacon_backup_overwrite` + `..._verbose_test_inventory_..._overwrite_completes_file`),
  then restored to green — proving the crux tests are coupled to the fix.

## The fix (cite §3 of the plan)
Reader-only event-list transform, wired as a new stage in `reconstructFileOver` after `seedStaleEditBases`
(behind the existing `reader ?` guard):
- `src/reconstruction_sidecar.ts` — NEW `latestBackupWriteFor(records, target, reader)`: a synthetic Write
  from the file's LATEST non-null file-history backup (highest version → `df7b79499e8a9377@v3`). changeId =
  blob name (out of the graphs, spec 40).
- `src/reconstruction_reseed.ts` — NEW module (120 lines). The stale-edit cluster
  (`reconstructedBaseText`/`editBaseIsStale`/`staleEditSeedFor`/`seedStaleEditBases`) was MOVED here
  VERBATIM out of `reconstruction_branches.ts` (which was AT the 250 cap — split, never condense), plus the
  two new functions `beaconIsTruncated` and `completeTruncatedBeacon`.
- `src/reconstruction_branches.ts` — moved cluster removed; now-unused imports dropped; imports
  `seedStaleEditBases`/`completeTruncatedBeacon` from the new module; one stage added:
  `const completed = reader ? completeTruncatedBeacon(records, restaged, reader) : restaged;`.

Trigger is doubly scoped so NO prior scenario regresses: (1) fires ONLY when a file's LAST event is a
`user-edit`; (2) truncation is a LINE-COUNT test (`backup.startsWith(beacon) && splitLines(backup).length >
splitLines(beacon).length`) so a backup differing only by a trailing newline is NOT "truncated". The
`startsWith` half also makes a poison backup a no-op.

## What Remains (in order)
1. **Commit — USER APPROVAL ONLY.** `git status` first, then stage EXACTLY these and nothing else
   (NEVER `git add -A`; do NOT stage `src/Plan_template.md`, `src/Impl_template.md`, `monitor-handoff.sh`,
   or `plans/monitor-handoff-spec.md` — pre-existing untracked helpers):
   - `src/reconstruction_reseed.ts` (new)
   - `src/reconstruction_branches.ts`, `src/reconstruction_sidecar.ts`
   - `tests/fixtures.ts`, `tests/reconstruction_engine_s27.test.ts` (new), `tests/reconstruction_cli_s27.test.ts` (new)
   - `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`
   - `plans/s27/` (the plan + this handoff)
   Commit message: `Implemented S27 handling` (+ standard Co-Authored-By / Claude-Session trailers).
2. **S28** is the next scenario per `plans/roadmap.md` (which lists scenarios through s42). `s28-*` is NOT
   yet defined on disk (`scenarios/` currently stops at s27) — planning is gated on that file appearing.

## Key Files
- Plan (authoritative, verified-live): `plans/s27/s27-reconstruction-plan.md`
- Incoming planning handoff: `plans/s27/handoff-api-from-scenarios-20260624-1540.md`
- Premise: `plans/script-handling.txt` (HAS-BEACON vs NO-BEACON; S27 extends it to the TERMINAL truncated beacon)
- Impl notes (prepended S27 entry, design decisions + deviations): `plans/implementation-notes-api-from-scenarios.md`
- Fix: `src/reconstruction_reseed.ts`, `src/reconstruction_sidecar.ts`, `src/reconstruction_branches.ts`
- Tests: `tests/reconstruction_engine_s27.test.ts` (7), `tests/reconstruction_cli_s27.test.ts` (6)
- Executed ground truth + backup: `scenarios/executed/s27-script-rename-edited-before-run/` (and its
  canonical twin under `…/Desktop/claude code src/RevEng/plans/scenarios/executed/…`); backup
  `~/.claude/file-history/d1b02f2f-eda1-49f1-9cc7-075bf02104c2/df7b79499e8a9377@v3` (2216 B = complete).

## Context the Next Agent Won't Have
- **DEVIATION (documented in impl-notes):** the S27 engine test sources its ground-truth literals from
  disk (`readFileSync` of the rendered executed files) instead of inlining ~15 KB of escaped strings
  (S25's pattern). This removes hand-transcription risk; the byte-locks are preserved by exact length
  asserts (8442 / 1449 / 2215) + independent-source `=== *_FINAL` equality. The hermetic backup READER
  stays off the real file-history tree: the @v3 backup is byte-identical to the rendered test file
  (2216 = 2215 + trailing newline), so the reader derives it from disk for the one blob and returns "" otherwise.
- **A Stop-hook WARNING** "no test file for reconstruction_reseed.ts" is expected and benign — the moved
  functions keep their coverage via the S19/S23/m5/m6/m7 + S27 scenario tests (as they did inside branches.ts).
- **The 250-line cap is hook-enforced.** You could not add the `completeTruncatedBeacon` wiring without
  first moving code out of `reconstruction_branches.ts` — hence the new module. `tsc`'s noUnusedLocals
  drove the import cleanup (`lastLinesOf`, `backupSeedWriteFor`, `EditEvent`, `WriteEvent` removed from branches.ts).
- **Monitor/handoff convention (load-bearing):** `MUST READ:` is line 1, the `# Handoff:` title is line 3,
  the FIRST `[sm][0-9]+` token in the title is the subject scenario, and whole-word `IMPLEMENTED` marks the
  completion stage. The S28 planning monitor scans the TITLE line of `plans/s28|s27/handoff-*.md` — match
  the next scenario only in a handoff TITLE, never the body (the S22/S26 false-fire lesson).

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
node --import tsx --test tests/reconstruction_engine_s27.test.ts   # 7 green
node --import tsx --test tests/reconstruction_cli_s27.test.ts       # 6 green
npm test          # 384 pass / 0 fail
npx tsc --noEmit  # No errors found
wc -l src/reconstruction_*.ts   # each ≤ 250
```
