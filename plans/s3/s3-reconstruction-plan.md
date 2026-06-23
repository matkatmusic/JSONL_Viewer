# Plan: S3 slice — copy (`cp`) lineage as a first-class genesis entry

Implement in the listed order. Each task is **RED first** (write the failing
`test_<behavior>` with plain-English step comments) then **GREEN** (minimum code in
separate verb-named functions). After every task run the three checks under
**Verify gate** and do not start the next task until all three are green.

All work is in the `api-from-scenarios` worktree. Source modules:
`src/reconstruction_engine.ts` (model + public API), `…_extract.ts` (records →
events), `…_replay.ts` (events → revisions), `…_lineage.ts` (following a file
across renames), `…_render.ts` (views), `…_cli.ts`, and
`src/structures/vocabulary.ts` (the `EventKind` enum). Tests:
`tests/reconstruction_{engine,extract,replay,lineage,render,cli}.test.ts`. Helpers
already exist: `loadRecords(file)` (`tests/utilities.ts`) and the per-scenario
`S1_JSONL`/`S2_JSONL` constants (`tests/fixtures.ts`). Style (see
`plans/coding-requirements.md` + `~/.claude/guides/coding-standards.md`): 4-space
indent, verb-named functions, `Path`/`Uuid` domain types (never bare strings for
paths/ids), compare enums by member (`event.kind === EventKind.copy`), one
condition per `if` (mirror the file's local style for `kind === X && revision.X`
guards).

## What S3 adds (scope)

The `s3-copy-file` scenario is: Write `s3_source.py` → Write
`tests/test_s3_source.py` → **`cp s3_source.py s3_copy.py`** → Read `s3_copy.py`
→ Edit `s3_copy.py` (rename `hello`→`greet`). The **only** new engine capability
is **copy (`cp`)**. Everything else already works:

- The Edit on `s3_copy.py` is handled verbatim by the existing S2 hunk-splice
  (its `toolUseResult` carries a real `structuredPatch` — confirmed below — even
  though the Edit *input* was a plain `old_string`/`new_string`). **Do not touch
  the edit path.**
- The Read on `s3_copy.py` is **deferred** (reads/observations append to a line's
  `values[]` — a later scenario). Extraction does not model `Read`, so it is
  ignored. Leave it that way.

### Three locked S3 decisions (drive the output shape)

1. **A copy produces TWO independent histories.** The source (`s3_source.py`)
   lives on as its own history; the destination (`s3_copy.py`) is a new one. The
   source is **not** collapsed into the destination — this is the opposite of a
   rename (`mv`), where the source path disappears. `cp` is therefore deliberately
   **absent from the rename chain**. → `reconstructAll(S3)` returns **three**
   histories.
