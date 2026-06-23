# Plan: S4 slice — overwrite (a second Write to an existing file)

Implement in the listed order. Each task is **RED first** (write the failing
`test_<behavior>` with plain-English step comments) then **GREEN** (minimum code in
separate verb-named functions). After every task run the three checks under
**Verify gate** and do not start the next task until all three are green.

All work is in the `api-from-scenarios` worktree, built directly on the implemented S3
slice (65 tests green). Source modules today: `src/reconstruction_engine.ts` (model +
public API + copy-seed recursion), `src/reconstruction_extract.ts` (records → events),
`src/reconstruction_replay.ts` (events → revisions), `src/reconstruction_lineage.ts`
(rename/copy path resolution), `src/reconstruction_render.ts` (verbose + diff + the default
list view), `src/reconstruction_cli.ts`, `src/structures/vocabulary.ts` (the `EventKind`
enum). Tests: `tests/reconstruction_{engine,extract,replay,lineage,render,cli}.test.ts`
(`node:test`); helpers `loadRecords` (`tests/utilities.ts`), `S1_JSONL`/`S2_JSONL`/`S3_JSONL`
(`tests/fixtures.ts`). Style: 4-space indent, verb-named functions, `Path`/`Uuid` domain
types (never bare strings for paths/ids), compare enums by member (`x === EventKind.write`),
one canonical wire-vocabulary home (`vocabulary.ts`).

## What S4 adds

The `s4-overwrite-file` scenario (Write → Write → **rewrite** `s4_overwrite.py` with a fresh
Write → rewrite the test file with a fresh Write) adds exactly one new engine capability:
**overwrite** — a second `Write` to a file that already exists, replacing all of its content.
This is distinct from an `Edit` (a partial splice, S2) and from a create (the first Write).

**The engine already reconstructs the right content for an overwrite** — `replayEvents`
pushes one `writeRevision` per write event, and `writeRevision` builds genesis lines from
`event.content`, so a second write to a path already yields a second full-content genesis
revision. S4's work is therefore narrow: **mark that second revision as an `overwrite`** (a
distinct kind, label, and diff header) rather than a second `create`, and prove the end-to-end
reconstruction and rendering. Because `src/reconstruction_render.ts` is at **249/250 lines**,
S4 also performs the pre-agreed split of the default list view into a new
`src/reconstruction_render_list.ts` before adding the overwrite label.

## Locked decisions (drive output shape; the implementer must confirm with the user — these mirror S2/S3's locked decisions and may be adjusted before coding if the user objects)

1. **An overwrite is a fresh full-content revision** — every line genesis (`oldLineNum -1`),
   stamped at the overwrite's timestamp, content taken from the Write's `content`. It is NOT
   spliced like an Edit. This honours the user's literal instruction ("Rewrite completely.
   Replace everything"): the diff shows a wholesale remove-all / add-all, not a line-by-line
   delta. (Rejected alternative: splice the overwrite Write's `structuredPatch` into a
   removal+addition pair like an Edit — it would preserve incidental unchanged-line lineage
   but misrepresents a wholesale rewrite as an edit and blurs the Write/Edit boundary.)
2. **Overwrite is detected at replay time by file presence, not at extraction.** A write event
   whose file is currently *present* (there is a previous revision and it is not a deletion)
   produces an overwrite; the first write (no previous revision) produces a create.
   Extraction keeps emitting plain `EventKind.write` events. The overwrite Write's
   `structuredPatch`/`originalFile` fields are deliberately **not** read — consistent with
   S3's rejection of `originalFile` (the project note `originalfile-not-always-populated`):
   replaying the events we already model is the clean-room, evidence-based path.
3. **Overwrite is its own revision `kind` (`EventKind.overwrite`), not a new event type.**
   There is no `OverwriteEvent`; `WriteEvent` covers both. The kind lives only on the
   `FileRevision`, so the list view labels it `overwrite` (not `create`) and the diff heads it
   `overwritten`. A write-after-delete (delete then re-create, scenario M4) leaves the file
   absent, so its write stays a `create` — overwrite is specifically "replace present content".

## Ground truth (S4 transcript — assert against these literal values)

