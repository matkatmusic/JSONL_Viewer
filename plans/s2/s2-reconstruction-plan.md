# Plan: S2 slice — Edit splice, rename lineage, paired-changeId

Implement in the listed order. Each task is **RED first** (write the failing
`test_<behavior>` with plain-English step comments) then **GREEN** (minimum code in
separate verb-named functions). After every task run the three checks under
**Verify gate** and do not start the next task until all three are green.

All work is in the `api-from-scenarios` worktree. Source: `src/reconstruction_engine.ts`,
`src/reconstruction_render.ts`, `src/reconstruction_cli.ts`, `src/structures/vocabulary.ts`.
Tests: `tests/reconstruction_engine.test.ts`, `…_render.test.ts`, `…_cli.test.ts`.
Test helpers already exist: `loadRecords(file)` (`tests/utilities.ts`) and `S2_JSONL`
(`tests/fixtures.ts`). Style: 4-space indent, verb-named functions, `Path`/`Uuid` domain
types (never bare strings for paths/ids), compare enums by member (`x === EventKind.edit`).

## Ground truth (S2 transcript — assert against these literal values)

Events in timestamp order; `changeId` = the tool_use id shown:

| time (Z) | tool | changeId (toolu_…) | effect |
|----------|------|--------------------|--------|
| 16:13:35 | Write | `01Dwpb8pFUQX9PEmR5QjsbXU` | create `…/s2_original.py` (2 lines) |
| 16:13:36 | Write | `018s6ZLtu9SEuyUPUeCwHumz` | create `…/tests/test_s2_original.py` (6 lines) |
| 16:13:50 | Bash `mv` | `012UW4N9wQ4DsstbeKVwHzwt` | rename `s2_original.py` → `s2_moved.py` |
| 16:14:00 | Edit | `015b59mN3fQcxCTHa7bB1nUM` | test import swap |
| 16:14:18 | Edit | `016L3mk1XG8te6aExUNaAqqD` | add `goodbye()` to `s2_moved.py` |

`mv` command string: `mv <abs>/s2_original.py <abs>/s2_moved.py` (two space-separated absolute paths, no flags).

Edit `015b59mN` hunk (one): `oldStart:1 oldLines:4 newStart:1 newLines:4`,
`lines = ["-from s2_original import hello", "+from s2_moved import hello", " ", " ", " def test_hello(capsys):"]`.

Edit `016L3mk1` hunk (one): `oldStart:1 oldLines:2 newStart:1 newLines:6`,
`lines = [" def hello():", "     print(\"hello\")", "+", "+", "+def goodbye():", "+    print(\"goodbye\")"]`.

`structuredPatch` lives on the **user record's top-level `toolUseResult`** (an `EditResult`,
see `src/structures/tool-results.ts`), reached via that record's `tool_result` block's
`tool_use_id`. Write results carry `structuredPatch: []`.

## Expected reconstruction (Task 4 asserts the full shapes)

`tests/test_s2_original.py` → 3 entries:
- `0` kind `write`, 6 genesis lines (every `oldLineNum === -1`), changeId `018s6ZLt`.
- `1` kind `edit` (removal), 5 lines, changeId `015b59mN`; old line 0 dropped, survivors `oldLineNum` 1,2,3,4,5.
- `2` kind `edit` (addition), 6 lines, **same** changeId `015b59mN`; idx0 born (`from s2_moved import hello`, `oldLineNum -1`), idx1..5 `oldLineNum` 0,1,2,3,4.

`s2_moved.py` → 3 entries (lineage from `s2_original.py`):
- `0` kind `write`, 2 genesis lines (`def hello():`, `    print("hello")`), changeId `01Dwpb8p`.
- `1` kind `rename`, `from` `…/s2_original.py` `to` `…/s2_moved.py`, 2 lines carried forward (`oldLineNum` 0,1), changeId `012UW4N9`.
- `2` kind `edit` (addition), 6 lines, changeId `016L3mk1`; idx0,1 `oldLineNum` 0,1 (context), idx2..5 born (`oldLineNum -1`).

---

## Task 1 — Fold-based replay carrying a `kind` on every revision (refactor)

