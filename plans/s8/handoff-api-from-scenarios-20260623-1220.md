# Handoff: S8 (s8-repeated-code-restore-rewinds) is PLANNED — make the surviving working tree come from file-history snapshots, not the final conversation head. Plan written, nothing coded.
Conversation name: api-from-scenarios — S8 (repeated-code-restore-rewinds) planning
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/2a0aaf00-4c30-4bf2-a63d-4275cc53e30b.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s8/s8-reconstruction-plan.md (NOT yet executed)

## Branch
`api-from-scenarios` based on `master`. HEAD = `8fcce38 Implemented S7 handling` (S7 is committed; 101 tests green at HEAD). The only uncommitted item is the new `plans/s8/` directory (this plan). No `-plate` branch.

## Goal
Clean-room TypeScript engine that reconstructs the file-change history of a Claude Code session from
its JSONL transcript, one scenario at a time. **S8 (`s8-repeated-code-restore-rewinds`)** is the
second scenario in the rewind family (S7–S23) and the first to break an S7 assumption. The session
does three `code` rewinds (each writing `scenario8.py` + `tests/test_scenario8.py`, then restoring
the working tree) and ends with a **conversation-only** rewind (step 11, no `, code`) followed by
`Hello`. A conversation-only rewind moves the conversation pointer but does NOT restore the working
tree — so the files written at step 9 (**v_c**) stay on disk and ARE the surviving working tree, even
though the final conversation head (step-12 `Hello`) wrote nothing. The goal is to make
reconstruction report v_c as surviving and v_a/v_b (the two `code`-rewound versions) as preserved
rewound branches.

## Current State
- **Nothing is coded for S8.** The plan is complete and ready to implement TDD task-by-task.
- **The bug is reproduced and root-caused.** Today `npx tsx src/reconstruction_cli.ts <S8>` reports
  `## surviving tip #d861247c` → **"no files touched"** and lists **three** rewound branches (v_a,
  v_b, AND v_c). v_c is wrongly demoted to rewound; the empty step-12 `Hello` head is wrongly
  surviving. Root cause: `findSurvivingHead` (private, in `src/reconstruction_branch.ts`) defines the
  surviving branch as the **final `last-prompt` head in file order**, which is the file-less step-12
  `Hello`.
- **The fix is concentrated in one function.** Make `findSurvivingHead` working-tree-aware by reading
  the `file-history-snapshot` records. Everything downstream (`selectLiveBranch`,
  `findConversationBranches`, `collectSurvivingUuids`, `reconstructAll`, `reconstructBranches`, all
  CLI views) already routes through `findSurvivingHead` and needs no behavioral change. **No CLI
  change, no new `EventKind`/per-line/container type.**
- **The algorithm is verified** against the real transcripts (throwaway scripts): S8 → surviving head
  `2988ac8f` (v_c) + rewound `[546718c1 (v_a), 84d669da (v_b)]`; **S7 → surviving head `77494da3`,
  unchanged; S1 → unchanged.** The change is a proven no-op for S1–S7.
- All ground-truth values (changeIds, tips, rewind point, file contents, sessionId, cwd) are embedded
  in the plan's "Verified ground truth" table and the literal test assertions.

## What Remains
Execute `plans/s8/s8-reconstruction-plan.md` in order. Use `/jot:implement` to keep the
implementation-notes log. Strict RED→GREEN per task; run the Verify gate after each task.

1. **Task 1 — Working-tree-aware surviving head (the whole behavioral fix).**
   - RED: add `S8_JSONL` to `tests/fixtures.ts`; add a synthetic conversation-only-rewind test to
     `tests/reconstruction_branch.test.ts` (surviving tip = the working-tree head `Wa`, not the final
     `Hc`); add `tests/reconstruction_engine_s8.test.ts` (`reconstructAll(S8)` = v_c only;
     `reconstructBranches(S8)` survivingTip `2988ac8f…`, two rewound tips `546718c1…`/`84d669da…`,
     both rewindPoint `04c69f8b…`). All fail today.
   - GREEN: create `src/reconstruction_tree.ts` (move `indexRecordsByUuid`, `collectAncestorUuids`,
     `collectHeadUuids` verbatim out of `reconstruction_branch.ts` + add `findHeadAtOrAbove`); create
     `src/reconstruction_worktree.ts` (`findWorkingTreeOwner` — the last snapshot whose `{path →
     version}` tracked set changed); revise `findSurvivingHead` in `reconstruction_branch.ts` to: use
     the final head when the working-tree owner is on its ancestor chain (S1–S7 no-op), else the head
     at-or-above the owner (S8). Exact code is in the plan.
   - Verify gate (101 + new tests green; `tsc` clean; all files ≤250 lines).
2. **Task 2 — CLI lock-in + docs.** Add 4 CLI regression tests to `tests/reconstruction_cli.test.ts`
   (default shows v_c surviving + 2 rewound, no "no files touched"; `--surviving`; `--list-branches`
   = 2 rewound lines; `--branch 546718c1` = v_a). No CLI source change expected. Update
   `plans/reconstruction-engine-design.md` (new spec 35 + Code-layout + test inventory),
   prepend an S8 entry to `plans/implementation-notes-api-from-scenarios.md`, mark `[x] S8` in
   `plans/roadmap.md`. Verify gate, then run the End-to-end check.
3. **Stop and report; commit only after the user approves** (suggested message: `Implemented S8 handling`).

## Key Files
- `plans/s8/s8-reconstruction-plan.md` — THE plan: ground-truth table, 7 locked decisions, the
  import-graph plan, 2 tasks with literal RED tests and exact GREEN code, verify + end-to-end checks.