`tests/fixtures.ts` gets `S4_JSONL` pointing at
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s4-overwrite-file/58f8c26c-48d5-4e8f-953c-265005a6ee73.jsonl`.

Mutating events in timestamp order; `changeId` = the tool_use id shown (the engine uses
`block.id`; `shortChangeId` drops the `toolu_` prefix and keeps 8 chars):

| time (Z) | tool | changeId (toolu_…) | effect |
|----------|------|--------------------|--------|
| 16:16:40 | Write | `01RMyyRt6YXqSD8eKAMbZ27Z` | create `…/s4_overwrite.py` (2 lines) |
| 16:16:41 | Write | `017kvbv4qLaXa1JG4wA7P38B` | create `…/tests/test_s4_overwrite.py` (5 lines) |
| 16:16:55 | Write | `012vJCJsTBLFuxsCnBSbdoLA` | **overwrite** `…/s4_overwrite.py` (2 lines) |
| 16:16:56 | Write | `01H4X6URpkNyVUFYz2zzpfhT` | **overwrite** `…/tests/test_s4_overwrite.py` (5 lines) |

The transcript also contains interleaved `Bash` calls (`ls …`, `python -m pytest …` twice);
`bashEventFrom` matches only `rm`/`mv`/`cp`, so these correctly produce no events. There is no
rename, delete, copy, or git mv in S4.

Literal file contents (genesis text for each revision):
- `s4_overwrite.py` create → `["def version1():", "    return 1"]`
- `s4_overwrite.py` overwrite → `["def version2():", "    return 2"]`
- `tests/test_s4_overwrite.py` create → `["from s4_overwrite import version1", "", "", "def test_version1_returns_1():", "    assert version1() == 1"]`
- `tests/test_s4_overwrite.py` overwrite → `["from s4_overwrite import version2", "", "", "def test_version2_returns_2():", "    assert version2() == 2"]`

## Expected reconstruction (Task 3 asserts the full shapes)

`s4_overwrite.py` → 2 entries (no rename/copy; keyed by its own path):
- `0` kind `write`, 2 genesis lines (`def version1():`, `    return 1`; every `oldLineNum === -1`), changeId `01RMyyRt`.
- `1` kind **`overwrite`**, 2 genesis lines (`def version2():`, `    return 2`; every `oldLineNum === -1`), changeId `012vJCJs`.

`tests/test_s4_overwrite.py` → 2 entries:
- `0` kind `write`, 5 genesis lines, changeId `017kvbv4`.
- `1` kind **`overwrite`**, 5 genesis lines (the `version2` test), changeId `01H4X6UR`.

Locked default list format (line counts are equal across versions, so no `(+N)`/`(−N)` delta;
the `overwrite` label is wider than the others, so its row is not column-aligned with them):
```
s4_overwrite.py
  0  create   2 lines            16:16:40Z  #01RMyyRt
  1  overwrite  2 lines          16:16:55Z  #012vJCJs

tests/test_s4_overwrite.py
  0  create   5 lines            16:16:41Z  #017kvbv4
  1  overwrite  5 lines          16:16:56Z  #01H4X6UR
