# Handoff: S14 (`s14-multi-edit-conv-only-read`) reconstruction PLAN is complete and prototype-verified — implement it. The plan makes `reconstruction_cli` route the conversation-only-rewind case onto the same (already-correct) code path as S13, via two surgical fixes. NOTHING of S14 is implemented yet; the prototype that proved the fix was reverted.
Conversation name: api-from-scenarios — S14 handoff monitor → plan S14 (multi-edit-conv-only-read)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/2d2bf512-3d32-43f2-bdf0-bbf685028cd5.jsonl
Plan file (AUTHORITATIVE): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s14/s14-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `a9af46d S12/S13 implemented` (S12 and S13 were committed together as one commit since this planning session began). The only uncommitted item in the tree is the new, untracked `plans/s14/` directory (the S14 plan). `npm test` on HEAD = **172 pass / 0 fail**.

## Goal
`api-from-scenarios` is a clean-room TypeScript engine that reconstructs a Claude Code session's file-change history from its JSONL transcript, one scenario at a time. **S14** is the seventh rewind-family scenario and the **conversation-only-rewind twin of S13**: the session writes `scenario14.py`(`greet`)+`tests/test_scenario14.py`, then `farewell` is added by an Edit, then a **conversation-only** `Rewind: 2` forks into an abandoned `farewell`-Edit branch and a surviving Read-only branch. Because a conv-only rewind does NOT roll back disk, the on-disk content is the abandoned branch's `farewell` Edit — which misroutes `findSurvivingHead` and hides the rewound branch. The slice makes the engine name the Read branch as surviving and surface the `farewell` Edit as a rewound branch, producing output byte-identical (modulo names/uuids) to S13.

## Current State
**Plan complete and prototype-verified; NOTHING of S14 implemented (prototype reverted).** During planning I applied the exact two fixes to a throwaway prototype and confirmed:
- All **172** prior tests stayed green; `npx tsc --noEmit` clean.
- S14 produced the correct fork output (rewound `#68f74356` above file-less surviving `#de63b23a`; fileDAG `B write #0131TtyG` + `D edit #01X52CXE`, `C write #01YE6fsX`).
- S8/S9/S10 `--list-branches` and the S13 default were byte-for-byte unchanged.
Then I reverted both source edits (verified: no residue; S14 back to its broken `surviving #fadbe55d`; 172 green). So the tree is clean at `a9af46d` plus `plans/s14/`.

The two verified bugs (both must be fixed):
1. **`findSurvivingHead` override mis-fires** (`src/reconstruction_branch.ts`): conv-only leaves `farewell` on disk ⇒ `findWorkingTreeOwner` = `2f3a2bcb` (abandoned branch), `finalChain.has(owner)=false` ⇒ the override returns the abandoned prompt `fadbe55d` as "surviving".
2. **structural dedup guard skips the real tip** (`src/reconstruction_fork.ts`): in S14 the abandoned prompt `fadbe55d` IS a `last-prompt` head (in S13 it was not), so the head-based pass claims it and `subtreeHoldsClaimedTip`'s `claimed.has(abandonedPrompt)` short-circuit blocks discovery of the real `farewell` tip `68f74356`.

## What Remains
Execute the plan's TDD task list in order (it is the authoritative, line-precise spec):
1. **Task 0** — add `S14_JSONL` to `tests/fixtures.ts` (Desktop absolute path; pattern after `S13_JSONL`).
2. **Tasks 1–3 (RED)** — new `tests/reconstruction_engine_s14.test.ts` (4 tests): branch enumeration returns surviving `de63b23a` + rewound `68f74356`@`acc07a57`; one rewound branch touching `scenario14.py` only; rewound content = greet+farewell; surviving content = greet only (no `farewell`).
3. **Task 4 (GREEN Part 1)** — in `findSurvivingHead`, keep `finalHead` when `survivingBranchRecordsFileChange(records, finalHead)` is true; add that helper (`extractFileEvents(selectBranchRecords(records, finalHead)).length > 0`) and `import { extractFileEvents } from "./reconstruction_extract.ts";`.
4. **Task 5 (GREEN Part 2)** — delete the `claimed.has(abandonedPrompt)` short-circuit (3 lines) in `subtreeHoldsClaimedTip` (`src/reconstruction_fork.ts`).
5. **Task 6 (CLI locks)** — new `tests/reconstruction_cli_s14.test.ts` (4 tests) asserting the plan's *Expected outputs* verbatim (default fork, unchanged fileDAG, `--list-branches`, `--branch 68f74356`).
6. **Task 7** — `npm test` = **180 pass / 0 fail** (172 + 8); `npx tsc --noEmit` clean; filesize sweep clean.
7. **Task 8** — flip `plans/roadmap.md` `[ ] S14` to `[x] S14 -> …`; prepend an S14 entry to `plans/implementation-notes-api-from-scenarios.md`.
8. Then surface the diff for the user to review/commit (project rule: commit only when the user asks; one-commit-per-scenario precedent → `Implemented S14 handling`). Do NOT start S15.

