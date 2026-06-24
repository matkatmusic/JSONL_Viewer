# Reconstruction Plan — Scenario **m2** (`m2-mv-rename`)

> **Type: characterization / regression LOCK. NO `src/` change.**
> The engine **already** reconstructs m2 byte-for-byte correct (verified live —
> see §2). This plan locks that behaviour with 9 new tests (4 engine + 5 CLI) and
> 3 doc edits, exactly mirroring the m1/S20/S21/S22 char-locks. It is **not** a real
> engine fix (unlike S19/S23). If, while implementing, any test cannot be made
> GREEN without touching `src/`, STOP and escalate — that would mean the live
> verification in §2 was wrong, and the plan must be revised, not the engine.

Implementing agent: read `~/.claude/guides/tdd.md` and
`plans/coding-requirements.md` before starting. The test code below already conforms
(enum-member comparisons via `EventKind.*`, wrapped `Path`/`Uuid`, and the verbatim
`finalTextOf`/`historyEndingWith` noun-phrase accessors carried over from the
m1/S23 suites).

---

## 1. Goal

Lock — with tests — that `reconstruction_cli` correctly reconstructs the
file-change history of `m2-mv-rename`, the **mv-rename** scenario: a file is
written, edited, then **renamed via `mv`**, then the renamed file is edited again.
A `mv m2_old_name.py m2_new_name.py` (event E) ends `m2_old_name.py`'s life and
continues it as `m2_new_name.py`. The lock must pin the two properties that make
m2 novel relative to the existing S2 rename precedent:

1. **History continuity across the rename (pre-rename edit carried):** the new
   file `m2_new_name.py` is ONE history that reaches back through the rename to
   include BOTH the original write (`process`) AND the **pre-rename edit**
   (`validate`). The post-rename edit (`finalize`) composes on top of that carried
   `process+validate` content. The renamed file is a four-revision history
   `[write, edit, rename, edit]`.
2. **Old path collapses (no separate history):** `m2_old_name.py` is NEVER its own
   surviving file — the rename source resolves to the destination, so
   `reconstructAll` returns exactly TWO histories (`m2_new_name.py` + the test
   file), and `--list-branches` lists only `m2_new_name.py, test_m2_old_name.py`.

m2 is **linear** — there is NO conversation or code rewind, so exactly ONE branch
(`surviving`, tip `#7260996e`) and NO rewound branch. It is the **file-rename twin
of m1** (m1 forks a file with `cp`; m2 renames a file with `mv`).

### Why m2 is distinct from S2 (the existing rename precedent)
`s2-move-file` is `write → move → edit-the-moved-file` — the file is edited ONLY
**after** the move, so its pre-rename history is a single `write`. m2 adds a
**pre-rename edit** (`validate`, event D) so the renamed file carries a TWO-revision
history (`write` + `edit`) across the rename and THEN gains a post-rename edit
(`finalize`, event F). m2 is the FIRST rename scenario edited on **both sides** of
the rename — the rename analogue of m1 being the first copy scenario to edit both
the source and the copy.

---

## 2. Ground truth (VERIFIED live against the engine at HEAD `ce18413` + uncommitted S23 + m1)

