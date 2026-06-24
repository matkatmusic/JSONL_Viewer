# Handoff: S9 (s9-code-restore-no-post-edit) is PLANNED — make the surviving working tree the *restored* code after a `code` rewind with no subsequent write. Plan written + prototype-validated; nothing committed yet.
Conversation name: api-from-scenarios — S9 (code-restore-no-post-edit) planning
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/83fa86ac-adb8-46b6-b080-b19f946c9a0e.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s9/s9-reconstruction-plan.md (NOT yet executed)

## Branch
`api-from-scenarios` based on `master`. HEAD = `8cef398 Implemented S8 handling` (S8 is committed; 109 tests green at HEAD). The only uncommitted items are the new `plans/s9/` directory (this plan) and a pre-existing stray edit to `src/Plan_Impl_template.md` (NOT part of S9 — leave it or ignore it). No `-plate` branch.

## Goal
Clean-room TypeScript engine that reconstructs the file-change history of a Claude Code session from its JSONL transcript, one scenario at a time. **S9 (`s9-code-restore-no-post-edit`)** is the third scenario in the rewind family (S7–S23). The session writes `scenario9.py` (`greet`) + `tests/test_scenario9.py`, then does a **`code` rewind back to root** (restoring those files to disk), then only **reads** (no further writes). A `code` restore re-versions the same on-disk content via trailing "refresh" snapshots that bump each file's `version` while leaving `backupFileName` null. The goal: report the **restored code** as the surviving working tree (surviving tip `#f1b8dede`), with **no rewound branch** (the read-only conversation head is a file-less tangent).

## Current State
**S9 is fully PLANNED and the fix is prototype-validated; nothing is coded or committed.** The plan (`plans/s9/s9-reconstruction-plan.md`) contains verified ground truth, 6 locked decisions, literal RED tests, and the exact GREEN code.

What the current engine does on the S9 transcript (the bug, confirmed by running `reconstruction_cli`):
```
## surviving  tip #936c10c7
no files touched                       <-- WRONG (step 4 reads scenario9.py; it is on disk)
## rewound  tip #f1b8dede  (rewind @ #3944b6a8)
  scenario9.py             0 create 2 lines 16:19:13Z #01PZ3yAw
  tests/test_scenario9.py  0 create 5 lines 16:19:14Z #012EzSkd
```

**Root cause (located):** `findSurvivingHead` already calls `findWorkingTreeOwner` and would switch the surviving head to the owner's branch (the S8 mechanism). But `findWorkingTreeOwner` (in `src/reconstruction_worktree.ts`) detects working-tree change by the `{path → version}` map; S9's refresh snapshots bump `version` (v3→v4→v5) with unchanged content, so the owner is wrongly the final refresh (`b71764ed`, on the read-only branch) instead of `f1b8dede` (the last snapshot whose CONTENT changed). With the owner on the final head's chain, the surviving head stays the read-only head → no Write events on that branch → "no files touched".

**The fix (single source change):** in `src/reconstruction_worktree.ts`, change `findWorkingTreeOwner`'s change-detection from a `{path → version}` key to a **carried-forward `backupFileName` content signature** (a snapshot is a change iff the tracked PATH SET changed OR a path's last-known non-null `backupFileName` changed; refresh snapshots that report null `backupFileName` carry the previous content id forward). This was **prototyped in this session, then reverted**: with it, `reconstruction_cli` on S9 yields the correct output (plain list of the two files, surviving tip `#f1b8dede`, no rewound branch) AND the full suite stayed **109/109 green** with S8 output unchanged.

## What Remains
Execute the plan with `/jot:implement`, in this order (the plan has the literal code):

1. **Task 1 RED** — (1a) add `S9_JSONL` to `tests/fixtures.ts`; (1b) extend the `snapshotRec` helper in `tests/reconstruction_branch.test.ts` to accept a per-path `backupFileName` (default null; the two existing S8 callers stay unchanged); (1c) add the synthetic `buildCodeRestoreNoPostEditRecords` + two tests (`test_find_conversation_branches_survives_restored_code_not_final_refresh`, `test_select_live_branch_follows_restored_code_after_code_rewind`); (1d) add `tests/reconstruction_engine_s9.test.ts` with two real-transcript tests. Confirm the 4 fail (RED) and the existing 109 still pass.
2. **Task 1 GREEN** — refine `findWorkingTreeOwner` in `src/reconstruction_worktree.ts` per the plan's exact code (extract `resolveContentId` + `buildContentSignature`; add `FileHistoryBackup` + `Path` imports; update the module header comment). Confirm the 4 new tests pass + all prior pass. Run the Verify gate.
3. **Task 2** — add 3 CLI regression tests to `tests/reconstruction_cli.test.ts` (default plain list; `--list-branches` single surviving line `#f1b8dede`; `--surviving` lists both files). Then the 3 doc updates: design-doc spec **36** (refines spec 35), `implementation-notes` S9 entry, `roadmap` mark S9 done. Run the Verify gate + End-to-end check.
4. **Stop and report; commit only after the user approves** (suggested message: `Implemented S9 handling`).
5. **After S9 commits, write the S9 implementation handoff** via `/jot:handoff-prompt` (this is the input-handoff; the implementor should produce an output-handoff).

