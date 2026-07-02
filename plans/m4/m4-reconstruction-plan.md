# Reconstruction Plan — Scenario **m4** (`m4-delete-recreate`)

> **Type: characterization / regression LOCK. NO `src/` change.**
> The engine **already** reconstructs m4 byte-for-byte correct (verified live —
> see §2). This plan locks that behaviour with 9 new tests (4 engine + 5 CLI) and
> 3 doc edits, exactly mirroring the m1/m2/m3/S20/S21/S22 char-locks. It is **not** a
> real engine fix (unlike S19/S23). If, while implementing, any test cannot be made
> GREEN without touching `src/`, STOP and escalate — that would mean the live
> verification in §2 was wrong, and the plan must be revised, not the engine.

Implementing agent: read `~/.claude/guides/tdd.md` and `plans/coding-requirements.md`
before starting. The test code below already conforms (enum-member comparisons via
`EventKind.*`, the `DOES_NOT_EXIST_YET` genesis sentinel, and the verbatim
`finalTextOf`/`historyEndingWith` accessors carried over from the m2 suite).

---

## 1. Goal

Lock — with tests — that `reconstruction_cli` correctly reconstructs the file-change
history of `m4-delete-recreate`, the **delete-then-recreate-at-the-same-path** scenario.
TWO files are touched; the source file `m4_lifecycle.py` lives a full lifecycle, in order:

1. `Write` `m4_lifecycle.py` = `v1` (event B) — `def v1(): return 1`
2. `Write` `tests/test_m4_lifecycle.py` = v1 test (event C)
3. `Edit` `m4_lifecycle.py` (event D) — appends `v1_helper()` (pure addition, no removal)
4. **bash `rm m4_lifecycle.py`** (event E) — DELETE; not terminal (the file is recreated next)
5. `Write` `m4_lifecycle.py` = `v2` (event F) — `def v2(): return 2`, a fresh create at the
   just-deleted path
6. `Edit` `tests/test_m4_lifecycle.py` (event G) — rewrites the test to target `v2`

The lock must pin the three properties that make m4 novel relative to the existing
**S1** (`s1-delete-file`) delete precedent (which deletes a file and **never recreates** it):

1. **Non-terminal delete:** the `rm` (event E) still produces an empty (`0 lines`) revision
   stamped at the rm time — exactly the S1 delete-revision behaviour — even though the file
   is recreated afterwards. m4 is the FIRST scenario where a delete is followed by further
   events on the same path.
2. **Recreate is born fresh (THE CRUX):** the `Write` after the delete (event F) is a
   **fresh create**, not an overwrite. Its revision `kind` is `EventKind.write` (NOT
   `EventKind.overwrite`), and every line is genesis (`oldLineNum === DOES_NOT_EXIST_YET`),
   so it carries **none** of the pre-delete lineage (no `v1`, no `v1_helper`) — only `v2`.
   This exercises the `fileIsPresent` delete-branch ("locked decision 3",
   `src/reconstruction_replay_edit.ts:30-35`) for the FIRST time with a real fixture: a
   write whose latest prior revision is a delete is labelled a create. No prior scenario
   has a write→delete→write sequence.