```

---

## Task 1 — `EventKind.overwrite` and a replay that distinguishes create from overwrite

Proven as a pure replay unit test (no transcript): two write events to the same path replay
into a create then an overwrite.

**Behavior:** replaying two write events for one file yields two revisions — the first of kind
`write` (create), the second of kind `overwrite` — each carrying its own content as genesis
lines and its own changeId.

**RED:** add to `tests/reconstruction_replay.test.ts`:
```ts
// Two writes to the same path: a create then a full-content overwrite.
test("test_second_write_to_a_present_file_is_an_overwrite", () => {
    // Two write events to one path, version1 then version2.
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    const target = new Path("/a/s4_overwrite.py");
    const events: FileEvent[] = [
        { kind: EventKind.write, changeId: new Uuid("w1"), target, content: "def version1():\n    return 1\n", timestamp: t0 },
        { kind: EventKind.write, changeId: new Uuid("w2"), target, content: "def version2():\n    return 2\n", timestamp: t1 },
    ];
    const revisions = replayEvents(events);
    // Two revisions: the create, then the overwrite.
    assert.equal(revisions.length, 2);
    // The first write is a create (the file was absent before it).
    assert.equal(revisions[0]!.kind, EventKind.write);
    // The second write is an overwrite (the file was present), carrying version2 as genesis.
    assert.equal(revisions[1]!.kind, EventKind.overwrite);
    assert.equal(revisions[1]!.lines.length, 2);
    assert.equal(revisions[1]!.lines[0]!.oldLineNum, -1);
    assert.equal(revisions[1]!.lines[0]!.values[0]!.line, "def version2():");
    // The two revisions come from different writes, so their change ids differ.
    assert.ok(!revisions[0]!.changeId.equals(revisions[1]!.changeId));
});
```
`EventKind.overwrite` does not exist yet → RED (does not compile).

**GREEN:**
1. `src/structures/vocabulary.ts` — add `overwrite = "overwrite"` to `EventKind` and extend the
   member comment to note `s4-overwrite-file adds overwrite (a second Write to a present file)`.
2. `src/reconstruction_replay.ts` — make `writeRevision` set its kind from a presence flag, and
   decide presence in the write branch:
   ```ts
   // A write produces a create when the file is absent, or an overwrite when it is
   // already present. Either way the new content is genesis (every line born here):
   // an overwrite replaces all content, it does not splice (locked decision 1).
   function writeRevision(event: WriteEvent, replacesPresent: boolean): FileRevision {
       const lines = splitLines(event.content).map((line) =>
           genesisLine(line, event.timestamp),
       );
       return {
           kind: replacesPresent ? EventKind.overwrite : EventKind.write,
           changeId: event.changeId,
           timestamp: event.timestamp,
           lines,
       };
   }

   // The file is present when the latest revision exists and is not a deletion — so a
   // write after a delete is a fresh create, not an overwrite (locked decision 3).
   function fileIsPresent(revisions: FileRevision[]): boolean {
       const last = revisions[revisions.length - 1];
       return last !== undefined && last.kind !== EventKind.delete;
   }
   ```
   In `appendRevisionsForEvent`, change the write branch to
   `revisions.push(writeRevision(event, fileIsPresent(revisions)));`.

**Verify gate.** (The S1/S2/S3 single-write paths still produce `create` because their first
write sees no previous revision; no path in S1–S3 is written twice.)

---

## Task 2 — Extraction emits both writes; `S4_JSONL` fixture

**Behavior:** extracting S4 finds four write events (two per file), each with its own changeId,
in timestamp order; the two for `s4_overwrite.py` are the create and the later overwrite.

**RED:** add `S4_JSONL` to `tests/fixtures.ts` (absolute path above, same shape as `S3_JSONL`),
then add to `tests/reconstruction_extract.test.ts`:
```ts
// S4 performs four writes: create + overwrite for each of the two files.
test("test_extract_finds_four_writes_two_per_file", () => {
    // Keep only the write events from the S4 transcript.
    const writes = extractFileEvents(loadRecords(S4_JSONL)).filter(
        (event) => event.kind === EventKind.write,
    );
    // Exactly four writes (no rm/mv/cp; the Bash ls/pytest calls yield no events).
    assert.equal(writes.length, 4);
    // Two of them target s4_overwrite.py, in timestamp order create then overwrite.
    const overwriteFile = writes.filter((event) =>
        event.target.toString().endsWith("/s4_overwrite.py"),
    );
    assert.equal(overwriteFile.length, 2);
    // The later write carries the version2 content.
    assert.ok(overwriteFile[1]!.content.includes("def version2():"));
});
```
This compiles but fails until `S4_JSONL` is added (and confirms extraction needs no change).
Import `S4_JSONL` and `EventKind` as needed.

**GREEN:** add only the `S4_JSONL` constant to `tests/fixtures.ts`. **No extraction code
changes** — `writeEventFrom` already captures `input.content`, and `bashEventFrom` already
ignores `ls`/`pytest`. (If the test passes immediately on adding the fixture, that is the
intended result: it locks that extraction is overwrite-agnostic.)

**Verify gate.**

---

## Task 3 — `reconstructFile` / `reconstructAll(S4)`: two independent histories, each create→overwrite

**Behavior:** reconstructing each S4 file yields create → overwrite with the literal shapes in
**Expected reconstruction**; reconstructing every file returns exactly two histories, keyed by
the two distinct paths, neither collapsing into the other.

**RED:** add to `tests/reconstruction_engine.test.ts`:
```ts
// helper: the absolute path of the file the transcript overwrites.
function s4OverwritePath(records: TranscriptRecord[]): Path {
    return extractFileEvents(records)
        .filter((event) => event.kind === EventKind.write)
        .find((event) => event.target.toString().endsWith("/s4_overwrite.py"))!.target;
}

