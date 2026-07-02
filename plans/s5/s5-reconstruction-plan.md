# Plan: S5 slice — bash output redirection (`>>` append, `>` overwrite), recovered from the file-history sidecar

Implement in the listed order. Each task is **RED first** (write the failing
`test_<behavior>` with plain-English step comments) then **GREEN** (minimum code in
separate verb-named functions). After every task run the three checks under
**Verify gate** and do not start the next task until all three are green.

All work is in the `api-from-scenarios` worktree, built directly on the committed S2/S3/S4
slices (`0436fa8`, 73 tests green). Source modules today: `src/reconstruction_engine.ts`
(model + public API + copy-seed recursion), `src/reconstruction_extract.ts` (records →
events), `src/reconstruction_replay.ts` (events → revisions), `src/reconstruction_lineage.ts`
(rename/copy path resolution), `src/reconstruction_render.ts` (verbose + diff),
`src/reconstruction_render_list.ts` (the default list view), `src/reconstruction_cli.ts`,
`src/structures/vocabulary.ts` (the `EventKind` enum), `src/structures/file-history.ts`
(`getFileHistorySnapshot` + `FileBackupMap` — **already built**, fully hydrates
`file-history-snapshot` records). Tests: `tests/reconstruction_{engine,engine_s4,extract,replay,lineage,render,render_list,cli}.test.ts`
plus `tests/file-history.test.ts` (`node:test`); helpers `loadRecords` (`tests/utilities.ts`),
`S1_JSONL`…`S4_JSONL` (`tests/fixtures.ts`). Style: 4-space indent, verb-named functions,
`Path`/`Uuid` domain types (never bare strings for paths/ids), compare enums by member
(`x === EventKind.write`), one canonical wire-vocabulary home (`vocabulary.ts`).

## What S5 adds

The `s5-bash-redirect` scenario (Write `s5_redirect.txt`="line one" → Bash
`echo "line two" >> …/s5_redirect.txt` → Bash `echo "replaced content" > …/s5_redirect.txt`)
adds two related capabilities the engine has never modelled, plus a **second input source**:

1. **`>>` append** — a content-*preserving* revision: the file's prior lines carry forward
   with identity back-pointers and only the appended tail lines are genesis. This is the
   first revision kind that is neither a wholesale genesis (create/overwrite/copy) nor a
   structuredPatch splice (edit).
2. **`>` overwrite** — a wholesale full-content revision, exactly like S4's overwrite, but
   produced by a bash redirect instead of a second `Write`.

The hard part is **content**. A bash redirect leaves **no file content in the JSONL**: its
`toolUseResult` is only `stdout`/`stderr` (both empty), with no `content`/`structuredPatch`/
`originalFile`. The resulting bytes live in the **file-history sidecar** — `Claude Code`
snapshots each tracked file just after every turn, writing a backup blob and recording a
`file-history-snapshot` record in the transcript that names the blob (`backupFileName` =
`hash@vN`). The blob itself sits at `~/.claude/file-history/<sessionId>/<backupFileName>`.
S5 therefore reconstructs redirect content **from the sidecar**, never by parsing the `echo`
command. The user has approved this **transcript + sidecar** approach.

## Locked decisions (drive output shape; the implementer must confirm with the user — these mirror S2/S3/S4's locked decisions and may be adjusted before coding if the user objects)

1. **A `>>` append is a content-preserving revision (`EventKind.append`).** The prior
   revision's lines carry forward unchanged (identity back-pointers, as a rename carries
   them); the appended tail lines are genesis (`oldLineNum` = `DOES_NOT_EXIST_YET`) stamped at the redirect's
   timestamp. (Rejected: modelling append as a full overwrite/all-genesis — it would discard
   the unchanged prefix's line lineage; or parsing the appended text out of `echo` — fragile,
   see decision 3.)
2. **A `>` overwrite reuses the S4 overwrite revision.** It routes through the existing
   `writeRevision(event, fileIsPresent(...))`: a redirect to a *present* file is an
   `overwrite` (full genesis), to an *absent* file a `write` (create). No new line logic. A
   `>>` to an *absent* file likewise creates it (every line genesis, kind `write`), mirroring
   write-to-absent; S5 only exercises `>>`/`>` against a present file, but replay handles both.
3. **Redirect content comes from the file-history sidecar, not the command.** For a redirect
   at `(target, timestamp)`, the content is the backup blob named by the **first
   `file-history-snapshot` taken strictly after `timestamp`** for that path — read from
   `<root>/<sessionId>/<backupFileName>`. The `echo` argument is **never** parsed. (Rejected:
   parsing `echo`'s quoted argument — breaks on `printf`/`tee`/heredocs/pipes/variable
   expansion and on `echo`'s own trailing-newline and quote-stripping semantics; the sidecar
   gives exact ground-truth bytes for *any* redirect regardless of how it was produced.)
   The redirect event's `content` is **empty from extraction and filled during
   reconstruction**, exactly as a `CopyEvent`'s `seedLines` are empty from extraction and
   filled from its source.
4. **The sidecar is read through an injected `BackupReader`.** The engine never hard-codes
   disk access: `reconstructFile`/`reconstructAll` take an optional `BackupReader`
   (`(backupFileName: Path) => string`). The CLI builds the real one
   (`~/.claude/file-history/<sessionId>/`); tests inject an in-memory map. This keeps the
   engine unit-testable without disk and keeps the clean-room rule intact (the executed
   scenario tree under `/Users/matkatmusicllc/Desktop/claude code src/` is never read by code
   or tests). S1–S4 pass no reader; with no redirect events the reader is never invoked, so
   they are unaffected.

## Per-line model impact (how `>>`/`>` are represented in the `LineEntry` / `oldLineNum` / `values` structure)