3. **Two-file accounting with one Edit-pair on the surviving sibling:** `reconstructAll`
   returns exactly TWO histories. The source `m4_lifecycle.py` is four revisions
   `[write, edit, delete, write]`; the sibling `tests/test_m4_lifecycle.py` is three
   revisions `[write, edit, edit]` — its single Edit (event G) becomes the engine's standard
   removal+addition pair (both halves sharing the one Edit's changeId), ending at the v2 test.

m4 is **linear** — there is NO conversation or code rewind, so exactly ONE branch
(`surviving`, tip `#3b6a446e`) and NO rewound branch. The two final reconstructed files are
byte-identical to the on-disk ground truth (`m4_lifecycle.py` = 23 bytes
`def v2():\n    return 2\n`; `tests/test_m4_lifecycle.py` = 76 bytes).

### Why m4 is distinct from S1 (the existing delete precedent)
`s1-delete-file` is `write → rm` on one file with **no recreate and no pre-delete edit**
(`tests/reconstruction_engine.test.ts:30-85`, specs 2-6) — a terminal two-revision history
`[write, delete]`. m4 **edits the file before deleting it, then recreates it at the same
path, then edits a sibling test file**. That is genuinely new coverage: it is the first time
a delete revision is followed by more revisions on the same path, the first time a Write is
replayed against a trailing-delete history (the born-fresh create branch of `fileIsPresent`),
and the first delete scenario that also runs an Edit before the delete and an Edit-pair on a
second file. m4 is the delete analogue of the m-series locks (m1 cp-fork, m2 mv-rename,
m3 bash-redirect): same machinery, new interleaving.

---

## 2. Ground truth (VERIFIED live against the engine at HEAD `91ac563` + uncommitted m2 + m3)

### 2.1 Scenario source & inputs
- Scenario script: `scenarios/m4-delete-recreate.txt`
- Executed transcript (worktree copy):
  `scenarios/executed/m4-delete-recreate/c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl`
- **Fixture path (Desktop — this is what `tests/fixtures.ts` must point at, like every
  other `S*_JSONL`/`M*_JSONL`):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m4-delete-recreate/c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl`
  (confirmed present on Desktop; same UUID as the worktree copy.)
- **m4 is READER-FREE (like m2, unlike m3).** Every m4 event carries its content inline or
  as an Edit base: the two Writes and the recreate Write carry full content in the JSONL
  tool-use input; the two Edits carry their `originalFile` base; the `rm` is a content-less
  delete (it produces a 0-line revision — nothing to recover). **NONE is a bash `>>`/`>`
  redirect**, so no event needs file-history sidecar recovery. Engine tests therefore call
  `reconstructAll(loadRecords(M4_JSONL))` with **NO reader** (the m2 pattern). The CLI builds
  its own reader internally (`buildSidecarReader`, `src/reconstruction_cli.ts:116-122,189`),
  which simply resolves unused here, so the CLI tests pass NO reader either.

### 2.2 Event ladder
| Turn | Kind | File | changeId | Effect |
|------|------|------|----------|--------|
| A | prompt | — | `#1d55df91` | root user prompt |
| B | write | `m4_lifecycle.py` | `#016pNFF6` | create — `def v1(): return 1` (2 lines) |
| C | write | `test_m4_lifecycle.py` | `#0147VowY` | create — v1 test (5 lines) |
| D | edit | `m4_lifecycle.py` | `#01USMe5y` | append `v1_helper()` (pure addition → ONE revision, 6 lines) |
| E | **delete** | `m4_lifecycle.py` | `#017nbCaY` | bash `rm m4_lifecycle.py` — empty revision (0 lines) |
| F | write | `m4_lifecycle.py` | `#01MLZYnc` | recreate — `def v2(): return 2` (2 lines), born fresh |
| G | edit | `test_m4_lifecycle.py` | `#0155AQbn` | rewrite test to v2 (removal+addition pair) |

Surviving branch tip: `#3b6a446e`. No rewind point. No rewound branch. Two files.

### 2.3 Reconstructed revisions (VERIFIED live via `reconstructAll`, reader-free)

**`m4_lifecycle.py` — 4 revisions, kinds `[write, edit, delete, write]`:**
- revision 0 = **write** (B), 2 lines, all genesis: `def v1():` / `    return 1`
- revision 1 = **edit** (D), 6 lines (carries v1 + births the blank lines + `v1_helper`):
  `def v1():` / `    return 1` / `` / `` / `def v1_helper():` / `    return "helper"`
- revision 2 = **delete** (E), **0 lines** — empty, stamped at the rm time
- revision 3 = **write** (F), 2 lines, **ALL GENESIS** (`oldLineNum === DOES_NOT_EXIST_YET`
  for every line), `kind === EventKind.write` (NOT `overwrite`): `def v2():` / `    return 2`
  — carries NONE of the pre-delete lineage.

**`tests/test_m4_lifecycle.py` — 3 revisions, kinds `[write, edit, edit]`:**
- revision 0 = **write** (C), 5 lines: `from m4_lifecycle import v1` / `` / `` /
  `def test_v1_returns_1():` / `    assert v1() == 1`
- revision 1 = **edit removal** (G), 2 lines — the post-removal intermediate of the replace
  hunk: the two blank context lines (lines 2-3) survive, the old import/def/assert are gone
- revision 2 = **edit addition** (G, SAME changeId as rev 1), 5 lines:
  `from m4_lifecycle import v2` / `` / `` / `def test_v2_returns_2():` / `    assert v2() == 2`

There is exactly **one delete** revision (source rev 2). The recreate (source rev 3) is the
second write-kind revision on that path, but it is a create, not an overwrite (born fresh).

### 2.4 Final reconstructed content (byte-identical to on-disk ground truth)
- `m4_lifecycle.py` (source rev 3, 23 bytes): `def v2():\n    return 2\n`
- `tests/test_m4_lifecycle.py` (test rev 2, 76 bytes):
  `from m4_lifecycle import v2\n\n\ndef test_v2_returns_2():\n    assert v2() == 2\n`

### 2.5 Exact CLI output (captured live — the byte source-of-truth for the CLI tests in §6)

Column gaps are **two spaces**. In the conversationDAG/fileDAG the **kind column is padded
to width 6** (the widest kind is `prompt`/`delete` = 6) and the **target column is padded to
the widest filename** (`test_m4_lifecycle.py` = 20).

Default (`runCli([M4_JSONL])`):
```
══ conversationDAG ══
A  prompt  #1d55df91
  B  write   m4_lifecycle.py       #016pNFF6
  C  write   test_m4_lifecycle.py  #0147VowY
  D  edit    m4_lifecycle.py       #01USMe5y
  E  delete  m4_lifecycle.py       #017nbCaY
  F  write   m4_lifecycle.py       #01MLZYnc
  G  edit    test_m4_lifecycle.py  #0155AQbn

══ fileDAG ══
m4_lifecycle.py
  B  write   #016pNFF6
  D  edit    #01USMe5y
  E  delete  #017nbCaY
  F  write   #01MLZYnc
test_m4_lifecycle.py
  C  write   #0147VowY
  G  edit    #0155AQbn
```
Note: NO `branch …` lines appear (linear scenario). The source file's four events
(B/D/E/F) group under `m4_lifecycle.py`; the test file's two (C/G) under
`test_m4_lifecycle.py`. (`test_m4_lifecycle.py` does NOT appear under the source node.)

`--list-branches`:
```
surviving  tip #3b6a446e    m4_lifecycle.py, test_m4_lifecycle.py
```
(one surviving branch, two files; no `rewound`.)

`--surviving --verbose` (the byte-lock for the §6 content tests; the `### <path>` header
carries the per-run temp dir and is NOT asserted). The source file is rendered first, then
the test file:
```
revision 0  @ 2026-06-18T16:05:58.675Z  (2 lines)
     1 | def v1():
     2 |     return 1

revision 1  @ 2026-06-18T16:06:21.558Z  (6 lines)
     1 | def v1():
     2 |     return 1
     3 | 
     4 | 
     5 | def v1_helper():
     6 |     return "helper"

revision 2  @ 2026-06-18T16:06:33.941Z  (0 lines)
  (file absent — 0 lines)

revision 3  @ 2026-06-18T16:07:02.329Z  (2 lines)
     1 | def v2():
     2 |     return 2
```
then (the test file):
```
revision 0  @ 2026-06-18T16:05:59.300Z  (5 lines)
     1 | from m4_lifecycle import v1
     2 | 
     3 | 
     4 | def test_v1_returns_1():
     5 |     assert v1() == 1

revision 1  @ 2026-06-18T16:07:03.293Z  (2 lines)
     1 | 
     2 | 

revision 2  @ 2026-06-18T16:07:03.293Z  (5 lines)
     1 | from m4_lifecycle import v2
     2 | 
     3 | 
     4 | def test_v2_returns_2():
     5 |     assert v2() == 2
```
The delete renders as `(0 lines)` + a body line `  (file absent — 0 lines)` (two-space
indent; the dash is an **em-dash `—`**, U+2014, one space each side).

---

## 3. Why NO engine change is needed (reference map — cite these in impl-notes)

The existing machinery already produces §2 exactly. The implementing agent does **not**
modify any of this; it is documented here so the tests assert against the right concepts and
so the impl-notes can explain *why* m4 is a no-op lock.

- **`EventKind.delete` vocabulary:** `src/structures/vocabulary.ts:103` (`delete = "delete"`).
  The doc comment there already notes "s1: write (create) and delete (Bash rm)".
- **Delete extraction (bash `rm` → content-less delete event):** `parseRmTarget` matches
  `/^rm\s+(.+)$/` and returns the removed `Path` — `src/reconstruction_extract.ts:39-45`;
  `bashEventFrom` tries it first and emits
  `{ kind: EventKind.delete, changeId: block.id, target: removed, timestamp }` —
  `src/reconstruction_extract.ts:91-100`; dispatched from `toFileEvent`
  (`src/reconstruction_extract.ts:163-164`) when the tool is `ToolName.Bash`. The
  `DeleteEvent` type is `src/reconstruction_engine.ts:69-74` (four fields, no content).
- **Delete replay (empty revision at rm time):** `deleteRevision` returns
  `{ kind: EventKind.delete, changeId, timestamp, lines: [] }` —
  `src/reconstruction_replay.ts:55-62`; dispatched from `appendRevisionsForEvent`
  (`src/reconstruction_replay.ts:144-147`). The revision timestamp is copied straight from
  the rm event's timestamp. This is the same path S1 exercises
  (`tests/reconstruction_engine.test.ts:71-77`, "delete revision is empty at rm time").
- **THE CRUX — recreate born fresh:** the Write is replayed by `writeRevision`, which builds
  an **unconditional all-genesis full-content revision** (every line `genesisLine(...)`, no
  back-pointers, never diffs against history) — `src/reconstruction_replay.ts:43-53`. Its
  `kind` is decided by `fileIsPresent(revisions)`: the file is present only when the latest
  revision exists **and is not a deletion** —
  `src/reconstruction_replay_edit.ts:30-35`:
  ```ts
  // The file is present when the latest revision exists and is not a deletion — so a
  // write after a delete is a fresh create, not an overwrite (locked decision 3).
  export function fileIsPresent(revisions: FileRevision[]): boolean {
      const last = revisions[revisions.length - 1];
      return last !== undefined && last.kind !== EventKind.delete;
  }
  ```
  For m4 the latest revision before the recreate is the delete (`lines: []`), so
  `fileIsPresent` returns `false` and the recreate is labelled `EventKind.write` (a create).
  Dispatch: `revisions.push(writeRevision(event, fileIsPresent(revisions)))` —
  `src/reconstruction_replay.ts:140-142`. m4 is the FIRST fixture to drive this delete-branch
  (the existing `test_second_write_to_a_present_file_is_an_overwrite`,
  `tests/reconstruction_replay.test.ts:50-71`, covers the inverse no-delete branch).
- **The `toolUseResult.type` (`"create"`/`"update"`) is parsed but NEVER consumed.** It
  exists on the schema (`src/structures/tool-results.ts:45`) and `hydrateWriteResult` ignores
  it; create-vs-overwrite is derived purely from replay history via `fileIsPresent`. (Do not
  write tests that assert on `type` — the engine does not read it.)
- **Edit replay = the established pair, but D is addition-only:** `applyEdit` splices each
  hunk against the latest revision; a hunk with any `-` pushes a removal revision, a hunk
  with any `+` pushes an addition revision, both carrying the Edit's changeId —
  `src/reconstruction_replay_edit.ts` (paired model locked by
  `tests/reconstruction_engine.test.ts:103`,
  `test_edit_splices_into_paired_removal_and_addition_revisions`). For m4: event D appends
  `v1_helper` (a `+`-only hunk) so it yields ONE revision (source rev 1, 6 lines); event G
  rewrites the test (a hunk with both `-` and `+`) so it yields the removal+addition pair
  (test rev 1 then rev 2, same changeId).
- **Reader-free (no sidecar):** `reconstructAll(records, reader?)` —
  `src/reconstruction_engine.ts:167-172` — takes an OPTIONAL `BackupReader`. m4 needs none
  (no redirect events). This matches m2 (`tests/reconstruction_engine_m2.test.ts`,
  `tests/reconstruction_cli_m2.test.ts` — no reader passed).
- **CLI rendering:** the `delete` label is the enum member string rendered via
  `padEnd(width)` in `src/reconstruction_graph_render.ts` (kind width = widest kind = 6 for
  m4). The verbose `(file absent — 0 lines)` body comes from `renderRevisionState` when
  `revision.lines.length === 0` — `src/reconstruction_render.ts:36-42` (em-dash literal).
- **Precedent:** S1 (`s1-delete-file`; `tests/reconstruction_engine.test.ts:30-85`,
  `tests/reconstruction_cli.test.ts:138`, `tests/reconstruction_render.test.ts:28-49`) for
  delete extraction/replay/render; the paired-edit lock at
  `tests/reconstruction_engine.test.ts:103`; the overwrite-vs-create decision at
  `tests/reconstruction_replay.test.ts:50-71`. m4 composes the delete path with a
  write-after-delete and an edit-before-delete for the first time.

---

## 4. Task 1 — Baseline & fixture (do first)

**4.1 Confirm baseline GREEN** (so the +9 delta is unambiguous):
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 296 pass / 0 fail
npx tsc --noEmit  # expect clean
```
If baseline is not 296/clean, STOP and report — the tree drifted from the m3 handoff.
NOTE: 296 = the 278 committed baseline (HEAD `91ac563`, which already includes S23 + m1)
plus m2's 9 and m3's 9 tests. m2 and m3 may still be **uncommitted** in the working tree
(their tests/docs present, no `src/` change). Do not revert them; m4 layers on top and
SHARES the doc files (`fixtures.ts`, `roadmap.md`, `implementation-notes-…md`,
`reconstruction-engine-design.md`), which carry m2's and m3's edits — **never** `git add -A`
and **never** `git checkout`/`restore` them (the worktree-git-checkout hazard documented
since S18).

**4.2 Add the fixture.** Edit `tests/fixtures.ts`: append, after the `M3_JSONL` entry, a new
constant (Desktop path, mirroring every other `S*_JSONL`/`M*_JSONL`):
```typescript
export const M4_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m4-delete-recreate/c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl";
```
Rationale: the suite reads transcripts from the Desktop RevEng tree, not the worktree
(confirmed: every `S*_JSONL`/`M*_JSONL` uses that root, and the m4 JSONL is present there
under the same UUID).

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_m4.test.ts`, 4 tests)

