# Handoff: S3 (`s3-copy-file`) reconstruction plan is written and ready — execute it task-by-task with strict RED→GREEN TDD; nothing implemented yet
Conversation name: api-from-scenarios — S3 copy-file (plan authoring)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/7ec2b369-ead6-42ef-9ad9-97ee8c1ffd99.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s3-reconstruction-plan.md (the plan to execute — 6 TDD tasks)

## Branch
`api-from-scenarios` based on `master`. HEAD = `39627cb reconstruction engine, built from S1's fixture`. The S2 slice and this S3 plan are **uncommitted** in the working tree. No `-plate` branch exists.

## Goal
Reconstruct the file-change history of a Claude Code session from its JSONL transcript, one scenario at a time, in clean-room TypeScript. This session authored the **S3 implementation plan** (`plans/s3-reconstruction-plan.md`). The S3 scenario (`s3-copy-file`) adds exactly one new engine capability: **copy (`cp`)** — a file copied to a new path, where the copy's genesis content is the source file's reconstructed content as of the copy time, and the source file lives on as its own independent history. The next agent's job is to **implement that plan**, not re-plan it.

## Current State
- **Plan complete and self-reviewed.** `plans/s3-reconstruction-plan.md` is a How-ordered, 6-task TDD plan written in the style of `plans/s2-reconstruction-plan.md`. It contains: the exact S3 ground truth (4 mutating events with timestamps + changeIds, the `cp` command form, the Edit's `structuredPatch` hunk), the expected reconstruction shapes for all three files, and per-task RED tests + GREEN code snippets that conform to `plans/coding-requirements.md` and `~/.claude/guides/coding-standards.md`.
- **Ground truth was extracted from the real transcript** (`…/executed/s3-copy-file/ac6edd6f-cc4e-4423-87f9-468530849db5.jsonl`) and verified: the Edit on `s3_copy.py` (`def hello():`→`def greet():`) carries a real `structuredPatch` on its `toolUseResult` (so the existing S2 edit-splice handles it untouched); the `cp` result carries **no** content (so the copy must be seeded from the source); all four timestamps are strictly increasing.
- **No S3 code has been written yet.** The only S3 artifact is the plan file. The S2 slice (Edit splice + rename lineage + paired changeId) remains implemented and green but uncommitted (9 modified + 6 new files — see `git status`); S3 builds directly on it.
- **Verify gate is currently green for S1+S2** (per the prior S2 handoff): `npm test` ~55 pass / 0 fail, `npx tsc --noEmit` clean, `filesize_check.py` exit 0. Re-run before starting (see How to Verify).

## What Remains
1. **Read `plans/s3-reconstruction-plan.md` in full**, then implement its 6 tasks **in order**, each strict RED→GREEN, running the Verify gate after every task before starting the next:
   - **Task 1** — Extract the `cp` as a copy event: add `EventKind.copy` (`vocabulary.ts`); add `CopyInfo`/`CopyEvent` types + `copy?` on `FileRevision` + extend `FileEvent` union (`reconstruction_engine.ts`); add `parseCpPaths` + a `cp` branch in `bashEventFrom` (`reconstruction_extract.ts`); teach `contentPathOf` about copy, leave `buildRenameChain` unchanged (`reconstruction_lineage.ts`); add `S3_JSONL` to `tests/fixtures.ts`.
   - **Task 2** — Replay a copy as a first-class genesis entry: add `copyRevision` + a `copy` branch in `appendRevisionsForEvent` (`reconstruction_replay.ts`).
   - **Task 3** — Seed the copy from the source at copy time + single-file reconstruction: add the cycle-guarded recursion (`reconstructLineage`) and `seedCopyEvents`/`seedOneCopy`/`lastRevisionAtOrBefore`/`linesTextOf` (`reconstruction_engine.ts`).
   - **Task 4** — `reconstructAll(S3)` returns three independent histories (copy does **not** collapse the source); expected to pass with no new code (locks the decision).
   - **Task 5** — Render the copy entry (verbose/diff/list): rename `renderRenameArrow`→`renderPathArrow` and update **both** rename callers; add copy handling to `renderRevisionState`, `diffBlock`, `entryLabel`, `entryDetail`, `renderHistoryBlock` + `copyOriginOf` (`reconstruction_render.ts`). Watch the 250-line cap — split the list view into `reconstruction_render_list.ts` if it crosses (instructions in the plan).
   - **Task 6** — CLI default-view test against the real S3 transcript (no CLI logic change expected) + update `reconstruction-engine-design.md`, `implementation-notes-api-from-scenarios.md`, and `roadmap.md`.
2. **Run the end-to-end check** (last block of the plan) against the real S3 transcript to confirm the locked default-view format.
3. **Stop and report; commit only after the user approves.** A large amount of S2 work is also still uncommitted — clarify with the user whether to commit S2 and S3 together or separately before committing anything.

## Key Files
- `plans/s3-reconstruction-plan.md` — THE plan to execute (ground truth, expected shapes, 6 TDD tasks with code).
- `plans/s2-reconstruction-plan.md` — the prior slice's plan; the style template and a worked example of the same patterns.
- `plans/reconstruction-engine-design.md` — the agreed model + specs 1–14; the per-line model (`FileRevision`/`LineEntry`, `oldLineNum` back-pointers); update with S3 specs in Task 6.
- `plans/coding-requirements.md` — mandatory project coding style (domain types `Path`/`Uuid`, single wire-vocabulary home, DRY helpers, enum-member compares, verb-named functions).
- `src/structures/vocabulary.ts` — the `EventKind` enum (add `copy`).
- `src/reconstruction_engine.ts` — model types + public `reconstructFile`/`reconstructAll`/`findDeletedTarget` (add copy types + seed recursion).
- `src/reconstruction_extract.ts` — records → `FileEvent`s (add `cp` parsing).
- `src/reconstruction_replay.ts` — events → revisions (add `copyRevision`).
- `src/reconstruction_lineage.ts` — rename/copy path resolution (teach `contentPathOf` about copy).
- `src/reconstruction_render.ts` — `renderVerbose`/`renderDiff`/`renderHistoryList` (add copy rendering).
- `src/structures/tool-results.ts` — `StructuredPatchHunk`, `EditResult`, `indexToolUseNamesById` (reused as-is; the Edit path is untouched).
- `tests/reconstruction_{engine,extract,replay,lineage,render,cli}.test.ts` — `node:test`; helpers `loadRecords` (`tests/utilities.ts`), `S1_JSONL`/`S2_JSONL`/`S3_JSONL` (`tests/fixtures.ts`).

## Context the Next Agent Won't Have
- **The three LOCKED S3 decisions (drive output shape; recorded in the plan's intro):** (1) a copy yields **two independent histories** — the source is NOT collapsed into the destination (the opposite of `mv`); so `cp` is deliberately kept **out of the rename chain** and `reconstructAll(S3)` returns **three** histories. (2) a copy is a **first-class genesis entry** (kind `copy`, all lines born at the `cp` time, records `from`/`to`). (3) a copy's genesis content is the **reconstructed source state as of the copy time**, NOT the destination Edit's `originalFile` field. These mirror S2's locked decisions; if the user objects to any, the plan's tasks must be adjusted before coding.
- **Why not `originalFile`:** the s3 Edit's `EditResult.originalFile` IS present (`"def hello():\n    print(\"hello\")\n"`) and equals the copy's seed, but it was deliberately rejected — `originalFile` is unreliable across transcripts (project note `originalfile-not-always-populated`) and would couple a file's genesis to a *later* edit. Reconstructing the source up to the copy time is the clean-room, evidence-based path and generalizes to a source edited after the copy.
- **The Edit path needs zero changes.** The Edit input was a plain `old_string`/`new_string` replace, but its `toolUseResult` still carries a full `structuredPatch` (hunk `oldStart:1 oldLines:2 newStart:1 newLines:2`, lines `["-def hello():", "+def greet():", "     print(\"hello\")"]`). The existing S2 `indexEditHunksByToolUseId` + splice handle it. Do not modify the edit machinery.
- **The `Read` of `s3_copy.py` (between cp and Edit) is intentionally ignored** — reads/observations (`values[]` multi-entry history) are a deferred capability. Extraction does not model `Read`.
- **The seed recursion has a cycle guard** (`resolving: Set<string>` of destination paths) so a hypothetical `cp a b; cp b a` cannot recurse forever; S3 itself never cycles. Keep it.
- **No runtime import cycle by design:** `reconstruction_engine.ts` owns the model types and imports the mechanics modules (extract/replay/lineage) as *values*; those import the types back *type-only* (erased). The seed recursion lives in the engine for this reason (it needs `reconstructFile` as a value). Keep it that way.
- **Edit-diff/render lines keep the `+ `/`- ` (space) prefix** (S1/S2 convention); the render tests assert `+ def hello():` (with the space).
- **Harness quirks:** `PostToolBatch`/`PostToolUse` hooks emit STALE failures (test results, 250-line warnings) for a file written in the same batch as its test — IGNORE them; the explicit `npm test` is authoritative. `tsx` does NOT type-check (use `npx tsc --noEmit`) and prints `Debugger listening…` to stderr (append `2>/dev/null` for clean CLI output). Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` — read-only ground truth only.
- **File-size cap is 250 lines per module.** `reconstruction_render.ts` (~220) and `reconstruction_replay.ts` (~216) are closest; if a copy addition crosses the cap, **split** (per the plan's exact instructions), never condense comments or single-line expressions — this matches the user's "split over condense" preference and the paired-test convention.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # node --import tsx --test tests/*.test.ts → all S1+S2 (and growing S3) specs pass, 0 fail
npx tsc --noEmit         # expect: No errors found
python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py src/reconstruction_*.ts   # exit 0
# End-to-end (default list view) against the real S3 transcript, AFTER Task 6:
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s3-copy-file/ac6edd6f-cc4e-4423-87f9-468530849db5.jsonl" 2>/dev/null
# Expect 3 files; s3_source.py (create, 2 lines); tests/test_s3_source.py (create, 6 lines);
# s3_copy.py headed "(copy of s3_source.py)" with a first-class copy entry (2 lines, copied from
# s3_source.py) then two edit entries sharing #012rscwP. Add --verbose / --diff for line state.
```
