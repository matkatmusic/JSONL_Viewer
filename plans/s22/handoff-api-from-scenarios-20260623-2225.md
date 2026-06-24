# Handoff: S22 (`s22-user-edits-conv-rewind`) reconstruction PLAN is complete and engine-verified — IMPLEMENT it. It is a CHARACTERIZATION/REGRESSION LOCK with NO production-code change (same shape as S16/S17/S18/S20/S21): the current S19+S20+S21 engine already reconstructs S22 byte-for-byte correctly, verified live this session BOTH with the CLI's auto-built reader AND with NO reader. Implementing = 1 fixture line + 9 tests (4 engine + 5 CLI) + 3 doc edits, expected 251 → 260 green, `tsc` clean, `git diff src/` stays EMPTY. The plan contains exact changeIds, both branch tips, both revision ladders, and verbatim test code.
Conversation name: api-from-scenarios — S22 planning monitor (waited for the S21 IMPLEMENTED handoff, then planned S22)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/e8241f8f-5b71-4d14-b640-a1b3b3b896e4.jsonl
Plan file (AUTHORITATIVE, ready to execute): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s22/s22-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `2c4909e implemented S21 handling`.

The working tree is CLEAN except for the untracked `plans/s22/` directory (this plan). S19, S20,
and S21 are all committed (`4b25f21` = S19/20, `2c4909e` = S21), so there is NO co-mingled
uncommitted scenario work. Still stage ONLY the S22 files when committing (per-scenario hygiene);
never `git add -A`.

## Goal
Lock — with tests — that `reconstruction_cli` correctly reconstructs the file-change history of
`s22-user-edits-conv-rewind`, the **two-user-edit conversation-rewind** scenario (the structural
meeting point of S18/S21 linear user edits and S19 conv-rewind). B writes `Stack`+`__init__`+
`self.items = []`; on the ABANDONED branch the user inserts `push` (D) and Claude adds `pop` (E);
a conversation-only `Rewind: 2` reverts the chat to the root prompt but LEAVES push+pop on disk;
on the SURVIVING branch the user inserts `peek` (F) and Claude adds `is_empty` (G). The surviving
reconstruction must end at the real 7-line on-disk file (the surviving user-edit F's snapshot
ABSORBS the off-branch push+pop), and the rewound branch must reconstruct separately to the 5-line
init+push+pop. The engine already does this; S22 locks it and proves the S19 reseed stays dormant
when a user-edit (not a Claude edit) leads the surviving post-rewind branch.

## Current State
**PLAN COMPLETE, engine-verified, NOTHING implemented yet.** This session (S22 PLANNING only):
- Monitor-gated: waited for the S21 IMPLEMENTED handoff (`plans/handoff-...-2210.md`) to land before planning.
- Ran S22 through `reconstruction_cli` (no crash) and confirmed the surviving final revision is BYTE-IDENTICAL to `scenarios/executed/s22-user-edits-conv-rewind/scenario22.py` (7 lines).
- Subagent + direct-probe analysis: confirmed the engine needs NO `src/` change. Empirically verified `reconstructBranches(loadRecords(S22_JSONL))` with **NO reader** yields the byte-identical 7-line surviving file → the S19 `seedStaleEditBases` reseed is provably INERT for S22.
- Captured all ground truth live: 2 branches (surviving tip `#adb42316` / rewound tip `#549149a1`, rewindPoint `#f3ad1ed6`), all changeIds, both revision ladders, exact CLI tree/list-branches/verbose output.
- Wrote the plan: `plans/s22/s22-reconstruction-plan.md`.
- `npm test` baseline is **251 green** (S21 committed at HEAD). No tests added yet by this session.

## What Remains
Execute the plan `plans/s22/s22-reconstruction-plan.md` in order:
1. **Task 0** — confirm `npm test` = 251 green, `tsc` clean, and the end-to-end probes match ground truth (surviving `#adb42316` + rewound `#549149a1`; `--surviving --verbose` = 3 revisions ending at 7 lines, byte-identical).
2. **Task 1a** — add `S22_JSONL` to `tests/fixtures.ts` after `S21_JSONL` (line 65; Desktop canonical path).
3. **Task 1b** — create `tests/reconstruction_engine_s22.test.ts` (4 tests, reader-free); `npm test` → 255 green.
4. **Task 2** — create `tests/reconstruction_cli_s22.test.ts` (5 tests); re-capture CLI whitespace live; `npm test` → 260 green.
5. **Task 3** — docs: flip `plans/roadmap.md` line 23 `[ ] S22 ->` to `[x]` (full entry in the plan); prepend the S22 entry to `plans/implementation-notes-api-from-scenarios.md`; add the S22 design note to `plans/reconstruction-engine-design.md` AFTER the S21 note (~line 194-199).
6. **Task 4** — verify gates: 260 green, `tsc` clean, filesize sweep, `git diff src/` EMPTY.
7. **create handoff** — `/jot:handoff-prompt`, title MUST contain `S22` + `IMPLEMENTED`, state 260 green / no engine change / nothing committed (so a downstream S23 planning monitor recognizes completion).
8. **Commit ONLY on user approval** — one commit `Implemented S22 handling`, staging EXACTLY the 7 S22 files (the 3 test/fixture files + 3 doc files + `plans/s22/s22-reconstruction-plan.md`); never `git add -A`, no `src/` files.