Create the file below. It is **reader-free** (the m2 pattern): it calls
`reconstructAll(loadRecords(M4_JSONL))` with no reader. The `finalTextOf` helper and the
`historyEndingWith` two-file selector are copied from the m2 suite (local convention permits
these noun-phrase accessors; keep them identical). `historyEndingWith` uses a leading-slash
suffix so `/m4_lifecycle.py` matches ONLY the source (the test path ends with
`/test_m4_lifecycle.py`, not `/m4_lifecycle.py`).

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { DOES_NOT_EXIST_YET } from "../src/structures/line-model.ts";
import { loadRecords } from "./utilities.ts";
import { M4_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The single history whose target path ends with `suffix`. m4 touches TWO files
// (source m4_lifecycle.py and tests/test_m4_lifecycle.py); a leading-slash suffix
// disambiguates them ("/m4_lifecycle.py" does not match "/test_m4_lifecycle.py").
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// m4's source file lives a full lifecycle: written (v1), edited (v1_helper appended),
// DELETED via `rm`, then RE-CREATED at the same path (v2). That is FOUR revisions in
// order [write, edit, delete, write], ending at the 2-line v2 ground truth.
test("test_m4_source_history_is_write_edit_delete_write_four_revisions", () => {
    const source = historyEndingWith(reconstructAll(loadRecords(M4_JSONL)), "/m4_lifecycle.py");
    assert.equal(source.revisions.length, 4);
    assert.deepEqual(
        source.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.delete, EventKind.write],
    );
    assert.equal(finalTextOf(source.revisions[3]!), "def v2():\n    return 2");
});