**Behavior:** reconstruction still yields the same S1 revisions, but is produced by a
left-fold that can append more than one revision per event and can read the previous
revision; every revision records which `EventKind` produced it.

**RED:** no new test — the existing S1 specs in `reconstruction_engine.test.ts`
(`test_create_revision_has_genesis_lines`, `test_delete_revision_is_empty_at_rm_time`,
`test_finds_deleted_target_and_reconstructs_two_revisions`) are the safety net. Add one
assertion to `test_create_revision_has_genesis_lines`:
```ts
// the create revision records that a write produced it.
assert.equal(create.kind, EventKind.write);
```
This fails to compile (no `kind` field) → RED.

**GREEN:**
1. `src/reconstruction_engine.ts` — add `kind: EventKind` to `FileRevision` (first field).
   Set it in `writeRevision` (`kind: EventKind.write`) and `deleteRevision`
   (`kind: EventKind.delete`).
2. Replace `reconstructFile`'s `.map(toRevision)` and delete `toRevision`. Add the fold:
   ```ts
   // Replay events in order into revisions; an event may append more than one
   // (an Edit emits a removal then an addition) and may read the previous one.
   function replayEvents(events: FileEvent[]): FileRevision[] {
       const revisions: FileRevision[] = [];
       for (const event of events) {
           appendRevisionsForEvent(event, revisions);
       }
       return revisions;
   }

   function appendRevisionsForEvent(event: FileEvent, revisions: FileRevision[]): void {
       if (event.kind === EventKind.write) {
           revisions.push(writeRevision(event));
           return;
       }
       if (event.kind === EventKind.delete) {
           revisions.push(deleteRevision(event));
           return;
       }
       throw new UnsupportedEventKindError(event.kind);
   }
   ```
3. Add the fog-of-war guard class (mirror `UnknownToolNameError` in `tool-results.ts`):
   ```ts
   export class UnsupportedEventKindError extends Error {
       readonly kind: string;
       constructor(kind: string) {
           super(`Unsupported event kind in replay: ${kind}`);
           this.name = "UnsupportedEventKindError";
           this.kind = kind;
       }
   }
   ```
4. `reconstructFile` body becomes: filter events to the target, then `replayEvents(...)`.
5. `tests/reconstruction_render.test.ts` — add `kind: EventKind.write` / `EventKind.delete`
   to each literal `FileRevision` fixture so they still type-check; import `EventKind`.

**Verify gate.**

---

## Task 2 — Extract Edit events and splice them into removal/addition revisions

Proven on `tests/test_s2_original.py` (no rename involved).

**Behavior A (extraction):** extracting S2 finds 2 edit events; each carries its file path
and its `structuredPatch` hunks verbatim.

**Behavior B (splice):** reconstructing the test file yields create → edit-removal →
edit-addition; the two edit revisions share one changeId; an inserted line is born
(`oldLineNum -1`) and a surviving line's `oldLineNum` points to its index in the
immediately previous revision.

**RED:** add to `reconstruction_engine.test.ts`:
```ts
// helper: the absolute path the transcript edits in tests/ (no rename touches it).
function s2TestFilePath(records): Path {
    const edits = extractFileEvents(records).filter((e) => e.kind === EventKind.edit);
    return edits.find((e) => e.target.toString().includes("test_s2_original.py"))!.target;
}

test("test_extract_finds_two_edits_with_their_hunks", () => {
    // Load the S2 transcript records.
    const events = extractFileEvents(loadRecords(S2_JSONL));
    // Keep only edit events.
    const edits = events.filter((e) => e.kind === EventKind.edit);
    // S2 performs exactly two Edits.
    assert.equal(edits.length, 2);
    // The import-swap edit carries its single hunk verbatim.
    const importEdit = edits.find((e) => e.target.toString().includes("test_s2_original.py"))!;
    assert.equal(importEdit.hunks[0]!.oldStart, 1);
    assert.equal(importEdit.hunks[0]!.oldLines, 4);
    assert.equal(importEdit.hunks[0]!.lines[0], "-from s2_original import hello");
    assert.equal(importEdit.hunks[0]!.lines[1], "+from s2_moved import hello");
});

test("test_edit_splices_into_paired_removal_and_addition_revisions", () => {
    // Load records and reconstruct the test file (created then edited, never renamed).
    const records = loadRecords(S2_JSONL);
    const revisions = reconstructFile(records, s2TestFilePath(records));
    // Three entries: the create, then the removal, then the addition.
    assert.equal(revisions.length, 3);
    // Entry 1 is the removal: the old import line (index 0) is gone, leaving 5 lines.
    assert.equal(revisions[1]!.kind, EventKind.edit);
    assert.equal(revisions[1]!.lines.length, 5);
    assert.equal(revisions[1]!.lines[0]!.oldLineNum, 1);
    // Entry 2 is the addition: the new import is born at index 0, total back to 6 lines.
    assert.equal(revisions[2]!.lines.length, 6);
    assert.equal(revisions[2]!.lines[0]!.oldLineNum, -1);
    assert.equal(revisions[2]!.lines[0]!.values[0]!.line, "from s2_moved import hello");
    // The removal and addition came from one Edit, so they share a changeId.
    assert.ok(revisions[1]!.changeId.equals(revisions[2]!.changeId));
});
```