S5 adds **no new fields or types to the per-line model** — `FileRevision`, `LineEntry`, and
`LineValue` (`reconstruction_engine.ts`) are unchanged. Both redirect kinds are expressed
entirely within the existing structure; what is new is one revision *shape* (append) and a
confirmation that overwrite needs none. (See `plans/reconstruction-engine-design.md` — "The
per-line model" and "The two rules".)

**Append (`>>`) — the first "carried-prefix + genesis-suffix" revision.** Until now a
whole-file content event was either *all-genesis* (`write`/`overwrite`/`copy`: every line
`oldLineNum === DOES_NOT_EXIST_YET`) or *all-carried* (`rename`: every line `oldLineNum === its previous
index`, `values` reused). An `Edit` mixes carried and born lines, but only through a
`structuredPatch` splice (Rule 2). An append is the first event that mixes them **positionally,
without a patch**:

- It satisfies **Rule 1** (a line was inserted ⇒ a new revision): the appended lines are
  insertions at end-of-file, so the append mints exactly one new revision.
- The prior lines are unchanged in both position and text (a `>>` only adds at EOF), so the
  post-append content's first `prevLen` lines are exactly the previous revision's lines. They
  **carry forward with identity back-pointers** — `oldLineNum = their previous index`, and
  their `values` array is **reused unchanged** (no new `LineValue` is appended: nothing
  re-witnessed them, and per the model extra `values[]` entries come only from observations/
  reads, never from an append). This is `carryAt`, the same helper a rename uses.
- The remaining lines (`content[prevLen..]`) are **genesis**: `oldLineNum === DOES_NOT_EXIST_YET`, a single
  `LineValue` stamped at the redirect's timestamp (`genesisLine`).
- So `revision.lines = [...prevLines.map(carryAt), ...tailLines.map(genesisLine)]`, of length
  equal to the new file's line count. (Append-to-absent has `prevLen === 0`, so every line is
  genesis — i.e. a create — per locked decision 2.)

