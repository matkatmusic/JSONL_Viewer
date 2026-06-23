# Handoff: S11 (s11-write-code-restore-rewrite) is PLANNED — make the surviving working tree the post-rewind *rewrite* (multiply) and preserve the abandoned pre-restore code (add) as a rewound branch. Plan written + engine-verified; NO production-code change expected (characterization/regression-lock + spec 38 + docs). Nothing executed; only `plans/s11/` is uncommitted.
Conversation name: api-from-scenarios — Plan S11
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/4fd768a5-7255-48e7-8417-213d2ae80dff.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s11/s11-reconstruction-plan.md (NOT yet executed)

## Branch
`api-from-scenarios` based on `master`. HEAD = `7805122 Implemented S10 handling` (122 tests green at HEAD). No `-plate` branch. The ONLY uncommitted item is the new untracked `plans/s11/` directory (this plan). Working tree is otherwise clean.

## Goal
Clean-room TypeScript engine that reconstructs the file-change history of a Claude Code session from its JSONL transcript, one scenario at a time. **S11 (`s11-write-code-restore-rewrite`)** is the fifth scenario in the rewind family (S7–S23): the session writes `scenario11.py`(`add`)+`tests/test_scenario11.py`, accepts, does a **`code` rewind back to root** (the `add` files leave disk), then **rewrites** the same two filenames with `multiply`, then exits. The goal of this slice is to LOCK that the surviving working tree is the **multiply** rewrite (surviving tip `#d03f0078`) and the abandoned **add** turn is preserved as ONE rewound branch (tip `#a7ceb7ae`, rewind @ root `#742f44f2`), and to document it as a distinct spec. **Verified finding: the engine is ALREADY correct** — S11 is the complement of S9 (S9 proved a `code`-restore refresh must NOT move the working-tree owner; S11 proves a real post-restore rewrite MUST) and is fully covered by specs 35+36 — so the slice is tests + docs only, **no `src/` change**.

## Current State
**S11 is PLANNED, not implemented.** The plan (`plans/s11/s11-reconstruction-plan.md`) is complete, follows the S10 plan's structure, and was written against verified ground truth (real-transcript CLI runs + `findWorkingTreeOwner` source review + JSONL snapshot/topology extraction). Nothing in `src/` or `tests/` has been touched yet.

Baseline verified just now at HEAD `7805122`:
- `npm test` → **122 pass, 0 fail**.
- `npx tsc --noEmit` → clean (exit 0).
- The current engine already produces the correct S11 output end-to-end (default = `## surviving #d03f0078` multiply + `## rewound #a7ceb7ae (rewind @ #742f44f2)` add; `--surviving` = multiply only; `--diff` shows multiply vs add). This is WHY the slice adds no production code.