**GREEN:**
1. `src/structures/vocabulary.ts` — add `edit = "edit"` to `EventKind`.
2. `src/reconstruction_engine.ts` — import `StructuredPatchHunk` and `EditResult` from
   `./structures/tool-results.ts`; add the event type and extend the union:
   ```ts
   export type EditEvent = {
       kind: EventKind.edit;
       changeId: Uuid;
       target: Path;
       hunks: StructuredPatchHunk[];
       timestamp: Date;
   };
   export type FileEvent = WriteEvent | DeleteEvent | EditEvent;   // RenameEvent added in Task 3
   ```
3. Index hunks by tool_use id from the user records' `toolUseResult` (reuse
   `indexToolUseNamesById` from `tool-results.ts`; read each record's `tool_result` block
   for its `tool_use_id`):
   ```ts
   // Map each Edit's tool_use id -> its structuredPatch hunks, read from the user
   // record that reports the result (toolUseResult), keyed back via tool_use_id.
   function indexEditHunksByToolUseId(records: TranscriptRecord[]): Map<string, StructuredPatchHunk[]> {
       const nameById = indexToolUseNamesById(records);
       const hunksById = new Map<string, StructuredPatchHunk[]>();
       for (const record of records) {
           collectEditHunksFromRecord(record, nameById, hunksById);
       }
       return hunksById;
   }

   function collectEditHunksFromRecord(record, nameById, hunksById): void {
       for (const block of getContentBlocks(record)) {
           if (block.type !== BlockType.tool_result) {
               continue;
           }
           const toolName = nameById.get(block.tool_use_id.toString());
           if (toolName !== ToolName.Edit) {
               continue;
           }
           const result = record.toolUseResult as EditResult | undefined;
           if (result) {
               hunksById.set(block.tool_use_id.toString(), result.structuredPatch);
           }
       }
   }
   ```
4. Thread `hunksById` through extraction: change `toFileEvent(block, timestamp)` →
   `toFileEvent(block, timestamp, hunksById)` and `collectEventsFromRecord(record, events)`
   → `collectEventsFromRecord(record, events, hunksById)`; in `extractFileEvents` build
   `hunksById` once before the loop. Add the Edit branch and its builder:
   ```ts
   function editEventFrom(block, timestamp, hunksById): EditEvent | undefined {
       const input = block.input as { file_path: string };
       const hunks = hunksById.get(block.id.toString());
       if (!hunks) {
           return undefined;
       }
       return {
           kind: EventKind.edit,
           changeId: block.id,
           target: new Path(input.file_path),
           hunks,
           timestamp,
       };
   }
   ```
   In `toFileEvent`, add `if (block.name === ToolName.Edit) { return editEventFrom(...); }`.
