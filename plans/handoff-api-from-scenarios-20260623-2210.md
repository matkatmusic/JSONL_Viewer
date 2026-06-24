# Handoff: S21 (`s21-multiple-user-edits`) is IMPLEMENTED and fully verified — a CHARACTERIZATION/REGRESSION LOCK with NO production-code change (same shape as S16/S17/S18/S20). The surviving `scenario21.py` reconstructs byte-for-byte to the 8-line on-disk ground truth across THREE interleaved user edits + two Claude edits on a single linear no-rewind branch; the S19 `seedStaleEditBases` reseed is proven INERT for every aligned edit. 251 tests green (was 242), `npx tsc --noEmit` clean, no file > 250 lines. Added an `S21_JSONL` fixture + 9 tests (4 engine + 5 CLI) + docs. NO `src/` change. NOTHING is committed (project rule: commit only on user approval, one commit per scenario → message `Implemented S21 handling`).
Conversation name: api-from-scenarios — S21 impl monitor → implement S21 (multiple-user-edits)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/caa8005d-217f-4064-9949-e313b604bc33.jsonl
Plan file (AUTHORITATIVE, executed): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s21/s21-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `5b441e5 updated plan impl template` (S19+S20 already committed at `4b25f21 implemented S19/20 handling`).

## Goal
Lock — with tests — that `reconstruction_cli` correctly reconstructs the file-change history of `s21-multiple-user-edits`, the **multi-user-edit extension of S18**. B writes `Counter`+`__init__`+`self.count = 0`; the user inserts `increment` out-of-band (D); Claude adds `decrement` anchored on D's line (E); the user inserts `reset` (F); Claude adds `get_count` anchored on F's line (G); the user PREPENDS `# Counter class` (H). All on ONE linear surviving branch, NO rewind. The surviving reconstruction must end at the real 8-line on-disk file. The engine already does this; S21 locks it and proves the S19 reseed stays dormant across many interleaved aligned edits.

## Current State
**IMPLEMENTED, verified, nothing committed.** This session:
- Waited (monitor-gated) for the genuine S21 plan (`plans/s21/s21-reconstruction-plan.md`) + handoff (`plans/handoff-...-2200.md`) to land before implementing.
- Confirmed Task-0 baseline: `npm test` = 242 green, `tsc` clean, and the end-to-end probes match ground truth (surviving tip `#49e4f32d`; `scenario21.py` = 6 revisions ending at 8 lines; `--surviving --verbose` byte-identical to on-disk `scenarios/executed/s21-multiple-user-edits/scenario21.py`).
- Added `S21_JSONL` to `tests/fixtures.ts`; created `tests/reconstruction_engine_s21.test.ts` (4 tests) → 246 green; created `tests/reconstruction_cli_s21.test.ts` (5 tests, whitespace re-captured live) → **251 green**.
- Updated docs: `plans/roadmap.md` line 22 flipped to `[x] S21`; prepended the S21 entry to `plans/implementation-notes-api-from-scenarios.md`; added the S21 design note to `plans/reconstruction-engine-design.md`.
- Verify gates all pass: `npm test` = **251 pass / 0 fail**, `npx tsc --noEmit` clean, filesize sweep clean, `git diff src/` EMPTY (no `.ts` source changed).

## What Remains
1. **Commit (ONLY on user approval)** — one scenario commit, message `Implemented S21 handling`, staging EXACTLY these 7 files (never `git add -A`):
   `tests/fixtures.ts`, `tests/reconstruction_engine_s21.test.ts`, `tests/reconstruction_cli_s21.test.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/s21/s21-reconstruction-plan.md`. No `src/` files.
2. **S22** is the next scenario (`scenarios/s22-*.txt`). A downstream S22 planning monitor keying on this S21-IMPLEMENTED handoff can proceed once it lands.

## Key Files
- `plans/s21/s21-reconstruction-plan.md` — THE plan executed (ground-truth table: changeIds, branch tip, revision ladder, verbatim test code). Read first.
- `tests/reconstruction_engine_s21.test.ts` — 4 engine tests (branch enumeration; no rewound branch; 6-revision alternating-kind + no-seed regression lock; 3-user-edits-among-2-edits-2-writes extraction).
- `tests/reconstruction_cli_s21.test.ts` — 5 CLI byte/position-lock tests (conversationDAG linear; fileDAG all six turns; list-branches surviving-only; surviving keeps all methods + prepend; verbose 6 revisions, `get_count` at line 8).
- `tests/fixtures.ts` — `S21_JSONL` added after `S20_JSONL` (canonical Desktop path).
- `src/reconstruction_replay.ts` / `src/reconstruction_branches.ts` — READ-ONLY orientation: `userEditChangesContent` (S15 guard records D/F/H) and `seedStaleEditBases`/`editBaseIsStale` (S19 reseed, stays INERT here). Do NOT edit.
- S21 JSONL (worktree): `scenarios/executed/s21-multiple-user-edits/7a7ce498-01f6-469d-ba3f-a8ba0ee748cb.jsonl` (the fixture uses the canonical Desktop path).

## Context the Next Agent Won't Have
- **S21 is a NO-OP characterization lock, NOT a fix.** Do not change `src/`. If a test fails, the test literal (changeId / line number / whitespace / revision count / enum member) is wrong, not the engine — fix the test to match live CLI/engine output.
- **No BackupReader for S21.** User-edit content is self-contained in the JSONL `edited_text_file` attachment, so the engine tests call `reconstructBranches(loadRecords(S21_JSONL))` with NO reader arg (like S18, NOT like S20 which supplied an in-memory reader).
- **Deviation from the plan's verbatim code:** dropped the unused `reconstructAll` import from the engine test. The plan copied the import block from the S18 template, which DOES call `reconstructAll`; the S21 tests use only `reconstructBranches`. Removed to avoid dead code; tsc stays clean regardless (`strict` is on but `noUnusedLocals` is not).
- **The three user-edit changeIds are attachment uuids** (D `#a4588e3c`, F `#ce4ae4a5`, H `#6fe6b088`), not tool_use ids — the user-edit changeId IS the `edited_text_file` record's uuid. Write/edit changeIds are `toolu_`-stripped tool_use ids.
- **The prepend (H) is load-bearing:** it shifts every line below it down by one, so `def get_count` renders on line 8 (not 7). The verbose position-lock test asserts exactly that.
- **CLI `--verbose` output is line-numbered** — lock by line POSITION (`8 |     def get_count…`), never by multi-line substrings. All asserted strings were re-captured live this session and matched the plan verbatim.
- **`src/Plan_Impl_template.md` was committed mid-session** (now in HEAD `5b441e5`), so `git diff src/` is clean; earlier in the session it showed as a pre-existing unrelated modification — it is NOT S21 work.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 251 pass / 0 fail
npx tsc --noEmit         # No errors found
git diff src/            # MUST be empty — S21 touches no source
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s21-multiple-user-edits/7a7ce498-01f6-469d-ba3f-a8ba0ee748cb.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null        # surviving tip #49e4f32d only
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null  # 6 revisions, final 8 lines, get_count on line 8
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null \
  | sed -n '/revision 5/,/^### /p' | grep -E "^ +[0-9]+ \| " | sed -E 's/^ +[0-9]+ \| //') \
  scenarios/executed/s21-multiple-user-edits/scenario21.py && echo BYTE-IDENTICAL
```
