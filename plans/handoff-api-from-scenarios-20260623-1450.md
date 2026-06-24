# Handoff: S12 (s12-write-conv-only-rewrite) is PLANNED — fix the engine CRASH so a conversation-only rewind followed by a post-rewind EDIT reconstructs the surviving (edited) files by seeding their base content from the file-history backup. Plan written + root-cause-verified; this is the FIRST rewind-family slice needing a real `src/` change. Nothing executed; only `plans/s12/` is uncommitted.
Conversation name: api-from-scenarios — Plan S12
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/9f2562df-cb21-441d-b564-a5e9b049620b.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s12/s12-reconstruction-plan.md (NOT yet executed)

## Branch
`api-from-scenarios` based on `master`. HEAD = `6a47c39 Implemented S11 handling` (129 tests green at HEAD). No `-plate` branch. The ONLY uncommitted item is the new untracked `plans/s12/` directory (this plan). Working tree otherwise clean.

## Goal
Clean-room TypeScript engine that reconstructs the file-change history of a Claude Code session from its JSONL transcript, one scenario at a time. **S12 (`s12-write-conv-only-rewrite`)** is the sixth scenario in the rewind family (S7–S23): the session writes `scenario12.py`(`add`)+`test_scenario12.py`, accepts, does a **conversation-only** rewind back to the original prompt (files stay on disk — spec 37 / S10), then on the new branch **Edits** both files to add `multiply` (it Reads then Edits — it never re-Writes), then exits. The goal of this slice is to make `reconstruction_cli` reconstruct that correctly — the surviving working tree is the **edited** files (add+multiply), with each file's base revision **seeded from the file-history backup** because its creating Write lives on the abandoned conversation branch — and to LOCK it with tests + a new spec. **Unlike S9/S10/S11 (no-op characterization slices), S12 REQUIRES a real `src/` change: the current engine CRASHES on the S12 transcript.**

## Current State
**S12 is PLANNED, not implemented.** The plan (`plans/s12/s12-reconstruction-plan.md`) is complete, follows the S10/S11 plan structure (adapted for a real RED→GREEN fix), and was written against verified ground truth (real-transcript CLI crash reproduction, full pipeline source review, JSONL topology/snapshot extraction, and the on-disk backup blob contents). Nothing in `src/` or `tests/` has been touched.