// Property 1 (non-terminal delete): the `rm` is NOT the last event on the path (the file is
// recreated afterwards), yet it still produces an EMPTY revision — revision 2 carries zero
// lines and kind delete. (S1's delete is terminal; m4's is mid-lifecycle.)
test("test_m4_delete_revision_between_edit_and_recreate_is_empty", () => {
    const source = historyEndingWith(reconstructAll(loadRecords(M4_JSONL)), "/m4_lifecycle.py");
    assert.equal(source.revisions[2]!.kind, EventKind.delete);
    assert.equal(source.revisions[2]!.lines.length, 0);
    assert.equal(finalTextOf(source.revisions[2]!), "");
});

// THE CRUX (property 2 — recreate born fresh): the Write after the delete is a FRESH create,
// not an overwrite. Its revision kind is `write` (NOT `overwrite`) and EVERY line is genesis
// (oldLineNum === DOES_NOT_EXIST_YET) — it carries NONE of the pre-delete lineage (no v1, no
// v1_helper), only v2. This proves fileIsPresent treated the trailing delete as absent.
test("test_m4_recreate_after_delete_is_born_fresh_write_not_overwrite", () => {
    const source = historyEndingWith(reconstructAll(loadRecords(M4_JSONL)), "/m4_lifecycle.py");
    const recreate = source.revisions[3]!;
    assert.equal(recreate.kind, EventKind.write); // a create — NOT EventKind.overwrite
    for (const entry of recreate.lines) {
        assert.equal(entry.oldLineNum, DOES_NOT_EXIST_YET); // every line born fresh, no back-pointer
    }
    assert.equal(finalTextOf(recreate), "def v2():\n    return 2"); // only v2, no carried lineage
});