## Key Files
- `plans/s9/s9-reconstruction-plan.md` — THE plan (ground truth, 6 locked decisions, literal RED tests + exact GREEN code, End-to-end check). Read first.
- `src/reconstruction_worktree.ts` (43→~60 lines) — the ONLY source file to change. `findWorkingTreeOwner` lives here.
- `src/reconstruction_branch.ts` (212) — `findSurvivingHead` (calls `findWorkingTreeOwner`); unchanged. Read to understand the switch logic.
- `src/structures/file-history.ts` — `getFileHistorySnapshot`, `FileHistorySnapshotMessage`, `FileBackupMap` (`.entries()` → `Array<[Path, FileHistoryBackup]>`), `FileHistoryBackup` (`{ backupFileName: Path | null; version: number; backupTime: Date }`).
- `src/reconstruction_engine.ts` (228) — `reconstructAll`/`reconstructBranches`; S9 engine tests target it. Unchanged.
- `tests/fixtures.ts`, `tests/reconstruction_branch.test.ts`, `tests/reconstruction_engine_s8.test.ts` (mirror it for S9), `tests/reconstruction_cli.test.ts`.
- `plans/reconstruction-engine-design.md` (spec 35 = S8 working-tree-survival; add spec 36), `plans/implementation-notes-api-from-scenarios.md`, `plans/roadmap.md`.
- `plans/handoff-api-from-scenarios-20260623-1243.md` — the S8 *implementation* handoff (input to this planning session).

## Context the Next Agent Won't Have
- **S9 reuses the S8 mechanism entirely — there is NO new content-from-backup machinery.** The restored bytes ARE the Write events restored to disk, so once the surviving head moves to `f1b8dede` (which has the Write events), `reconstructAll` reconstructs the files from those events with their real `changeId`s (`scenario9.py` = `toolu_01PZ3yAwBcZT3utNNCFEEMLn`, test = `toolu_012EzSkdGv9PA1K2NBwrwDot`). Do NOT try to synthesize a revision from backup content — the FINAL snapshot's `backupFileName` is **null** (no on-disk backup for the final state), so there is nothing to read; the only on-disk backup is the `@v2` pair on the `f1b8dede` snapshot, and you don't need it.
- **This fix REVISES S8's locked decision #3**, which deliberately chose `version` over `backupFileName` (because `backupFileName` is null for a file's first tracked version). The revision is safe because a freshly written file ALSO changes the tracked PATH SET, so it is still detected; the carry-forward only affects *refresh* snapshots (same paths, null bfn, bumped version). This was the whole subtlety — verify it, don't "simplify" back to version.
- **The discriminator was validated against BOTH real transcripts by hand AND by a reverted prototype.** Carry-forward `backupFileName` gives S9 owner `f1b8dede` (correct) and S8 owner `2267781c` = v_c (unchanged). S8's trailing conversation-only snapshot `f9238a6c` repeats content id `@v7`, so it stays "unchanged" and does not move S8's owner. If you change the discriminator, re-verify S8.
- **Expected S9 output is a PLAIN LIST (no `## headers`).** S9 has one surviving branch and zero rewound branches (the read-only head `936c10c7` touches no files → dropped as a file-less tangent, exactly like S7's read tangent / S8's `Hello`). The CLI only prints `## surviving`/`## rewound` headers when rewound branches exist; with none, S9 renders like S1–S6. This is correct, not a bug. Surviving tip is still `#f1b8dede` (see `--list-branches`).
- **Surviving tip = `#f1b8dede`, which was the *rewound* tip before the fix.** Consequence: `--branch f1b8dede` now returns nothing (it's the surviving branch, not a rewound one); use `--surviving`. This mirrors S8 (its surviving tip is v_c's write head, not the final `Hello`).
- **A reverted prototype lived briefly in `src/reconstruction_worktree.ts` during this session** to validate the fix; it was restored exactly (verified: no residue, git clean). The committed S8 version is the baseline you start from.
- **Harness quirks (carried from S8):** `tsx` does NOT type-check — `npx tsc --noEmit` is the real type gate (`noUnusedLocals`/`noUnusedParameters`/`noImplicitAny` make stray imports/untyped params hard errors; type the new test helpers `FileHistory[]`). A PostToolUse hook flags `>3×` indent nesting — the plan's GREEN code already extracts `resolveContentId` to avoid it. Ignore stale mid-edit `PostToolBatch`/`PostToolUse` test-failure noise; a manually-run `npm test` is authoritative. Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` beyond the `S9_JSONL` fixture path.
- **Carried-forward, not S9:** the `parseRedirect` `2>&1` / `>/dev/null` mis-parse (S5 regression noted in the S8 handoff) is still open — separate slice.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # baseline 109; after Task 1 = 113; after Task 2 (+3 CLI) = 116; 0 fail
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
End-to-end (proves the restored code survives; S8/S7/S1 unchanged):
```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s9-code-restore-no-post-edit/b381c39b-e81e-45e8-b400-03edc4ee4be3.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                  # plain list: scenario9.py #01PZ3yAw (2 lines) + tests/test_scenario9.py #012EzSkd (5 lines). NO "## ", NO "no files touched".
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null  # "surviving  tip #f1b8dede   scenario9.py, test_scenario9.py" (no rewound line)
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null      # the two files, no headers
# Sanity: S8 default still surviving #2988ac8f + 2 rewound (#546718c1, #84d669da); S1 still a plain list.
```
