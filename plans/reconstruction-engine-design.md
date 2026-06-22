# Per-line reconstruction engine — agreed design

Clean-room TypeScript rebuild of "Engine B" (see
`/Users/matkatmusicllc/Desktop/claude code src/RevEng/docs/engine-b-overview.md`).
Reconstructs a target file's on-disk history from recorded transcript evidence and
(later) emits a per-line verdict against a reference. Built scenario by scenario.

## The per-line model

A reconstructed file is an ordered list of **revisions**. Each revision is a
whole-file snapshot at a timestamp:

```
FileRevision = { changeId, timestamp, lines: LineEntry[] }
LineEntry    = { oldLineNum, values: { line, timestamp }[] }
```

- `changeId` is a `Uuid` identifying the **source operation** that produced this
  revision. When one operation produces more than one revision (a `-`/`+` edit —
  see Rule 2), every revision it emits shares the same `changeId`, so a paired
  removal/addition can never be delinked. Distinct operations (a `Write`, an `rm`)
  get distinct `changeId`s.

- A line's **position in this revision is its array index** (so `newLineNum` and a
  per-revision `numLines` are derived — we don't store them).
- `oldLineNum` is a **back-pointer**: the index this line occupied in the
  *previous* revision, or `-1` if it was just born (inserted, or genesis).
- `values` is the line's content history at this position: usually one authored
  entry, with extra entries appended when an observation (a read) re-witnesses the
  same line.

### Tracking a line across renumbering

Chain `oldLineNum` ⇄ index across consecutive revisions:

- **Forward** (where does `(rev r, index i)` go?): in `r+1`, find the entry whose
  `oldLineNum === i`. Found → it's now at that entry's index. None → the line was
  removed at `r+1`'s timestamp.
- **Backward** (where did a final line come from?): its predecessor is at index
  `oldLineNum` in `r-1`; stop when `oldLineNum === -1` (born).

## The two rules

1. **New revision ⇔ a line was inserted or removed** (positions shift). Pure
   same-position text replacement appends to that index's `values[]` instead.
2. **Coarse in-hunk identity, with linked revisions.** A `structuredPatch` marks
   lines `-`/`+`/` `. Context lines keep identity; a `-`/`+` pair is read literally
   as remove + insert (we do *not* claim one line "became" the other). By Rule 1
   the removal and the addition are each their own revision — and **both carry the
   same `changeId`** so the pair stays linked to the single source edit. (A
   fine-grained sub-diff that *does* link `-`→`+` as one modified line is deferred
   until a scenario needs it.)

Consequence: because a patch encodes every change as `-`/`+`, **every
content-changing Edit/Write mints a new revision**; multi-entry `values[]` is
driven by **observations (reads)**, not edits.

### Open question — where does `changeId` come from?

Answer: **derive it from the originating tool_use id** (already a `Uuid`
in our parse layer) — deterministic, reproducible runs, and doubles as provenance
("which recorded edit caused this"); 

## Scope so far

- **S1 (`s1-delete-file`)** — reconstructs **every file touched**:
  `s1_delete.py` (`Write` create → `Bash rm` delete, two revisions) and
  `tests/test_s1_delete.py` (create only). `reconstructFile`/`reconstructAll` are
  generic over the target; only the *evidence kinds* (write/delete) are fog-of-war
  limited. `--verbose` prints line state per revision; `--diff` prints the changes.
- Later scenarios add `Edit` (splice + `oldLineNum` mapping), `mv`/`cp` lineage,
  reads/observations, and the verdict/coverage layer.

## Code layout

The engine is split by concern, one paired test each (files kept well under the
250-line cap with full comments, not crammed):

- `src/reconstruction_engine.ts` — model types + event extraction + reconstruct.
- `src/reconstruction_render.ts` — `renderVerbose` / `renderDiff` (pure).
- `src/reconstruction_cli.ts` — arg parsing + `runCli` + entry point.
  Run: `tsx src/reconstruction_cli.ts <transcript.jsonl> [--target <p>] [--verbose|--diff]`.

## TDD specs

Tests (`node:test` + `node:assert`) split to match: extraction/reconstruct in
`tests/reconstruction_engine.test.ts` (driven off the real `S1_JSONL`), rendering
in `tests/reconstruction_render.test.ts` (pure, literal revisions), CLI in
`tests/reconstruction_cli.test.ts`. Red→green, each spec one test.

### S1 — implemented now

1. **Event extraction** — `extractFileEvents(records)` finds exactly two events for
   the deleted target: a `write` then a `delete`, in timestamp order.
2. **Every touched file** — `reconstructAll(records)` returns a history per file
   the transcript touches: `s1_delete.py` (create + delete) AND
   `tests/test_s1_delete.py` (create only, never deleted). Nothing is dropped.
3. **Single-file reconstruction** — `reconstructFile(records, target)` returns one
   file's revisions; `findDeletedTarget(records)` auto-detects the rm'd file. For
   `s1_delete.py` that's exactly two revisions.
4. **Create revision** — revision 0 has 2 lines, `def hello():` and
   `    print("hello")`; every `LineEntry.oldLineNum === -1` (genesis), each with one
   value; `revision.timestamp` equals the write event's timestamp.
5. **Delete revision** — revision 1 has `lines: []` (0 lines); `revision.timestamp`
   equals the rm event's timestamp.
6. **changeId present & distinct** — both revisions carry a `changeId: Uuid`; the
   create and delete revisions' `changeId`s differ (distinct operations).
7. **Trailing-newline split** — content ending in `\n` yields N lines, not N+1 (no
   phantom trailing blank line).
8. **`--verbose` render** — output lists revision 0's lines (numbered) and shows
   revision 1 as 0 lines / deleted.
9. **`--diff` render** — output shows revision 0's lines as additions (`+`) and
   revision 1 as removals (`-`) of those same lines.

### Deferred to S2+ (specs to write when those features land)

10. **Paired remove/add share `changeId`** — a `-`/`+` Edit emits a removal and an
    addition revision with the *same* `changeId`.
11. **`oldLineNum` chaining** — after an insert, forward/backward chaining tracks a
    line's number across the renumber (proved against S2's real Edit hunks).
12. **New revision ⇔ insert/remove**; same-position replacement appends to
    `values[]` instead.