## What Remains
Execute the plan with `/jot:implement` (it maintains the implementation-notes log). In order:
1. **Get user approval of the plan's 5 locked decisions** (top of the plan), then start Task 1.
2. **Task 1 — engine + synthetic regression lock (no production code):**
   - 1a. Add `S11_JSONL` to `tests/fixtures.ts` (after `S10_JSONL`).
   - 1b. Add ONE builder + test to `tests/reconstruction_branch.test.ts` — `buildCodeRestoreThenRewriteRecords` + `test_find_conversation_branches_advances_owner_to_post_restore_rewrite` (the complement of S9's `buildCodeRestoreNoPostEditRecords`). Literal code is in the plan.
   - 1c. Add new `tests/reconstruction_engine_s11.test.ts` (mirror `reconstruction_engine_s8.test.ts`) — 2 tests, literal code in the plan.
   - Verify gate: expect **125 pass** (122+3), tsc clean, no file >250 lines.
3. **Task 2 — CLI regression lock + docs (no engine code):**
   - 2a. Create NEW file `tests/reconstruction_cli_s11.test.ts` (4 tests, mirror S7's CLI tests; literal code in the plan). **Do NOT add to `tests/reconstruction_cli.test.ts` — it is at 246/250 lines.**
   - 2b. Docs: add **spec 38** to `plans/reconstruction-engine-design.md` (`### S11 — implemented now`); prepend an S11 entry to `plans/implementation-notes-api-from-scenarios.md`; flip `plans/roadmap.md` line 12 `[ ] S11 ->` to `[x] S11 -> [x] …`.
   - Verify gate: expect **129 pass** (125+4), tsc clean, no file >250 lines. Then run the End-to-end check block.
4. **Stop and report; commit only after the user approves.** Commit `plans/s11/` + the test/doc changes together (suggested message `Implemented S11 handling`).

## Key Files
- `plans/s11/s11-reconstruction-plan.md` — THE plan to execute (verified ground truth, snapshot table, topology, 5 locked decisions, literal test bodies, the explicit "no RED phase" note). Read first.
- `plans/handoff-api-from-scenarios-20260623-1352.md` — the S10 *implementation* handoff (the input that triggered this planning session; explains the prior no-op-slice pattern).
- `src/reconstruction_worktree.ts` (77) — `findWorkingTreeOwner` / `resolveContentId` / `buildContentSignature`. **UNCHANGED by S11**; read to see why the owner advances to the multiply head (`resolveContentId` returns the full `backupFileName` incl `@v` version).
- `src/reconstruction_branch.ts` (212) — `findSurvivingHead` / `findConversationBranches`. **UNCHANGED**; the spec-35/36 path selects the multiply write turn as surviving and the add turn as one rewound branch.
- `tests/reconstruction_engine_s8.test.ts` — the structural model for `reconstruction_engine_s11.test.ts` (it is the existing engine test that asserts BOTH a surviving branch and rewound branches; copy its `rewound[i].tip` / `.rewindPoint` / `.histories` accessors verbatim).
- `tests/reconstruction_cli_s10.test.ts` (39) — the per-scenario CLI-file split to mirror for the new `_s11` file.
- S7 CLI tests inside `tests/reconstruction_cli.test.ts` (`test_default_view_shows_all_branches`, `test_surviving_flag_shows_only_surviving_branch`, `test_list_branches_summarizes_surviving_and_rewound`, `test_branch_id_retrieves_one_specific_branch`) — the assertion model for S11's 4 CLI tests.
- `tests/reconstruction_branch.test.ts` — `buildCodeRestoreNoPostEditRecords` (the S9 builder at ~line 123) is the base to adapt; `snapshotRec(messageId, tracked, backups?)` / `rec` / `lastPrompt` helpers at the top.
- S11 JSONL: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s11-write-code-restore-rewrite/a26b3dcb-cf00-4b17-a595-86dd57d4df83.jsonl` (119 records).

## Context the Next Agent Won't Have
- **This is a NO-FIX slice and that is correct, not incomplete.** The engine reconstructs S11 right today (verified end-to-end + direct `reconstructAll`/`reconstructBranches` drive before any code). The new tests are characterization/regression locks, **expected GREEN on arrival** on unchanged `src/`. Do NOT invent a `src/` change to manufacture a RED→GREEN cycle — it would risk regressing S1–S10. (Same pattern as S9 Task 2 and all of S10.)
- **The spec-38 crux — the `@v<version>` suffix is load-bearing.** The harness names backups `<path-hash>@v<version>` where the path-hash is PATH-derived, not content-derived. In this transcript the `add` and `multiply` versions of `scenario11.py` share the **identical** path-hash `ef7eb2c33a0c873b`, differing ONLY by `@v2` vs `@v4`. `resolveContentId` returns the FULL `backupFileName` string (version included), so the content signature changes and the owner advances to the multiply head. A refactor that compared only the hash component would regress S11 (surviving would wrongly be `add`) while S9/S10 still passed — that is the exact failure mode the S11 tests guard.
- **Why S11 ≠ S9 at the data level:** S9's post-restore turn only READS — its refresh snapshot bumps `version` with a `null` bfn and content is unchanged, so the owner must NOT move (carry-forward keeps the old id). S11's post-restore turn REWRITES — after the same kind of `v3@null` refresh, a `v4` snapshot supplies a NEW non-null bfn, so the owner MUST move. The synthetic builder `buildCodeRestoreThenRewriteRecords` is deliberately the complement of `buildCodeRestoreNoPostEditRecords`.
- **Why S11 ≠ S10 at the branch level:** S10's abandoned head only READ (file-less tangent → dropped → zero rewound branches → plain CLI list). S11's abandoned `add` head WROTE files → it is preserved as ONE rewound branch → the CLI default view has `## surviving` + `## rewound` headers (the S7/S8 shape, NOT a plain list).
- **All four Writes are `type:"create"`, `originalFile:null`** (the `code` restore wiped disk back to empty root before the rewrite), so both branches' files are `create`s — no `overwrite` revision kind appears. S11 is the first scenario where two branches write the SAME filenames with different content; the branch-aware model keeps them fully separate (no cross-branch line bleed).
- **Synthetic `messageId` note (in the plan):** make the rewrite snapshot's `messageId` = the surviving head (`Wb`); the refresh snapshot's `messageId` is immaterial (its signature is unchanged so it is never the owner). If the test is unexpectedly RED, the assertion is the thing to re-check against the verified ground truth — not the engine.
- **Harness quirks (carried from S8/S9/S10):** `tsx` does NOT type-check — `npx tsc --noEmit` is the real type gate (`noImplicitAny`/`noUnusedLocals` make untyped helpers / stray imports hard errors; type the new engine-test helpers `FileHistory[]`). The CLI prints a `Debugger listening…` banner on stderr — run with `2>/dev/null`; the CLI tests use `runCli` directly (no banner). A 250-line-per-file hard cap is enforced by a PostToolUse hook AND the verify-gate filesize check — this is why S11's CLI tests go in a new file. Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` beyond the `S11_JSONL` fixture path. A background `.plate` agent may auto-commit periodically; expect partial commits and reconcile.
- **Coding requirements** (`plans/coding-requirements.md`, mandatory): no primitive domain values (`Uuid`/`Date`/`Path`), one canonical wire vocabulary in `src/structures/vocabulary.ts`, DRY helpers, enum-member discriminant comparisons, verb-named functions. The literal test code in the plan already conforms.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # baseline 122; 125 after Task 1; 129 after Task 2 — zero failures
npx tsc --noEmit         # No errors found (this is the REAL type gate; tsx does not type-check)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
End-to-end (proves S11 is correct; S10/S9/S8/S1 unchanged):
```
P="/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s11-write-code-restore-rewrite/a26b3dcb-cf00-4b17-a595-86dd57d4df83.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                  # ## surviving #d03f0078 (multiply) + ## rewound #a7ceb7ae (rewind @ #742f44f2) (add)
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null  # surviving #d03f0078 + rewound #a7ceb7ae rewind @ #742f44f2
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null      # the two multiply files only
npx tsx src/reconstruction_cli.ts "$P" --diff 2>/dev/null           # surviving = "def multiply…"; rewound = "def add…"
# Sanity (unchanged): S10 --list-branches surviving #bfd9d428 (no rewound); S8 default surviving #2988ac8f + 2 rewound; S1 default 0 "## " headers.
```
