# Handoff: S21 (`s21-multiple-user-edits`) reconstruction PLAN is complete and engine-verified — IMPLEMENT it. It is a CHARACTERIZATION/REGRESSION LOCK with NO production-code change (same shape as S16/S17/S18/S20): the current S19+S20 engine already reconstructs S21 byte-for-byte correctly (verified live this session). Implementing = 1 fixture line + 9 tests (4 engine + 5 CLI) + 3 doc edits, expected 242 → 251 green, `tsc` clean, `git diff src/` stays EMPTY. The plan contains exact changeIds, branch tip, revision ladder, and verbatim test code.
Conversation name: api-from-scenarios — S21 planning monitor (waited for the S20 IMPLEMENTED handoff, then planned S21)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/4601a2ef-bc14-4f80-89b2-2e0ad2531de0.jsonl
Plan file (AUTHORITATIVE, ready to execute): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s21/s21-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `4b25f21 implemented S19/20 handling`.

The working tree is CLEAN except for the untracked `plans/s21/` directory (this plan). S19 and S20
were committed together as `4b25f21` since the S20 implementation handoff was written — so unlike the
S13–S20 sessions there is NO co-mingled uncommitted scenario work to avoid. Still stage ONLY the S21
files when committing (per-scenario hygiene); never `git add -A`.

## Goal
Lock — with tests — that `reconstruction_cli` correctly reconstructs the file-change history of
`s21-multiple-user-edits`: a single LINEAR no-rewind branch where THREE out-of-band USER edits are
interleaved with TWO Claude edits. B writes `Counter`+`__init__`(3 lines); the user inserts
`increment` (D); Claude adds `decrement` anchored on D's line (E); the user inserts `reset` (F);
Claude adds `get_count` anchored on F's line (G); the user PREPENDS `# Counter class` (H). The
surviving `scenario21.py` ends at the real 8-line on-disk file. The engine already does this; S21
locks it and proves the S19 reseed stays dormant across many interleaved aligned edits.

## Current State
**PLAN COMPLETE, engine behavior VERIFIED CORRECT, no code change needed, nothing for S21 committed.**
This session:
- Waited (monitor-gated, `box9n9lbg`) for the S20 IMPLEMENTED handoff (`…-2146.md`) before analyzing,
  so S21 was diagnosed against the S19+S20-fixed engine (now committed at `4b25f21`).
- Ran S21 through `reconstruction_cli`: `--surviving --verbose` reconstructs `scenario21.py` to
  **8 lines, BYTE-IDENTICAL** to on-disk `scenarios/executed/s21-multiple-user-edits/scenario21.py`
  (`diff` clean). `--list-branches` shows one surviving branch (tip `#49e4f32d`), zero rewound.
  Default conversationDAG/fileDAG render the six turns correctly.
- Confirmed via four subagents (engine-path trace + raw-JSONL extraction + test-template + doc-format)
  that **no `src/` change is required**: S15's `userEditChangesContent` records all three user edits
  (D/F/H each change content); S19's `editBaseIsStale` is FALSE for the aligned edits E/G, so
  `seedStaleEditBases` never fires; branch enumeration yields exactly one surviving head.
- Baseline (per the S20 handoff): `npm test` = **242 pass / 0 fail**.
- Wrote the plan with the exact changeIds, tip, revision ladder, captured CLI output, and verbatim
  engine + CLI test code.

## What Remains
Execute `plans/s21/s21-reconstruction-plan.md` top to bottom, in order:
1. **Task 0** — confirm `npm test` = 242 green and the end-to-end probes match ground truth. (If ≠ 242, STOP.)
2. **Task 1a** — add `S21_JSONL` to `tests/fixtures.ts` after `S20_JSONL` (~line 63), canonical Desktop path.
3. **Task 1b** — create `tests/reconstruction_engine_s21.test.ts` with 4 tests (branch-only; no-rewound; 6-revision alternating-kinds + no-seed regression lock; three-user-edits extraction). NO BackupReader. `npm test` → 246 green.
4. **Task 2** — create `tests/reconstruction_cli_s21.test.ts` with 5 CLI byte/position-lock tests; re-run the CLI and paste exact whitespace; lock the verbose test by line POSITION. `npm test` → 251 green.
5. **Task 3** — docs: flip `plans/roadmap.md` line 22 `[ ] S21 -> [x] …`; PREPEND an S21 entry to `plans/implementation-notes-api-from-scenarios.md`; add one note to `plans/reconstruction-engine-design.md`.
6. **Task 4** — verify gates: `npm test` (251 green), `npx tsc --noEmit` clean, filesize sweep (≤250 lines), `git diff src/` EMPTY.
7. **create handoff** — with `/jot:handoff-prompt` (title contains `S21` + `IMPLEMENTED`; state 251 green, no engine change, nothing committed). Required so any downstream S22 planning monitor recognizes completion.
8. On user approval, commit as ONE scenario commit (`Implemented S21 handling`) staging EXACTLY the 7 S21 files listed in the plan's Commit section. No `src/` files.