5. Splice replay — add to `appendRevisionsForEvent` an `EventKind.edit` branch calling
   `applyEdit(event, revisions)`, and implement the splice (single hunk per S2 Edit;
   iterate `event.hunks` so multi-hunk folds, applying each against the working lines):
   ```ts
   // Splice one Edit's hunks against the latest revision. A hunk with any '-' emits a
   // removal revision; a hunk with any '+' emits an addition revision; both carry the
   // Edit's changeId. Context lines keep identity; inserted lines are born (-1).
   function applyEdit(event: EditEvent, revisions: FileRevision[]): void {
       for (const hunk of event.hunks) {
           const previousLines = lastLinesOf(revisions);
           const removed = removedOldIndicesOf(hunk);
           if (removed.size > 0) {
               const removalLines = keepSurvivingLines(previousLines, removed);
               revisions.push(editRevision(event, removalLines));
           }
           const additionLines = insertHunkAdditions(lastLinesOf(revisions), hunk, event.timestamp);
           if (additionLines.added) {
               revisions.push(editRevision(event, additionLines.lines));
           }
       }
   }

   function lastLinesOf(revisions: FileRevision[]): LineEntry[] {
       const last = revisions[revisions.length - 1];
       return last ? last.lines : [];
   }

   function editRevision(event: EditEvent, lines: LineEntry[]): FileRevision {
       return { kind: EventKind.edit, changeId: event.changeId, timestamp: event.timestamp, lines };
   }

   // The old-line indices (into the previous revision) that this hunk deletes. Walk the
   // hunk: ' ' and '-' each consume one old line starting at oldStart-1; '-' is deleted.
   function removedOldIndicesOf(hunk: StructuredPatchHunk): Set<number> {
       const removed = new Set<number>();
       let oldIndex = hunk.oldStart - 1;
       for (const line of hunk.lines) {
           if (line.startsWith("-")) {
               removed.add(oldIndex);
               oldIndex += 1;
           } else if (line.startsWith("+")) {
               // an inserted line consumes no old line
           } else {
               oldIndex += 1;
           }
       }
       return removed;
   }

   // Previous lines minus the removed indices; each survivor keeps its previous index
   // as its oldLineNum back-pointer.
   function keepSurvivingLines(previousLines: LineEntry[], removed: Set<number>): LineEntry[] {
       const survivors: LineEntry[] = [];
       for (let index = 0; index < previousLines.length; index++) {
           if (removed.has(index)) {
               continue;
           }
           survivors.push({ oldLineNum: index, values: previousLines[index]!.values });
       }
       return survivors;
   }

   // Insert the hunk's '+' lines among the (post-removal) working lines. Context lines
   // carry their working index as oldLineNum and keep their existing values; '+' lines
   // are born (-1) with the hunk text (its prefix char stripped) at the edit timestamp.
   function insertHunkAdditions(workingLines: LineEntry[], hunk: StructuredPatchHunk, timestamp: Date): { lines: LineEntry[]; added: boolean } {
       const result: LineEntry[] = workingLines.slice(0, hunk.oldStart - 1).map(carryAt);
       let workingIndex = hunk.oldStart - 1;
       let added = false;
       for (const line of hunk.lines) {
           if (line.startsWith("-")) {
               continue;
           }
           if (line.startsWith("+")) {
               result.push({ oldLineNum: -1, values: [{ line: line.slice(1), timestamp }] });
               added = true;
           } else {
               result.push({ oldLineNum: workingIndex, values: workingLines[workingIndex]!.values });
               workingIndex += 1;
           }
       }
       for (let index = workingIndex; index < workingLines.length; index++) {
           result.push({ oldLineNum: index, values: workingLines[index]!.values });
       }
       return { lines: result, added };
   }

   // Carry a working line forward unchanged, recording its current index as oldLineNum.
   function carryAt(entry: LineEntry, index: number): LineEntry {
       return { oldLineNum: index, values: entry.values };
   }
   ```

**Verify gate.** (Hand-trace check: the removal revision has 5 lines, the addition has 6,
matching the Expected-reconstruction shapes above.)

---

## Task 3 — Extract the rename and merge the moved file's history across it

**Behavior A (extraction):** extracting S2 finds one rename event from the `mv`, carrying
`from`/`to` paths and the `mv` tool_use's changeId.

**Behavior B (lineage + first-class entry):** reconstructing the moved file by its final
path yields create → rename → edit; the rename entry has kind `rename`, carries the prior
lines forward unchanged, and records `from`/`to`.

