# Handoff: Implement Scenario S24 (`s24-script-rename-functions`) — characterization/regression LOCK, NO src change
Conversation name: plan s24
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/6d57705d-cef3-4796-9d68-e7f16b894d00.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s24/s24-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `3d3ac15 m2-m7 implemented` (S1–S23 + m1–m7 all committed; clean baseline of 337 tests).

## Goal
Lock the engine's **already-correct** reconstruction of Scenario S24 — a function module rewritten by an
external `python3` script run through the Bash tool (NOT via Edit/Write). The engine recovers the rename
from the harness-injected `edited_text_file` **beacon** attachment via existing S15 machinery, so S24
needs **zero `src/` change**. Add a fixture + 10 lock tests + 3 doc edits, taking the suite **337 → 347**.

## Current State
- **Planning complete.** Full implementation plan written to `plans/s24/s24-reconstruction-plan.md`.
- **Ground truth VERIFIED LIVE** against the engine at HEAD `3d3ac15`:
  - `order_utils.py` reconstructs as **6 revisions** `[write, edit, edit, userEdit, edit, edit]`.
  - rev3 = `userEdit`, changeId `859347d2-3413-439f-ba38-3ab7ee61474c` (the `edited_text_file` attachment
    uuid), 187 lines, **fully renamed**. rev3 len = 5063; final rev5 len = **6478**, **234 lines**.
  - Final text is **byte-identical** to `scenarios/executed/s24-script-rename-functions/order_utils.py`.
  - **READER-INDEPENDENT** (with vs without `BackupReader` → identical history; content comes from the
    in-JSONL attachment snippet, not backups).
  - **LINEAR**: one surviving branch (tip `#fba814f7`), `branched.rewound.length === 0`, 3 files.
  - The two opaque `python3 rename_funcs.py` Bash runs produce **0 file events**.
- **Baseline confirmed**: `npm test` = 337 pass / 0 fail; `npx tsc --noEmit` clean.
- **No implementation started.** No fixture, no test files, no doc edits yet.
- Working tree: `plans/s24/` is new (untracked). `src/Plan_Impl_template.md` shows a pre-existing
  unrelated modification — **do NOT stage it** with the S24 commit.

## What Remains
Execute the plan (`plans/s24/s24-reconstruction-plan.md`) in order:

1. **Task 1 — Baseline & fixture.** Confirm `npm test` = 337 / `tsc` clean. Append `S24_JSONL` to
   `tests/fixtures.ts` after `M7_JSONL` (Desktop path given in plan §2.1 / §4.2).
2. **Task 2 — Engine lock** (`tests/reconstruction_engine_s24.test.ts`, 5 tests, **reader-free**, mirrors
   `reconstruction_engine_s22.test.ts`). Capture the `S24_FINAL` 234-line literal via the `node -e` command
   in plan §5. Run the 3 RED→GREEN liveness probes (changeId, poison-reader, final literal) and record them.
3. **Task 3 — CLI lock** (`tests/reconstruction_cli_s24.test.ts`, 5 tests, mirrors
   `reconstruction_cli_m7.test.ts`). Assert against the exact CLI byte strings in plan §2.7. Run the
   liveness probe and record it.
4. **Task 4 — Docs (3 edits):** add a NEW `S24` line to `plans/roadmap.md` (after the M7 line — the
   S-series resumes; there is no placeholder to flip); PREPEND a top entry to
   `plans/implementation-notes-api-from-scenarios.md`; APPEND an S24 note to
   `plans/reconstruction-engine-design.md` (after the m7 note, ~line 320). Cite the HAS-BEACON rule.
5. **Task 5 — Verify:** `npm test` = **347 / 0**; `npx tsc --noEmit` clean; **`git diff src/` EMPTY**.
   If any test needs a `src/` change, STOP and escalate (ground truth drifted).
6. **Task 6 — Commit (ONLY on explicit user approval):** stage exactly the 6 files listed in plan §9
   (never `git add -A`; do not stage `src/Plan_Impl_template.md`). Message: `Implemented S24 handling`.