## Key Files
- `plans/s22/s22-reconstruction-plan.md` — THE plan to execute. Read FIRST. Contains the ground-truth table (changeIds, both branch tips, both revision ladders), verbatim test code for both test files, and exact doc-edit text.
- `tests/fixtures.ts` — add `S22_JSONL` after `S21_JSONL` (line 65); canonical Desktop path.
- `tests/reconstruction_engine_s21.test.ts` / `tests/reconstruction_cli_s21.test.ts` — the no-reader templates the S22 tests mirror.
- `scenarios/s22-user-edits-conv-rewind.txt` — the scenario script (the Rewind:2 step).
- S22 JSONL (worktree): `scenarios/executed/s22-user-edits-conv-rewind/64ab0dde-e737-4ba6-9d31-64ead32f6ff4.jsonl` (the fixture uses the canonical Desktop mirror of the same file).
- `src/reconstruction_branches.ts` / `src/reconstruction_replay.ts` — READ-ONLY orientation: `seedStaleEditBases`/`staleEditSeedFor`/`editBaseIsStale` (S19 reseed, INERT here) and `userEditChangesContent` (S15 guard, records D and F). Do NOT edit.

## Context the Next Agent Won't Have
- **S22 is a NO-OP characterization lock, NOT a fix.** Do not change `src/`. If a test fails, the test literal (changeId / line number / whitespace / revision count / enum member) is wrong, not the engine — fix the test to match live CLI/engine output.
- **No BackupReader for S22 engine tests** (unlike S20). The off-branch `push`/`pop` that survived the conv-only rewind are already inside the surviving user-edit F's `edited_text_file` snapshot, so the content is self-contained in the JSONL. This was VERIFIED this session: the no-reader reconstruction is byte-identical, which is also the proof that the reseed is inert. Engine tests call `reconstructBranches(loadRecords(S22_JSONL))` with NO reader arg (like S18/S21).
- **Why the reseed is inert here vs ACTIVE in S19:** `staleEditSeedFor` only fires for `EventKind.edit` (Claude edits), never for `user-edit`. On the surviving branch the user-edit F runs first and re-establishes the full 6-line disk content via its snapshot, so the lone surviving Claude edit G (`is_empty`) has an aligned base (`editBaseIsStale(G)` is false). S19 differs because a Claude edit, not a user-edit, follows its rewind — so its base is stale and the reseed must fire. S22 is the complement that locks the dormant case.
- **The two user-edits have DIFFERENT line deltas despite being the same kind:** D adds 1 line (`push`) on the abandoned branch (disk then = init+push), F adds 3 lines (push+pop+peek) on the surviving branch (disk then = init+push+pop). This is driven by per-branch disk state the engine threads, and is the headline behavior to lock (engine test 2 asserts rev1 = 6 lines; the rewound test asserts the 5-line result).
- **The rewindPoint sits on the REWOUND branch, not the surviving one.** `findConversationBranches` returns surviving `{tip adb42316, rewindPoint undefined}` and rewound `{tip 549149a1, rewindPoint f3ad1ed6}`. Engine test 1 asserts exactly this.
- **CLI `--branch` takes the BARE 8-char hex** (`549149a1`), NOT with a leading `#` (the `#`-prefixed form returns nothing). The 5 CLI tests don't use `--branch`, but Task 0's manual rewound-branch probe does.
- **CLI `--verbose` output is line-numbered** — lock by line POSITION (`7 |     def is_empty…`, `4 |     def push…`), never by multi-line substrings. There is no `--rewound` flag; `--verbose` with no recognized selector defaults to the surviving branch (use `--branch <hex>` for the rewound branch).
- **The changeId rendering rule:** user-edit changeId = the `edited_text_file` attachment record's uuid (D=`eea066db`, F=`5df7ac59`); write/edit changeId = the `toolu_`-stripped tool_use id (first 8 chars). Do not assert Claude-edit hunks directly — they are derived from the tool-result `structuredPatch`.
- **Subagent caution:** during planning, one investigative subagent over-claimed that the reseed FIRES for F and that a reader is REQUIRED. Both are wrong — corrected by direct probe (no-reader reconstruction byte-identical). Trust the empirical probe in the plan, not that claim.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # baseline 251 pass / 0 fail BEFORE work; 260 pass / 0 fail AFTER
npx tsc --noEmit         # No errors found
git diff src/            # MUST be empty — S22 touches no source
# End-to-end (debugger banner stripped with 2>/dev/null):
P="scenarios/executed/s22-user-edits-conv-rewind/64ab0dde-e737-4ba6-9d31-64ead32f6ff4.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null          # surviving #adb42316 + rewound #549149a1 (rewind @ #f3ad1ed6)
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null    # 3 revisions, rev1 = 6 lines, final 7 lines, is_empty on line 7
diff <(npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null \
  | sed -n '/revision 2/,/^### /p' | grep -E "^ +[0-9]+ \| " | sed -E 's/^ +[0-9]+ \| //') \
  scenarios/executed/s22-user-edits-conv-rewind/scenario22.py && echo BYTE-IDENTICAL
```