**RED:** add to `reconstruction_engine.test.ts`:
```ts
test("test_extract_finds_rename_from_mv", () => {
    // Extract S2 events and keep the rename(s).
    const renames = extractFileEvents(loadRecords(S2_JSONL)).filter((e) => e.kind === EventKind.rename);
    // The mv produces exactly one rename, s2_original.py -> s2_moved.py.
    assert.equal(renames.length, 1);
    assert.ok(renames[0]!.from.toString().endsWith("/s2_original.py"));
    assert.ok(renames[0]!.to.toString().endsWith("/s2_moved.py"));
});

test("test_moved_file_history_spans_create_rename_edit", () => {
    // Reconstruct the moved file by its final path (the rename destination).
    const records = loadRecords(S2_JSONL);
    const finalPath = extractFileEvents(records).find((e) => e.kind === EventKind.rename)!.to;
    const revisions = reconstructFile(records, finalPath);
    // Create (as s2_original.py), the rename, then the goodbye() edit.
    assert.equal(revisions.length, 3);
    assert.equal(revisions[0]!.kind, EventKind.write);
    assert.equal(revisions[1]!.kind, EventKind.rename);
    assert.equal(revisions[2]!.kind, EventKind.edit);
    // The rename carries the 2 prior lines forward unchanged.
    assert.equal(revisions[1]!.lines.length, 2);
    assert.equal(revisions[1]!.lines[1]!.values[0]!.line, '    print("hello")');
    // The edit adds goodbye(), ending at 6 lines with the new lines born.
    assert.equal(revisions[2]!.lines.length, 6);
    assert.equal(revisions[2]!.lines[4]!.values[0]!.line, "def goodbye():");
    assert.equal(revisions[2]!.lines[4]!.oldLineNum, -1);
});
```

**GREEN:**
1. `src/structures/vocabulary.ts` — add `rename = "rename"` to `EventKind`.
2. `src/reconstruction_engine.ts` — add the rename info and event, extend the union, and
   add `rename?` to `FileRevision`:
   ```ts
   export type RenameInfo = { from: Path; to: Path };
   export type RenameEvent = {
       kind: EventKind.rename;
       changeId: Uuid;
       from: Path;
       to: Path;
       timestamp: Date;
   };
   export type FileEvent = WriteEvent | DeleteEvent | EditEvent | RenameEvent;
   ```
   Add `rename?: RenameInfo` to `FileRevision`.
3. Parse `mv` and branch the Bash handler. Rename the existing Bash handler to
   `bashEventFrom` (rm → delete, else mv → rename); keep `parseRmTarget`, add:
   ```ts
   // Parse `mv <src> <dst>` (two space-separated paths, no flags — the s2 form).
   function parseMvPaths(command: string): RenameInfo | undefined {
       const match = command.trim().match(/^mv\s+(\S+)\s+(\S+)$/);
       if (!match) {
           return undefined;
       }
       return { from: new Path(match[1]!), to: new Path(match[2]!) };
   }

   function bashEventFrom(block, timestamp): FileEvent | undefined {
       const input = block.input as { command: string };
       const removed = parseRmTarget(input.command);
       if (removed) {
           return { kind: EventKind.delete, changeId: block.id, target: removed, timestamp };
       }
       const moved = parseMvPaths(input.command);
       if (moved) {
           return { kind: EventKind.rename, changeId: block.id, from: moved.from, to: moved.to, timestamp };
       }
       return undefined;
   }
   ```
   Point `toFileEvent`'s `ToolName.Bash` branch at `bashEventFrom`.
4. Replay the rename as a first-class carried-forward entry — add the
   `EventKind.rename` branch to `appendRevisionsForEvent`:
   ```ts
   function renameRevision(event: RenameEvent, revisions: FileRevision[]): FileRevision {
       const lines = lastLinesOf(revisions).map(carryAt);
       return {
           kind: EventKind.rename,
           changeId: event.changeId,
           timestamp: event.timestamp,
           lines,
           rename: { from: event.from, to: event.to },
       };
   }
   ```