7. **create handoff** — write a COMPLETION handoff via `/jot:handoff-prompt` into `plans/s24/`: record
   347 green / tsc clean / NO src change; the crux locks proven RED→GREEN; the HAS-BEACON framing; and
   whether any next scenario exists (check `scenarios/` for `s25-*`/`m8-*`). **S24 appears to be the last
   currently-defined scenario** — if so, state the series is complete and arm NO downstream monitor.

## Key Files
- `plans/s24/s24-reconstruction-plan.md` — THE plan; read it fully first (has exact assertions, byte
  strings, and the `S24_FINAL` capture command).
- `tests/fixtures.ts` — add `S24_JSONL` after `M7_JSONL` (line ~92).
- `tests/reconstruction_engine_s22.test.ts` — template for the reader-free engine lock.
- `tests/reconstruction_cli_m7.test.ts` / `reconstruction_cli_m3.test.ts` — templates for the CLI lock.
- `src/reconstruction_user_edit.ts` (`userEditEventFrom`/`stripLineNumberPrefixes`),
  `src/reconstruction_replay.ts` (`userEditChangesContent`/`userEditRevision`),
  `src/reconstruction_extract.ts` (`collectEventsFromRecord`/`extractFileEvents`) — the already-correct
  code paths to CITE in impl-notes (do NOT modify).
- `scenarios/executed/s24-script-rename-functions/order_utils.py` — the 234-line ground truth (source of
  the `S24_FINAL` literal).
- Fixture transcript: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s24-script-rename-functions/c46c3db9-b5ac-4c20-adf8-9f33caa8359c.jsonl`.

## Context the Next Agent Won't Have
- **S24 is HAS-BEACON, NOT a script-replay scenario.** The sibling RevEng project's APPROVED
  "Script-Execution-as-Authored-Event" work (`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/{spec,plan,tasks}-script-execution-replay.md`)
  builds a forward-validation transform engine — but ONLY for **NO-BEACON** files (no post-script
  observation). Its premise: find the beacon after the script run, rewind observed edits in
  `(T_exec, beacon]` to get the immediate post-script state ("PostScriptBeacon"), then check
  `forward(pre-script) == PostScriptBeacon`. **S24 never reaches that path:** its beacon (the
  `edited_text_file` attachment at 20:12:44.611) lands with **zero intervening edits** before it, so the
  immediate post-script state is *directly observed*. The `api-from-scenarios` engine adopts the beacon
  as the rev3 `user-edit` — no transform, no forward-validation, no `src/` change. Do NOT port the
  RevEng replay feature; that would be over-engineering for a file that already has observed truth.
- **The lone "terse name" false-positive:** `apply_disc` is a *substring* of `apply_discount`. Always
  match the whole-word `def <name>(` headers (the plan's `TERSE_DEFS`/`RENAMED_DEFS` lists), never bare
  substrings — a naive `grep apply_disc` will report a phantom match in renamed content.
- **Reader-independence must be guarded with a POISON reader**, not by comparing two real runs — pass a
  `BackupReader` that returns garbage and assert the output is unchanged (proves the engine never consults
  it for S24). This is the regression guard against a future change that makes S24 spuriously hit backups.
- **`rev3` timestamp == the Bash result time (20:12:44.611Z)**, not the later Read/Edit — the harness
  snapshots the script-changed file as part of the bash result turn. changeId is the *message UUID*
  (`859347d2…`), not a `toolu_` id, because user-edits use `entry.uuid` (per `userEditEventFrom`).
- **Project rule:** one commit per scenario, gated on explicit user approval; never `git add -A` (the tree
  carries shared docs). An unrelated `src/Plan_Impl_template.md` modification is already in the working
  tree — leave it out of the S24 stage.
- This is the **24th** scenario in the same characterization-lock pattern (S15–S23, m1, m4, m7 were all
  no-src-change locks). The pattern is well-established; the plan's test structure is copy-adapt from s22
  (engine) and m7 (CLI).

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
node --import tsx --test tests/reconstruction_engine_s24.test.ts   # 5 green
node --import tsx --test tests/reconstruction_cli_s24.test.ts      # 5 green
npm test            # expect 347 pass / 0 fail
npx tsc --noEmit    # expect: No errors found
git diff --stat src/  # expect EMPTY — S24 adds NO src change
```