test("test_overwrite_file_history_is_create_then_overwrite", () => {
    // Reconstruct s4_overwrite.py by its path.
    const records = loadRecords(S4_JSONL);
    const revisions = reconstructFile(records, s4OverwritePath(records));
    // Two entries: the version1 create, then the version2 overwrite.
    assert.equal(revisions.length, 2);
    assert.equal(revisions[0]!.kind, EventKind.write);
    assert.equal(revisions[0]!.lines[0]!.values[0]!.line, "def version1():");
    assert.equal(revisions[1]!.kind, EventKind.overwrite);
    assert.equal(revisions[1]!.lines.length, 2);
    assert.equal(revisions[1]!.lines[0]!.values[0]!.line, "def version2():");
    // Every overwrite line is genesis (a wholesale replacement, not a splice).
    assert.ok(revisions[1]!.lines.every((entry) => entry.oldLineNum === -1));
});

test("test_reconstruct_all_returns_two_independent_s4_histories", () => {
    // Reconstruct every file S4 touches.
    const histories = reconstructAll(loadRecords(S4_JSONL));
    // Exactly two files, neither collapsed into the other.
    assert.equal(histories.length, 2);
    // Each history is a create followed by an overwrite.
    for (const history of histories) {
        assert.equal(history.revisions.length, 2);
        assert.equal(history.revisions[0]!.kind, EventKind.write);
        assert.equal(history.revisions[1]!.kind, EventKind.overwrite);
    }
    // The two files are the source and its test, by final path.
    const names = histories.map((history) => history.target.toString());
    assert.ok(names.some((name) => name.endsWith("/s4_overwrite.py")));
    assert.ok(names.some((name) => name.endsWith("/tests/test_s4_overwrite.py")));
});
```

**GREEN:** **no engine code changes expected** — `reconstructFile` filters the lineage by
path (the rename chain is empty in S4, so `resolveFinalPath` is identity), `seedCopyEvents`
passes write events through untouched, and `distinctFinalPaths` already keys each path once.
The tests should pass on Task 1's replay change alone. (This task locks the two-history,
no-collapse decision the way S3's Task 4 did.) Ensure the engine test file imports
`TranscriptRecord`, `extractFileEvents`, `Path`, `EventKind`, and `S4_JSONL`.

**Verify gate.**

---

## Task 4 — Split the default list view into `src/reconstruction_render_list.ts` (refactor, no behavior change)

`src/reconstruction_render.ts` is at 249/250 lines; Task 5 must add to it, so split first. This
is the remedy pre-agreed in the S3 handoff. **Split, never condense** (the user's
"split over condense" preference). Pure move — no behavior change.

**RED:** relocate the one existing list-view test so it imports from the new module (which does
not exist yet → fails to resolve → RED). Create `tests/reconstruction_render_list.test.ts` and
**move** `test_list_shows_copy_entry_with_provenance` (lines 145–156 of
`tests/reconstruction_render.test.ts`) into it, importing `renderHistoryList` from
`../src/reconstruction_render_list.ts`. Give the relocated test its own small copy fixture
(an inline `FileRevision` of `kind: EventKind.copy` with two genesis lines and a
`copy: { from, to }`), since the shared `copyRevisionFixture` stays in
`reconstruction_render.test.ts` for the diff/verbose copy tests that remain. Delete the moved
test (only that one) from `reconstruction_render.test.ts`; keep `renderHistoryList` out of its
imports there.

**GREEN:**
1. Create `src/reconstruction_render_list.ts`. **Move** from `reconstruction_render.ts` (cutting
   them out of that file) the default-list section: `renderHistoryList` and its helpers
   `baseName`, `shortChangeId`, `shortTime`, `entryLabel`, `entryDelta`, `entryDetail`,
   `renderEntry`, `originalPathOf`, `copyOriginOf`, `renderHistoryBlock`. Export
   `renderHistoryList`. Imports it needs: `FileHistory`, `FileRevision` (type-only) from
   `./reconstruction_engine.ts`; `EventKind` from `./structures/vocabulary.ts`; `Path`, `Uuid`
   (type-only) from `./structures/domain.ts`. Header comment: "Default list view for the
   reconstruction engine: one block per touched file with its numbered entries (kind, line
   count or rename/copy detail, short time, short change id). Pure over FileHistory[]."
2. `src/reconstruction_render.ts` now keeps only `renderVerbose` and `renderDiff` (and their
   helpers `currentText`, `renderNumberedLine`, `renderPathArrow`, `renderRevisionState`,
   `diffLabel`, `keptOldIndices`, `removedLines`, `addedLines`, `diffBlock`). Drop the now-unused
   `Uuid` import (it was only used by the moved `shortChangeId`); keep `Path` (used by
   `renderPathArrow`). `noUnusedLocals`/`noUnusedParameters` make a stray import a hard `tsc`
   error, so prune precisely.
3. `src/reconstruction_cli.ts` — import `renderHistoryList` from `./reconstruction_render_list.ts`
   and keep importing `renderDiff`/`renderVerbose` from `./reconstruction_render.ts`.

**Verify gate.** (All 65 prior tests plus the relocated one stay green; `filesize_check.py`
now passes with room — `reconstruction_render.ts` drops to ≈133 lines and the new list module
is ≈115.)

---

## Task 5 — Render the overwrite entry (list label + diff header)

**Behavior:** the default list view labels an overwrite entry `overwrite` (not `create` and not
`delete`); the diff view heads an overwrite block `overwritten` and shows its content as a full
remove-all / add-all; the verbose view shows the overwrite's full new line state (already true
via the default branch — assert it as a lock).

**RED:** add unit tests (literal `FileRevision[]`, no transcript).

In `tests/reconstruction_render_list.test.ts`:
```ts
// A create then an overwrite of the same two-line file, from literals.
function createThenOverwrite(): FileRevision[] {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    const v1 = ["def version1():", "    return 1"].map((line) => ({ oldLineNum: -1, values: [{ line, timestamp: t0 }] }));
    const v2 = ["def version2():", "    return 2"].map((line) => ({ oldLineNum: -1, values: [{ line, timestamp: t1 }] }));
    return [
        { kind: EventKind.write, changeId: new Uuid("w1"), timestamp: t0, lines: v1 },
        { kind: EventKind.overwrite, changeId: new Uuid("w2"), timestamp: t1, lines: v2 },
    ];
}