- `src/reconstruction_branch.ts` (241/250) — holds `findSurvivingHead` (the one function to change)
  and the three walkers to move out. Read first.
- `src/structures/file-history.ts` — `getFileHistorySnapshot` → `FileHistorySnapshotMessage` with
  `snapshot.trackedFileBackups: FileBackupMap` (`.entries()` → `Array<[Path, {backupFileName, version,
  backupTime}]>`). The S8 fix reads `version` per path for change detection.
- `src/reconstruction_engine.ts` (228/250) — `reconstructBranches`/`reconstructAll`; unchanged by S8
  but the integration tests target it.
- `src/reconstruction_cli.ts` / `src/reconstruction_render_list.ts` — the all-branches default
  renderer; unchanged by S8 (Task 2 only adds tests).
- `tests/fixtures.ts`, `tests/reconstruction_branch.test.ts`, `tests/reconstruction_cli.test.ts` —
  where the S8 tests land; `tests/reconstruction_engine_s8.test.ts` is new.
- `plans/handoff-api-from-scenarios-20260623-1152.md` — the S7 implementation handoff (architecture
  context the S8 fix builds on).
- `plans/coding-requirements.md` + `~/.claude/guides/{coding-standards,tdd,planning,single-condition-branching}.md`
  — mandatory style, enforced strictly.

## Context the Next Agent Won't Have
- **The core insight: a `code` rewind restores the working tree; a conversation-only rewind does
  not.** The transcript records this only in the `file-history-snapshot` records' `trackedFileBackups`
  — the harness's authoritative on-disk file state. The surviving working tree = the **last snapshot
  whose tracked `{path → version}` set CHANGED** (a conversation-only rewind appends a trailing
  snapshot with an UNCHANGED set, so it is correctly ignored). That snapshot's `messageId` is a
  conversation record on v_c's branch; the head at-or-above it (`2988ac8f`) is the surviving head.
- **The no-op-for-S1–S7 guard is essential and load-bearing.** `findSurvivingHead` keeps the final
  `last-prompt` head when the working-tree owner is on that head's ancestor chain (true for every
  non-rewind and every `code`-rewind-ending transcript). Only S8's conversation-only divergence takes
  the new branch. This is why S7's surviving tip stays `#77494da3` (S7 tests assert it literally) and
  S1–S6 stay byte-identical. **If you "simplify" by always switching to the owner's head, you break
  S7.** Verified: running the proposed algorithm gives S7 `77494da3` and S1 unchanged.
- **`version` is a backup-event counter, NOT a write counter** (S8 goes 1→7 for 3 writes). Use it
  ONLY for change detection (does this snapshot's set differ from the previous), never as a write
  identity.
- **scenario8.py is byte-identical across v_a/v_b/v_c** (2-line celsius) — it cannot tell you which
  survived. **The test file is the disambiguator:** v_c's test is `def test_celsius_to_fahrenheit_zero():`,
  v_a/v_b's is `def test_freezing_point():`. Assertions key on this.
- **File-org split is forced by the 250-line cap, not preference.** `reconstruction_branch.ts` is
  241/250; the new logic overflows it. The import graph must stay acyclic:
  `reconstruction_extract.ts` imports `FileEvent` from the engine which imports from
  `reconstruction_branch.ts`, so the snapshot/tree helpers must depend only on `structures/*` (NOT
  the engine/extract). Hence two leaf modules: `reconstruction_tree.ts` (generic walkers) and
  `reconstruction_worktree.ts` (snapshot→owner, no tree dependency — it only scans snapshots). This
  mirrors S7's `reconstruction_branches.ts` split for the same reason. Move code to its new canonical
  home and import it back; do NOT leave a re-export shim (project rule: no forwarding layers).
- **Rejected alternative — "surviving = the abandoned branch with the latest write."** It happens to
  give v_c for S8 but is a guess that ignores restores; it would mis-handle **S9
  (`s9-code-restore-no-post-edit`)**, where the final action restores OLDER code with no new write.
  The snapshot mechanism handles S9 correctly (the tracked set changes at the restore), so build it
  now. S9 is the natural validation of this foundation.
- **Harness quirks:** `tsx` does NOT type-check — `npx tsc --noEmit` is the real type gate
  (`noUnusedLocals`/`noUnusedParameters` make a stray import a hard error). Ignore stale in-batch
  `PostToolBatch`/`PostToolUse` hook failures (they run tests mid-edit); a manually-run `npm test` is
  authoritative. Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude
  code src/` beyond the `S8_JSONL` fixture path.
- **Carried-forward open bug (not S8):** `parseRedirect` mis-parses `2>&1` / `>/dev/null` (S5
  regression). S8 never triggers it. Track as a separate `parseRedirect` hardening slice.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 101 now; +new S8 specs after each task, 0 fail
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
End-to-end (proves the conversation-only rewind keeps v_c on disk; S7/S1 unchanged):
```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s8-repeated-code-restore-rewinds/ac304418-47fe-4c2b-be86-ea62783110e0.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                  # DEFAULT: ## surviving tip #2988ac8f (v_c #01WWP6tD/#01Jn7kgw) + 2 rewound (v_a #014hpZNH, v_b #014Yd3uL @ #04c69f8b). NO "no files touched", NO 3rd rewound, NO overwrite.
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null      # v_c only, no headers
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null  # surviving #2988ac8f; rewound #546718c1, #84d669da
npx tsx src/reconstruction_cli.ts "$P" --branch 546718c1 2>/dev/null # only v_a
# Sanity: S7 still surviving #77494da3 + one rewound v1; S1 still a plain list, no ## headers.
```
