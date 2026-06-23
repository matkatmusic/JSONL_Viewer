# Handoff: S5 (`s5-bash-redirect`) reconstruction plan is fully authored and refined to coding standards — ready to implement; NO code written yet
Conversation name: api-from-scenarios — S5 bash-redirect plan (authoring + review)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/d6618041-6f94-4ac1-80ba-50a3bda183e6.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s5/s5-reconstruction-plan.md (the plan to execute — 9 TDD tasks)

## Branch
`api-from-scenarios` based on `master`. HEAD = `0436fa8 Implemented S2/3/4` (S2/S3/S4 are committed; 73 tests green at HEAD). No `-plate` branch exists.

## Goal
Reconstruct the file-change history of a Claude Code session from its JSONL transcript, one scenario at a time, in clean-room TypeScript. **S5 (`s5-bash-redirect`)** adds bash output redirection: `echo … >> file` (**append**) and `echo … > file` (**overwrite**). The hard part: a redirect leaves **no content in the JSONL** (its `toolUseResult` is only empty stdout/stderr). The resulting bytes are recovered from the **file-history sidecar** — `file-history-snapshot` records name backup blobs at `~/.claude/file-history/<sessionId>/<backupFileName>`. The user explicitly approved this **transcript + sidecar** approach (vs. parsing the `echo` command, which was rejected as fragile).

## Current State
- **This session produced and refined ONLY the plan doc.** No source or test files changed. `npm test` at HEAD = **73 pass / 0 fail** (just confirmed).
- **Working tree:** only untracked items — `plans/s5/` (the new plan) and `src/Plan_Impl_template.md` (a stray, unrelated template that has shown up since S4; confirm with the user before committing — it belongs to no slice). `git diff --stat` is empty.
- **The plan is complete and standards-clean.** It was reviewed line-by-line against `~/.claude/guides/planning.md` + `tdd.md` + `coding-standards.md` + `single-condition-branching.md` and `plans/coding-requirements.md`, and corrected through several rounds (see Context).
- **The S5 ground truth is fully pinned in the plan** (exact tool_use ids, timestamps, the single target file `…/run-scenario.3kn92g5n/s5_redirect.txt`, and the three content states verified by reading the real backup blobs `@v2`/`@v3`/`@v4`).

## What Remains
Execute the 9 tasks **in order**, each **RED → GREEN → Verify gate** (do not start a task until the prior gate is green). Tasks 1–3 are pre-feature refactors (no behavior change), 4–9 build the feature:

