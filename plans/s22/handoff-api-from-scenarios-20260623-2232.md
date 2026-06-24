# Handoff: S22 (`s22-user-edits-conv-rewind`) is IMPLEMENTED and fully verified — a CHARACTERIZATION/REGRESSION LOCK with NO production-code change (same shape as S16/S17/S18/S20/S21). The current S19+S20+S21 engine already reconstructs S22 byte-for-byte correctly: the surviving `scenario22.py` ends at the real 7-line on-disk file and the rewound branch reconstructs separately to the 5-line init+push+pop. Added an `S22_JSONL` fixture + 9 tests (4 engine + 5 CLI) + 3 doc edits. 260 tests green (was 251), `npx tsc --noEmit` clean, `git diff src/` EMPTY, no file > 250 lines. NO `src/` change. NOTHING is committed (project rule: commit only on user approval, one commit per scenario → message `Implemented S22 handling`).
Conversation name: api-from-scenarios — S22 impl monitor → implement S22 (user-edits-conv-rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/8e7ceadb-0426-4adb-83e3-d50d13f3b81c.jsonl
Plan file (AUTHORITATIVE, executed): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s22/s22-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `2c4909e implemented S21 handling` (S19+S20 at `4b25f21`, S21 at `2c4909e`). All prior scenarios are committed, so the working tree holds ONLY S22 work.

## Goal
Lock — with tests — that `reconstruction_cli` correctly reconstructs the file-change history of `s22-user-edits-conv-rewind`, the **two-user-edit conversation-rewind** scenario (the structural meeting point of S18/S21 linear user edits and S19 conv-rewind). B writes `Stack`+`__init__`+`self.items = []`; on the ABANDONED branch the user inserts `push` (D) and Claude adds `pop` (E); a conversation-only `Rewind: 2` reverts the chat to the root prompt but LEAVES push+pop on disk; on the SURVIVING branch the user inserts `peek` (F) and Claude adds `is_empty` (G). The surviving user-edit F's `edited_text_file` snapshot ABSORBS the off-branch push+pop, so the surviving reconstruction is three revisions (write→userEdit→edit) ending at the real 7-line file; the rewound branch reconstructs separately to 5 lines. S22 proves the S19 `seedStaleEditBases` reseed stays DORMANT when a user-edit (not a Claude edit) leads the surviving post-rewind branch.

## Current State
**IMPLEMENTED, verified, nothing committed.** This session:
- Waited (monitor-gated) for the genuine S22 plan (`plans/s22/s22-reconstruction-plan.md`) AND, per user instruction, the S22 IMPLEMENT handoff (`plans/handoff-...-2225.md`) to land before implementing. (One earlier monitor false-fired on the S21 IMPLEMENTED handoff `...-2210.md`, which only names S22 in its body; re-armed with a title-scoped predicate.)
- Confirmed Task-0 baseline: `npm test` = 251 green, `tsc` clean; end-to-end probes match ground truth (branches `#adb42316` surviving + `#549149a1` rewound @ `#f3ad1ed6`; `--surviving --verbose` = 3 revisions 3→6→7 lines, byte-identical to on-disk `scenario22.py`).
- Added `S22_JSONL` to `tests/fixtures.ts` (after `S21_JSONL`); created `tests/reconstruction_engine_s22.test.ts` (4 tests) → 255 green; re-captured CLI whitespace live, then created `tests/reconstruction_cli_s22.test.ts` (5 tests) → **260 green**.
- Updated docs: `plans/roadmap.md` line 23 flipped to `[x] S22`; prepended the S22 entry to `plans/implementation-notes-api-from-scenarios.md`; added the S22 design note to `plans/reconstruction-engine-design.md` AFTER the S21 note.
- Verify gates all pass: `npm test` = **260 pass / 0 fail**, `npx tsc --noEmit` clean, filesize sweep clean, `git diff src/` EMPTY (no `.ts` source changed).

## What Remains
1. **Commit (ONLY on user approval)** — one scenario commit, message `Implemented S22 handling`, staging EXACTLY these 7 files (never `git add -A`):
   `tests/fixtures.ts`, `tests/reconstruction_engine_s22.test.ts`, `tests/reconstruction_cli_s22.test.ts`, `plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`, `plans/reconstruction-engine-design.md`, `plans/s22/s22-reconstruction-plan.md`. No `src/` files.
2. **S23** is the next scenario (`scenarios/s23-*.txt`, user-edits + CODE rewind). A downstream S23 planning monitor keying on this S22-IMPLEMENTED handoff can proceed once it lands.

## Key Files
- `plans/s22/s22-reconstruction-plan.md` — THE plan executed (ground-truth table: changeIds, both branch tips, both revision ladders, verbatim test code). Read first.
- `tests/reconstruction_engine_s22.test.ts` — 4 engine tests (branch fork at rewind point; surviving 3-revision absorption with no seed; rewound branch → 5-line init+push+pop; two-user-edit extraction among 2 edits + 2 writes).
- `tests/reconstruction_cli_s22.test.ts` — 5 CLI byte/position-lock tests (conversationDAG fork; fileDAG both branches; list-branches both; surviving keeps all four methods; verbose 3 revisions, push@4 / is_empty@7).
- `tests/fixtures.ts` — `S22_JSONL` added after `S21_JSONL` (canonical Desktop path).
- `src/reconstruction_branches.ts` / `src/reconstruction_replay.ts` — READ-ONLY orientation: `seedStaleEditBases`/`staleEditSeedFor`/`editBaseIsStale` (S19 reseed, INERT here) and `userEditChangesContent` (S15 guard, records D and F). Do NOT edit.
- S22 JSONL (worktree): `scenarios/executed/s22-user-edits-conv-rewind/64ab0dde-e737-4ba6-9d31-64ead32f6ff4.jsonl` (the fixture uses the canonical Desktop path).

## Context the Next Agent Won't Have
- **S22 is a NO-OP characterization lock, NOT a fix.** Do not change `src/`. If a test fails, the test literal (changeId / line number / whitespace / revision count / enum member) is wrong, not the engine — fix the test to match live CLI/engine output.
- **No BackupReader for S22 engine tests** (unlike S20). The off-branch `push`/`pop` that survived the conv-only rewind are already inside the surviving user-edit F's `edited_text_file` snapshot, so the content is self-contained in the JSONL. VERIFIED: the no-reader reconstruction is byte-identical — which is also the proof that the reseed is inert. Engine tests call `reconstructBranches(loadRecords(S22_JSONL))` with NO reader arg (like S18/S21).
- **Why the reseed is inert here vs ACTIVE in S19:** `staleEditSeedFor` only fires for `EventKind.edit` (Claude edits), never for `user-edit`. On the surviving branch F (a user-edit) runs first and re-establishes the full 6-line disk content via its snapshot, so the lone surviving Claude edit G (`is_empty`) has an aligned base (`editBaseIsStale(G)` is false). S19 differs because a Claude edit follows its rewind. Engine test 2 (3 revisions, rev1=6 lines, no 4th seed revision) locks the dormant case.
- **The two user-edits have DIFFERENT line deltas despite the same kind:** D adds 1 line (`push`) on the abandoned branch (disk then = init+push); F adds 3 lines (push+pop+peek) on the surviving branch (disk then = init+push+pop). Driven by per-branch disk state the engine threads.
- **The rewindPoint sits on the REWOUND branch, not the surviving one:** `findConversationBranches` returns surviving `{tip adb42316, rewindPoint undefined}` and rewound `{tip 549149a1, rewindPoint f3ad1ed6}`.
- **CLI `--verbose` is line-numbered** — lock by line POSITION (`4 |     def push…`, `7 |     def is_empty…`), never by multi-line substrings. There is no `--rewound` flag; inspect the rewound branch with `--branch 549149a1 --verbose` (BARE 8-char hex, no leading `#`).
- **changeId rendering:** user-edit changeId = the `edited_text_file` attachment uuid (D=`eea066db`, F=`5df7ac59`); write/edit changeId = the `toolu_`-stripped tool_use id (first 8 chars). Don't assert Claude-edit hunks directly — derived from the tool-result `structuredPatch`.
- **Plan's subagent caution (carried forward):** during S22 PLANNING one investigative subagent over-claimed the reseed FIRES for F and a reader is REQUIRED — both wrong, corrected by the direct no-reader probe. Trust the empirical probe.
- **Implementation deviations from the plan:** none. CLI whitespace re-captured live matched the plan's verbatim strings exactly.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 260 pass / 0 fail
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