5. Lineage resolution — follow the `mv` chain so a content event and the rename land in
   one history keyed by the final path. Add and use these in `reconstructFile`:
   ```ts
   // Map each rename source path -> its destination path.
   function buildRenameChain(events: FileEvent[]): Map<string, Path> {
       const next = new Map<string, Path>();
       for (const event of events) {
           if (event.kind === EventKind.rename) {
               next.set(event.from.toString(), event.to);
           }
       }
       return next;
   }

   // Follow the rename chain to the path the file ends life at.
   function resolveFinalPath(path: Path, renameChain: Map<string, Path>): Path {
       let current = path;
       while (renameChain.has(current.toString())) {
           current = renameChain.get(current.toString())!;
       }
       return current;
   }

   // The path a content event touches; for a rename it is the destination.
   function contentPathOf(event: FileEvent): Path {
       return event.kind === EventKind.rename ? event.to : event.target;
   }

   function eventBelongsToLineage(event: FileEvent, finalTarget: Path, renameChain: Map<string, Path>): boolean {
       return resolveFinalPath(contentPathOf(event), renameChain).equals(finalTarget);
   }
   ```
   `reconstructFile(records, target)` becomes: extract events; build `renameChain`;
   `finalTarget = resolveFinalPath(target, renameChain)`; filter by
   `eventBelongsToLineage(event, finalTarget, renameChain)`; `replayEvents(filtered)`.

**Verify gate.** (S1 `reconstructFile` still filters by `target.equals` because S1 has no
renames, so its chain is empty and `resolveFinalPath` is identity.)

---

## Task 4 — `reconstructAll(S2)` returns both lineages with the full entry shapes

**Behavior:** reconstructing every file in S2 returns exactly two histories — the test
file and the moved file (keyed by `s2_moved.py`, not `s2_original.py`) — each with the
entry shapes in **Expected reconstruction**.

**RED:** add to `reconstruction_engine.test.ts` `test_reconstruct_all_returns_two_s2_lineages`,
stepping through: load records; `reconstructAll`; assert `length === 2`; find the moved
history by `target.toString().endsWith("/s2_moved.py")` and assert its `revisions.length === 3`
with kinds `write,rename,edit`; assert no history is keyed by `s2_original.py`; find the
test history and assert `revisions.length === 3` and `revisions[1].changeId.equals(revisions[2].changeId)`.

**GREEN:** `src/reconstruction_engine.ts` — replace `distinctTargets` with a lineage-aware
grouping and rebuild `reconstructAll`:
```ts
// Distinct final paths across all events (rename sources collapse into their destination).
function distinctFinalPaths(events: FileEvent[], renameChain: Map<string, Path>): Path[] {
    const byPath = new Map<string, Path>();
    for (const event of events) {
        const finalPath = resolveFinalPath(contentPathOf(event), renameChain);
        byPath.set(finalPath.toString(), finalPath);
    }
    return [...byPath.values()];
}

export function reconstructAll(records: TranscriptRecord[]): FileHistory[] {
    const events = extractFileEvents(records);
    const renameChain = buildRenameChain(events);
    return distinctFinalPaths(events, renameChain).map((target) => ({
        target,
        revisions: reconstructFile(records, target),
    }));
}
```

**Verify gate.** (Re-run the S1 `test_reconstruct_all_accounts_for_every_touched_file` —
still 2 histories with counts 2 and 1.)

---

## Task 5 — Render the rename as a first-class entry and show edit deltas

**Behavior:** the diff view shows an edit's real `+`/`-` lines (not remove-all/add-all) and
shows a rename as its own `renamed A → B` block with no line churn; the verbose view labels
each entry by kind and shows the rename’s `from → to`.

**RED:** add to `reconstruction_render.test.ts`, building literal `FileRevision[]` fixtures
that mirror the moved-file shapes (a `write` create, a `rename` carrying lines forward, an
`edit` addition):
- `test_diff_shows_rename_entry_as_first_class_block`: `renderDiff([create, rename])`
  contains `renamed` and both path strings, and contains **no** `+`/`-` content line for
  the rename block.
- `test_diff_shows_only_inserted_lines_for_an_edit`: `renderDiff([rename, editAddition])`
  contains `+def goodbye():` and does **not** remove the two unchanged context lines.
- `test_verbose_labels_rename_entry`: `renderVerbose([create, rename])` contains
  `rename` and `→`.

