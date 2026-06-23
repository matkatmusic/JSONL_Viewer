# Handoff: S2 slice (Edit splice + rename lineage + paired-changeId) is fully planned and ready to implement — no code written yet
Conversation name: s2 reconstruction — spec & plan
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/17715352-f1da-442f-a848-778d6e26e905.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s2-reconstruction-plan.md  (READ FIRST — full How-ordered TDD task list with code snippets)

## Branch
`api-from-scenarios` based on `master`. HEAD = `39627cb reconstruction engine, built from S1's fixture`. **Working tree clean — no S2 code written yet; this session only produced the plan.**

## Goal
Feed the S2 transcript (`s2-move-file`: Write → Write → Bash `mv` → Edit → Edit) into the existing reconstruction engine and make it reconstruct the full revision history of every file S2 touches. S2 adds three things S1's engine never modeled: in-place `Edit` splices driven by `structuredPatch` hunks, a file **rename** (`mv`) whose history must survive the path change, and the rule that the two revisions of one `-`/`+` Edit share a `changeId`. This is the design doc's deferred specs 10–12.

## Current State
- **S1 slice done, committed, green** (HEAD): `npm test` → 42 pass / 0 fail; `npx tsc --noEmit` clean; `filesize_check.py` clean. Engine split into `reconstruction_engine.ts` (model + extraction + replay), `reconstruction_render.ts` (pure render), `reconstruction_cli.ts` (CLI). `EventKind` enum (`write`, `delete`) lives in `src/structures/vocabulary.ts`.
- **S2 ground-truth fully extracted this session** (two Explore passes over the real JSONL — verbatim values are in the plan file's "Ground truth" table):
  - 5 file-mutating ops, with their tool_use ids (= changeIds): Write `s2_original.py` `01Dwpb8p`; Write `tests/test_s2_original.py` `018s6ZLt`; Bash `mv s2_original.py → s2_moved.py` `012UW4N9`; Edit import-swap on the test file `015b59mN`; Edit add-`goodbye()` on `s2_moved.py` `016L3mk1`.
  - Edit `015b59mN` hunk: `oldStart:1 oldLines:4 newStart:1 newLines:4`, lines `["-from s2_original import hello","+from s2_moved import hello"," "," "," def test_hello(capsys):"]`.
  - Edit `016L3mk1` hunk: `oldStart:1 oldLines:2 newStart:1 newLines:6`, lines `[" def hello():","     print(\"hello\")","+","+","+def goodbye():","+    print(\"goodbye\")"]`.
  - `structuredPatch` lives on the **user record's top-level `toolUseResult`** (an `EditResult`), reached via that record's `tool_result` block's `tool_use_id` — NOT in the `tool_result` content block (that only holds the success string). Write results carry `structuredPatch: []`.
- **The plan was presented twice (ExitPlanMode) and rejected twice**; the user redirected to the planning guide both times, then ran `/handoff-prompt`. The plan was REWRITTEN to the guide's shape (How + In-What-Order, strict red→green TDD, code snippets) — that rewritten version is the repo plan file above. No approval was given to start coding; **the next agent should confirm with the user before implementing, or just execute the plan if told to.**

## What Remains
Execute the 6 ordered tasks in `plans/s2-reconstruction-plan.md` (each is RED test first, then GREEN minimum code; run the Verify gate — `npm test` + `npx tsc --noEmit` + `filesize_check.py` — after every task):
1. **Fold-based replay + `kind` on every revision** (refactor under S1's green tests). Replace `reconstructFile`'s `.map(toRevision)` with a `replayEvents` left-fold + `appendRevisionsForEvent` dispatch; add `kind: EventKind` to `FileRevision`; add `UnsupportedEventKindError` guard; update the literal `FileRevision` fixtures in `reconstruction_render.test.ts` to include `kind`.
2. **Edit extraction + splice → paired removal/addition revisions** (prove on `tests/test_s2_original.py`). Add `EventKind.edit`; `EditEvent`; `indexEditHunksByToolUseId` (read hunks off `toolUseResult`); thread `hunksById` through extraction; implement the splice (`removedOldIndicesOf` / `keepSurvivingLines` / `insertHunkAdditions`) — full code is in the plan. Removal + addition share the Edit's changeId; inserted lines born `-1`; survivors carry `oldLineNum` back-pointers.
3. **Rename extraction + lineage merge + first-class rename entry**. Add `EventKind.rename`; `RenameEvent`/`RenameInfo`; `parseMvPaths`; `bashEventFrom` (rm→delete else mv→rename); `renameRevision` carries prior lines forward; `buildRenameChain`/`resolveFinalPath`/`contentPathOf`/`eventBelongsToLineage` so `reconstructFile` follows the `mv` to the final path.
4. **`reconstructAll(S2)` → 2 lineages** with the full entry shapes (test file: create/edit-rm/edit-add; moved file keyed by `s2_moved.py`: create/rename/edit). Replace `distinctTargets` with `distinctFinalPaths`.
5. **Render rename as a first-class block + `oldLineNum`-driven edit diffs**. `renderVerbose` labels the rename entry (`from → to`); replace `diffBlock` so edits show only their real `+`/`-` lines and the rename shows `@@ renamed A → B @@` with no churn.
6. **Default CLI list view + run on real transcript + docs**. Add pure `renderHistoryList` (+ `shortChangeId`/`shortTime`/per-entry delta) in the render module; CLI calls it for the default view; update `plans/reconstruction-engine-design.md` (mark specs 10–12 done) and `plans/implementation-notes-api-from-scenarios.md` (dated S2 decisions). Then run the end-to-end check in the plan. **Commit only after the user approves.**

Expected final shapes (assert in Task 4) are spelled out in the plan's "Expected reconstruction" section.

## Key Files
- `plans/s2-reconstruction-plan.md` — **the executable plan** (ground truth, expected shapes, 6 TDD tasks with code).
- `plans/reconstruction-engine-design.md` — agreed model (revisions, `oldLineNum`, the two rules, `changeId`); specs 10–12 are S2.
- `plans/implementation-notes-api-from-scenarios.md` — dated decision log to append S2 entries to.
- `src/reconstruction_engine.ts` — model types + extraction + replay (the main file to extend).
- `src/reconstruction_render.ts` — pure render; extend for rename entry + edit diffs.
- `src/reconstruction_cli.ts` — CLI; default-view wiring.
- `src/structures/vocabulary.ts` — `EventKind` (add `edit`, `rename`); all wire enums live here.
- `src/structures/tool-results.ts` — `StructuredPatchHunk`, `EditResult`, `indexToolUseNamesById`, `getToolResultForUserRecord` (reuse for hunk indexing).
- `src/structures/content-blocks.ts` — `getContentBlocks`, `ToolUseBlock`, `BlockType`.
- `tests/reconstruction_{engine,render,cli}.test.ts` — `node:test` + `node:assert/strict`; helpers `loadRecords` (`tests/utilities.ts`), `S2_JSONL` (`tests/fixtures.ts`).

## Context the Next Agent Won't Have
- **Two LOCKED user decisions** (drive output shape): (1) **Merge by lineage** — a renamed file is ONE history keyed by its surviving/final path (`s2_moved.py`, not `s2_original.py`); `reconstructAll(S2)` returns exactly 2 histories. (2) **Rename is a FIRST-CLASS entry** in the timeline (its own numbered entry, kind `rename`, with `from→to` + the `mv`'s changeId), carrying the unchanged line snapshot forward (identity `oldLineNum`); it mints no line change. The user explicitly steered to "rename events should be a first-class entry in the render."
- **Coarse `-`/`+` (Rule 2):** take the diff literally — one Edit hunk emits a removal revision (if any `-`) then an addition revision (if any `+`), both sharing the Edit's changeId. Edit `015b59mN` (a `-`/`+` pair) → 2 revisions; Edit `016L3mk1` (pure insertion) → 1. Do NOT sub-diff to pair `-`→`+`.
- **`changeId` = the originating tool_use id** (deterministic + provenance; a paired remove/add shares it automatically). Never randomly generated.
- **The first Explore pass reported "no structuredPatch"** — it was reading the `tool_result` content block. The hunks are on the **user record's `toolUseResult`**. Don't repeat that mistake.
- **Planning-guide expectations (the user enforced these):** plan files are How + In-What-Order, minimal Why; strict red→green TDD with `test_<behavior>` names and plain-English step comments; code snippets must follow `plans/coding-requirements.md` and the user's global standards — domain types not primitives (`Path`/`Uuid`, both have `.equals()`), verb-named functions, compare enums by member, 4-space indent, imperative style.
- **User strongly prefers splitting files over condensing** to stay under the 250-line cap; if `reconstruction_engine.ts` nears it, split replay/lineage into `src/reconstruction_replay.ts`. All enums in `vocabulary.ts`; no re-export/forwarding shims; flat tests `tests/<stem>.test.ts`, `node:test` (NOT vitest).
- **Harness quirks:** the `PostToolBatch` hook often emits a STALE failure for a file written in the same batch as its test — IGNORE it, `npm test` is authoritative. `tsx` doesn't type-check (use `npx tsc --noEmit`). `tsx` prints `Debugger listening…` to stderr — append `2>/dev/null` for clean CLI output. Clean room is absolute: never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` — that path is only for reading the design.
- **Verify before coding:** `findDeletedTarget` still works for S1 (S2 has no `rm`, so it returns undefined and the CLI falls through to `reconstructAll`). S1's `reconstructFile` filter still works because S1 has no renames (empty chain → `resolveFinalPath` is identity).

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # node --import tsx --test tests/*.test.ts → 42 S1 specs (+ S2 specs as added), 0 fail
npx tsc --noEmit         # expect: No errors found
python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py src/reconstruction_*.ts   # exit 0
# End-to-end (after Task 6), through the scenarios/ symlink or the absolute path:
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s2-move-file/1e82511e-05a3-4712-9a95-206b24128694.jsonl" 2>/dev/null
# Expect 2 files; s2_moved.py with a first-class rename entry between create and edit;
# the test file's two edit entries sharing #015b59mN.
```