// Property 3 (two-file accounting + Edit-pair on the surviving sibling): reconstructAll
// returns exactly TWO histories. The test file is written (v1 test) then edited (to v2) — the
// single Edit becomes the engine's standard removal+addition pair, so three revisions
// [write, edit, edit], with both edit halves sharing the ONE Edit's changeId, ending at v2.
test("test_m4_test_file_edit_is_paired_removal_then_addition", () => {
    const histories = reconstructAll(loadRecords(M4_JSONL));
    assert.equal(histories.length, 2);
    const testFile = historyEndingWith(histories, "/test_m4_lifecycle.py");
    assert.equal(testFile.revisions.length, 3);
    assert.deepEqual(
        testFile.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.edit],
    );
    assert.equal(
        testFile.revisions[1]!.changeId.toString(),
        testFile.revisions[2]!.changeId.toString(),
    );
    assert.equal(
        finalTextOf(testFile.revisions[2]!),
        "from m4_lifecycle import v2\n\n\ndef test_v2_returns_2():\n    assert v2() == 2",
    );
});
```

**TDD for a char-lock (do this per the tdd guide):**
1. Write the file; run `node --import tsx --test tests/reconstruction_engine_m4.test.ts`.
   Expect all 4 GREEN immediately (engine already correct).
2. **Prove the crux locks actually bite** (record each RED→GREEN in impl-notes):
   - In `test_m4_recreate_after_delete_is_born_fresh_write_not_overwrite`, temporarily change
     `assert.equal(recreate.kind, EventKind.write)` to `EventKind.overwrite` and re-run — it
     MUST go RED (proving the recreate is a fresh create, i.e. `fileIsPresent` saw the
     delete). Restore.
   - In `test_m4_delete_revision_between_edit_and_recreate_is_empty`, temporarily change
     `assert.equal(source.revisions[2]!.lines.length, 0)` to `1` and re-run — it MUST go RED
     (proving the non-terminal delete revision is empty). Restore.
3. If step 1 is NOT all-green, STOP — the no-fix premise is violated (the recreate would be
   carrying pre-delete lineage, or the delete/edit replay would be wrong).

> If `reconstructAll`'s signature differs, match the engine's actual call site — m2 calls
> `reconstructAll(loadRecords(M2_JSONL))` with no reader. Do NOT change the engine to fit the
> test.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_m4.test.ts`, 5 tests)

