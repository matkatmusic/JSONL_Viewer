# Handoff: S4 (`s4-overwrite-file`) reconstruction plan is written and ready — execute it task-by-task with strict RED→GREEN TDD; nothing implemented yet
Conversation name: api-from-scenarios — S4 overwrite-file (plan authoring)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/9fd48ef3-2bf4-4536-b88c-673cde50afd7.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s4-reconstruction-plan.md (the plan to execute — 6 TDD tasks)

## Branch
`api-from-scenarios` based on `master`. HEAD = `39627cb reconstruction engine, built from S1's fixture`. The S2 slice, the S3 slice, **and** this S4 plan are all **uncommitted** in the working tree. No `-plate` branch exists.

## Goal
Reconstruct the file-change history of a Claude Code session from its JSONL transcript, one scenario at a time, in clean-room TypeScript. This session authored the **S4 implementation plan** (`plans/s4-reconstruction-plan.md`). The S4 scenario (`s4-overwrite-file`) adds exactly one new engine capability: **overwrite** — a second `Write` to a file that already exists, replacing all of its content (distinct from a create and from an Edit splice). The next agent's job is to **implement that plan**, not re-plan it.

## Current State
- **Plan complete and self-reviewed.** `plans/s4-reconstruction-plan.md` is a How-ordered, 6-task TDD plan written in the style of `plans/s3-reconstruction-plan.md`. It contains: the verified S4 ground truth (4 write events with real `toolu_` changeIds + assistant-record timestamps; the interleaved `ls`/`pytest` Bash calls that correctly yield no events), the expected reconstruction shapes for both files, the locked default list format, and per-task RED tests + GREEN code snippets conforming to `plans/coding-requirements.md` and `~/.claude/guides/coding-standards.md`.
- **Ground truth was extracted from the real transcript and verified against the post-S3 code.** Key finding the plan rests on: **the engine already reconstructs the overwrite's content** — `replayEvents` pushes one `writeRevision` per write event and `writeRevision` builds genesis lines from `event.content`, so a second write to a path already yields a second full-content genesis revision. S4's work is therefore narrow: mark that second revision as an `overwrite` (a distinct kind + label + diff header) and prove it end-to-end. Extraction needs **no** change (it already emits both writes and ignores `ls`/`pytest`).
- **No S4 code written yet.** The only S4 artifact is the plan file (`plans/s4-reconstruction-plan.md`). The S2 and S3 slices remain implemented and green but uncommitted (11 modified + new files — see `git status`; 928 insertions); S4 builds directly on S3.
- **Verify gate is currently green for S1+S2+S3** (per the S3 implementation handoff `-1903`): `npm test` → 65 pass / 0 fail, `npx tsc --noEmit` clean, `filesize_check.py` exit 0. Re-run before starting (see How to Verify).