**GREEN:** `src/reconstruction_render.ts` —
1. `renderRevisionState`: when `revision.kind === EventKind.rename`, render
   `revision N  rename  <from> → <to>  @ <stamp>` (read `revision.rename`); otherwise keep
   the existing numbered line-state body.
2. Replace `diffBlock` with an `oldLineNum`-driven diff so edits show only their changes:
   - additions = entries with `oldLineNum === -1` → `+ <text>`.
   - removals = previous-revision indices `i` with no current entry whose
     `oldLineNum === i` → `- <previous text>`.
   - when `revision.kind === EventKind.rename`, emit header
     `@@ renamed <from> → <to> @ <stamp> @@` and no `+`/`-` lines.
   Import `EventKind` from `../structures/vocabulary.ts`.

**Verify gate.**

---

## Task 6 — Default CLI list view + run against the real S2 transcript + docs

**Behavior:** the no-`--target` CLI view prints each file with its numbered entries
(kind, line count, short time, short changeId), and a rename entry prints its `from → to`.

**RED:** add to `reconstruction_cli.test.ts` `test_default_view_lists_s2_entries_with_rename`:
run `runCli([S2_JSONL])`; assert the output contains `s2_moved.py`, a line containing
`rename` with both `s2_original.py` and `s2_moved.py`, and the short changeId `015b59mN`
for the test-file edits.

**GREEN:**
1. `src/reconstruction_render.ts` — add a pure `renderHistoryList(histories: FileHistory[]): string`
   producing the locked format below; helpers `shortChangeId(id)` (strip a leading
   `toolu_`, then first 8 chars) and `shortTime(date)` (`date.toISOString().slice(11, 19) + "Z"`);
   per-entry label from `kind` (`write`→`create`, `edit`, `rename`, `delete`) and a
   `(+N)`/`(−N)` delta computed from the previous entry's line count.
2. `src/reconstruction_cli.ts` — call `renderHistoryList(reconstructAll(records))` for the
   default (no-`--target`, no-`--verbose`, no-`--diff`) path. Keep `--target`/`--verbose`/`--diff` wiring.
3. `plans/reconstruction-engine-design.md` — mark specs 10–12 implemented; record the two
   locked decisions (merge-by-lineage keyed by final path; rename is a first-class
   carried-forward entry, mints no content change).
4. `plans/implementation-notes-api-from-scenarios.md` — append dated S2 entries
   (hunk-driven splice, `oldLineNum` chaining, paired changeId, `mv` lineage).

Locked default format:
```
s2_moved.py   (was s2_original.py)
  0  create   2 lines            16:13:35Z  #01Dwpb8p
  1  rename   s2_original.py → s2_moved.py   16:13:50Z  #012UW4N9
  2  edit     6 lines  (+4)      16:14:18Z  #016L3mk1

tests/test_s2_original.py
  0  create   6 lines            16:13:36Z  #018s6ZLt
  1  edit     5 lines  (−1)      16:14:00Z  #015b59mN
  2  edit     6 lines  (+1)      16:14:00Z  #015b59mN
```

**Verify gate**, then stop and report. Commit only after the user approves.

---

## Verify gate (run after every task; all three must pass before the next task)

```
npm test                                  # 42 S1 specs + the S2 specs added so far, 0 fail
npx tsc --noEmit                          # No errors found
python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py src/reconstruction_*.ts
```

If `reconstruction_engine.ts` approaches the 250-line cap, split the replay/lineage
functions into a new `src/reconstruction_replay.ts` (imported by the engine) rather than
condensing comments or single-lining expressions. Ignore any stale `PostToolBatch` hook
failure for a file written in the same batch as its test — `npm test` is authoritative.
`tsx` does not type-check, so `npx tsc --noEmit` is the type gate.

## End-to-end check (after Task 6)

```
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s2-move-file/1e82511e-05a3-4712-9a95-206b24128694.jsonl" 2>/dev/null
# Expect two files; s2_moved.py with a first-class rename entry between create and edit;
# the test file's two edit entries sharing #015b59mN. Add --verbose / --diff to see the
# oldLineNum-chained line state and the -import/+import and +goodbye changes.
```