// The list view labels the second entry an overwrite, not a create or delete.
test("test_list_labels_overwrite_entry", () => {
    const out = renderHistoryList([{ target: new Path("/a/s4_overwrite.py"), revisions: createThenOverwrite() }]);
    // The overwrite entry is labelled overwrite.
    assert.ok(out.includes("overwrite"));
    // It is not mislabelled delete (the entryLabel fall-through).
    const overwriteLine = out.split("\n").find((line) => line.includes("#") && line.includes("overwrite"))!;
    assert.ok(!overwriteLine.includes("delete"));
});
```

In `tests/reconstruction_render.test.ts`:
```ts
// A create then overwrite, from literals (local to this file's diff/verbose tests).
function createThenOverwriteRevs(): FileRevision[] {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    const v1 = ["def version1():", "    return 1"].map((line) => born(line, t0));
    const v2 = ["def version2():", "    return 2"].map((line) => born(line, t1));
    return [
        { kind: EventKind.write, changeId: new Uuid("w1"), timestamp: t0, lines: v1 },
        { kind: EventKind.overwrite, changeId: new Uuid("w2"), timestamp: t1, lines: v2 },
    ];
}

// --diff heads an overwrite "overwritten" and shows a full replace (all out, all in).
test("test_diff_shows_overwrite_as_full_replace", () => {
    const out = renderDiff(createThenOverwriteRevs());
    assert.ok(out.includes("overwritten"));
    // Every old line is removed and every new line added (a wholesale rewrite).
    assert.ok(out.includes("- def version1():"));
    assert.ok(out.includes("+ def version2():"));
});