### 2.1 Scenario source & inputs
- Scenario script: `scenarios/m2-mv-rename.txt`
- Executed transcript (worktree copy): `scenarios/executed/m2-mv-rename/70c5989e-017b-425f-8a8b-89daec0c4528.jsonl`
- **Fixture path (Desktop — this is what `tests/fixtures.ts` must point at, like every other `S*_JSONL`/`M1_JSONL`):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m2-mv-rename/70c5989e-017b-425f-8a8b-89daec0c4528.jsonl`
  (confirmed present on Desktop, 178 KB.)
- **No file-history backup / `BackupReader` is needed** — a rename is recovered
  entirely from the JSONL Bash command (the from/to paths), and the renamed file's
  content is the OLD file's reconstructed content carried forward inline (see §3).
  Engine tests run **reader-free** (pass no `BackupReader`); the CLI builds its own
  real reader internally and is unaffected. (Contrast: bash `>`/`>>` redirects DO
  need the sidecar — rename does not.)

### 2.2 Event ladder (the `mv` is event E)
| Turn | Kind | File (final path) | changeId | Effect |
|------|------|------|----------|--------|
| A | prompt | — | `#222eac11` | root user prompt |
| B | write | `m2_old_name.py` | `#01ByHKPs` | create `process()` — 2 lines |
| C | write | `test_m2_old_name.py` | `#0138XEEN` | create test — 5 lines |
| D | edit | `m2_old_name.py` | `#01BfXLQz` | add `validate()` — old file → 6 lines |
| **E** | **rename** | **`m2_new_name.py`** | **`#01SMiNy8`** | **`mv m2_old_name.py m2_new_name.py`** — old → new, content carried (process+validate) |
| F | edit | `m2_new_name.py` | `#01FMMzJD` | add `finalize()` — new file → 10 lines |

Surviving branch tip: `#7260996e`. No rewind point. No rewound branch.
Note the test file `test_m2_old_name.py` is **not** renamed (only `m2_old_name.py`
is) — it keeps its original name and is a single untouched write.

### 2.3 Final reconstructed content (byte-identical to on-disk ground truth — VERIFIED via `diff`, 112 bytes == 112 bytes)

`m2_new_name.py` — **4 revisions** (`write → edit → rename → edit`), final **10 lines**:
- revision 0 = write (`process`), **2 lines**:
  ```
  def process():
      return "processing"
  ```
- revision 1 = edit (`validate`, the **pre-rename** edit), **6 lines** — this is the
  content carried across the rename:
  ```
  def process():
      return "processing"


  def validate():
      return "valid"
  ```
- revision 2 = **rename** (kind `EventKind.rename`), `m2_old_name.py → m2_new_name.py`
  — carries revision 1's content forward unchanged (no new lines).
- revision 3 = edit (`finalize`, the **post-rename** edit), final **10 lines**:
  ```
  def process():
      return "processing"


  def validate():
      return "valid"


  def finalize():
      return "done"
  ```

`test_m2_old_name.py` — **1 revision** (write), **5 lines**:
```
from m2_old_name import process


def test_process_returns_processing():
    assert process() == "processing"
```

There is **NO** surviving `m2_old_name.py` history — the rename source collapses
into `m2_new_name.py` (see §3).

### 2.4 Exact CLI output (captured live — the byte source-of-truth for the CLI tests in §6)

Column gaps are **two spaces**; the kind column is padded to the widest kind
(`rename`/`prompt` = 6), and the file column is padded to the widest filename.

Default (`runCli([M2_JSONL])`):
```
══ conversationDAG ══
A  prompt  #222eac11
  B  write   m2_old_name.py       #01ByHKPs
  C  write   test_m2_old_name.py  #0138XEEN
  D  edit    m2_old_name.py       #01BfXLQz
  E  rename  m2_new_name.py       #01SMiNy8
  F  edit    m2_new_name.py       #01FMMzJD

══ fileDAG ══
m2_old_name.py
  B  write   #01ByHKPs
  D  edit    #01BfXLQz
test_m2_old_name.py
  C  write   #0138XEEN
m2_new_name.py
  E  rename  #01SMiNy8
  F  edit    #01FMMzJD
```
Note: NO `branch …` lines appear (linear scenario). In the **fileDAG**,
`m2_old_name.py` shows its pre-rename events (B, D) and `m2_new_name.py` shows the
rename + post-rename edit (E, F) — the fileDAG groups by the path each event names,
while the reconstructed *history* (below) merges them into one lineage.

`--list-branches`:
```
surviving  tip #7260996e    m2_new_name.py, test_m2_old_name.py
```
(`m2_old_name.py` is correctly ABSENT — it was renamed away.)