1. **Split `src/reconstruction_replay.ts`** (it's at 247/250 lines). Move the line primitives (`splitLines`, `genesisLine`, `carryAt`, `lastLinesOf`, `fileIsPresent`) and the whole Edit splice (`applyEdit` + `editRevision`, `removedOldIndicesOf`, `keepSurvivingLines`, `insertHunkAdditions`) into a NEW `src/reconstruction_replay_edit.ts` that imports nothing from `reconstruction_replay.ts` (one-directional, no cycle). RED = a new import test.
2. **Rename the 8 verb-less helpers in `src/reconstruction_render_list.ts`** (all file-private): `baseName→getBaseName`, `shortChangeId→shortenChangeId`, `shortTime→formatShortTime`, `entryLabel→getEntryLabel`, `entryDelta→getEntryDelta`, `entryDetail→getEntryDetail`, `originalPathOf→findOriginalPath`, `copyOriginOf→findCopyOrigin`. (`entryLabel` appears in `tests/reconstruction_render_list.test.ts` only as a *comment* — update it.) No RED; existing tests prove no behavior change.
3. **Introduce `DOES_NOT_EXIST_YET`** in a NEW leaf module `src/structures/line-model.ts` (`export const DOES_NOT_EXIST_YET = -1;`) and replace every genesis `-1` (`oldLineNum` meaning "no previous line") across `src/` and `tests/`. Leaf module is required to avoid the engine↔replay value cycle. Leave unrelated `-1`s and `oldLineNum >= 0` alone.
4. **Append + overwrite redirect-event replay** (pure replay units). Add `EventKind.append`; add `AppendEvent` (`kind: append`) and `OverwriteEvent` (`kind: overwrite`) to the `FileEvent` union (both carry `content`, empty from extraction); add `appendRevision` (carried prefix via `carryAt` + genesis suffix via `genesisLine`); broaden `writeRevision` to `WriteEvent | OverwriteEvent`; add the two dispatch branches.
5. **Sidecar resolver** — NEW `src/reconstruction_sidecar.ts`: `buildBackupTimeline` (drops null-backup points), `findBackupAfter`, `fillRedirectContent`, `BackupReader` type, `createSidecarReader`, `getDefaultFileHistoryRoot`, `findSessionId`. Unit-test with hand-built snapshot records + an in-memory reader (incl. the null-skip case).
6. **Extraction recognizes `>>`/`>`** — add `ParsedRedirect` type + `parseRedirect` and one branch in `bashEventFrom` emitting `AppendEvent`/`OverwriteEvent` with `content: ""`.
7. **`S5_JSONL` fixture + thread the `BackupReader`** through `reconstructAll`/`reconstructFile`/`reconstructLineage`/`seedCopyEvents` (all optional param, backward-compatible); integration test: `reconstructAll(S5, inMemoryReader)` → one history, create→append→overwrite.
8. **Render the append entry** — `getEntryLabel` append branch (`"append"`) + `diffBlock` `@@ appended @ … @@` branch (added-tail only).
9. **CLI wires the real reader** (`findSessionId` + `createSidecarReader(getDefaultFileHistoryRoot())`) + default-view test on the real S5 transcript + docs (design-doc specs 24–28; `reconstruction_sidecar.ts`/`reconstruction_replay_edit.ts`/`structures/line-model.ts` + render_list renames into Code-layout; `implementation-notes`; `roadmap` S5 row).

Then: **ask the user before committing** (and resolve the stray `src/Plan_Impl_template.md`).

**Optional cleanups the user flagged but did not yet request done** (offer before/while implementing): (a) the `fillRedirectContent` guard uses a compound `&&` `if` — refactor to a single-condition `isRedirectKind` helper per `single-condition-branching.md`; (b) the plan leaves three test helpers under-specified — `buildRedirectRecords` (Task 6), `createThenAppendRevs` (Task 8), and the `selectHistories` signature change (Task 9) — write them out fully when implementing.

## Key Files
- `plans/s5/s5-reconstruction-plan.md` — the plan to execute (ground truth, locked decisions, per-line model impact, alignment rule, the 9 tasks with code snippets).
- `plans/reconstruction-engine-design.md` — the agreed model + specs 1–23 (S5 adds 24–28 in Task 9); read "The per-line model" and "The two rules".
- `plans/coding-requirements.md` — mandatory style (domain types `Path`/`Uuid`, single wire-vocabulary home, DRY, **verb-named functions (rule 5)**, enum-member compares).
- `src/structures/file-history.ts` — **already built**: `getFileHistorySnapshot(record)` + `FileBackupMap`; hydrates `file-history-snapshot` into domain types. S5 reuses this; do NOT rebuild snapshot parsing.
- `src/reconstruction_replay.ts` (247/250 lines — Task 1 splits it), `src/reconstruction_engine.ts` (model types + `reconstruct*` API + copy-seed recursion — the template for sidecar fill), `src/reconstruction_extract.ts` (`bashEventFrom` rm/mv/cp — Task 6 adds redirects), `src/reconstruction_render.ts` (`diffBlock`), `src/reconstruction_render_list.ts` (`getEntryLabel` after Task 2), `src/reconstruction_cli.ts`, `src/structures/vocabulary.ts` (`EventKind`).
- `tests/fixtures.ts` (add `S5_JSONL`), `tests/utilities.ts` (`loadRecords`).

## Context the Next Agent Won't Have
- **The alignment rule was CORRECTED mid-session — get this right.** The content a redirect produced is the blob of the **first snapshot of that path whose `backupTime` is strictly after the redirect's timestamp AND whose `backupFileName` is non-null**. The **non-null** qualifier is load-bearing: version 1's backup is `null` and its `backupTime` (:05.633) is *after* the create (:05.619), so "first snapshot after" alone wrongly resolves the create to the empty v1. Task 5's `buildBackupTimeline` drops null points so `findBackupAfter` is then a simple first-after. An earlier draft claimed snapshots are "taken just after each operation, before the next turn" — that is **unverified and wrong** (backupTimes are several seconds later, at turn boundaries); do not reintroduce it. Also: **do not key off record/stream order** — use `backupTime`.
- **Per-line model impact (the heart of the change, easy to under-specify).** S5 adds **no new fields/types** to `FileRevision`/`LineEntry`/`LineValue`. An **append** is the first revision that mixes carried + genesis lines *without a structuredPatch*: prior lines carry forward with identity back-pointers (`oldLineNum = previous index`, `values` reused unchanged — no new sighting), the tail is genesis. The split is **positional** (`prevLen`), justified by the invariant that `>>` only adds at EOF (so prior content is exactly the prefix). **Overwrite (`>`) needs NO per-line change** — it's all-genesis like S4's overwrite, reusing `writeRevision(event, fileIsPresent(...))`.
- **A revision is defined by the redirect COMMAND, not the snapshot.** One `>>`/`>` → exactly one revision (its `tool_use` id = `changeId`, its timestamp = the revision time). Snapshots supply *content only*; they do not enumerate revisions (so the duplicate `@v4` snapshot and the null `v1` create no entries, and `ls`/`pytest` still produce none). The snapshot-driven alternative was considered and rejected.
- **`DOES_NOT_EXIST_YET` must live in a leaf module** (`structures/line-model.ts`), NOT in `reconstruction_engine.ts`: replay/render would then import a *value* from engine while engine imports them as values → the runtime cycle the design doc forbids. The constant `= -1`; `oldLineNum >= 0` checks are the complement and stay.
- **The user enforces coding-requirements rule 5 (verb in every function name) strictly** — including over the existing `…Of` precedent (they had `sessionIdOf` renamed to `findSessionId`). All new function names in the plan already comply; honor this when writing any new code. They also asked for the `parseRedirect` return type to be a **named** type (`ParsedRedirect`), not an inline object literal.
- **Clean room is absolute.** Never import/copy from `/Users/matkatmusicllc/Desktop/claude code src/` — read-only ground truth. Tests use an **in-memory `BackupReader`** (a `{ "hash@vN": content }` map), never disk; only the CLI (Task 9) reads the real `~/.claude/file-history/…` blobs.
- **Harness quirks (from S4):** `tsx` does NOT type-check — `npx tsc --noEmit` is the type gate, and `noUnusedLocals`/`noUnusedParameters` make a stray import a hard error (prune precisely on the Task 1 split). `filesize_check.py` reads only `argv[1]` — loop over files. Ignore stale `PostToolBatch`/`PostToolUse` hook failures for a file written in the same batch as its test; `npm test` is authoritative.
- A project memory was written this session: `file-history-sidecar-is-second-input` (the sidecar is a standing second input for future scenarios too).

## How to Verify
Run the plan's **Verify gate after every task** (all three green before the next):
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # node --import tsx --test tests/*.test.ts → all prior + new S5 specs, 0 fail (73 at HEAD, more as tasks land)
npx tsc --noEmit         # No errors found
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```
End-to-end after Task 9 (reads the real sidecar blobs):
```
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s5-bash-redirect/621364dd-a153-42f4-b44f-b6b5232c57e9.jsonl" 2>/dev/null
# Expect one file s5_redirect.txt: create (#01Mzva3Z) → append (#01PDv4Df, "2 lines (+1)") → overwrite (#01UB1SvL).
# --diff: append = "appended" adding only "+ line two"; overwrite = "overwritten" removing both lines, adding "+ replaced content".
```