## Key Files
- `plans/s14/s14-reconstruction-plan.md` — THE plan: verified topology, both root causes, the two exact edits, the authoritative expected outputs, the 8-test TDD breakdown, and the corpus-wide regression proof.
- `src/reconstruction_branch.ts` (215/250) — `findSurvivingHead` (Part 1 edit). `selectBranchRecords` already here.
- `src/reconstruction_fork.ts` (125) — `subtreeHoldsClaimedTip` (Part 2 edit). `findStructuralRewoundBranches` is the S13 machinery being unblocked.
- `src/reconstruction_extract.ts` — `extractFileEvents` (imported by Part 1; no import cycle — it imports none of branch/fork/worktree).
- `src/reconstruction_worktree.ts` — `findWorkingTreeOwner` (read-only context: why owner lands off-branch for conv-only).
- `tests/reconstruction_engine_s13.test.ts` / `tests/reconstruction_cli_s13.test.ts` — mirror these for the S14 test files.
- `tests/fixtures.ts` — add `S14_JSONL`.

## Context the Next Agent Won't Have
- **S14's correct reconstruction is byte-identical to S13's** (modulo `s13`→`s14`, uuids, timestamps). The rewind *type* (code vs conv) changes only actual disk, which the fileDAG already captures identically (the Edit event exists in both). So you can mirror the S13 tests almost line-for-line.
- **The override fires for ONLY `s8`/`s9`/`s10`/`s14`** across the entire corpus (verified by scanning every scenario for `finalChain.has(owner)===false`). Part 1 therefore cannot affect `s1`–`s7`, `s11`–`s13`, `m1`–`m7`. For S9/S10 the surviving branch has no file events ⇒ the redirect still fires (unchanged); for S8 the surviving branch has file changes ⇒ Part 1 keeps `finalHead` and S8's head-based rewound tips are untouched (verified `--list-branches` unchanged: `#2988ac8f` + two rewound).
- **`collectDescendantUuids(start)` EXCLUDES `start` itself** — this is why deleting the `claimed.has(abandonedPrompt)` line is safe: for S7/S8/S11/S12 the abandoned prompt's deepest reply (the claimed head tip) is a descendant and still trips the subtree scan, so those stay skipped; only S14's deeper-than-the-claimed-prompt tip gets discovered.
- **`fadbe55d` is the trap.** It is simultaneously the abandoned prompt (a fork child) AND a `last-prompt` head. After Part 1 it becomes a degenerate head-based abandoned branch (tip = the prompt) that is filtered downstream (no diverging file change) — harmless — but it poisons `claimed` and blocks the structural pass until Part 2.
- **Do NOT touch the fileDAG path or `--surviving` reconstruction.** Both are already correct (fileDAG = disk lineage `B`+`D`; surviving = greet-only because the surviving branch has no file events of its own). The bug is purely in *which head is named surviving* and *whether the rewound branch is enumerated*.
- **A repo Stop hook reruns the suite after every edit; a lint hook caps files at 250 lines and blocks >3× indent nesting.** Expect inline RED during strict RED→GREEN. The hook log can lag one edit (it sometimes reports the prior step's failure) — confirm true state with `npx tsx --test <file>`. During this session the lag showed a "tests FAILED" right after I added a helper but before its import; the next edit cleared it.
- **`_diag*.ts` scratch scripts** must live INSIDE the project root (not `/tmp`) to inherit ESM (`type: module`); `/tmp` makes tsx treat them as CJS and top-level constructs fail. Delete them after use (the Stop hook flags any source file lacking a test).

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect: 180 pass / 0 fail (172 prior + 8 new)
npx tsc --noEmit         # expect: no errors (tsx does not type-check)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
P="scenarios/executed/s14-multi-edit-conv-only-read/6d632174-79b3-4c11-953f-1308a957d748.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                 # fork: rewound #68f74356 above surviving #de63b23a (no file changes)
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null # surviving #de63b23a + rewound #68f74356 (rewind @ #acc07a57)
npx tsx src/reconstruction_cli.ts "$P" --branch 68f74356 --verbose 2>/dev/null  # greet + farewell
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null        # greet only
# Regression spot-check (must be unchanged): S13 default + --list-branches; S8/S9/S10 --list-branches; S1 default.
```