`--surviving --verbose` — the `m2_new_name.py` rename revision header (the crux byte-lock):
```
revision 2  rename  <…>/m2_old_name.py → <…>/m2_new_name.py  @ 2026-06-18T16:05:30.146Z
```
(`m2_new_name.py`'s pre-rename block is `revision 1  @ …  (6 lines)` — process+validate;
its final block is `revision 3  @ …  (10 lines)` — adds finalize. The test file is a
single `revision 0  @ …  (5 lines)`.)

---

## 3. Why NO engine change is needed (reference map — cite these in impl-notes)

The existing rename machinery already produces §2 exactly. The implementing agent
does **not** modify any of this; it is documented here so the tests assert against
the right concepts and so the impl-notes can explain *why* m2 is a no-op fix.

- **Parse (`mv` → rename event):** `parseMvPaths` matches `^(?:git\s+)?mv\s+(\S+)\s+(\S+)$`
  and returns `{from, to}` — `src/reconstruction_extract.ts:49`. `bashEventFrom`
  builds the `RenameEvent` with cwd-resolved paths — `src/reconstruction_extract.ts:91-107`.
  `RenameEvent` type — `src/reconstruction_engine.ts:86`; `RenameInfo` —
  `src/reconstruction_engine.ts:37`; `EventKind.rename` — `src/structures/vocabulary.ts:105`.
  **No sidecar:** rename content is NOT read from file-history (only redirects are —
  `reconstruction_extract.ts:75`); a rename just links two path identities.
- **History continuity / one lineage (property 1):** `buildRenameChain` maps
  `from → to` for every rename — `src/reconstruction_lineage.ts:11-19`.
  `resolveFinalPath` follows that chain to the surviving path —
  `src/reconstruction_lineage.ts:22-31`. `contentPathOf` keys a rename by its
  destination (`event.to`) — `src/reconstruction_lineage.ts:34-42`.
  `eventBelongsToLineage` filters BOTH old-path and new-path events into ONE history
  for the final target — `src/reconstruction_lineage.ts:45-51`; this is applied in
  `reconstructFileOver` — `src/reconstruction_branches.ts:41-58`. So B (write old),
  D (edit old), E (rename), F (edit new) all reconstruct as the single
  `m2_new_name.py` history.
- **Content carried across the rename (the pre-rename edit survives):**
  `renameRevision` builds the rename revision as
  `lines = lastLinesOf(revisions).map(carryAt)` — `src/reconstruction_replay.ts:64-78`
  — i.e. it carries the PRIOR revision's lines (process+validate) forward as identity
  back-pointers (`lastLinesOf`/`carryAt` — `src/reconstruction_replay_edit.ts:38-46`).
  The post-rename edit F (`finalize`) is replayed by `applyEdit` onto
  `lastLinesOf(revisions)` — which now includes the rename checkpoint — so `finalize`
  splices onto `process+validate` — `src/reconstruction_replay.ts:136-187`.
- **Old path excluded from the surviving file set (property 2):** `distinctFinalPaths`
  collapses every rename source into its final destination, so the surviving file set
  has ONE entry for the renamed file — `src/reconstruction_lineage.ts:53-65`;
  consumed by `reconstructFilesOver` — `src/reconstruction_branches.ts:189-195`;
  rendered by `summarizeBranchFiles`/`renderBranchSummary` (basenames of
  `branched.surviving` only) — `src/reconstruction_render_list.ts:134-145`. The old
  name is never a key, so it never appears.
- **Why rename differs from copy:** a copy creates a NEW genesis revision
  (`copyRevision`/`genesisLine`, every line `oldLineNum = DOES_NOT_EXIST_YET`) and the
  destination is a SEPARATE final path — `src/reconstruction_replay.ts:80-94` — so
  copy keeps TWO histories (m1). A rename instead chains path resolution and merges
  old+new into ONE history. m2 is the rename mirror of m1's copy.