**Key invariant this relies on:** a `>>` appends only at EOF, so the previous revision's lines
are exactly the prefix of the post-append content. The split point is therefore purely
**positional** (`prevLen` = the previous revision's line count), never a text diff — `appendRevision`
slices `splitLines(content)` at `carried.length`. A `>>` cannot alter earlier lines, so the
prefix is always intact; were that ever violated the positional carry would mis-assign, but
that is outside `>>` semantics and outside S5 scope.

**Overwrite (`>`) — no per-line change beyond S4.** A `>` overwrite is all-genesis exactly like
S4's second-`Write` overwrite: every line `oldLineNum === DOES_NOT_EXIST_YET`, one `LineValue` at the redirect
timestamp; by Rule 1 it reads as remove-all + insert-all. It **severs back-pointers**, so the
lines from the prior (append) revision are not carried — forward-tracking from them finds no
entry whose `oldLineNum` matches, i.e. they were removed at the overwrite's timestamp. This is
the existing `writeRevision(event, fileIsPresent(...))` path; S5 adds nothing to it at the line
level.

**Rendering reads straight off this structure** (Task 8): the append diff shows **additions
only** — `addedLines` emits the genesis suffix (`oldLineNum === DOES_NOT_EXIST_YET`); the carried prefix
(`oldLineNum >= 0`) produces neither a `+` nor a `-`. The overwrite diff shows the full
remove-all / add-all because every line is genesis and every prior line lost its back-pointer.

## How a redirect's content maps to a backup blob (the alignment rule, and what is actually verified)

**Verified** (the three blobs were read from disk): the backups hold the file's successive
content states in version order — `@v2` = `line one\n`, `@v3` = `line one\nline two\n`, `@v4` =
`replaced content\n` (post-create, post-append, post-overwrite). Version 1's `backupFileName`
is `null` — no blob (a file's first version is the live file, with nothing to back up).

| version | backupFileName | backupTime (Z) | blob content | state after |
|---------|----------------|----------------|--------------|-------------|
| 1 | `null` | 16:17:05.633 | (no blob) | — |
| 2 | `acf7bffbb9d6cc7f@v2` | 16:17:10.530 | `line one\n` | create (Write @ :05.619) |
| 3 | `acf7bffbb9d6cc7f@v3` | 16:17:18.975 | `line one\nline two\n` | append (`>>` @ :13.180) |
| 4 | `acf7bffbb9d6cc7f@v4` | 16:17:28.694 | `replaced content\n` | overwrite (`>` @ :21.882) |

**Not** verified: Claude Code's exact snapshot trigger. The `backupTime`s sit several seconds
after each operation (snapshots evidently land around turn boundaries, *not* immediately after
the tool runs), and each snapshot *record* appears in the stream just before the **next**
operation's record, reflecting the state the **previous** operation left. Do not rely on record
order — the implementation keys off `backupTime`.

**The alignment rule:** a redirect's resulting content is the blob of the **first snapshot of
that path whose `backupTime` is strictly after the redirect's timestamp _and_ whose
`backupFileName` is non-null**. The non-null qualifier is load-bearing: version 1's backup is
`null` and its `backupTime` (:05.633) is *after* the create (:05.619), so "first snapshot after"
alone would wrongly resolve the create to the empty v1. Skipping nulls maps all three correctly
— create→`@v2`, append→`@v3`, overwrite→`@v4` (the create's content also comes free from the
`Write` tool result, so only the two redirects truly need the sidecar). This is why
`buildBackupTimeline` (Task 5) drops null-backup points and `findBackupAfter` then takes the
first remaining point after the timestamp.

**Assumption the rule depends on:** at most one mutation to the path occurs between two
consecutive (non-null) snapshots of it, so the next snapshot uniquely reflects this operation's
output. S5 satisfies it (one file mutation per turn, one snapshot per turn boundary). If a
future scenario mutated one file twice between snapshots, the intermediate state would be
unrecoverable from the sidecar — flag it then.

`backupFileName` already embeds `hash@vN`, so resolving a blob path is a three-string join
(`<root>/<sessionId>/<backupFileName>`) — no hashing.

## Ground truth (S5 transcript — assert against these literal values)

`tests/fixtures.ts` gets `S5_JSONL` pointing at
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s5-bash-redirect/621364dd-a153-42f4-b44f-b6b5232c57e9.jsonl`.

The transcript's `sessionId` is `621364dd-a153-42f4-b44f-b6b5232c57e9` (equals the JSONL
basename and the file-history directory name). All three operations target the one file
`…/run-scenario.3kn92g5n/s5_redirect.txt`. Mutating events in timestamp order
(`changeId` = the tool_use id; `shortChangeId` drops `toolu_` and keeps 8 chars):

| time (Z) | tool | changeId (toolu_…) | effect | content source |
|----------|------|--------------------|--------|----------------|
| 16:17:05.619 | Write | `01Mzva3Zgz1zgiuPXNiU4hHQ` | create `s5_redirect.txt` (1 line) | Write `content` |
| 16:17:13.180 | Bash `>>` | `01PDv4DfKhyMwx1PTSzUgaaV` | **append** "line two" | sidecar `@v3` |
| 16:17:21.882 | Bash `>` | `01UB1SvLTx1yPEgVzp8F5y3X` | **overwrite** "replaced content" | sidecar `@v4` |

The transcript also contains a `queue-operation` record (already modelled in S4) and snapshot
duplication (snapshot #4 appears twice, same `@v4`); neither yields a file event. There is no
rename, delete, copy, or git mv in S5.

Literal file contents (genesis text per revision):
- `s5_redirect.txt` create → `["line one"]`
- `s5_redirect.txt` append → `["line one", "line two"]` (line 0 carried, line 1 genesis)
- `s5_redirect.txt` overwrite → `["replaced content"]` (every line genesis)

## Expected reconstruction (Task 7 asserts the full shapes)

`s5_redirect.txt` → 3 entries (one file, no rename/copy; keyed by its own path):
- `0` kind `write`, 1 genesis line (`line one`; `oldLineNum === DOES_NOT_EXIST_YET`), changeId `01Mzva3Z`.
- `1` kind **`append`**, 2 lines: `line one` carried (`oldLineNum === 0`, same value object as
  entry 0) then `line two` genesis (`oldLineNum === DOES_NOT_EXIST_YET`), changeId `01PDv4Df`.
- `2` kind **`overwrite`**, 1 genesis line (`replaced content`; `oldLineNum === DOES_NOT_EXIST_YET`), changeId
  `01UB1SvL`.

Locked default list format (line-count deltas appear because counts change: 1 → 2 → 1):
```
s5_redirect.txt
  0  create   1 lines            16:17:05Z  #01Mzva3Z
  1  append   2 lines (+1)       16:17:13Z  #01PDv4Df
  2  overwrite  1 lines (-1)     16:17:21Z  #01UB1SvL
```

---

## Task 1 — Split `reconstruction_replay.ts` to make room (refactor, no behavior change)

`src/reconstruction_replay.ts` is at **247/250 lines**; Task 4 must add the append branch, so
split first. This is the same remedy as S4's render split — **split, never condense** (the
user's standing preference). Pure move — no behavior change, no test moves required (the Edit
splice stays covered through `replayEvents` in `tests/reconstruction_replay.test.ts`).

**Behavior:** identical replay output to today, with the line/revision helpers and the Edit
splice relocated to a new module that `reconstruction_replay.ts` imports — chosen so the new
module imports **nothing** from `reconstruction_replay.ts` (one-directional, no import cycle,
honouring the design doc's "no runtime import cycle" rule).

**RED:** add to `tests/reconstruction_replay.test.ts` an import-driven check that fails to
resolve until the new module exists:
```ts
// The shared replay helpers now live in their own module (Task 1 split).
import { splitLines } from "../src/reconstruction_replay_edit.ts";

// splitLines drops a single trailing newline, so "a\nb\n" is two lines, not three.
test("test_split_lines_module_is_importable_and_drops_trailing_newline", () => {
    assert.deepEqual(splitLines("a\nb\n"), ["a", "b"]);
});
```
The new module does not exist yet → RED (does not resolve).

**GREEN:**
1. Create `src/reconstruction_replay_edit.ts`. **Move** out of `reconstruction_replay.ts`
   (cutting them from that file) and **export**: the line primitives `splitLines`,
   `genesisLine`, `carryAt`, `lastLinesOf`, `fileIsPresent`; and the whole Edit splice
   `applyEdit` with its privates `editRevision`, `removedOldIndicesOf`, `keepSurvivingLines`,
   `insertHunkAdditions`. Imports it needs: `StructuredPatchHunk` (type) from
   `./structures/tool-results.ts`; `EventKind` from `./structures/vocabulary.ts`;
   `EditEvent`, `FileRevision`, `LineEntry` (type-only) from `./reconstruction_engine.ts`.
   Header comment: "Replay helpers: the per-line primitives (split/genesis/carry/presence)
   and the Edit splice. Imports nothing from reconstruction_replay.ts so the dependency runs
   one way (replay → here), keeping the module graph acyclic. Design:
   plans/reconstruction-engine-design.md."
2. `src/reconstruction_replay.ts` now imports `{ splitLines, genesisLine, carryAt,
   lastLinesOf, fileIsPresent, applyEdit }` from `./reconstruction_replay_edit.ts` and keeps
   only the revision appenders that orchestrate them (`writeRevision`, `deleteRevision`,
   `renameRevision`, `copyRevision`), `appendRevisionsForEvent`, `replayEvents`, and
   `UnsupportedEventKindError`. `noUnusedLocals`/`noUnusedParameters` make a stray import a
   hard `tsc` error — prune precisely.

**Verify gate.** (All 73 tests stay green; `reconstruction_replay.ts` drops to ≈150 lines and
the new module is ≈110.)

---

## Task 2 — Rename the verb-less helpers in `reconstruction_render_list.ts` (refactor, no behavior change)

Coding-requirements rule 5 requires a verb in every function name. The default list view's
helpers predate that rule; rename them before Task 8 adds the `append` label. All are **private
to the module** (only `renderHistoryList` is exported, and only it is imported elsewhere — the
CLI), so the rename is contained to this one file. Pure rename — no behavior change.

**Behavior:** identical list output; only the internal helper names change.

**RED:** none new — the existing `reconstruction_render_list` and `reconstruction_cli` tests
cover the behavior and stay green through the rename (a mechanical refactor, like Task 1's
split). If `tests/reconstruction_render_list.test.ts` names any of these helpers (in an import
or comment), update that reference in the same commit so the suite still compiles.

**GREEN:** in `src/reconstruction_render_list.ts`, rename throughout (definition + every call
site within the file):

| old | new |
|-----|-----|
| `baseName` | `getBaseName` |
| `shortChangeId` | `shortenChangeId` |
| `shortTime` | `formatShortTime` |
| `entryLabel` | `getEntryLabel` |
| `entryDelta` | `getEntryDelta` |
| `entryDetail` | `getEntryDetail` |
| `originalPathOf` | `findOriginalPath` |
| `copyOriginOf` | `findCopyOrigin` |

`renderEntry`, `renderHistoryBlock`, and the exported `renderHistoryList` already carry a verb —
leave them. No other source file imports these private helpers (verified by grep), so there are
no cross-file edits beyond the possible one test reference above.

**Verify gate.**

---

## Task 3 — Introduce `DOES_NOT_EXIST_YET` for the genesis sentinel (refactor, no behavior change)

The per-line model uses a bare `-1` for `oldLineNum` to mean "this line had no predecessor in
the previous revision — it was born/inserted here". Replace that magic number with a named
constant everywhere it carries that meaning, **before** Task 4's `appendRevision` and Task 8's
append diff add new genesis sites. Pure refactor, no behavior change.

**Behavior:** identical reconstruction; the `-1` genesis literals become a named constant.

**RED:** add to `tests/reconstruction_replay.test.ts`:
```ts
import { DOES_NOT_EXIST_YET } from "../src/structures/line-model.ts";

// The genesis sentinel is a named constant standing in for the old bare -1.
test("test_genesis_sentinel_constant_is_defined", () => {
    assert.equal(DOES_NOT_EXIST_YET, -1);
});
```
The module/constant does not exist yet → RED (does not resolve).

**GREEN:**
1. Create `src/structures/line-model.ts`:
   ```ts
   // The per-line model's genesis sentinel. A LineEntry.oldLineNum of DOES_NOT_EXIST_YET marks
   // a line with no predecessor in the previous revision — it was born (inserted/genesis) at
   // this revision, so it "did not exist yet" one revision earlier. A leaf module (it imports
   // nothing from the engine) so engine/replay/render may all import it as a value without a
   // runtime cycle. Design: plans/reconstruction-engine-design.md ("The per-line model").
   export const DOES_NOT_EXIST_YET = -1;
   ```
2. Replace every genesis `-1` (an `oldLineNum` meaning "no previous line") with
   `DOES_NOT_EXIST_YET`, importing it where used. Grep `oldLineNum` across `src/` and `tests/`
   to confirm none are missed. Known sites:
   - `src/reconstruction_replay_edit.ts` (after Task 1): `genesisLine` (`oldLineNum: -1`) and
     `insertHunkAdditions`'s `+`-line push (`oldLineNum: -1`).
   - `src/reconstruction_render.ts`: `addedLines`'s `entry.oldLineNum === -1` filter (and the
     two `oldLineNum -1` comments).
   - `src/reconstruction_engine.ts`: the `LineEntry` doc comment (`-1 = born here` →
     `DOES_NOT_EXIST_YET = born here`) — comment only; the engine uses no `-1` in code.
   - Test literals/assertions across `tests/*.test.ts` (`oldLineNum: -1`, `oldLineNum === -1`,
     `oldLineNum, -1`).
   Leave every unrelated `-1` alone — the `(−1)` list line-count delta, loop indices, etc. — and
   do **not** touch `oldLineNum >= 0` checks (the complement "has a predecessor", which carries
   no `-1`).

**Verify gate.** (A literal replaced by a named constant; all prior tests stay green. From here
on, every task's test snippet that asserts a genesis line imports `DOES_NOT_EXIST_YET` from
`../src/structures/line-model.ts`.)

---

## Task 4 — Append and overwrite redirect-event replay (`EventKind.append`, pure replay units)

Proven as pure replay unit tests (no transcript, no sidecar): the redirect events carry their
already-resolved full content, so this task is only about the line model they replay into.

**Behavior:** replaying a write then an append event for one file yields a create then an
**append** — the append carries the prior line forward (identity back-pointer) and adds the
new tail line as genesis; replaying an overwrite event against a present file yields an
**overwrite** (full genesis), against an absent file a create.

**RED:** add to `tests/reconstruction_replay.test.ts`:
```ts
// A write then a `>>` append to the same path: create then a content-preserving append.
test("test_append_event_carries_prior_lines_and_adds_a_genesis_tail", () => {
    // A create of one line, then an append whose full content is both lines.
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    const target = new Path("/a/s5_redirect.txt");
    const events: FileEvent[] = [
        { kind: EventKind.write, changeId: new Uuid("w1"), target, content: "line one\n", timestamp: t0 },
        { kind: EventKind.append, changeId: new Uuid("a1"), target, content: "line one\nline two\n", timestamp: t1 },
    ];
    const revisions = replayEvents(events);
    // Two revisions: the create, then the append.
    assert.equal(revisions.length, 2);
    assert.equal(revisions[0]!.kind, EventKind.write);
    // The append is its own kind, two lines long.
    assert.equal(revisions[1]!.kind, EventKind.append);
    assert.equal(revisions[1]!.lines.length, 2);
    // Line 0 is carried from the create (a back-pointer to old index 0, not genesis).
    assert.equal(revisions[1]!.lines[0]!.oldLineNum, 0);
    assert.equal(revisions[1]!.lines[0]!.values[0]!.line, "line one");
    // Line 1 is the appended tail, born here.
    assert.equal(revisions[1]!.lines[1]!.oldLineNum, DOES_NOT_EXIST_YET);
    assert.equal(revisions[1]!.lines[1]!.values[0]!.line, "line two");
});

// A `>` overwrite event against a present file is a full-content overwrite (S4 reuse).
test("test_overwrite_event_against_present_file_is_an_overwrite", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    const target = new Path("/a/s5_redirect.txt");
    const events: FileEvent[] = [
        { kind: EventKind.write, changeId: new Uuid("w1"), target, content: "line one\n", timestamp: t0 },
        { kind: EventKind.overwrite, changeId: new Uuid("o1"), target, content: "replaced content\n", timestamp: t1 },
    ];
    const revisions = replayEvents(events);
    // The second revision is an overwrite, all genesis (a wholesale replace).
    assert.equal(revisions[1]!.kind, EventKind.overwrite);
    assert.ok(revisions[1]!.lines.every((entry) => entry.oldLineNum === DOES_NOT_EXIST_YET));
    assert.equal(revisions[1]!.lines[0]!.values[0]!.line, "replaced content");
});
```
`EventKind.append`, `AppendEvent`, and `OverwriteEvent` do not exist yet → RED (does not
compile).

**GREEN:**
1. `src/structures/vocabulary.ts` — add `append = "append"` to `EventKind`, with a member
   comment noting `s5-bash-redirect adds append (a >> redirect to a present file)`.
2. `src/reconstruction_engine.ts` — add two event types and extend the `FileEvent` union. Both
   carry `content` that is empty from extraction and filled from the sidecar during
   reconstruction (mirror the `CopyEvent` comment):
   ```ts
   // A bash `>>` append: prior lines survive, the new tail is genesis. content is the
   // file's full post-append text, recovered from the file-history sidecar (the redirect
   // leaves no content in the JSONL); it is empty from extraction and filled during
   // reconstruction. See plans/s5/s5-reconstruction-plan.md.
   export type AppendEvent = {
       kind: EventKind.append;
       changeId: Uuid;
       target: Path;
       content: string;
       timestamp: Date;
   };

   // A bash `>` overwrite: a wholesale full-content revision (S4 overwrite, produced by a
   // redirect). content is recovered from the sidecar like AppendEvent.
   export type OverwriteEvent = {
       kind: EventKind.overwrite;
       changeId: Uuid;
       target: Path;
       content: string;
       timestamp: Date;
   };
   ```
   Add `| AppendEvent | OverwriteEvent` to the `FileEvent` union.
3. `src/reconstruction_replay_edit.ts` — add the append builder (it has the carry helpers):
   ```ts
   // A `>>` append: carry the present file's lines forward unchanged (identity
   // back-pointers) and add the redirect's new tail lines as genesis. When the file is
   // absent the append creates it — every line genesis, kind write — mirroring how a
   // write-to-absent is a create not an overwrite (locked decision 2).
   export function appendRevision(
       event: AppendEvent,
       revisions: FileRevision[],
       present: boolean,
   ): FileRevision {
       const newLines = splitLines(event.content);
       if (!present) {
           return {
               kind: EventKind.write,
               changeId: event.changeId,
               timestamp: event.timestamp,
               lines: newLines.map((line) => genesisLine(line, event.timestamp)),
           };
       }
       const carried = lastLinesOf(revisions).map(carryAt);
       const appended = newLines
           .slice(carried.length)
           .map((line) => genesisLine(line, event.timestamp));
       return {
           kind: EventKind.append,
           changeId: event.changeId,
           timestamp: event.timestamp,
           lines: [...carried, ...appended],
       };
   }
   ```
   Import `AppendEvent` (type-only) from `./reconstruction_engine.ts`.
4. `src/reconstruction_replay.ts` — broaden `writeRevision`'s parameter to
   `event: WriteEvent | OverwriteEvent` (both have `content`; an overwrite event present →
   `overwrite`, absent → `write`, no other change), import `appendRevision` from
   `./reconstruction_replay_edit.ts`, and add two dispatch branches to
   `appendRevisionsForEvent` before the final `throw`:
   ```ts
   if (event.kind === EventKind.overwrite) {
       revisions.push(writeRevision(event, fileIsPresent(revisions)));
       return;
   }
   if (event.kind === EventKind.append) {
       revisions.push(appendRevision(event, revisions, fileIsPresent(revisions)));
       return;
   }
   ```
   Import the `AppendEvent`/`OverwriteEvent` types as needed.

**Verify gate.**

---

## Task 5 — The sidecar resolver: `src/reconstruction_sidecar.ts`

Proven as a pure unit (synthetic `file-history-snapshot` records + an in-memory reader); no
disk, no real transcript.

**Behavior:** given a transcript's `file-history-snapshot` records and a `BackupReader`,
filling a redirect event's content reads the backup blob named by the **first snapshot taken
after the event's timestamp** for that path; a non-redirect event passes through unchanged.

**RED:** create `tests/reconstruction_sidecar.test.ts`. Build two snapshot records by hand
(use `Path`/timestamps that bracket the event) and an in-memory reader, then assert the fill:
```ts
// Two snapshots for one path: an earlier one and a later one that backs up the post-event content.
function buildSnapshotRecord(path: string, backupFileName: string, backupTime: string): TranscriptRecord {
    return {
        type: RecordType.fileHistorySnapshot,
        messageId: "m-" + backupFileName,
        isSnapshotUpdate: false,
        snapshot: {
            messageId: "m-" + backupFileName,
            timestamp: backupTime,
            trackedFileBackups: { [path]: { backupFileName, version: 2, backupTime } },
        },
    } as unknown as TranscriptRecord;
}

// fillRedirectContent resolves a redirect's content from the snapshot taken just after it.
test("test_fill_resolves_redirect_content_from_the_next_snapshot_blob", () => {
    const path = "/a/s5_redirect.txt";
    const records = [
        buildSnapshotRecord(path, "h@v2", "2026-01-01T00:00:10Z"),
        buildSnapshotRecord(path, "h@v3", "2026-01-01T00:00:20Z"),
    ];
    // An append at :13 — the first snapshot strictly after it is @v3.
    const event: FileEvent = {
        kind: EventKind.append, changeId: new Uuid("a1"),
        target: new Path(path), content: "", timestamp: new Date("2026-01-01T00:00:13Z"),
    };
    const reader: BackupReader = (name) => name.toString() === "h@v3" ? "line one\nline two\n" : "WRONG";
    const filled = fillRedirectContent(records, [event], reader);
    // The append now carries the post-append blob; a non-redirect event would be untouched.
    assert.equal((filled[0] as AppendEvent).content, "line one\nline two\n");
});
```
`reconstruction_sidecar.ts` does not exist yet → RED.

**GREEN:** create `src/reconstruction_sidecar.ts`:
```ts
// Sidecar: recover a bash redirect's resulting file content from the file-history backups
// beside the transcript. A `>`/`>>` leaves no content in the JSONL, but Claude Code snapshots
// each tracked file just after a turn; the snapshot taken next after the redirect names the
// backup blob holding the file's full new content. Blobs live at
// <root>/<sessionId>/<backupFileName>; backupFileName already embeds hash@vN, so no hashing.
// The reader is injected so the engine stays pure and tests use an in-memory map.
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { getFileHistorySnapshot } from "./structures/file-history.ts";
import { Path, Uuid } from "./structures/domain.ts";
import { EventKind } from "./structures/vocabulary.ts";
import type { FileEvent } from "./reconstruction_engine.ts";

export type BackupReader = (backupFileName: Path) => string;

type BackupPoint = { backupTime: Date; backupFileName: Path | null };

// Per path, the time-ordered backup points across every file-history snapshot.
function buildBackupTimeline(records: TranscriptRecord[]): Map<string, BackupPoint[]> {
    const timeline = new Map<string, BackupPoint[]>();
    for (const record of records) {
        const message = getFileHistorySnapshot(record);
        if (!message) {
            continue;
        }
        for (const [path, backup] of message.snapshot.trackedFileBackups.entries()) {
            const points = timeline.get(path.toString()) ?? [];
            points.push({ backupTime: backup.backupTime, backupFileName: backup.backupFileName });
            timeline.set(path.toString(), points);
        }
    }
    for (const points of timeline.values()) {
        points.sort((a, b) => a.backupTime.getTime() - b.backupTime.getTime());
    }
    return timeline;
}

// The blob name of the first snapshot of `target` taken strictly after `when`.
function findBackupAfter(timeline: Map<string, BackupPoint[]>, target: Path, when: Date): Path | undefined {
    const points = timeline.get(target.toString()) ?? [];
    const next = points.find((point) => point.backupTime.getTime() > when.getTime());
    return next?.backupFileName ?? undefined;
}

// Fill each append/overwrite event's content from the sidecar; pass others through. A
// redirect with no resolvable backup keeps its empty content (defensive — should not happen
// for a tracked file).
export function fillRedirectContent(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const timeline = buildBackupTimeline(records);
    return events.map((event) => {
        if (event.kind !== EventKind.append && event.kind !== EventKind.overwrite) {
            return event;
        }
        const backupFileName = findBackupAfter(timeline, event.target, event.timestamp);
        if (!backupFileName) {
            return event;
        }
        return { ...event, content: reader(backupFileName) };
    });
}

// The default on-disk reader: <root>/<sessionId>/<backupFileName>.
export function createSidecarReader(sessionId: Uuid, root: Path): BackupReader {
    return (backupFileName) =>
        readFileSync(join(root.toString(), sessionId.toString(), backupFileName.toString()), "utf8");
}

// Claude Code's default file-history root: ~/.claude/file-history.
export function getDefaultFileHistoryRoot(): Path {
    return new Path(join(homedir(), ".claude", "file-history"));
}

// The session id from the transcript's envelope records (the file-history dir is named for
// it). file-history-snapshot records carry none, so scan for the first that has one.
export function findSessionId(records: TranscriptRecord[]): Uuid | undefined {
    for (const record of records) {
        const sessionId = (record as { sessionId?: Uuid }).sessionId;
        if (sessionId) {
            return sessionId;
        }
    }
    return undefined;
}
```
Import `BackupReader`, `fillRedirectContent`, and the `AppendEvent`/`FileEvent` types into the
test as needed (plus `RecordType` and `loadRecords` are not needed here — the records are
hand-built).

**Verify gate.**

---

## Task 6 — Extraction recognizes `>>` and `>` (parse the redirect, emit the events)

**Behavior:** a Bash `echo … >> path` becomes an `AppendEvent` and a Bash `echo … > path`
becomes an `OverwriteEvent`, each carrying the redirect target and **empty** content (content
is filled later from the sidecar); a Bash command with no redirect still yields nothing.

**RED:** add to `tests/reconstruction_extract.test.ts` a synthetic two-redirect transcript
(hand-built `assistant` records with Bash `tool_use` blocks, same shape the existing extract
tests use), then:
```ts
// `>>` extracts an append event; `>` an overwrite event — both with empty content and the redirect target.
test("test_extract_maps_redirects_to_append_and_overwrite_events", () => {
    const events = extractFileEvents(buildRedirectRecords()); // helper: one `>>` then one `>` to /a/f.txt
    const append = events.find((event) => event.kind === EventKind.append)!;
    const overwrite = events.find((event) => event.kind === EventKind.overwrite)!;
    // Both target the redirected file; neither carries content yet (the sidecar fills it).
    assert.equal(append.target.toString(), "/a/f.txt");
    assert.equal((append as AppendEvent).content, "");
    assert.equal(overwrite.target.toString(), "/a/f.txt");
    assert.equal((overwrite as OverwriteEvent).content, "");
});
```
`bashEventFrom` does not parse redirects yet → RED.

**GREEN:** `src/reconstruction_extract.ts` — add a redirect parser and one branch in
`bashEventFrom` (after the `rm`/`mv`/`cp` checks, before `return undefined`):
```ts
// A parsed bash output redirection: the target file and whether it appends (`>>`) rather
// than overwrites (`>`).
type ParsedRedirect = {
    target: Path;
    appends: boolean;
};

// Parse a bash output redirection target: `>>` appends, `>` overwrites/creates. Returns the
// target and whether it appends, or undefined when there is no redirect. The content is NOT
// parsed from the command — it is recovered from the file-history sidecar (locked decision 3).
function parseRedirect(command: string): ParsedRedirect | undefined {
    const appended = command.match(/>>\s*(\S+)\s*$/);
    if (appended) {
        return { target: new Path(appended[1]!), appends: true };
    }
    const overwritten = command.match(/(?<!>)>\s*(\S+)\s*$/);
    if (overwritten) {
        return { target: new Path(overwritten[1]!), appends: false };
    }
    return undefined;
}
```
In `bashEventFrom`:
```ts
const redirected = parseRedirect(input.command);
if (redirected) {
    const kind = redirected.appends ? EventKind.append : EventKind.overwrite;
    return { kind, changeId: block.id, target: redirected.target, content: "", timestamp };
}
```
(The `>>` regex is tried first so `echo x >> f` is never misread as `> f`; the `>` regex's
negative lookbehind `(?<!>)` is belt-and-braces.) `bashEventFrom`'s return type already widens
to the `FileEvent` union, so `AppendEvent`/`OverwriteEvent` fit; import `EventKind` is already
present.

**Verify gate.**

---

## Task 7 — `S5_JSONL` fixture; thread the `BackupReader`; reconstruct create→append→overwrite

**Behavior:** with an in-memory reader over the real backup names, `reconstructAll(S5)` returns
one history for `s5_redirect.txt` whose three entries are create → append → overwrite with the
literal shapes in **Expected reconstruction**.

**RED:** add `S5_JSONL` to `tests/fixtures.ts` (absolute path above, same shape as `S4_JSONL`),
then add to `tests/reconstruction_engine.test.ts` (or a new `tests/reconstruction_engine_s5.test.ts`
if the engine test file would exceed 250 lines — check first; **split over condense**):
```ts
// The real backup blobs, keyed by the backupFileName the snapshots name (an in-memory sidecar).
const S5_BACKUPS: Record<string, string> = {
    "acf7bffbb9d6cc7f@v2": "line one\n",
    "acf7bffbb9d6cc7f@v3": "line one\nline two\n",
    "acf7bffbb9d6cc7f@v4": "replaced content\n",
};
const s5Reader: BackupReader = (name) => S5_BACKUPS[name.toString()] ?? "";

test("test_redirect_file_history_is_create_then_append_then_overwrite", () => {
    const histories = reconstructAll(loadRecords(S5_JSONL), s5Reader);
    // One file, three entries.
    assert.equal(histories.length, 1);
    const revisions = histories[0]!.revisions;
    assert.equal(revisions.length, 3);
    // create: one genesis line.
    assert.equal(revisions[0]!.kind, EventKind.write);
    assert.equal(revisions[0]!.lines[0]!.values[0]!.line, "line one");
    // append: line one carried (oldLineNum 0), line two genesis.
    assert.equal(revisions[1]!.kind, EventKind.append);
    assert.equal(revisions[1]!.lines[0]!.oldLineNum, 0);
    assert.equal(revisions[1]!.lines[1]!.values[0]!.line, "line two");
    // overwrite: one genesis line, wholesale replace.
    assert.equal(revisions[2]!.kind, EventKind.overwrite);
    assert.ok(revisions[2]!.lines.every((entry) => entry.oldLineNum === DOES_NOT_EXIST_YET));
    assert.equal(revisions[2]!.lines[0]!.values[0]!.line, "replaced content");
});
```
`reconstructAll` takes no reader yet → RED (does not compile).

**GREEN:** `src/reconstruction_engine.ts` — thread an optional `BackupReader` through the
reconstruction API and fill redirect content before replay (the copy-seed precedent):
1. Import `{ fillRedirectContent } from "./reconstruction_sidecar.ts"` and the `BackupReader`
   type.
2. `reconstructFile(records, target, reader?: BackupReader)` → forwards `reader` into
   `reconstructLineage`.
3. `reconstructLineage(records, target, resolving, reader?: BackupReader)` — after
   `seedCopyEvents`, before replay:
   ```ts
   const seeded = seedCopyEvents(records, lineage, resolving, reader);
   const filled = reader ? fillRedirectContent(records, seeded, reader) : seeded;
   return replayEvents(filled);
   ```
4. Thread `reader` through `seedCopyEvents`/`seedOneCopy` into their inner
   `reconstructLineage` calls (so a copied file that later gets a redirect still resolves —
   keeps the API consistent even though S5 has no copies).
5. `reconstructAll(records, reader?: BackupReader)` → pass `reader` into each
   `reconstructFile`.
   The optional `reader` keeps S1–S4 call sites (`reconstructFile(records, target)`,
   `reconstructAll(records)`) compiling unchanged; with no redirect events `fillRedirectContent`
   is never reached.

**Verify gate.**

---

## Task 8 — Render the append entry (list label + diff header)

**Behavior:** the list view labels an append entry `append`; the diff view heads an append
block `appended` and shows only the added tail lines (the carried prefix is unchanged, so no
`-`/context noise); the overwrite entry already renders (`overwrite` / `overwritten`) from S4.

**RED:** add unit tests (literal `FileRevision[]`, no transcript).

In `tests/reconstruction_render_list.test.ts`:
```ts
// A create then an append of one tail line, from literals.
function createThenAppend(): FileRevision[] {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    const v0 = [{ oldLineNum: DOES_NOT_EXIST_YET, values: [{ line: "line one", timestamp: t0 }] }];
    const v1 = [
        { oldLineNum: 0, values: [{ line: "line one", timestamp: t0 }] },
        { oldLineNum: DOES_NOT_EXIST_YET, values: [{ line: "line two", timestamp: t1 }] },
    ];
    return [
        { kind: EventKind.write, changeId: new Uuid("w1"), timestamp: t0, lines: v0 },
        { kind: EventKind.append, changeId: new Uuid("a1"), timestamp: t1, lines: v1 },
    ];
}

// The list view labels the second entry an append, not a create or delete.
test("test_list_labels_append_entry", () => {
    const out = renderHistoryList([{ target: new Path("/a/s5_redirect.txt"), revisions: createThenAppend() }]);
    const appendLine = out.split("\n").find((line) => line.includes("#") && line.includes("append"))!;
    assert.ok(appendLine);
    assert.ok(!appendLine.includes("delete"));
});
```

In `tests/reconstruction_render.test.ts`:
```ts
// --diff heads an append "appended" and shows only the new tail line (prefix unchanged).
test("test_diff_shows_append_as_added_tail_only", () => {
    const out = renderDiff(createThenAppendRevs()); // local literal helper, like createThenAppend
    assert.ok(out.includes("appended"));
    assert.ok(out.includes("+ line two"));
    // The carried prefix is not re-emitted as an add or a remove.
    assert.ok(!out.includes("+ line one"));
    assert.ok(!out.includes("- line one"));
});
```
`entryLabel` has no `append` branch → list label falls through to `"delete"` → first test RED;
`diffBlock` heads it `changed` → second test RED.

**GREEN:**
1. `src/reconstruction_render_list.ts` — add an `append` branch to `entryLabel`, before the
   `delete` fall-through:
   ```ts
   if (kind === EventKind.append) {
       return "append";
   }
   ```
2. `src/reconstruction_render.ts` — add an `append` branch to `diffBlock`, before the generic
   block, heading it `appended` and emitting only the additions (the carried lines have
   `oldLineNum >= 0`, so `addedLines` already excludes them):
   ```ts
   if (revision.kind === EventKind.append) {
       const header = `@@ appended @ ${stamp} @@`;
       const added = addedLines(revision);
       return [header, ...added].join("\n");
   }
   ```
   `renderRevisionState` (verbose) needs no change — an append renders its full numbered line
   state through the default body.

**Verify gate.**

---

## Task 9 — CLI wires the real sidecar reader + default-view test on the real S5 transcript + docs

**Behavior:** the no-flag CLI view of the real S5 transcript lists `s5_redirect.txt` with a
`create`, then an `append`, then an `overwrite` entry and the right short change ids — reading
the real backups from `~/.claude/file-history/<sessionId>/`.

**RED:** add to `tests/reconstruction_cli.test.ts` (import `S5_JSONL`):
```ts
// The default view of the real S5 transcript lists create -> append -> overwrite.
test("test_default_view_lists_s5_redirect_entries", () => {
    const out = runCli([S5_JSONL]);
    assert.ok(out.includes("s5_redirect.txt"));
    assert.ok(out.includes("create"));
    assert.ok(out.includes("append"));
    assert.ok(out.includes("overwrite"));
    // The append carries its short change id.
    assert.ok(out.includes("#01PDv4Df"));
});
```
This test reads the real sidecar blobs on disk; if they are ever absent the CLI falls back to
empty redirect content (the test would then fail loudly, which is the intended signal).

**GREEN:**
1. `src/reconstruction_cli.ts` — build the real reader from the loaded records and pass it into
   reconstruction:
   ```ts
   import { createSidecarReader, getDefaultFileHistoryRoot, findSessionId, type BackupReader } from "./reconstruction_sidecar.ts";

   // The on-disk file-history reader for this transcript's session, or undefined when the
   // session id can't be determined (then redirects resolve to empty content).
   function buildSidecarReader(records: TranscriptRecord[]): BackupReader | undefined {
       const sessionId = findSessionId(records);
       if (!sessionId) {
           return undefined;
       }
       return createSidecarReader(sessionId, getDefaultFileHistoryRoot());
   }
   ```
   In `runCli`, after `loadTranscript`, build the reader and pass it through `selectHistories`
   into `reconstructFile`/`reconstructAll`.
2. `plans/reconstruction-engine-design.md` — add the S5 specs (continuing after S4's 20–23):
   - **24. Append replay** — a write then an append event replay into a create then an
     `append`; the append carries the prior lines (identity back-pointers) and adds the tail
     as genesis; an append/overwrite to an absent file is a create.
   - **25. Sidecar resolution** — `fillRedirectContent` fills a redirect event's content from
     the backup blob named by the first `file-history-snapshot` taken after the event, read
     through an injected `BackupReader`.
   - **26. Redirect extraction** — `bashEventFrom` maps `>>`→`AppendEvent`, `>`→`OverwriteEvent`,
     both with empty content; non-redirect Bash still yields nothing.
   - **27. Redirect reconstruction** — `reconstructAll(S5, reader)` returns one history,
     create→append→overwrite, with the literal line shapes.
   - **28. Append render** — the list labels it `append`; the diff heads it
     `@@ appended @ … @@` with added-tail-only; verbose shows the full state.

     Also: add `reconstruction_sidecar.ts`, `reconstruction_replay_edit.ts`, and
     `structures/line-model.ts` (the `DOES_NOT_EXIST_YET` sentinel) to the Code-layout section;
     note the engine now takes an optional `BackupReader` (transcript + sidecar); and note the
     `reconstruction_render_list.ts` helper renames (Task 2).
3. `plans/implementation-notes-api-from-scenarios.md` — append a dated S5 entry (append as a
   content-preserving revision; sidecar content resolution via the injected reader; the
   alignment rule; the replay split; decisions and any deviations).
4. `plans/roadmap.md` — mark the S5 row done.

**Verify gate**, then run the End-to-end check, then stop and report. Commit only after the
user approves.

---

## Verify gate (run after every task; all three must pass before the next task)

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # node --import tsx --test tests/*.test.ts → all prior + new S5 specs, 0 fail
npx tsc --noEmit         # No errors found
# filesize_check.py only reads argv[1]; loop over every file individually:
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
```

`tsx` does not type-check, so `npx tsc --noEmit` is the type gate (and `noUnusedLocals`/
`noUnusedParameters` make any stray import a hard error — prune precisely when splitting in
Task 1). The `filesize_check.py` script flags file > 250 lines, function > 15 lines, and deep
nesting, and only checks its first argument — always loop. Ignore any stale
`PostToolBatch`/`PostToolUse` hook failure for a file written in the same batch as its test —
`npm test` is authoritative. Clean room is absolute: never import or copy from
`/Users/matkatmusicllc/Desktop/claude code src/` — that path is read-only ground truth, and
tests use an **in-memory** `BackupReader`, never that tree.

## End-to-end check (after Task 9)

```
npx tsx src/reconstruction_cli.ts \
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s5-bash-redirect/621364dd-a153-42f4-b44f-b6b5232c57e9.jsonl" 2>/dev/null
# Expect one file, s5_redirect.txt, with a create entry (#01Mzva3Z), then an append entry
# (#01PDv4Df, "2 lines (+1)"), then an overwrite entry (#01UB1SvL). Add --diff to see the
# append as an "appended" block adding only "+ line two", and the overwrite as an "overwritten"
# block removing both prior lines and adding "+ replaced content"; --verbose for full states.
# This reads the real backups from ~/.claude/file-history/621364dd-…/ (acf7bffbb9d6cc7f@v3,@v4).
```