2. **A copy is a first-class genesis entry.** The destination's revision 0 has
   kind `copy`, every line born (`oldLineNum -1`) at the `cp` timestamp, and
   records its `from`/`to` provenance (mirrors S2's first-class rename entry).
3. **A copy's genesis content is the reconstructed SOURCE state as of the copy
   time** — obtained by reconstructing the source up to the `cp` timestamp, **not**
   from the destination Edit's `originalFile` field. `originalFile` is present here
   but is unreliable across transcripts (see the `originalFile not always
   populated` project note) and would couple the copy's genesis to a later edit;
   reconstructing the source is the clean-room, evidence-based path.

## Ground truth (S3 transcript — assert against these literal values)

Let `ABS` = `/private/var/folders/fy/wg2tzrv957sg2vqjcvdkdzvm0000gn/T/run-scenario.57vhwfus`
(every path in the transcript is absolute under this tmpdir). The fixture JSONL is
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s3-copy-file/ac6edd6f-cc4e-4423-87f9-468530849db5.jsonl`.

File-mutating events in timestamp order; `changeId` = the tool_use id shown:

| time (Z)     | tool      | changeId (toolu_…)         | effect                                            |
|--------------|-----------|----------------------------|---------------------------------------------------|
| 16:16:10.514 | Write     | `01Sp68G4xsTBUBNjyQrgLuat` | create `ABS/s3_source.py` (2 lines)               |
| 16:16:11.185 | Write     | `01UZv3kDuy4K8n6jU7PCpzpR` | create `ABS/tests/test_s3_source.py` (6 lines)    |
| 16:16:27.224 | Bash `cp` | `01JD5DoUCPtnnQrnJpSDmHwf` | copy `ABS/s3_source.py` → `ABS/s3_copy.py`        |
| 16:16:42.488 | Edit      | `012rscwPrNJgreMrLzXzsNjc` | `s3_copy.py`: `def hello():` → `def greet():`      |

(A `Read` of `s3_copy.py` at 16:16:36.928 sits between the `cp` and the Edit — not
modeled, see scope.)

`cp` command string (one space-separated source and destination, no flags):
`cp ABS/s3_source.py ABS/s3_copy.py`.

`s3_source.py` content (2 lines after trailing-newline split): `def hello():`,
`    print("hello")`.

`tests/test_s3_source.py` content (6 lines): `from s3_source import hello`, ``, ``,
`def test_hello(capsys):`, `    hello()`,
`    assert capsys.readouterr().out == "hello\n"`.

Edit `012rscwP` — one hunk: `oldStart:1 oldLines:2 newStart:1 newLines:2`,
`lines = ["-def hello():", "+def greet():", "     print(\"hello\")"]`. As in S2,
the `structuredPatch` lives on the **user record's top-level `toolUseResult`** (an
`EditResult`), reached via that record's `tool_result` block's `tool_use_id` — the
existing `indexEditHunksByToolUseId` already reads it.

## Expected reconstruction (Tasks 3–4 assert these shapes)

`s3_source.py` → 1 entry:
- `0` kind `write`, 2 genesis lines (`def hello():`, `    print("hello")`, every
  `oldLineNum === -1`), changeId `01Sp68G4`.

`tests/test_s3_source.py` → 1 entry:
- `0` kind `write`, 6 genesis lines, changeId `01UZv3kD`.

`s3_copy.py` → 3 entries (its own lineage, keyed by `s3_copy.py`):
- `0` kind `copy`, 2 genesis lines seeded from `s3_source.py` at copy time
  (`def hello():`, `    print("hello")`, every `oldLineNum === -1`), `copy.from`
  ends `/s3_source.py`, `copy.to` ends `/s3_copy.py`, changeId `01JD5DoU`.
- `1` kind `edit` (removal), 1 line (`    print("hello")`, `oldLineNum 1`), changeId
  `012rscwP`; the `def hello():` line (old index 0) is dropped.
- `2` kind `edit` (addition), 2 lines, **same** changeId `012rscwP`; idx0 born
  (`def greet():`, `oldLineNum -1`), idx1 `oldLineNum 0`.

---

## Task 1 — Extract the `cp` as a copy event

**Behavior:** extracting S3 finds exactly one copy event from the `cp`, carrying
`from`/`to` paths and the `cp` tool_use's changeId; and `contentPathOf` of a copy
event is its destination.

**RED:** first add the fixture constant, then the tests.

1. `tests/fixtures.ts` — add beside `S2_JSONL`:
   ```ts
   export const S3_JSONL =
       "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s3-copy-file/ac6edd6f-cc4e-4423-87f9-468530849db5.jsonl";
   ```
2. `tests/reconstruction_extract.test.ts` — import `S3_JSONL`, `EventKind`,
   `extractFileEvents`, `loadRecords`, and add:
   ```ts
   test("test_extract_finds_copy_from_cp", () => {
       // Extract every file event from the S3 transcript.
       const events = extractFileEvents(loadRecords(S3_JSONL));
       // Keep only the copy events.
       const copies = events.filter((event) => event.kind === EventKind.copy);
       // The single cp produces exactly one copy event.
       assert.equal(copies.length, 1);
       // It copies s3_source.py to s3_copy.py.
       assert.ok(copies[0]!.from.toString().endsWith("/s3_source.py"));
       assert.ok(copies[0]!.to.toString().endsWith("/s3_copy.py"));
       // Its changeId is the cp tool_use id.
       assert.ok(copies[0]!.changeId.toString().endsWith("01JD5DoUCPtnnQrnJpSDmHwf"));
   });
   ```
3. `tests/reconstruction_lineage.test.ts` — add a unit test that a copy event's
   content path is its destination (build a literal `CopyEvent`):
   ```ts
   test("test_content_path_of_copy_is_its_destination", () => {
       // A copy event moving content into s3_copy.py.
       const copy: CopyEvent = {
           kind: EventKind.copy,
           changeId: new Uuid("toolu_cp"),
           from: new Path("/x/s3_source.py"),
           to: new Path("/x/s3_copy.py"),
           seedLines: [],
           timestamp: new Date("2026-06-18T16:16:27.224Z"),
       };
       // The path a copy touches is the destination it creates.
       assert.ok(contentPathOf(copy).equals(new Path("/x/s3_copy.py")));
   });
   ```
   These fail to compile (no `EventKind.copy`, no `CopyEvent`) → RED.

**GREEN:**
1. `src/structures/vocabulary.ts` — add `copy = "copy"` to `EventKind` and extend
   its comment to mention `copy` (Bash `cp`).
2. `src/reconstruction_engine.ts` — add the copy provenance type and event, and
   extend the union and the revision model:
   ```ts
   // The source and destination of a copy (the two paths a cp connects). Same
   // shape as RenameInfo but a distinct concept: a copy duplicates, a rename moves.
   export type CopyInfo = { from: Path; to: Path };

   // A copy (Bash cp): a NEW file whose genesis content is the source's content as
   // of the copy. seedLines holds those source line texts; it is empty from
   // extraction and filled during reconstruction (the cp result carries no
   // content). The source file lives on as its own history — a copy is not a move.
   export type CopyEvent = {
       kind: EventKind.copy;
       changeId: Uuid;
       from: Path;
       to: Path;
       seedLines: string[];
       timestamp: Date;
   };

   export type FileEvent =
       | WriteEvent
       | DeleteEvent
       | EditEvent
       | RenameEvent
       | CopyEvent;
   ```
   Add `copy?: CopyInfo;` to `FileRevision` (after `rename?`), and extend the
   `FileRevision` doc comment: "copy is set only on a copy (genesis) revision."
3. `src/reconstruction_extract.ts` — import `CopyEvent` and `CopyInfo` (type-only)
   from `./reconstruction_engine.ts`; add the `cp` parser and a `cp` branch in
   `bashEventFrom` (after the `mv` branch):
   ```ts
   // Parse `cp <src> <dst>` (two space-separated paths, no flags — the s3 form).
   function parseCpPaths(command: string): CopyInfo | undefined {
       const match = command.trim().match(/^cp\s+(\S+)\s+(\S+)$/);
       if (!match) {
           return undefined;
       }
       return { from: new Path(match[1]!), to: new Path(match[2]!) };
   }
   ```
   In `bashEventFrom`, after the `moved` block:
   ```ts
   const copied = parseCpPaths(input.command);
   if (copied) {
       return {
           kind: EventKind.copy,
           changeId: block.id,
           from: copied.from,
           to: copied.to,
           seedLines: [],
           timestamp,
       };
   }
   ```
   Update the `bashEventFrom` doc comment to read "`rm` → delete, `mv` → rename,
   `cp` → copy".
4. `src/reconstruction_lineage.ts` — teach `contentPathOf` about copy (single
   condition per `if`):
   ```ts
   export function contentPathOf(event: FileEvent): Path {
       if (event.kind === EventKind.rename) {
           return event.to;
       }
       if (event.kind === EventKind.copy) {
           return event.to;
       }
       return event.target;
   }
   ```
   Leave `buildRenameChain` unchanged — a copy must **not** enter the rename chain
   (locked decision 1), so source and destination stay distinct lineages and
   `distinctFinalPaths` keeps both. (The lineage-test import line will need
   `CopyEvent`, `Uuid`, `Path`, `contentPathOf`, `EventKind`.)

**Verify gate.** (Replay has no copy branch yet — but no test in this task replays
a copy, and S1/S2 transcripts contain no copy events, so nothing hits the replay
guard.)

---

## Task 2 — Replay a copy as a first-class genesis entry

Proven as a unit on a literal, already-seeded `CopyEvent` (no source resolution
yet — that is Task 3).

**Behavior:** replaying a copy event whose `seedLines` are known appends one
revision: kind `copy`, one genesis line per seed line (all `oldLineNum -1`) stamped
at the copy time, carrying the `from`/`to` provenance.

**RED:** `tests/reconstruction_replay.test.ts` — add:
```ts
test("test_replay_appends_copy_genesis_revision_from_seed_lines", () => {
    // A copy event seeded with the source's two lines at copy time.
    const copy: CopyEvent = {
        kind: EventKind.copy,
        changeId: new Uuid("toolu_cp"),
        from: new Path("/x/s3_source.py"),
        to: new Path("/x/s3_copy.py"),
        seedLines: ["def hello():", '    print("hello")'],
        timestamp: new Date("2026-06-18T16:16:27.224Z"),
    };
    // Replaying just the copy yields one revision.
    const revisions = replayEvents([copy]);
    assert.equal(revisions.length, 1);
    // It is a copy revision carrying the from/to provenance.
    assert.equal(revisions[0]!.kind, EventKind.copy);
    assert.ok(revisions[0]!.copy!.from.equals(new Path("/x/s3_source.py")));
    assert.ok(revisions[0]!.copy!.to.equals(new Path("/x/s3_copy.py")));
    // Its lines are the seed content, every line born here (genesis).
    assert.equal(revisions[0]!.lines.length, 2);
    assert.equal(revisions[0]!.lines[0]!.values[0]!.line, "def hello():");
    assert.equal(revisions[0]!.lines[0]!.oldLineNum, -1);
    // The genesis lines are stamped at the copy time.
    assert.equal(
        revisions[0]!.lines[0]!.values[0]!.timestamp.toISOString(),
        "2026-06-18T16:16:27.224Z",
    );
});
```
Fails to compile (no copy handling in replay) → RED.

**GREEN:** `src/reconstruction_replay.ts` — import `CopyEvent` (type-only) from
`./reconstruction_engine.ts`; add the builder and the branch. Reuse the existing
`genesisLine` helper:
```ts
// A copy is a first-class genesis entry: a NEW file born with the source's content
// as of the copy (seedLines), every line genesis (oldLineNum -1) stamped at the
// copy timestamp, recording the from/to provenance. The source file is untouched.
function copyRevision(event: CopyEvent): FileRevision {
    const lines = event.seedLines.map((line) =>
        genesisLine(line, event.timestamp),
    );
    return {
        kind: EventKind.copy,
        changeId: event.changeId,
        timestamp: event.timestamp,
        lines,
        copy: { from: event.from, to: event.to },
    };
}
```
Add to `appendRevisionsForEvent`, before the final `throw` (mirror the write/delete
branches):
```ts
if (event.kind === EventKind.copy) {
    revisions.push(copyRevision(event));
    return;
}
```

**Verify gate.**

---

## Task 3 — Seed the copy from the source at copy time, and reconstruct the copied file

**Behavior:** `reconstructFile(records, <s3_copy.py path>)` yields copy →
edit-removal → edit-addition; revision 0 is a copy seeded with the source's content
*as of the copy time*; the two edit revisions share one changeId.

**RED:** `tests/reconstruction_engine.test.ts` — add a helper that finds the copy
destination from the transcript, then the spec:
```ts
// The destination path of the single cp in the S3 transcript.
function s3CopyTargetPath(records: TranscriptRecord[]): Path {
    const copy = extractFileEvents(records).find(
        (event) => event.kind === EventKind.copy,
    );
    return (copy as CopyEvent).to;
}

test("test_copied_file_history_spans_copy_then_paired_edit", () => {
    // Load S3 and reconstruct the copied file by its destination path.
    const records = loadRecords(S3_JSONL);
    const revisions = reconstructFile(records, s3CopyTargetPath(records));
    // Three entries: the copy, then the edit removal, then the edit addition.
    assert.equal(revisions.length, 3);
    // Entry 0 is the copy, seeded with the source's two lines at copy time.
    assert.equal(revisions[0]!.kind, EventKind.copy);
    assert.equal(revisions[0]!.lines.length, 2);
    assert.equal(revisions[0]!.lines[0]!.values[0]!.line, "def hello():");
    assert.equal(revisions[0]!.lines[0]!.oldLineNum, -1);
    assert.ok(revisions[0]!.copy!.from.toString().endsWith("/s3_source.py"));
    // Entry 1 is the edit removal: def hello() dropped, leaving 1 line.
    assert.equal(revisions[1]!.kind, EventKind.edit);
    assert.equal(revisions[1]!.lines.length, 1);
    assert.equal(revisions[1]!.lines[0]!.oldLineNum, 1);
    // Entry 2 is the edit addition: def greet() born at index 0, back to 2 lines.
    assert.equal(revisions[2]!.lines.length, 2);
    assert.equal(revisions[2]!.lines[0]!.oldLineNum, -1);
    assert.equal(revisions[2]!.lines[0]!.values[0]!.line, "def greet():");
    // The removal and addition came from one Edit, so they share a changeId.
    assert.ok(revisions[1]!.changeId.equals(revisions[2]!.changeId));
});
```
This fails: the copy revision's `seedLines` are still empty (extraction sets `[]`),
so revision 0 has 0 lines → RED.

**GREEN:** `src/reconstruction_engine.ts` — resolve each copy's seed by
reconstructing its source up to the copy time, then replay. Replace the body of
`reconstructFile` with a private, cycle-guarded recursion and add the seed helpers:
```ts
// Reconstruct one file's history: follow any rename to its final path, keep only
// that lineage's events, seed any copy from its source, then replay.
export function reconstructFile(
    records: TranscriptRecord[],
    target: Path,
): FileRevision[] {
    return reconstructLineage(records, target, new Set<string>());
}

// resolving holds the destination paths currently being seeded, so a copy cycle
// (cp a b; cp b a) breaks instead of recursing forever.
function reconstructLineage(
    records: TranscriptRecord[],
    target: Path,
    resolving: Set<string>,
): FileRevision[] {
    const events = extractFileEvents(records);
    const renameChain = buildRenameChain(events);
    const finalTarget = resolveFinalPath(target, renameChain);
    const lineage = events.filter((event) =>
        eventBelongsToLineage(event, finalTarget, renameChain),
    );
    const seeded = seedCopyEvents(records, lineage, resolving);
    return replayEvents(seeded);
}

// Fill each copy event's seedLines from its source; pass other events through.
function seedCopyEvents(
    records: TranscriptRecord[],
    lineage: FileEvent[],
    resolving: Set<string>,
): FileEvent[] {
    return lineage.map((event) => {
        if (event.kind === EventKind.copy) {
            return seedOneCopy(records, event, resolving);
        }
        return event;
    });
}

// Seed one copy with the source file's content as of the copy timestamp.
function seedOneCopy(
    records: TranscriptRecord[],
    event: CopyEvent,
    resolving: Set<string>,
): CopyEvent {
    const destination = event.to.toString();
    if (resolving.has(destination)) {
        return { ...event, seedLines: [] };
    }
    const next = new Set(resolving);
    next.add(destination);
    const sourceRevisions = reconstructLineage(records, event.from, next);
    const atCopy = lastRevisionAtOrBefore(sourceRevisions, event.timestamp);
    if (!atCopy) {
        return { ...event, seedLines: [] };
    }
    return { ...event, seedLines: linesTextOf(atCopy) };
}

// The latest revision whose timestamp is at or before `when`, or undefined.
function lastRevisionAtOrBefore(
    revisions: FileRevision[],
    when: Date,
): FileRevision | undefined {
    let chosen: FileRevision | undefined;
    for (const revision of revisions) {
        if (revision.timestamp.getTime() <= when.getTime()) {
            chosen = revision;
        }
    }
    return chosen;
}

// The believed text of each line in a revision (its latest value).
function linesTextOf(revision: FileRevision): string[] {
    return revision.lines.map(
        (entry) => entry.values[entry.values.length - 1]!.line,
    );
}
```
Add `FileEvent` and `CopyEvent` to the symbols this file already declares/uses;
`extractFileEvents`, `buildRenameChain`, `resolveFinalPath`,
`eventBelongsToLineage`, and `replayEvents` are already imported.

**Verify gate.** (Hand-trace: the source lineage `[write]` reconstructs to one
2-line revision at 16:16:10; `lastRevisionAtOrBefore(16:16:27)` picks it; the copy
is seeded with those 2 lines; the existing edit splice then yields the 1-line
removal and 2-line addition.) If `reconstruction_engine.ts` approaches the 250-line
cap, move `seedCopyEvents`/`seedOneCopy`/`lastRevisionAtOrBefore`/`linesTextOf`
into a new `src/reconstruction_seed.ts` that imports `reconstructLineage` — but
prefer keeping them in the engine while it stays under the cap (this file owns the
recursion).

---

## Task 4 — `reconstructAll(S3)` returns three independent histories

**Behavior:** reconstructing every file in S3 returns exactly three histories —
`s3_source.py` (1 create), `tests/test_s3_source.py` (1 create), and `s3_copy.py`
(copy → edit → edit). The copy does **not** collapse the source: a history keyed by
`s3_source.py` still exists.

**RED:** add two specs.

1. `tests/reconstruction_lineage.test.ts` — copy keeps the source as its own final
   path:
   ```ts
   test("test_distinct_final_paths_keeps_copy_source_and_destination", () => {
       // A source write and a copy of it into a new file.
       const write: WriteEvent = {
           kind: EventKind.write,
           changeId: new Uuid("toolu_w"),
           target: new Path("/x/s3_source.py"),
           content: "def hello():\n",
           timestamp: new Date("2026-06-18T16:16:10.514Z"),
       };
       const copy: CopyEvent = {
           kind: EventKind.copy,
           changeId: new Uuid("toolu_cp"),
           from: new Path("/x/s3_source.py"),
           to: new Path("/x/s3_copy.py"),
           seedLines: [],
           timestamp: new Date("2026-06-18T16:16:27.224Z"),
       };
       // A copy is absent from the rename chain, so both paths survive.
       const renameChain = buildRenameChain([write, copy]);
       const finals = distinctFinalPaths([write, copy], renameChain)
           .map((path) => path.toString());
       // Both the source and the copy destination are distinct histories.
       assert.ok(finals.some((path) => path.endsWith("/s3_source.py")));
       assert.ok(finals.some((path) => path.endsWith("/s3_copy.py")));
       assert.equal(finals.length, 2);
   });
   ```
2. `tests/reconstruction_engine.test.ts`:
   ```ts
   test("test_reconstruct_all_returns_three_s3_histories", () => {
       // Reconstruct every file the S3 transcript touches.
       const histories = reconstructAll(loadRecords(S3_JSONL));
       // Exactly three files: source, its test, and the copy.
       assert.equal(histories.length, 3);
       // The source survives the copy as its own one-revision history.
       const source = histories.find((history) =>
           history.target.toString().endsWith("/s3_source.py"),
       )!;
       assert.equal(source.revisions.length, 1);
       assert.equal(source.revisions[0]!.kind, EventKind.write);
       // The copied file's history is copy -> edit -> edit.
       const copy = histories.find((history) =>
           history.target.toString().endsWith("/s3_copy.py"),
       )!;
       assert.equal(copy.revisions.length, 3);
       assert.equal(copy.revisions[0]!.kind, EventKind.copy);
       // The test file is untouched after creation.
       const test = histories.find((history) =>
           history.target.toString().endsWith("/test_s3_source.py"),
       )!;
       assert.equal(test.revisions.length, 1);
   });
   ```

**GREEN:** expected to pass with **no new code** — `distinctFinalPaths` and
`reconstructAll` already key by `contentPathOf` + `resolveFinalPath`, and Task 1
made `contentPathOf` of a copy its destination while leaving copies out of the
rename chain. If either spec fails, the defect is in `contentPathOf`/the rename
chain from Task 1 — fix there, do not special-case `reconstructAll`. (These specs
lock the "copy ≠ merge" decision against regression.)

**Verify gate.** (Re-run S2's `test_reconstruct_all_returns_two_s2_lineages` and
S1's `test_reconstruct_all_accounts_for_every_touched_file` — still 2 each.)

---

## Task 5 — Render the copy as a first-class entry (verbose / diff / list)

**Behavior:** the list view shows a copy entry labelled `copy` with its line count
and `(copied from <name>)`, and the copied file's header reads `(copy of <name>)`;
the diff view shows a copy as a `@@ copied A → B @@` block with its lines as
additions; the verbose view labels the entry `copy` and shows its `from → to` plus
the line body.

**RED:** `tests/reconstruction_render.test.ts` — build a literal copy
`FileRevision` fixture and add:
```ts
// A copy genesis revision for s3_copy.py (two lines, copy provenance).
const copyRevisionFixture: FileRevision = {
    kind: EventKind.copy,
    changeId: new Uuid("toolu_01JD5DoUCPtnnQrnJpSDmHwf"),
    timestamp: new Date("2026-06-18T16:16:27.224Z"),
    lines: [
        { oldLineNum: -1, values: [{ line: "def hello():", timestamp: new Date("2026-06-18T16:16:27.224Z") }] },
        { oldLineNum: -1, values: [{ line: '    print("hello")', timestamp: new Date("2026-06-18T16:16:27.224Z") }] },
    ],
    copy: { from: new Path("/x/s3_source.py"), to: new Path("/x/s3_copy.py") },
};

test("test_list_shows_copy_entry_with_provenance", () => {
    // Render the default list view for the copied file.
    const output = renderHistoryList([
        { target: new Path("/x/s3_copy.py"), revisions: [copyRevisionFixture] },
    ]);
    // The header marks it a copy of the source.
    assert.ok(output.includes("(copy of s3_source.py)"));
    // The entry is labelled copy and notes its origin.
    assert.ok(output.includes("copy"));
    assert.ok(output.includes("(copied from s3_source.py)"));
});

test("test_diff_shows_copy_as_its_own_block_with_added_lines", () => {
    // Render the diff for a lone copy revision.
    const output = renderDiff([copyRevisionFixture]);
    // It is a copied block naming both paths.
    assert.ok(output.includes("copied"));
    assert.ok(output.includes("s3_source.py"));
    assert.ok(output.includes("s3_copy.py"));
    // Its genesis lines appear as additions.
    assert.ok(output.includes("+ def hello():"));
});

test("test_verbose_labels_copy_entry_with_arrow_and_body", () => {
    // Render the verbose state for a lone copy revision.
    const output = renderVerbose([copyRevisionFixture]);
    // It is labelled copy, shows the arrow, and lists the body lines.
    assert.ok(output.includes("copy"));
    assert.ok(output.includes("→"));
    assert.ok(output.includes("def hello():"));
});
```
Fail to compile/assert (render has no copy handling) → RED.

**GREEN:** `src/reconstruction_render.ts` — import `CopyInfo` (type-only) from
`./reconstruction_engine.ts`. Make the existing arrow helper generic and add copy
handling everywhere a kind is branched:
1. Rename `renderRenameArrow(rename: RenameInfo)` to
   `renderPathArrow(transition: { from: Path; to: Path })` (a copy and a rename
   both render `from → to`); update **both** existing rename callers — the rename
   branch in `renderRevisionState` and the rename branch in `diffBlock`.
   (`entryDetail`'s rename branch uses `baseName` directly and is unaffected.)
2. `renderRevisionState` — add a copy branch before the line-state body (a copy has
   both provenance and content, so show the arrow header *and* the numbered body):
   ```ts
   if (revision.kind === EventKind.copy && revision.copy) {
       const count = revision.lines.length;
       const header = `revision ${index}  copy  ${renderPathArrow(revision.copy)}  @ ${stamp}  (${count} lines)`;
       const body = revision.lines.map(renderNumberedLine).join("\n");
       return `${header}\n${body}`;
   }
   ```
3. `diffBlock` — add a copy branch (genesis lines are already `oldLineNum -1`, so
   `addedLines` renders them as `+`):
   ```ts
   if (revision.kind === EventKind.copy && revision.copy) {
       const header = `@@ copied ${renderPathArrow(revision.copy)} @ ${stamp} @@`;
       const added = addedLines(revision);
       return [header, ...added].join("\n");
   }
   ```
4. `entryLabel` — add a copy case:
   ```ts
   if (kind === EventKind.copy) {
       return "copy";
   }
   ```
5. `entryDetail` — add a copy case (its content count plus origin), before the
   default line-count return:
   ```ts
   if (revision.kind === EventKind.copy && revision.copy) {
       return `${revision.lines.length} lines  (copied from ${baseName(revision.copy.from)})`;
   }
   ```
6. `renderHistoryBlock` — extend the header so a copied file reads `(copy of X)`.
   Add a finder beside `originalPathOf`:
   ```ts
   // The source path a copied history was born from, if it began as a copy.
   function copyOriginOf(revisions: FileRevision[]): Path | undefined {
       const copied = revisions.find(
           (revision) => revision.kind === EventKind.copy && revision.copy,
       );
       return copied?.copy?.from;
   }
   ```
   In `renderHistoryBlock`, build the header with single-condition guards:
   ```ts
   const was = originalPathOf(history.revisions);
   const copiedFrom = copyOriginOf(history.revisions);
   let header = `${history.target}`;
   if (was) {
       header = `${history.target}   (was ${baseName(was)})`;
   } else if (copiedFrom) {
       header = `${history.target}   (copy of ${baseName(copiedFrom)})`;
   }
   ```

**Verify gate.** If `reconstruction_render.ts` exceeds the 250-line cap (it is
already ~220), split the default list view into a new
`src/reconstruction_render_list.ts` — move `renderHistoryList` and its helpers
(`baseName`, `shortChangeId`, `shortTime`, `entryLabel`, `entryDelta`,
`entryDetail`, `renderEntry`, `originalPathOf`, `copyOriginOf`,
`renderHistoryBlock`), keep `renderVerbose`/`renderDiff` in `reconstruction_render.ts`,
and relocate the list-view tests into a new
`tests/reconstruction_render_list.test.ts`. Update the import in
`reconstruction_cli.ts` to pull `renderHistoryList` from the new module. Split,
never condense comments or single-line expressions.

---

## Task 6 — Run against the real S3 transcript + docs

**Behavior:** the no-`--target` CLI default view prints the three S3 files with the
copied file's first-class copy entry.

**RED:** `tests/reconstruction_cli.test.ts` — import `S3_JSONL` and add:
```ts
test("test_default_view_lists_s3_with_copy_entry", () => {
    // Run the CLI default view over the real S3 transcript.
    const output = runCli([S3_JSONL]);
    // All three touched files appear.
    assert.ok(output.includes("s3_source.py"));
    assert.ok(output.includes("s3_copy.py"));
    assert.ok(output.includes("test_s3_source.py"));
    // The copied file is marked a copy of the source and carries a copy entry.
    assert.ok(output.includes("(copy of s3_source.py)"));
    assert.ok(output.includes("copy"));
    // The copied file's edits share the Edit's short changeId.
    assert.ok(output.includes("#012rscwP"));
});
```

**GREEN:** no CLI logic change is expected — `runCli`'s default path already calls
`renderHistoryList(reconstructAll(records))`. If the test fails only on formatting,
fix the format in `reconstruction_render.ts` (Task 5), not in the CLI.

Then update the docs:
1. `plans/reconstruction-engine-design.md` — move `cp` lineage out of "Deferred",
   add an **S3 — implemented now** subsection with new numbered specs (15+) for:
   copy extraction, copy as a first-class genesis entry, seed-from-source-at-copy-
   time, and copy-does-not-collapse-source (three independent histories). Record
   the three locked S3 decisions in the S3 scope paragraph, and update the **Scope
   so far** and **Code layout** sections (note any new `reconstruction_seed.ts` /
   `reconstruction_render_list.ts` only if a split was actually made).
2. `plans/implementation-notes-api-from-scenarios.md` — prepend a dated S3 entry:
   the `cp` capability, the seed-from-source-at-copy-time decision and why
   `originalFile` was rejected, the cycle guard, and any module split made.
3. `plans/roadmap.md` — mark the S3 line done.

**Verify gate**, then stop and report. Commit only after the user approves.

Locked default-view format (for the real S3 transcript):
```
s3_source.py
  0  create   2 lines            16:16:10Z  #01Sp68G4

tests/test_s3_source.py
  0  create   6 lines            16:16:11Z  #01UZv3kD

s3_copy.py   (copy of s3_source.py)
  0  copy     2 lines  (copied from s3_source.py)   16:16:27Z  #01JD5DoU
  1  edit     1 lines  (−1)      16:16:42Z  #012rscwP
  2  edit     2 lines  (+1)      16:16:42Z  #012rscwP
```

---

## Verify gate (run after every task; all three must pass before the next task)

```
npm test                                  # S1 + S2 + the S3 specs added so far, 0 fail
npx tsc --noEmit                          # No errors found
python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py src/reconstruction_*.ts
```

`tsx` does not type-check, so `npx tsc --noEmit` is the type gate. Ignore any stale
`PostToolBatch`/`PostToolUse` hook failure for a file written in the same batch as
its test — the explicit `npm test` run is authoritative. If a module crosses the
250-line cap, split per the per-task instructions above (split over condense).
Clean room is absolute: never import or copy from `/Users/matkatmusicllc/Desktop/claude code src/` — that path is read-only ground truth.

## End-to-end check (after Task 6)

```
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s3-copy-file/ac6edd6f-cc4e-4423-87f9-468530849db5.jsonl" 2>/dev/null
# Expect three files; s3_copy.py headed "(copy of s3_source.py)" with a first-class
# copy entry (2 lines, copied from s3_source.py) then the two edit entries sharing
# #012rscwP. Add --verbose / --diff to see the copy's arrow + body and the
# -def hello() / +def greet() change.
```