// --verbose shows the overwrite's full new line state (default full-state body).
test("test_verbose_shows_overwrite_full_state", () => {
    const out = renderVerbose(createThenOverwriteRevs());
    assert.ok(out.includes("def version2():"));
    assert.ok(out.includes("    return 2"));
});
```
`entryLabel` has no `overwrite` branch, so the list label falls through to `"delete"` → first
test RED; `diffBlock` heads it `changed`, not `overwritten` → second test RED. (The verbose
test already passes — it locks the default behavior.)

**GREEN:**
1. `src/reconstruction_render_list.ts` — add an `overwrite` branch to `entryLabel`, before the
   `delete` fall-through:
   ```ts
   if (kind === EventKind.overwrite) {
       return "overwrite";
   }
   ```
2. `src/reconstruction_render.ts` — add an `overwrite` branch to `diffBlock`, before the generic
   block, heading it `overwritten` and reusing the existing removal/addition helpers (the
   overwrite's all-genesis lines make `removedLines` drop every previous line and `addedLines`
   add every new one — a full replace):
   ```ts
   if (revision.kind === EventKind.overwrite) {
       const header = `@@ overwritten @ ${stamp} @@`;
       const removed = removedLines(previous, revision);
       const added = addedLines(revision);
       return [header, ...removed, ...added].join("\n");
   }
   ```
   `renderRevisionState` (verbose) needs no change — an overwrite is neither rename nor copy, so
   it already renders the full numbered line state.

**Verify gate.** (Hand-trace: the diff of the two-line overwrite emits `- def version1():`,
`-     return 1`, `+ def version2():`, `+     return 2` under the `overwritten` header.)

---

## Task 6 — CLI default-view test on the real S4 transcript + docs

**Behavior:** the no-flag CLI view of the real S4 transcript lists both files, each with a
`create` then an `overwrite` entry and the right short change ids.

**RED:** add to `tests/reconstruction_cli.test.ts` (import `S4_JSONL`):
```ts
// The default view lists S4's two files, each created then overwritten.
test("test_default_view_lists_s4_overwrite_entries", () => {
    const out = runCli([S4_JSONL]);
    // Both touched files appear.
    assert.ok(out.includes("s4_overwrite.py"));
    assert.ok(out.includes("test_s4_overwrite.py"));
    // Each carries a create entry and an overwrite entry.
    assert.ok(out.includes("create"));
    assert.ok(out.includes("overwrite"));
    // The overwrite of s4_overwrite.py carries its short change id.
    assert.ok(out.includes("#012vJCJs"));
});
```

**GREEN:**
1. No CLI logic change (the default path already calls `renderHistoryList`, now imported from
   `reconstruction_render_list.ts` per Task 4). The test passes once Tasks 1–5 are in.
2. `plans/reconstruction-engine-design.md` — add the S4 specs (continuing the numbering after
   S3's 15–19), record the three locked decisions, and add `reconstruction_render_list.ts` to
   the Code-layout section (and that `reconstruction_render.ts` now holds only verbose+diff).
3. `plans/implementation-notes-api-from-scenarios.md` — append a dated S4 entry (overwrite as a
   replay-time presence distinction; the render split; decisions and any deviations).
4. `plans/roadmap.md` — mark the S4 row done.

**Verify gate**, then run the End-to-end check, then stop and report. Commit only after the
user approves (a large amount of S2/S3 work is also still uncommitted — clarify with the user
whether S2/S3/S4 commit together or separately before committing anything).

---

## Verify gate (run after every task; all three must pass before the next task)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                                  # node --import tsx --test tests/*.test.ts → all prior + new S4 specs, 0 fail
npx tsc --noEmit                          # No errors found
python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py src/reconstruction_*.ts   # exit 0
```

`tsx` does not type-check, so `npx tsc --noEmit` is the type gate (and `noUnusedLocals`/
`noUnusedParameters` make any stray import a hard error — prune precisely when splitting in
Task 4). Ignore any stale `PostToolBatch`/`PostToolUse` hook failure for a file written in the
same batch as its test — `npm test` is authoritative. Clean room is absolute: never import or
copy from `/Users/matkatmusicllc/Desktop/claude code src/` — that path is read-only ground truth.

## End-to-end check (after Task 6)

```
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s4-overwrite-file/58f8c26c-48d5-4e8f-953c-265005a6ee73.jsonl" 2>/dev/null
# Expect two files; s4_overwrite.py with a create entry then an overwrite entry (#01RMyyRt then
# #012vJCJs); tests/test_s4_overwrite.py likewise (#017kvbv4 then #01H4X6UR). Add --diff to see
# each overwrite as an "overwritten" block removing all version1 lines and adding all version2
# lines; --verbose to see each revision's full line state.
```