## What Remains
1. **Read `plans/s4-reconstruction-plan.md` in full**, then implement its 6 tasks **in order**, each strict RED→GREEN, running the Verify gate after every task before starting the next:
   - **Task 1** — Add `EventKind.overwrite` (`vocabulary.ts`); in `reconstruction_replay.ts` make `writeRevision(event, replacesPresent)` set kind by presence and add `fileIsPresent(revisions)` (present = last revision exists and is not a delete); the write branch of `appendRevisionsForEvent` passes `fileIsPresent(revisions)`. Replay unit test (two writes to one path → create then overwrite).
   - **Task 2** — Add `S4_JSONL` to `tests/fixtures.ts`; prove extraction finds four writes (two per file), `bashEventFrom` ignores `ls`/`pytest`. **No extraction code change.**
   - **Task 3** — Prove `reconstructFile`/`reconstructAll(S4)` return two independent histories, each create→overwrite (every overwrite line genesis). **No engine code change expected** (locks the decision, like S3 Task 4).
   - **Task 4** — **Split the default list view into `src/reconstruction_render_list.ts`** (move `renderHistoryList` + its helpers `baseName`/`shortChangeId`/`shortTime`/`entryLabel`/`entryDelta`/`entryDetail`/`renderEntry`/`originalPathOf`/`copyOriginOf`/`renderHistoryBlock`), keep `renderVerbose`/`renderDiff` in `reconstruction_render.ts`, relocate the one list-view test (`test_list_shows_copy_entry_with_provenance`) to `tests/reconstruction_render_list.test.ts`, and repoint the `renderHistoryList` import in `reconstruction_cli.ts`. **Pure refactor, no behavior change. Required because `reconstruction_render.ts` is at 249/250 lines** — Task 5 must add to it. Prune the now-unused `Uuid` import from `reconstruction_render.ts` (noUnusedLocals is a hard `tsc` error).
   - **Task 5** — Render the overwrite entry: add an `overwrite` branch to `entryLabel` (→ `"overwrite"`, in `reconstruction_render_list.ts`) and an `overwrite` branch to `diffBlock` (→ `@@ overwritten @ … @@` then full remove-all/add-all, in `reconstruction_render.ts`). Verbose needs no change (overwrite falls to the default full-state body). Render unit tests.
   - **Task 6** — CLI default-view test on the real S4 transcript (no CLI logic change) + update `reconstruction-engine-design.md` (S4 specs after S3's 15–19, the 3 locked decisions, add `reconstruction_render_list.ts` to Code layout), `implementation-notes-api-from-scenarios.md` (dated S4 entry), `roadmap.md` (mark S4 done).
2. **Run the end-to-end check** (last block of the plan) against the real S4 transcript to confirm the locked default-view format.
3. **Stop and report; commit only after the user approves.** A large amount of S2 and S3 work is *also* still uncommitted — **clarify with the user whether to commit S2/S3/S4 together or separately**, and what to do with stray untracked files (`src/Plan_Impl_template.md`, `plans/.gitignore`) unrelated to the slices, before committing anything.

## Key Files
- `plans/s4-reconstruction-plan.md` — THE plan to execute (verified ground truth, expected shapes, 6 TDD tasks with code and locked decisions).
- `plans/s3-reconstruction-plan.md` / `plans/s2-reconstruction-plan.md` — prior slices' plans; the style template and worked examples of the same patterns (first-class kinds, paired tests, render-cap split).
- `plans/reconstruction-engine-design.md` — the agreed model + specs 1–19 (S3 = 15–19); the per-line model (`FileRevision`/`LineEntry`, `oldLineNum` back-pointers); add S4 specs in Task 6.
- `plans/coding-requirements.md` — mandatory project coding style (domain types `Path`/`Uuid`, single wire-vocabulary home, DRY helpers, enum-member compares, verb-named functions).
- `src/structures/vocabulary.ts` — the `EventKind` enum (now `write`/`delete`/`edit`/`rename`/`copy`; add `overwrite`).
- `src/reconstruction_replay.ts` — events → revisions; `writeRevision`, `appendRevisionsForEvent` (the only mechanics change in S4).
- `src/reconstruction_render.ts` — `renderVerbose`/`renderDiff` (+ the list view to be moved out); **249/250 lines, at the cap**.
- `src/reconstruction_cli.ts` — repoint the `renderHistoryList` import after the Task 4 split.
- `src/reconstruction_engine.ts` / `src/reconstruction_extract.ts` / `src/reconstruction_lineage.ts` — read for context; S4 expects **no** changes to them.
- `tests/reconstruction_{replay,extract,engine,render,cli}.test.ts` + new `tests/reconstruction_render_list.test.ts`; helpers `loadRecords` (`tests/utilities.ts`), `S1/S2/S3/S4_JSONL` (`tests/fixtures.ts`).

## Context the Next Agent Won't Have
- **The three LOCKED S4 decisions (recorded in the plan intro; drive output shape — confirm with the user, who may adjust them before coding):** (1) an overwrite is a **fresh full-content revision** — every line genesis (`oldLineNum -1`), content from the Write's `content`, NOT an Edit-style splice (honours "Rewrite completely. Replace everything"; the diff is a wholesale remove-all/add-all). (2) overwrite is detected **at replay time by file presence**, not at extraction — the overwrite Write's `structuredPatch`/`originalFile` are deliberately **not** read (clean-room; consistent with S3's rejection of `originalFile`, project note `originalfile-not-always-populated`). (3) overwrite is its own **revision kind**, not a new event type — there is no `OverwriteEvent`; `WriteEvent` covers both, and a write-after-delete (M4) stays a `create` because the file is absent.
- **The plan is deliberately a small slice.** Three of its six tasks (2, 3, and the CLI half of 6) are expected to pass with **no production-code change** beyond Task 1's replay tweak and Task 5's two render branches — they exist to lock behavior with tests (the same shape as S3's Task 4). Do not invent extraction or lineage changes; if a "no-change" task fails, the bug is in Task 1's replay logic, not in extraction.
- **Why Task 4 (the split) comes before Task 5 (the label):** `reconstruction_render.ts` is at 249/250 lines, so *any* net addition trips `filesize_check.py`. The split was pre-agreed in the S3 handoff (`-1903`). **Split, never condense** — never single-line expressions or strip comments to save lines (the user's standing "split over condense" preference). After the split, `reconstruction_render.ts` drops to ≈133 lines.
- **`entryLabel` currently falls through to `return "delete"`** — so an `overwrite`-kind revision is mislabelled `delete` in the list view until Task 5 adds its branch. That is the RED for the list-label test.
- **Verified event times are the assistant-record timestamps** (`16:16:40/41/55/56`), not the slightly different user/result-record times an earlier analysis showed. The engine uses `record.timestamp` of the record holding the tool_use block. The plan's ground-truth table already uses the correct values.
- **Harness quirks:** `PostToolBatch`/`PostToolUse` Stop hooks emit STALE test-failure / 250-line warnings for a file written in the same batch as its test — IGNORE them; the explicit `npm test` is authoritative (expected during the RED phase). `tsx` does NOT type-check (use `npx tsc --noEmit`) and prints `Debugger listening…` to stderr (append `2>/dev/null` for clean CLI output). `noUnusedLocals`/`noUnusedParameters` make a stray import a hard `tsc` error (codes 6133/6196) — prune precisely when splitting in Task 4. Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` — read-only ground truth only.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # node --import tsx --test tests/*.test.ts → 65 (S1+S2+S3) + growing S4 specs pass, 0 fail
npx tsc --noEmit         # expect: No errors found
python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py src/reconstruction_*.ts   # exit 0
# End-to-end (default list view) against the real S4 transcript, AFTER Task 6:
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s4-overwrite-file/58f8c26c-48d5-4e8f-953c-265005a6ee73.jsonl" 2>/dev/null
# Expect two files; s4_overwrite.py with a create entry (#01RMyyRt) then an overwrite entry
# (#012vJCJs); tests/test_s4_overwrite.py likewise (#017kvbv4 then #01H4X6UR). Add --diff to see
# each overwrite as an "overwritten" block (all version1 lines removed, all version2 lines added).
```