- **Precedent:** `s2-move-file` already exercises rename lineage — design doc
  "Merge by lineage" note at `plans/reconstruction-engine-design.md:75-90`; tests
  `tests/reconstruction_lineage.test.ts:92-98` (`distinctFinalPaths` collapses the
  rename source), `tests/reconstruction_engine.test.ts:124-146` (moved file history
  spans create→rename→edit, 3 revisions) and `:148-166` (`reconstructAll(S2)` returns
  exactly two lineages, none keyed by the old name). m2 GENERALISES S2 from "edit only
  AFTER the move" to "edit on BOTH sides of the rename" (pre-rename `validate` carried
  across, post-rename `finalize` composed on top) — a four-revision lineage, which the
  new tests pin.

---

## 4. Task 1 — Baseline & fixture (do first)

**4.1 Confirm baseline GREEN** (so the +9 delta is unambiguous):
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 278 pass / 0 fail
npx tsc --noEmit  # expect clean
```
If baseline is not 278/clean, STOP and report — the tree drifted from the m1
handoff. NOTE: 278 already includes the uncommitted S23 work
(`src/reconstruction_branches.ts`) and the uncommitted m1 tests/docs (m1 added ZERO
`src/` change). Do not revert or commit that work; m2 layers on top of it and SHARES
the doc files (`fixtures.ts`, `roadmap.md`, `implementation-notes…md`,
`reconstruction-engine-design.md`), which already carry S23+m1 edits — **never**
`git add -A` and **never** `git checkout`/`restore` them.

**4.2 Add the fixture.** Edit `tests/fixtures.ts`: append, after the `M1_JSONL`
entry, a new constant (Desktop path, mirroring every other `S*_JSONL`/`M1_JSONL`):
```typescript
export const M2_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m2-mv-rename/70c5989e-017b-425f-8a8b-89daec0c4528.jsonl";
```
Rationale: the suite reads transcripts from the Desktop RevEng tree, not the
worktree (confirmed: every `S*_JSONL`/`M1_JSONL` uses that root, and the m2 JSONL is
present there).

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_m2.test.ts`, 4 tests)

Create the file below. It is **reader-free** (`reconstructAll(loadRecords(M2_JSONL))`
with no `BackupReader`), because m2 needs no sidecar (see §2.1/§3). The
`finalTextOf` and `historyEndingWith` helpers are copied verbatim from
`tests/reconstruction_engine_m1.test.ts` (local convention permits these
noun-phrase accessors; keep them identical for consistency).

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { M2_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The history whose final path ends with `suffix` (and, when excludeTest, is not the test file).
function historyEndingWith(histories: FileHistory[], suffix: string, excludeTest: boolean): FileHistory {
    return histories.find((history) => {
        const path = history.target.toString();
        const matches = path.endsWith(suffix);
        return excludeTest ? matches && !path.includes("test_") : matches;
    })!;
}

const OLD_AT_RENAME =
    "def process():\n    return \"processing\"\n\n\ndef validate():\n    return \"valid\"";
const MERGED_FINAL =
    "def process():\n    return \"processing\"\n\n\ndef validate():\n    return \"valid\"\n\n\ndef finalize():\n    return \"done\"";
const TEST_FINAL =
    "from m2_old_name import process\n\n\ndef test_process_returns_processing():\n    assert process() == \"processing\"";

// m2's renamed file is ONE history that spans write -> edit -> rename -> edit (four
// revisions). The pre-rename write+edit and the post-rename edit are merged into the
// single m2_new_name.py lineage, ending at the 10-line process+validate+finalize file.
test("test_m2_renamed_file_history_is_write_edit_rename_edit_four_revisions", () => {
    const histories = reconstructAll(loadRecords(M2_JSONL));
    const renamed = historyEndingWith(histories, "m2_new_name.py", false);
    assert.equal(renamed.revisions.length, 4);
    assert.deepEqual(
        renamed.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.rename, EventKind.edit],
    );
    assert.equal(finalTextOf(renamed.revisions[renamed.revisions.length - 1]!), MERGED_FINAL);
});

