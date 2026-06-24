# Handoff: S10 (s10-conv-only-no-post-edit) is PLANNED — the engine already reconstructs S10 correctly, so the plan is a characterization/regression-lock + new spec 37 + docs (NO production-code change). Plan written, nothing executed.
Conversation name: api-from-scenarios — S10 (conv-only-no-post-edit) planning [autonomous monitor session]
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/3f0dce49-f9e4-4d9d-a661-6dc03f4be60a.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s10/s10-reconstruction-plan.md (NOT yet executed)

## Branch
`api-from-scenarios` based on `master`. HEAD = `5c16958 implemented S9`. **116 tests green at HEAD.** No `-plate` branch.
Uncommitted in the working tree at handoff time: S9's documented finishing remainder (`tests/reconstruction_cli.test.ts` +29, and the 3 doc edits `plans/implementation-notes-…`, `plans/reconstruction-engine-design.md`, `plans/roadmap.md`) — **that is S9's tail to commit, not S10's** — plus the new untracked `plans/s10/` (this plan) and `plans/handoff-…-1322.md` (the S9 handoff). S10 starts from a 116-green baseline regardless.

## Goal
Clean-room TypeScript engine that reconstructs the file-change history of a Claude Code session from its JSONL transcript, one scenario at a time. **S10 (`s10-conv-only-no-post-edit`)** is the fourth scenario in the rewind family (S7–S23): the session writes `scenario10.py` (`greet`) + `tests/test_scenario10.py`, accepts them, then does a **conversation-only rewind** back to root (files are LEFT on disk — not restored/removed), then only **reads** (no further writes). Goal: lock that the surviving working tree is the two kept files (surviving tip `#bfd9d428`), with **zero rewound branches** (the read-only head is a file-less tangent dropped like S7's read tangent / S8's `Hello` / S9's read head).

## Current State
**The plan is fully written and the engine is already correct on S10 — nothing is coded for S10 yet.** Key finding (verified, not assumed):

- S10 is the **isolated, minimal instance of design-doc spec 35** (a conversation-only rewind keeps the abandoned branch's files on disk; `findSurvivingHead` picks the surviving branch from the working-tree owner). S8 only exercised this *combined* with two `code` rewinds; S10 is the pure single-conv-only-rewind case.
- S10 is a **strict no-op for spec 36** (the content-signature fix): its post-rewind snapshots repeat the SAME `version` (`v2`) AND the SAME non-null `backupFileName` — there is NO version bump and NO null-bfn refresh (the opposite of S9's `code`-restore churn `v3→v4→v5`/null). So the working-tree owner is stable under both the old version rule and the spec-36 signature.
- Therefore **no `src/` change is needed**. Verified end-to-end: `reconstruction_cli` default renders a plain list (`scenario10.py #01CmDQPd` 2 lines + `tests/test_scenario10.py #0134iGZz` 5 lines, no `##` headers, no "no files touched"); `--list-branches` = one line `surviving  tip #bfd9d428   scenario10.py, test_scenario10.py`; `--surviving` = the two files. Direct engine drive: `reconstructAll(S10)` = the two Write turns; `reconstructBranches(S10)` = `survivingTip bfd9d428-86da-4480-b30a-abf27f2c4ff1`, `rewound.length 0`.

So the plan is a **characterization/regression-lock + spec 37 + docs** plan (mirrors S9's Task 2, where green-on-arrival CLI tests LOCKED a no-CLI-change result).

## What Remains
Execute `plans/s10/s10-reconstruction-plan.md` via `/jot:implement`, in this order:

1. **Task 1 — regression lock (no production code).**
   a. Add `S10_JSONL` to `tests/fixtures.ts` (after `S9_JSONL`).
   b. Add ONE synthetic test to `tests/reconstruction_branch.test.ts` — `test_find_conversation_branches_survives_working_tree_when_conv_only_refresh_repeats_real_backup` (builder `buildConversationOnlyRewindRealBackupRecords`); it covers the *real, non-null bfn carried* refresh variant (S8's existing null-bfn `buildConversationRewindRecords` test already covers the null variant — do NOT duplicate it).
   c. Add new file `tests/reconstruction_engine_s10.test.ts` (mirror `tests/reconstruction_engine_s9.test.ts`, typed `FileHistory[]` helpers): `test_default_reconstruction_is_the_files_kept_by_a_conversation_only_rewind` and `test_conversation_only_rewind_with_no_post_edit_has_no_rewound_branches`.
   d. Verify gate (expect ~119 green; `npx tsc --noEmit` clean; filesize check).
2. **Task 2 — CLI regression lock + docs.**
   a. Add 3 CLI tests to `tests/reconstruction_cli.test.ts` (`test_s10_default_view_is_a_plain_list_of_the_kept_files`, `test_s10_list_branches_shows_only_the_surviving_branch`, `test_s10_surviving_flag_shows_the_kept_files`) — reuse the existing S9/S8 CLI-invocation helper and matcher style.
   b. Docs: new **spec 37** in `plans/reconstruction-engine-design.md` (`### S10 — implemented now`, refers to spec 35, notes the spec-36 no-op); S10 entry atop `plans/implementation-notes-api-from-scenarios.md`; mark S10 `[x]` in `plans/roadmap.md`.
   c. Verify gate (expect ~122 green), then the end-to-end check, then STOP and report. Commit only after user approval.
3. **Heads-up on git hygiene before committing:** S9's finishing remainder (the 4 modified files above) is still uncommitted. Decide with the user whether to commit S9's tail first (`Finish S9: CLI regression tests + docs`) or fold it in — keep S9's and S10's changes in separate commits.

## Key Files
- `plans/s10/s10-reconstruction-plan.md` — THE plan (verified ground truth, snapshot table, 5 locked decisions, literal test bodies, the explicit "no RED phase" note). Follow verbatim.
- `src/reconstruction_worktree.ts` (77) — `findWorkingTreeOwner` (content signature). UNCHANGED by S10; read to understand why S10's repeated signature keeps the owner at `bfd9d428`.
- `src/reconstruction_branch.ts` (212) — `findSurvivingHead` / `findConversationBranches`. UNCHANGED; the spec-35 `findHeadAtOrAbove(owner)` path is what selects the write branch as surviving.
- `tests/reconstruction_engine_s9.test.ts` — the mirror template for the new S10 engine test file.
- `tests/reconstruction_branch.test.ts` — has `snapshotRec(messageId, tracked, backups?)` (S9-extended) and the S8 `buildConversationRewindRecords` (null-bfn conv-only synthetic). Add 1b after `buildCodeRestoreNoPostEditRecords`.
- `tests/reconstruction_cli.test.ts` — add `S10_JSONL` import + 3 CLI tests; copy the existing S9 CLI tests' helper + matcher style.
- `plans/reconstruction-engine-design.md` — specs 35 (S8 working-tree-survival) and 36 (S9 content signature) are the direct predecessors; add spec 37 after the `### S9` block.
- `plans/handoff-api-from-scenarios-20260623-1322.md` — the S9 *implementation* handoff (input to this session).

## Context the Next Agent Won't Have
- **This is a NO-FIX slice — that is the whole point, and it is verified, not assumed.** Do NOT invent a `src/` change to manufacture a RED→GREEN cycle; there is nothing to fix, and a change would risk regressing S1–S9. The new tests are characterization locks expected GREEN on arrival. If any is unexpectedly RED, STOP and diagnose (wrong assertion vs. a real regression) — see the plan's "On the absence of a RED phase".
- **Why S10 ≠ S9 at the data level (the crux for spec 37):** a conversation-only rewind does not touch disk, so the post-rewind file-history snapshots repeat the SAME `version` and SAME non-null `backupFileName`. A `code` restore (S9) instead emits refresh snapshots that bump `version` with a `null` `backupFileName`. So S9 NEEDED the content-signature fix; S10 is stable under any rule. Snapshot ground truth (file order): `#3a4b4993` empty→both v1/null, `#bfd9d428` both **v2 real bfn (owner)**, `#cdd14e17`/`#6ee9d4e5`/`#a80a31a7` all repeat **v2 + same bfn** on the read branch.
- **Verified ground truth (assert these exactly):** surviving tip `bfd9d428-86da-4480-b30a-abf27f2c4ff1`; `rewound.length 0`; `scenario10.py` changeId `toolu_01CmDQPdzdqgZhMLUQz3fe7t` (2 lines, 16:08:33Z); `tests/test_scenario10.py` changeId `toolu_0134iGZzirN3ZPRTyUUx6Eyb` (5 lines, 16:08:34Z); fork/rewind point `4e1571b4-9437-4dcb-b26c-c92b33ec0b71` (root, shared parent of write prompt `3a4b4993…` and read prompt `cdd14e17…`); read-branch final head `67d05ad4-3393-4ea9-8acb-12eb0d7686b1`.
- **Harness quirks (carried from S8/S9):** `tsx` does NOT type-check — `npx tsc --noEmit` is the real type gate (`noImplicitAny`/`noUnusedLocals` make untyped test helpers/stray imports hard errors; type new engine-test helpers `FileHistory[]`). The CLI prints a `Debugger listening…`/`Waiting for the debugger to disconnect…` banner on stderr — always run with `2>/dev/null`; the existing CLI tests already strip it (reuse their helper). A background `.plate` agent auto-commits periodically — expect partial commits mid-session and reconcile. Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` beyond the `S10_JSONL` fixture path. `parseRedirect` `2>&1`/`>/dev/null` regression remains open and unrelated.
- **Roadmap/spec naming:** the design-doc subsections are `### S8 — implemented now` / `### S9 — implemented now`; add `### S10 — implemented now` with spec **37**. Roadmap S10 is line 11.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # baseline 116 pass / 0 fail at HEAD; ~119 after Task 1, ~122 after Task 2
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
End-to-end (proves S10 is correct and unchanged; S9/S8/S1 sanity):
```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s10-conv-only-no-post-edit/517dcc05-8809-43cd-86d4-7f6907b9ee76.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                  # plain list: scenario10.py #01CmDQPd (2 lines) + tests/test_scenario10.py #0134iGZz (5 lines). NO "## ", NO "no files touched".
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null  # one line: surviving  tip #bfd9d428   scenario10.py, test_scenario10.py
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null      # the two files, no headers
# Sanity (unchanged): S9 default = plain list (scenario9.py #01PZ3yAw + tests/test_scenario9.py #012EzSkd), --list-branches surviving #f1b8dede;
#                     S8 default = surviving #2988ac8f + 2 rewound (#546718c1, #84d669da); S1 still a plain list, no ## headers.
```