`runCli([M4_JSONL, ...flags])` builds its own sidecar reader internally (which resolves
unused for m4), so pass **NO** reader. Assertions use `assert.ok(out.includes(...))` on the
byte-exact strings captured in §2.5 (two-space column gaps; kind column padded to width 6;
target column padded to width 20). The `### <path>` verbose header carries a per-run temp dir
and is NOT asserted.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M4_JSONL } from "./fixtures.ts";

// m4's conversationDAG is LINEAR: a single root prompt A with B..G beneath it and NO
// branch/rewind lines. The `rm` surfaces as a `delete` turn (E); the recreate as `write` (F).
test("test_m4_default_conversationDAG_lists_prompt_and_six_linear_events", () => {
    const out = runCli([M4_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #1d55df91"));
    assert.ok(out.includes("  B  write   m4_lifecycle.py       #016pNFF6"));
    assert.ok(out.includes("  C  write   test_m4_lifecycle.py  #0147VowY"));
    assert.ok(out.includes("  D  edit    m4_lifecycle.py       #01USMe5y"));
    assert.ok(out.includes("  E  delete  m4_lifecycle.py       #017nbCaY"));
    assert.ok(out.includes("  F  write   m4_lifecycle.py       #01MLZYnc"));
    assert.ok(out.includes("  G  edit    test_m4_lifecycle.py  #0155AQbn"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The fileDAG groups the source file's four events (B/D/E/F) under m4_lifecycle.py and the
// test file's two (C/G) under test_m4_lifecycle.py, each in order. The delete is a turn.
test("test_m4_default_fileDAG_groups_two_files_by_lifecycle", () => {
    const out = runCli([M4_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "m4_lifecycle.py\n  B  write   #016pNFF6\n  D  edit    #01USMe5y\n  E  delete  #017nbCaY\n  F  write   #01MLZYnc",
    ));
    assert.ok(out.includes(
        "test_m4_lifecycle.py\n  C  write   #0147VowY\n  G  edit    #0155AQbn",
    ));
});

// One surviving branch, no rewound branch (linear scenario); BOTH files are listed.
test("test_m4_list_branches_single_surviving_two_files", () => {
    const out = runCli([M4_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #3b6a446e"));
    assert.ok(out.includes("m4_lifecycle.py, test_m4_lifecycle.py"));
    assert.ok(!out.includes("rewound"));
});

// THE DELETE BYTE-LOCK: even though the file is later recreated, the `rm` renders as an
// absent (0-line) revision in the surviving verbose history.
test("test_m4_surviving_verbose_shows_delete_as_absent_revision", () => {
    const out = runCli([M4_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("(0 lines)\n  (file absent — 0 lines)"));
});

// THE RECREATE BYTE-LOCK (end-to-end born-fresh): the revision after the absent one carries
// ONLY the 2-line v2 content (def v2 / return 2) — the recreate did not carry v1/v1_helper
// forward. The source history has exactly four revisions (0..3); there is no revision 4.
test("test_m4_surviving_verbose_recreate_shows_only_v2_content", () => {
    const out = runCli([M4_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("(2 lines)\n     1 | def v2():\n     2 |     return 2"));
    assert.ok(!out.includes("revision 4"));
});
```

**TDD:** run `node --import tsx --test tests/reconstruction_cli_m4.test.ts` — expect all 5
GREEN. If a multi-line `includes` (a fileDAG block, or a verbose block) fails, re-capture the
exact block with
`npx tsx src/reconstruction_cli.ts "scenarios/executed/m4-delete-recreate/c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl" --surviving --verbose 2>/dev/null`
(stderr carries only the debugger banner) and reconcile whitespace — the strings in §2.5 are
the authority (kind column padded to width 6, target column to width 20, two-space gaps, five
leading spaces before the line-number column; the em-dash in `(file absent — 0 lines)` is
U+2014). As a prove-the-lock step, in `test_m4_surviving_verbose_recreate_shows_only_v2_content`
temporarily change `def v2():` to `def v2_SENTINEL():` and confirm RED (a sentinel that
appears NOWHERE else — per the m2/m3 lesson, do NOT reuse `(2 lines)`/`(0 lines)` which recur
across revision blocks), then restore. Likewise, in the delete test, append `SENTINEL` inside
the `(file absent — 0 lines)` literal and confirm RED, then restore.

---

## 7. Task 4 — Docs (3 edits)

**7.1 `plans/roadmap.md`** — flip the empty `[ ] M4 ->` placeholder (line 28) to checked,
mirroring the M1/M2/M3 line style. Suggested text:
```
[x] M4 -> [x] DELETE then RE-CREATE at the same path: TWO files. m4_lifecycle.py is written (v1 `def v1(): return 1`), edited (appends `v1_helper()`), DELETED via bash `rm`, then a NEW file is written at the same path (v2 `def v2(): return 2`); the sibling tests/test_m4_lifecycle.py is written (v1 test) then edited to v2. Reconstructs as TWO histories: m4_lifecycle.py is FOUR revisions [write, edit, delete, write] (delete = empty 0-line revision at rm time; the recreate is born FRESH — kind write not overwrite, every line genesis, carrying NONE of the pre-delete v1/v1_helper lineage), ending at the 23-byte `def v2():\n    return 2`; test_m4_lifecycle.py is THREE revisions [write, edit, edit] (the Edit is the engine's standard removal+addition pair) ending at the v2 test. FIRST scenario with a non-terminal delete, the FIRST write→delete→write recreate (exercising the fileIsPresent delete-branch / "locked decision 3"), and the first delete with a pre-delete edit + a sibling Edit-pair. Linear (no rewind), one surviving branch tip #3b6a446e. Engine ALREADY correct (characterization LOCK, NO src change): parseRmTarget/bashEventFrom emit the content-less DeleteEvent, deleteRevision yields the empty revision, writeRevision + fileIsPresent label the post-delete Write a fresh create, and applyEdit emits the removal+addition pair. Reader-free (no bash redirect). 9 new tests (4 engine + 5 CLI); 305 green; S1–S23 + m1 + m2 + m3 byte-for-byte unchanged.
```

**7.2 `plans/implementation-notes-api-from-scenarios.md`** — PREPEND a new entry at the very
top (newest-first), in the established heading format:
```
## <YYYY-MM-DD:HH:MM:SS> — m4 reconstruction (delete then recreate at the same path) — COMPLETE; characterization/regression LOCK, NO src change; 305 tests green
Chat title: <this session's title>
Path to JSONL log: <this session's JSONL>
```
Then the standard sub-sections: `### References` (link this plan, the m3 handoff that gated
it, and §3's file:line map), `### Design decisions` (why NO engine change — restate §3:
`parseRmTarget`/`bashEventFrom` delete extraction, `deleteRevision` empty revision,
`writeRevision`+`fileIsPresent` born-fresh recreate ["locked decision 3"], `applyEdit`
removal+addition pair on the sibling test; note m4 is the FIRST non-terminal delete and the
first write→delete→write recreate), `### Deviations` (record the prove-the-lock RED→GREEN
steps from §5/§6), `### Tradeoffs` (engine tests are reader-free like m2; the born-fresh
property is locked at the engine level via kind+genesis and at the CLI level via the rendered
2-line v2 block), `### Open questions` (none expected).

**7.3 `plans/reconstruction-engine-design.md`** — append a short **m4** note immediately after
the **m3** note (same per-scenario style). NO new spec number (engine unchanged). Suggested
content:
```
m4 (`m4-delete-recreate`) deletes a file then re-creates it at the same path. Two files: m4_lifecycle.py is written (v1), edited (appends v1_helper), DELETED via bash `rm`, then written again (v2); tests/test_m4_lifecycle.py is written then edited to v2. No new machinery — it is locked, not fixed. It composes existing guarantees: (a) delete extraction — `parseRmTarget`/`bashEventFrom` emit a content-less DeleteEvent and `deleteRevision` yields an empty 0-line revision at the rm time (the S1 delete path, here NON-terminal for the first time); (b) born-fresh recreate — `writeRevision` builds an unconditional all-genesis full-content revision and `fileIsPresent` ("locked decision 3") treats the trailing delete as absent, so the post-delete Write is labelled a create (kind write, not overwrite) carrying none of the pre-delete v1/v1_helper lineage — the FIRST fixture to drive the fileIsPresent delete-branch (the inverse of test_second_write_to_a_present_file_is_an_overwrite); (c) the paired edit — `applyEdit` emits the sibling test's removal+addition pair, while the pre-delete edit on the source (appending v1_helper) is a `+`-only hunk and so a single addition revision. Reader-free (no bash redirect). Linear (no rewind): one surviving branch, two files.
```

> Do NOT `git checkout`/`git restore` the shared docs (`fixtures.ts`, `roadmap.md`,
> `implementation-notes-…md`, `reconstruction-engine-design.md`) to undo a temp edit — revert
> the specific lines by hand (they carry uncommitted m2 and m3 edits).

---

## 8. Task 5 — Full verification

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 305 pass / 0 fail (296 baseline + 9 new)
npx tsc --noEmit  # expect clean
git diff --stat src/   # expect EMPTY — m4 adds ZERO src change
```
- **`git diff src/` must be EMPTY for m4.** HEAD `91ac563` already commits S23 + m1, and
  m2/m3 added no `src/`, so the only way a `src/` change appears is if you broke the no-fix
  premise. If ANY `src/` file (or new hunk) appears, STOP and escalate.
- End-to-end byte check (belt-and-suspenders, against the worktree JSONL):
  ```
  P="scenarios/executed/m4-delete-recreate/c8422976-8d07-4c16-8b0a-30c582c1cf7c.jsonl"
  npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
  ```
  and eyeball that `m4_lifecycle.py` shows four revisions — v1, v1+v1_helper, the
  `(file absent — 0 lines)` delete, then the 2-line v2 recreate — and that
  `test_m4_lifecycle.py` shows three revisions ending at the v2 test; and that
  `--list-branches` lists both files under `surviving tip #3b6a446e` with NO `rewound`.

---

## 9. Task 6 — Commit (on user approval ONLY) then HAND OFF

Project rule: **one commit per scenario, only after the user approves.** Stage EXACTLY these
7 files — do **NOT** `git add -A` (other scenarios share fixtures/roadmap/impl-notes/design,
which carry uncommitted m2 and m3 edits, and the worktree handoff layout under
`plans/sN/`/`plans/m1/`/`plans/m2/`/`plans/m3/`/`plans/m4/` must not be swept in):
- `tests/fixtures.ts`
- `tests/reconstruction_engine_m4.test.ts`
- `tests/reconstruction_cli_m4.test.ts`
- `plans/roadmap.md`
- `plans/implementation-notes-api-from-scenarios.md`
- `plans/reconstruction-engine-design.md`
- `plans/m4/m4-reconstruction-plan.md` (this plan)

There is **no `src/` file** in the commit (m4 is a no-src-change lock).
Suggested message: `Implemented m4 handling`. NOTE: m2's and m3's commits (their parallel
7-file sets) may still be outstanding and are separate decisions — do not bundle.

**Then CREATE A HANDOFF** via the `/jot:handoff-prompt` skill documenting the completed m4
implementation (tests green count = 305, no-src-change confirmation, files staged) and naming
the **NEXT scenario** (roadmap line 29, whatever follows M4) — plan it the same way
(ground-truth-first: run the CLI live, verify byte-for-byte, then char-lock or real-fix
depending on whether the engine is already correct). This handoff is a **required
deliverable**, not optional.

---

## 10. Acceptance criteria (Definition of Done)

- [ ] `tests/fixtures.ts` has `M4_JSONL` (Desktop path), appended after `M3_JSONL`.
- [ ] `tests/reconstruction_engine_m4.test.ts` — 4 tests, reader-free
      (`reconstructAll(loadRecords(M4_JSONL))`), all green; both crux tests proven to bite
      (RED when `recreate.kind` is flipped to `EventKind.overwrite`, and when the delete
      revision's `lines.length` is flipped to `1`).
- [ ] `tests/reconstruction_cli_m4.test.ts` — 5 tests, all green; linear (asserts no
      `branch`/`rewound`); the delete renders as `(file absent — 0 lines)`, the recreate
      renders only the 2-line v2 content, and `revision 4` is proven absent.
- [ ] `npm test` = **305 pass / 0 fail**; `npx tsc --noEmit` clean.
- [ ] `git diff src/` is **EMPTY** (m4 adds no engine change).
- [ ] roadmap M4 line flipped to `[x]`; impl-notes entry prepended; design.md m4 note
      appended after the m3 note (NO new spec number).
- [ ] Committed (exact 7-file list) only after user approval, message `Implemented m4 handling`.
- [ ] **Completion handoff written via `/jot:handoff-prompt`** (names the next scenario).