// THE CRUX (property 1 — history continuity across the rename): the PRE-rename edit
// (validate, revision 1) is carried into the new file's lineage, the rename (revision
// 2) is a first-class revision linking old -> new, and the post-rename edit composes
// finalize on top of the carried process+validate content.
test("test_m2_pre_rename_edit_is_carried_across_rename_and_post_edit_composes_on_it", () => {
    const histories = reconstructAll(loadRecords(M2_JSONL));
    const renamed = historyEndingWith(histories, "m2_new_name.py", false);
    // revision 1 is the pre-rename edit (validate) — its content is what the rename carries forward
    assert.equal(renamed.revisions[1]!.kind, EventKind.edit);
    assert.equal(finalTextOf(renamed.revisions[1]!), OLD_AT_RENAME);
    // revision 2 is the rename itself, linking the old path to the new path
    assert.equal(renamed.revisions[2]!.kind, EventKind.rename);
    assert.ok(renamed.revisions[2]!.rename!.from.toString().endsWith("/m2_old_name.py"));
    assert.ok(renamed.revisions[2]!.rename!.to.toString().endsWith("/m2_new_name.py"));
    // the final (revision 3) adds finalize on top of the carried process+validate
    assert.equal(finalTextOf(renamed.revisions[3]!), MERGED_FINAL);
    assert.ok(finalTextOf(renamed.revisions[3]!).includes("def validate():"));
});

// Property 2 (old path collapses): the rename source is never its own surviving
// history. reconstructAll returns exactly TWO histories (renamed file + test file),
// and none is keyed by the old path m2_old_name.py.
test("test_m2_old_path_collapses_into_new_and_two_total_histories", () => {
    const histories = reconstructAll(loadRecords(M2_JSONL));
    assert.equal(histories.length, 2);
    assert.ok(histories.every((h) => !h.target.toString().endsWith("/m2_old_name.py")));
    const renamed = historyEndingWith(histories, "m2_new_name.py", false);
    assert.ok(finalTextOf(renamed.revisions[renamed.revisions.length - 1]!).includes("def finalize():"));
});

// The test file is a single write, NOT renamed (it keeps its m2_old_name.py-derived
// name) and untouched by the rename of the module under test.
test("test_m2_test_file_single_write_and_not_renamed", () => {
    const histories = reconstructAll(loadRecords(M2_JSONL));
    const testFile = historyEndingWith(histories, "test_m2_old_name.py", false);
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
    assert.equal(finalTextOf(testFile.revisions[0]!), TEST_FINAL);
});
```

**TDD for a char-lock (do this per the tdd guide):**
1. Write the file; run `node --import tsx --test tests/reconstruction_engine_m2.test.ts`. Expect all 4 GREEN immediately (engine already correct).
2. **Prove the crux lock actually bites:** temporarily change `OLD_AT_RENAME` to
   `MERGED_FINAL` in the test and re-run —
   `test_m2_pre_rename_edit_is_carried_across_rename…` MUST go RED (it proves the
   test distinguishes the pre-rename carried content from the final content; if the
   engine dropped the pre-rename `validate` edit, revision 1 would not equal
   `OLD_AT_RENAME`). Then restore `OLD_AT_RENAME`. Record this RED→GREEN proof in
   impl-notes.
3. If step 1 is NOT all-green, STOP — the no-fix premise is violated.

> If `reconstructAll`'s signature requires a reader argument at the call site,
> pass `undefined` explicitly (`reconstructAll(loadRecords(M2_JSONL), undefined)`).
> Do NOT build an in-memory backup map — m2 needs none.

> `FileRevision.rename` is the optional `{from, to}` accessor populated on rename
> revisions (mirrors the `.copy` accessor used by the m1 tests). If the type exposes
> it under a different name at implementation time, match the engine's actual field —
> do NOT add one.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_m2.test.ts`, 5 tests)