Baseline verified just now at HEAD `6a47c39`:
- `npm test` → **129 pass, 0 fail** (per S11's final count; not re-run this session — confirm before starting).
- The current engine **CRASHES** on S12: `npx tsx src/reconstruction_cli.ts <S12.jsonl>` → `TypeError: Cannot read properties of undefined (reading 'values')` at `src/reconstruction_replay_edit.ts:112`. This is WHY the slice adds production code (the first rewind-family slice that does).

## What Remains
Execute the plan with `/jot:implement` (it maintains the implementation-notes log). In order:
1. **Get user approval of the plan's 5 locked decisions** (top of the plan) — especially **decision 3** (the rewound-branch choice: DEFAULT preserves Branch A as one rewound branch like S11; the flagged ALTERNATIVE is zero rewound branches). Then start Task 1.
2. **Task 1 — fix the crash (RED→GREEN), all literal code in the plan:**
   - 1a. RED→GREEN: add 3 unit tests for `seedEditBaseFromBackup` to `tests/reconstruction_sidecar.test.ts`, then implement `seedEditBaseFromBackup` + private `findBackupAtOrBefore` in `src/reconstruction_sidecar.ts` (Source change 1).
   - 1b. GREEN: wire the seed into `reconstructFileOver` (`src/reconstruction_branches.ts:46`, after `fillRedirectContent`) — Source change 2 (one line + extend the import).
   - 1c. RED→GREEN: add a guard test to a NEW `tests/reconstruction_replay_edit.test.ts`, then make `insertHunkAdditions`'s context-line branch total in `src/reconstruction_replay_edit.ts` (Source change 3).
   - Verify gate: full suite green (incl. all S1–S11 unchanged), tsc clean, no file >250 lines.
3. **Task 2 — real-transcript engine lock:** add `S12_JSONL` to `tests/fixtures.ts` (absolute-Desktop path, given in plan), then add `tests/reconstruction_engine_s12.test.ts` (3 tests, in-memory `S12_BACKUPS` reader per the S5 pattern; literal code in plan). RED before Task 1's fix, GREEN after. **Read the two branch-tip uuids off the fixed engine and transcribe them into the two commented assertions — do NOT guess them.**
4. **Task 3 — CLI regression lock + docs:** new file `tests/reconstruction_cli_s12.test.ts` (4 tests on the S11 model, or 3 on the S10 model if the user picked decision-3's alternative). Docs: **spec 39** in `plans/reconstruction-engine-design.md`; prepend an S12 entry to `plans/implementation-notes-api-from-scenarios.md`; flip `plans/roadmap.md` `[ ] S12 ->` to `[x]`.
5. **Stop and report; commit only after the user approves.** Commit `plans/s12/` + the src/test/doc changes together (suggested message `Implemented S12 handling`).

## Key Files
- `plans/s12/s12-reconstruction-plan.md` — THE plan to execute (verified ground truth, the 3 literal source changes, snapshot/topology/changeId/backup tables, 5 locked decisions, literal test bodies, the RED-phase note). Read first.
- `plans/handoff-api-from-scenarios-20260623-1415.md` — the S11 handoff (predecessor; explains the rewind-family no-op pattern S12 breaks from) and `plans/s11/s11-reconstruction-plan.md` (its Risks section explicitly named S12's "rewrite that EDITS a kept file" as a deferred future slice).
- `src/reconstruction_sidecar.ts` (117) — add `seedEditBaseFromBackup` (exported) + `findBackupAtOrBefore` (private). Reuses the existing private `findCwd`/`buildBackupTimeline`/`BackupPoint` and the `BackupReader` type. The existing `findBackupAfter` selects the WRONG backup for an edit (the result, not the base) — do not reuse it; the seed needs at-or-before.
- `src/reconstruction_branches.ts` (121) — `reconstructFileOver` pipeline (extract → lineage filter → seedCopyEvents → fillRedirectContent → **insert seed here** → replayEvents). One new line + import.
- `src/reconstruction_replay_edit.ts` (169) — `insertHunkAdditions` crashes at line 112; make its context-line branch total (Source change 3).
- `src/reconstruction_engine.ts` (229, UNCHANGED) — `WriteEvent`/`EditEvent`/`FileRevision` types (the synthetic seed reuses `WriteEvent`); `reconstructBranches`/`reconstructAll` drive the surviving reconstruction where the crash occurs.
- `tests/reconstruction_engine_s5.test.ts` — the model for `reconstruction_engine_s12.test.ts` (the existing engine test that passes an in-memory `BackupReader`); `tests/reconstruction_cli_s11.test.ts` — the model for the new `_s12` CLI file; `tests/reconstruction_sidecar.test.ts` (76) — reuse its snapshot/reader builders for Task 1a; `tests/reconstruction_replay_edit.test.ts` — does NOT exist, create it (Task 1c).
- S12 JSONL (clean-room input, read-only): worktree `scenarios/executed/s12-write-conv-only-rewrite/e320b4f6-c7ec-4084-90b9-44ca935d7577.jsonl`; the fixture uses the Desktop equivalent (140 records).

## Context the Next Agent Won't Have
- **This is a REAL FIX, not a no-op — and that is the whole point.** S9/S10/S11 were characterization-only slices (engine already correct). S12 is the FIRST rewind-family slice where the engine is wrong: it throws. Do NOT treat the new tests as "expected green on arrival" — Task 1a/1c and Task 2 are genuinely RED on the current `src/` and turn GREEN only after the three source changes. (This inverts the discipline note in the S9/S10/S11 plans.)
- **Root cause (verified end-to-end):** a conversation-only rewind keeps the abandoned branch's files on disk, but `selectBranchRecords` excludes that branch's Write events from the surviving branch's record set (they are off the surviving head's ancestor chain). So the surviving file's lineage is `[EditEvent]` with no creating Write → `applyEdit` runs against an empty base → `insertHunkAdditions` indexes `workingLines[0]` of `[]` → crash. The fix recovers the missing base content from the file-history backup the abandoned branch left (`43c1313ce6fd5f24@v2` for scenario12.py, `06083fd98836d88e@v2` for the test) and prepends it as a synthetic Write.
- **Why the backup must be selected AT-OR-BEFORE the edit (not after):** the `@v2` backup is the `add` base the edit was diffed against (snapshotted 16:09:52, before the edit at 16:10:31); `@v3` is the edit's RESULT (16:10:43) and is reconstructed from the edit, never read. The existing `findBackupAfter` would wrongly pick `@v3`. Seeding the EXACT `@v2` content guarantees the edit's `structuredPatch` hunks align (it is byte-identical to what Claude diffed against — verified: `@v2` = `"def add(a, b):\n    return a + b\n"`).
- **The engine tests MUST pass a reader; S10/S11's did not.** S12's surviving content cannot be reconstructed without the sidecar (the `add` base lives only in the backup). Use an in-memory `BackupReader` (the S5 pattern) seeded with the two `@v2` blobs — exact strings are in the plan. The CLI tests (Task 3) instead use `runCli`'s real on-disk reader, which resolves `~/.claude/file-history/e320b4f6-c7ec-4084-90b9-44ca935d7577/` (the blobs are present on this machine; verified).
- **The defensive guard (Source change 3) changes NO S1–S11 output.** Their edits always follow a Write on the same branch, so the working base is never empty and the new `carried === undefined` branch never executes. It only converts the would-be crash (un-seedable edit) into a best-effort genesis reconstruction. Confirm zero regressions via the full-suite run.
- **Decision 3 is a genuine modelling choice — get the user's call.** DEFAULT: Branch A (the abandoned `add` Write) is preserved as ONE rewound branch (the S7/S8/S11 shape; `buildRewoundBranchHistory` produces it with only the seed fix — no extra logic; `## surviving` + `## rewound` headers). ALTERNATIVE: zero rewound branches (argue the conv-only rewind "absorbed" Branch A's bytes into the surviving base, so render a plain list like S10) — this needs new absorbed-vs-discarded detection and is recommended OUT of scope. The CLI-test count (4 vs 3) and the design-doc spec wording depend on this.
- **Verified ground truth (in the plan, do not re-derive):** changeIds — Write add `toolu_015zSRxJ93FV3tpqoy4kZ3AR`, Write test `toolu_018wtDuedtHLmqtYGy71vVdC`, Edit +multiply `toolu_01NjGUyNRPyhZYw4Ws1HtjYE`, Edit test `toolu_0161dgZLqA2Z6m5bkhabofUx`; fork/rewind point `94000895-217c-4fc7-93f1-d24afe2f46f6` (both "Write a file…" prompts share it); session `e320b4f6-c7ec-4084-90b9-44ca935d7577`.
- **Harness quirks (carried from S8–S11):** `tsx` does NOT type-check — `npx tsc --noEmit` is the real type gate (`noImplicitAny`/`noUnusedLocals` make untyped helpers / stray imports hard errors; type new engine-test helpers `FileHistory[]`). The CLI prints a `Debugger listening…` banner on stderr — run with `2>/dev/null`; CLI tests use `runCli` directly (no banner). A 250-line-per-file hard cap is enforced by a PostToolUse hook AND the verify-gate filesize check — this is why the S12 CLI tests go in a new file (`reconstruction_cli.test.ts` is at the cap). Ignore stale in-batch PostToolBatch/PostToolUse hook failures (they run tests mid-edit, before tsx reloads); a manually-run `npm test` is authoritative. Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` beyond the `S12_JSONL` fixture path. A background `.plate` agent may auto-commit periodically; expect partial commits and reconcile.
- **Coding requirements** (`plans/coding-requirements.md`, mandatory): no primitive domain values (`Uuid`/`Date`/`Path`), one canonical wire vocabulary in `src/structures/vocabulary.ts`, DRY helpers, enum-member discriminant comparisons (`event.kind !== EventKind.edit`, never `"edit"`), verb-named functions. The literal code in the plan conforms.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # baseline 129; grows ≈+10 across the 3 tasks (3 sidecar + 1 guard + 3 engine + ~4 CLI); ZERO failures incl. all S1–S11
npx tsc --noEmit         # No errors found (the REAL type gate; tsx does not type-check)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
Reproduce the crash BEFORE the fix (proves the RED state), then confirm it is fixed AFTER:
```
P="scenarios/executed/s12-write-conv-only-rewrite/e320b4f6-c7ec-4084-90b9-44ca935d7577.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null
# BEFORE: empty output + exit 1 (crash). AFTER (decision 3 default):
#   ## surviving  tip #<Branch B>  -> scenario12.py (add base then +multiply edit), test_scenario12.py (base then +multiply edit)
#   ## rewound    tip #<Branch A>  (rewind @ #94000895)  -> scenario12.py #015zSRxJ (add only), test_scenario12.py #018wtDue (add only)
npx tsx src/reconstruction_cli.ts "$P" --surviving 2>/dev/null      # only the edited (add+multiply) files
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null  # surviving + rewound (rewind @ #94000895)
npx tsx src/reconstruction_cli.ts "$P" --diff 2>/dev/null           # surviving scenario12.py shows the +multiply hunk on the add base
# Sanity (unchanged): S11 default = surviving #d03f0078 + 1 rewound #a7ceb7ae; S10 --list-branches surviving #bfd9d428 (no rewound); S1 default = plain list, 0 "## " headers.
```