## Key Files
- `plans/s21/s21-reconstruction-plan.md` — THE plan: ground-truth table (changeIds/tip/revision ladder/final text), captured CLI output, verbatim engine + CLI test code, doc edits, verify gates, commit list. Read it fully first.
- `tests/reconstruction_engine_s18.test.ts` — the no-reader engine-test template the S21 engine tests copy (imports + `finalTextOf`/`historyEndingWith` helpers).
- `tests/reconstruction_engine_s20.test.ts` — the source for the 3-arg `historyEndingWith(…, excludeTest)` helper and the `.kind` / revision-count assertion style.
- `tests/reconstruction_cli_s18.test.ts` / `tests/reconstruction_cli_s20.test.ts` — the CLI-test templates (`runCli` usage, line-position locking).
- `tests/fixtures.ts` — add `S21_JSONL` after `S20_JSONL` (~line 63); canonical Desktop path (confirmed to exist).
- `src/reconstruction_branches.ts` / `src/reconstruction_replay.ts` / `src/reconstruction_user_edit.ts` — READ ONLY orientation: `editBaseIsStale`/`seedStaleEditBases` (must stay inert), `userEditChangesContent` (records D/F/H), `userEditEventFrom` (content from the JSONL attachment). Do NOT edit.
- S21 JSONL (worktree, for live CLI runs): `scenarios/executed/s21-multiple-user-edits/7a7ce498-01f6-469d-ba3f-a8ba0ee748cb.jsonl` (the fixture uses the canonical Desktop path).

## Context the Next Agent Won't Have
- **S21 is a NO-OP characterization lock, NOT a fix.** Do not change `src/`. If a test fails, the test (changeId / whitespace / line number / revision count / enum member) is wrong — fix the test to match live CLI/engine output.
- **The S21 vs S18 hinge:** S18 had ONE user edit on a linear no-rewind branch; S21 has THREE, interleaved with two Claude edits. S21 is the FIRST scenario with three `user-edit` changes coexisting on one surviving lineage, the FIRST where each Claude edit is anchored on content a USER edit produced (E's `old_string` is D's `increment` line; G's is F's `reset` line), and the FIRST with a PREPENDING user edit (H pushes `def get_count` from line 7 to line 8).
- **No BackupReader for the S21 engine tests.** User-edit content is self-contained in the JSONL `edited_text_file` attachment (`userEditEventFrom` reads the `snippet`), so the engine tests call `reconstructAll(loadRecords(S21_JSONL))` / `reconstructBranches(loadRecords(S21_JSONL))` with NO reader arg — the S18 pattern, NOT S20 (S20 supplied an in-memory reader only to keep the dormant reseed path callable; S21 doesn't need to).
- **changeId provenance differs by kind:** the user-edit changeId IS the attachment record's uuid (D=`a4588e3c`, F=`ce4ae4a5`, H=`6fe6b088`); the write/edit changeId is the `toolu_`-stripped tool_use id (B=`01MAX6e1`, C=`012CK8yY`, E=`012pCfid`, G=`015ayHM2`). The surviving conversation tip is `#49e4f32d` (the post-edit Read/Thanks tail, not H).
- **Claude edits here use `old_string`/`new_string`, not an inline `structuredPatch`.** The hunk the engine consumes comes from the tool-RESULT `structuredPatch` record. This is already handled — do NOT assert hunks in the tests; assert revisions/kinds/final-text/CLI bytes instead.
- **CLI column whitespace is load-bearing and fragile.** The plan's CLI strings were captured live this session, but re-run `reconstruction_cli` during implementation and paste exact lines; lock the `--verbose` test by line POSITION (the render is line-numbered, so raw multi-line substrings never match).
- **There is no `--rewound` flag** and no rewound branch to inspect — S21 is linear (no `isRewind`/`isSidechain` records).
- **Baseline is 242, not 233.** S19+S20 are committed (`4b25f21`); a stale memory of "233 green" pre-dates S20. Target after S21 = 251.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 242 pass / 0 fail BEFORE you start; 251 pass / 0 fail when done
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
git diff src/            # MUST be empty — S21 touches no source
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s21-multiple-user-edits/7a7ce498-01f6-469d-ba3f-a8ba0ee748cb.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null      # surviving tip #49e4f32d only, no rewound
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null # scenario21.py: 6 revisions, final 8 lines, `# Counter class` on line 1
# Byte-identical to on-disk ground truth:
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null \
  | sed -n '/revision 5/,/^### /p' | grep -E "^ +[0-9]+ \| " | sed -E 's/^ +[0-9]+ \| //') \
  scenarios/executed/s21-multiple-user-edits/scenario21.py && echo BYTE-IDENTICAL
```