`runCli([M2_JSONL, ...flags])` builds its own sidecar reader internally — pass NO
reader. Assertions use `assert.ok(out.includes(...))` on the byte-exact strings
captured in §2.4. Use the two-space column gaps exactly as shown.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M2_JSONL } from "./fixtures.ts";

// m2's conversationDAG is LINEAR: a single root prompt A with B..F beneath it and NO
// branch/rewind lines. The mv surfaces as its own `rename` turn (E).
test("test_m2_default_conversationDAG_lists_six_linear_turns_with_rename", () => {
    const out = runCli([M2_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #222eac11"));
    assert.ok(out.includes("  B  write   m2_old_name.py       #01ByHKPs"));
    assert.ok(out.includes("  C  write   test_m2_old_name.py  #0138XEEN"));
    assert.ok(out.includes("  D  edit    m2_old_name.py       #01BfXLQz"));
    assert.ok(out.includes("  E  rename  m2_new_name.py       #01SMiNy8"));
    assert.ok(out.includes("  F  edit    m2_new_name.py       #01FMMzJD"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The fileDAG groups by the path each event names: m2_old_name.py shows its
// pre-rename events (B write, D edit), m2_new_name.py shows the rename + post-rename
// edit (E rename, F edit), and the test file is its own group.
test("test_m2_default_fileDAG_groups_old_test_and_new_paths", () => {
    const out = runCli([M2_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("m2_old_name.py\n  B  write   #01ByHKPs\n  D  edit    #01BfXLQz"));
    assert.ok(out.includes("test_m2_old_name.py\n  C  write   #0138XEEN"));
    assert.ok(out.includes("m2_new_name.py\n  E  rename  #01SMiNy8\n  F  edit    #01FMMzJD"));
});

// One surviving branch, no rewound branch (linear scenario); the old name is ABSENT
// from the surviving file set (it was renamed away).
test("test_m2_list_branches_single_surviving_old_name_absent", () => {
    const out = runCli([M2_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #7260996e"));
    assert.ok(out.includes("m2_new_name.py, test_m2_old_name.py"));
    assert.ok(!out.includes("rewound"));
    // the rename source is collapsed, so it is not listed as its own surviving file
    assert.ok(!out.includes(", m2_old_name.py"));
});

// Surviving verbose: m2_new_name.py ends at the 10-line finalize version.
test("test_m2_surviving_verbose_new_file_ends_at_finalize_ten_lines", () => {
    const out = runCli([M2_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("(10 lines)"));
    assert.ok(out.includes("def finalize():"));
});

// THE CRUX CLI BYTE-LOCK: m2_new_name.py's revision 2 is a `rename` from the old path
// to the new path; its pre-rename revision is the 6-line process+validate version
// (proving the pre-rename `validate` edit was carried across), and its final revision
// is the 10-line finalize version.
test("test_m2_surviving_verbose_rename_revision_carries_pre_rename_content", () => {
    const out = runCli([M2_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 2  rename  "));
    assert.ok(out.includes("m2_old_name.py → "));
    assert.ok(out.includes("m2_new_name.py"));
    assert.ok(out.includes("(6 lines)"));   // pre-rename content carried across — process+validate
    assert.ok(out.includes("def validate():"));
    assert.ok(out.includes("(10 lines)"));  // post-rename final — adds finalize
});
```

**TDD:** run `node --import tsx --test tests/reconstruction_cli_m2.test.ts` — expect
all 5 GREEN. If a multi-line `includes` (the fileDAG blocks, or `revision 2  rename`)
fails, re-capture the exact block with
`npx tsx src/reconstruction_cli.ts "<worktree m2 jsonl>" 2>/dev/null` (stderr carries
only the debugger banner) and reconcile whitespace — the strings in §2.4 are the
authority (kind column padded to width 6, two-space gaps). As a prove-the-lock step,
temporarily change `(6 lines)` to `(2 lines)` in the crux test and confirm RED (that
would be the signature of the engine dropping the pre-rename `validate` edit), then
restore.

---

## 7. Task 4 — Docs (3 edits)

**7.1 `plans/roadmap.md`** — flip the empty `[ ] M2 ->` placeholder (currently
line 26) to checked, mirroring the M1 line's style. Suggested text:
```
[x] M2 -> [x] mv-RENAME: a `mv` renames a file that is edited on BOTH sides of the rename. B writes `m2_old_name.py` (`process`); C writes the test; D adds `validate` to the old file; E `mv m2_old_name.py m2_new_name.py` (rename — old path ends, content carried = process+validate); F adds `finalize` to the NEW file. The renamed file reconstructs as ONE four-revision history (write→edit→rename→edit) ending at the 10-line process+validate+finalize file; `m2_old_name.py` collapses into `m2_new_name.py` (NOT a separate surviving file), so `reconstructAll` returns two histories and `--list-branches` lists only `m2_new_name.py, test_m2_old_name.py`. FIRST rename scenario edited on BOTH sides of the rename (the rename twin of m1's cp-fork; linear, no rewind — one surviving branch, tip #7260996e). Engine ALREADY correct (characterization LOCK, NO src change): `buildRenameChain`/`resolveFinalPath`/`eventBelongsToLineage` merge old+new into one lineage, `renameRevision` carries the pre-rename content forward (`lastLinesOf`/`carryAt`) so F composes on it, and `distinctFinalPaths` collapses the old path. Generalises the S2 move lineage from "edit only AFTER the move" to "edit on BOTH sides". 9 new tests (4 engine + 5 CLI); 287 green; S1–S23 + m1 byte-for-byte unchanged.
```

**7.2 `plans/implementation-notes-api-from-scenarios.md`** — PREPEND a new entry at
the very top (newest-first), in the established heading format:
```
## <YYYY-MM-DD:HH:MM:SS> — m2 reconstruction (mv-rename: edit, rename, then edit the renamed file) — COMPLETE; characterization/regression LOCK, NO src change; 287 tests green
Chat title: <this session's title>
Path to JSONL log: <this session's JSONL>
```
Then the standard sub-sections: `### References` (link this plan, the m1 handoff
that gated it, and §3's file:line map), `### Design decisions` (why NO engine
change — restate §3, esp. `buildRenameChain`/`eventBelongsToLineage` for the one-history
merge, `renameRevision`/`lastLinesOf`/`carryAt` for the pre-rename content carry, and
`distinctFinalPaths` for the old-path collapse; note m2 is the FIRST rename scenario
edited on BOTH sides and the rename twin of m1), `### Deviations` (record the
prove-the-lock RED→GREEN steps from §5/§6), `### Tradeoffs` (reader-free engine tests
since m2 needs no sidecar), `### Open questions` (none expected).

**7.3 `plans/reconstruction-engine-design.md`** — append a short **m2** note
immediately after the **m1** note (same per-scenario style). NO new spec number
(engine unchanged). Suggested content:
```
m2 (`m2-mv-rename`) is the rename twin of m1's cp-fork: a `mv` (event E) renames `m2_old_name.py` to `m2_new_name.py`, and the file is edited on BOTH sides of the rename (D adds `validate` before; F adds `finalize` after). No new machinery — it is locked, not fixed. It generalises the S2 move lineage ("edit only after the move") to "edit on both sides", exercising two existing guarantees together for the first time on a rename: (a) one-history merge — `buildRenameChain`/`resolveFinalPath`/`eventBelongsToLineage` fold the old-path write+edit and the new-path edit into a single `m2_new_name.py` lineage (write→edit→rename→edit); (b) content carry — `renameRevision` carries the pre-rename `process+validate` forward via `lastLinesOf`/`carryAt`, so F's `finalize` splices onto it. `distinctFinalPaths` collapses the rename source, so `m2_old_name.py` is never a separate surviving file. Linear (no rewind): one surviving branch.
```

> Do NOT `git checkout`/`git restore` the shared docs (`fixtures.ts`,
> `roadmap.md`, `implementation-notes-…md`, `reconstruction-engine-design.md`) to
> undo a temp edit — revert the specific lines by hand (they carry uncommitted
> S23+m1 edits).

---

## 8. Task 5 — Full verification

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 287 pass / 0 fail (278 baseline + 9 new)
npx tsc --noEmit  # expect clean
git diff --stat src/   # see note below
```
- **`git diff src/` reflects only PRE-EXISTING uncommitted work, not m2.** m2 must
  add **NOTHING** to `src/`. Depending on whether S23/m1 have been committed yet:
  if not, `git diff --stat src/` shows ONLY `src/reconstruction_branches.ts` (the
  S23 change; m1 added no src); if S23 has been committed, it is empty. Either way,
  **no NEW src change may appear for m2**. If any other src file (or new hunk)
  appears, the no-fix premise broke — STOP and escalate.
- End-to-end byte check (optional belt-and-suspenders, against the worktree JSONL):
  ```
  P="scenarios/executed/m2-mv-rename/70c5989e-017b-425f-8a8b-89daec0c4528.jsonl"
  npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
  ```
  and eyeball that `m2_new_name.py` reaches `revision 2  rename …`, its pre-rename
  block is 6 lines (process+validate), and its final is 10 lines (`finalize`); and
  that `--list-branches` lists `m2_new_name.py, test_m2_old_name.py` with NO
  `m2_old_name.py`.

---

## 9. Task 6 — Commit (on user approval ONLY) then HAND OFF

Project rule: **one commit per scenario, only after the user approves.** Stage
EXACTLY these 7 files — do **NOT** `git add -A` (other scenarios share
fixtures/roadmap/impl-notes/design, which carry uncommitted S23+m1 edits, and the
worktree handoff-reorg under `plans/sN/`/`plans/m1/` must not be swept in):
- `tests/fixtures.ts`
- `tests/reconstruction_engine_m2.test.ts`
- `tests/reconstruction_cli_m2.test.ts`
- `plans/roadmap.md`
- `plans/implementation-notes-api-from-scenarios.md`
- `plans/reconstruction-engine-design.md`
- `plans/m2/m2-reconstruction-plan.md` (this plan)

There is **no `src/` file** in the commit (m2 is a no-src-change lock).
Suggested message: `Implemented m2 handling`.

**Then CREATE A HANDOFF** via the `/jot:handoff-prompt` skill documenting the
completed m2 implementation (tests green count = 287, no-src-change confirmation,
files staged, and that the NEXT scenario is **m3 (`m3-bash-redirect`)** — plan it the
same way). This handoff is a **required deliverable**, not optional.

---

## 10. Acceptance criteria (Definition of Done)

- [ ] `tests/fixtures.ts` has `M2_JSONL` (Desktop path), appended after `M1_JSONL`.
- [ ] `tests/reconstruction_engine_m2.test.ts` — 4 tests, reader-free, all green; crux test proven to bite (RED when `OLD_AT_RENAME` flipped to `MERGED_FINAL`).
- [ ] `tests/reconstruction_cli_m2.test.ts` — 5 tests, all green; linear (asserts no `branch`/`rewound`); old name absent from surviving set.
- [ ] `npm test` = **287 pass / 0 fail**; `npx tsc --noEmit` clean.
- [ ] `git diff src/` shows **no NEW** engine change for m2 (only pre-existing uncommitted S23, if any).
- [ ] roadmap M2 line flipped to `[x]`; impl-notes entry prepended; design.md m2 note appended after the m1 note.
- [ ] Committed (exact 7-file list) only after user approval, message `Implemented m2 handling`.
- [ ] **Completion handoff written via `/jot:handoff-prompt`** (names m3 as the next scenario).
