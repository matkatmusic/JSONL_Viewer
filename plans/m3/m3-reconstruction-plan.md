# Reconstruction Plan — Scenario **m3** (`m3-bash-redirect`)

> **Type: characterization / regression LOCK. NO `src/` change.**
> The engine **already** reconstructs m3 byte-for-byte correct (verified live —
> see §2). This plan locks that behaviour with 9 new tests (4 engine + 5 CLI) and
> 3 doc edits, exactly mirroring the m1/m2/S20/S21/S22 char-locks. It is **not** a
> real engine fix (unlike S19/S23). If, while implementing, any test cannot be made
> GREEN without touching `src/`, STOP and escalate — that would mean the live
> verification in §2 was wrong, and the plan must be revised, not the engine.

Implementing agent: read `~/.claude/guides/tdd.md` and
`plans/coding-requirements.md` before starting. The test code below already conforms
(enum-member comparisons via `EventKind.*`, wrapped `Path`/`Uuid`, and the verbatim
`finalTextOf` noun-phrase accessor carried over from the s5/m1/m2 suites).

---

## 1. Goal

Lock — with tests — that `reconstruction_cli` correctly reconstructs the
file-change history of `m3-bash-redirect`, the **bash-redirect-interleaved-with-edit**
scenario. ONE file `m3_mixed.txt` is mutated four times, in order:

1. `Write` `"line one"` (event B)
2. **bash `>>` append** `"line two"` (event C) — a `>>` redirect: its content is **NOT**
   in the JSONL tool result; it is recovered from the `~/.claude/file-history` backup
   snapshot taken just after the op, via the injected `BackupReader`.
3. `Edit` `"line one"` → `"LINE ONE"` (event D) — its recorded base
   (`originalFile = "line one\nline two\n"`) **includes** the bash-appended `line two`,
   i.e. the base is content the engine knows only because the prior append revision
   recovered it from the backup.
4. **bash `>>` append** `"line three"` (event E) — second redirect, recovered the same way.

The lock must pin the three properties that make m3 novel relative to the existing
S5 bash-redirect precedent (which has **no** Edit at all):

1. **Backup-recovered append content (both redirects):** event C's append revision
   carries `line one` forward (identity back-pointer) and births `line two` as genesis;
   event E's append revision carries `LINE ONE`+`line two` forward and births
   `line three`. The appended text is supplied ONLY by the `BackupReader` (the tool
   result is empty) — proving the sidecar recovery path.
2. **Edit splices the standard removal+addition pair onto a backup-recovered base:**
   the single Edit (D) becomes the engine's established **two revisions** — a removal
   revision (`line one` dropped → leaves just `line two`) then an addition revision
   (`LINE ONE`+`line two`) — and it splices correctly onto the append revision whose
   `line two` came from the backup. This is the existing
   `test_edit_splices_into_paired_removal_and_addition_revisions` semantics
   (`tests/reconstruction_engine.test.ts:103`), here exercised for the FIRST time on a
   base produced by a bash-redirect append.
3. **The S19/S23 stale-edit-base reseed stays INERT:** because the Edit's recorded base
   aligns exactly with the engine's reconstructed append revision (`line one`/`line two`),
   `editBaseIsStale` returns **false** and `seedStaleEditBases` injects **NO** synthetic
   reseed `Write`. The result is exactly **5 revisions** (write, append, edit-removal,
   edit-addition, append) — NOT 6. m3 is the first scenario to prove the reseed stays
   dormant when an edit follows a backup-recovered append whose content matches the
   edit's recorded base.

m3 is **linear** — there is NO conversation or code rewind, so exactly ONE branch
(`surviving`, tip `#6076417b`) and NO rewound branch. The final reconstructed
`m3_mixed.txt` is byte-identical to the 29-byte on-disk ground truth.

### Why m3 is distinct from S5 (the existing bash-redirect precedent)
`s5-bash-redirect` is `write → >> append → > overwrite` on one file with **zero Edit
activity** (`tests/reconstruction_engine_s5.test.ts:19-36`). m3 **interleaves a real
`Edit` between two `>>` appends** on the same file. That is genuinely new coverage: it
is the first time an Edit's base is a line-state produced by a backup-recovered append,
and the first time the removal+addition edit pair and the reseed-dormancy guard are
exercised together on top of redirect-recovered content. m3 is the bash-redirect
analogue of the m-series locks (m1 cp-fork, m2 mv-rename): same machinery, new
interleaving.

---

## 2. Ground truth (VERIFIED live against the engine at HEAD `91ac563` + uncommitted m2)

### 2.1 Scenario source & inputs
- Scenario script: `scenarios/m3-bash-redirect.txt`
- Executed transcript (worktree copy): `scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl`
- **Fixture path (Desktop — this is what `tests/fixtures.ts` must point at, like every
  other `S*_JSONL`/`M*_JSONL`):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl`
  (confirmed present on Desktop; same UUID as the worktree copy; reconstructs to the
  same surviving tip `#6076417b`.)
- **m3 NEEDS the file-history `BackupReader`** (unlike m2, which was reader-free). The
  two `>>` redirects (C, E) carry **no** content in the JSONL; the engine recovers each
  appended chunk from the `~/.claude/file-history/<sessionId>/` snapshot taken just
  after the op. **Engine tests therefore wire an in-memory `BackupReader`** (the s5
  pattern — see §5). The CLI builds its own real on-disk reader internally
  (`buildSidecarReader` → `createSidecarReader(sessionId, getDefaultFileHistoryRoot())`,
  `src/reconstruction_cli.ts:114-122,189`), so the CLI tests pass NO reader and exercise
  the real `~/.claude/file-history` blobs end-to-end.

### 2.2 Event ladder
| Turn | Kind | File | changeId | Effect |
|------|------|------|----------|--------|
| A | prompt | — | `#6ae088f4` | root user prompt |
| B | write | `m3_mixed.txt` | `#01D2sbvo` | create — `line one` (1 line) |
| C | append | `m3_mixed.txt` | `#01VfBVfA` | bash `echo "line two" >> m3_mixed.txt` — recovered from backup `@v3` → `line one`/`line two` (2 lines) |
| D | edit | `m3_mixed.txt` | `#015Don8V` | `Edit` `line one` → `LINE ONE` (base `originalFile = "line one\nline two\n"`) |
| E | append | `m3_mixed.txt` | `#01JDsxQb` | bash `echo "line three" >> m3_mixed.txt` — recovered from backup `@v5` → `LINE ONE`/`line two`/`line three` (3 lines) |

Surviving branch tip: `#6076417b`. No rewind point. No rewound branch. Single file.

### 2.3 File-history backups (the sidecar source-of-truth — used to build the in-memory reader in §5)
Session id `0a7f5fa5-deda-4208-823e-1cfe7d650a74`; backups under
`~/.claude/file-history/0a7f5fa5-deda-4208-823e-1cfe7d650a74/`, keyed by the
`backupFileName` each file-history snapshot record names (`936191f45d79faed@vN`):

| Backup name | Timestamp | Content | Snapshot after |
|-------------|-----------|---------|----------------|
| `936191f45d79faed@v2` | 2026-06-18T16:05:28Z | `line one\n` | B (write) |
| `936191f45d79faed@v3` | 2026-06-18T16:05:39Z | `line one\nline two\n` | **C (append)** — queried by event C; also equals D's `originalFile` |
| `936191f45d79faed@v4` | 2026-06-18T16:05:56Z | `LINE ONE\nline two\n` | D (edit) |
| `936191f45d79faed@v5` | 2026-06-18T16:06:07Z | `LINE ONE\nline two\nline three\n` | **E (append)** — queried by event E; the final ground truth |

`fillRedirectContent` reads the FIRST snapshot **strictly after** each redirect's
timestamp (`findBackupAfter`): C (16:05:32Z) → `@v3`; E (16:06:00Z) → `@v5`. The
in-memory test reader in §5 includes all four blobs so the test is robust to which
names the engine queries.

### 2.4 Final reconstructed content (byte-identical to on-disk ground truth — 29 bytes `LINE ONE\nline two\nline three\n`)

`m3_mixed.txt` — **5 revisions**, kinds `[write, append, edit, edit, append]`:

- revision 0 = **write** (B), **1 line**: `line one`
- revision 1 = **append** (C), **2 lines** — `line one` carried (oldLineNum 0), `line two` genesis:
  ```
  line one
  line two
  ```
- revision 2 = **edit removal** (D), **1 line** — the established removal half of the
  replace hunk: `line one` (index 0) is dropped, leaving the carried `line two`. This is
  the post-removal / pre-insertion intermediate the engine always emits for a hunk that
  both removes and adds (NOT a backup snapshot — no backup ever held just `line two`):
  ```
  line two
  ```
- revision 3 = **edit addition** (D, same changeId as rev 2), **2 lines** — `LINE ONE`
  born, `line two` carried:
  ```
  LINE ONE
  line two
  ```
- revision 4 = **append** (E), **3 lines** — `LINE ONE`/`line two` carried, `line three` genesis:
  ```
  LINE ONE
  line two
  line three
  ```

There is exactly **one** write-kind revision (rev 0). No synthetic reseed write appears
between rev 1 and rev 2 (the reseed is inert — see §3).

### 2.5 Exact CLI output (captured live — the byte source-of-truth for the CLI tests in §6)

Column gaps are **two spaces**; the kind column is padded to the widest kind
(`prompt`/`append` = 6); in the conversationDAG the file column is padded to the widest
filename (here all events share `m3_mixed.txt`).

Default (`runCli([M3_JSONL])`):
```
══ conversationDAG ══
A  prompt  #6ae088f4
  B  write   m3_mixed.txt  #01D2sbvo
  C  append  m3_mixed.txt  #01VfBVfA
  D  edit    m3_mixed.txt  #015Don8V
  E  append  m3_mixed.txt  #01JDsxQb

══ fileDAG ══
m3_mixed.txt
  B  write   #01D2sbvo
  C  append  #01VfBVfA
  D  edit    #015Don8V
  E  append  #01JDsxQb
```
Note: NO `branch …` lines appear (linear scenario). All four file events group under
the single `m3_mixed.txt` node in the fileDAG.

`--list-branches`:
```
surviving  tip #6076417b    m3_mixed.txt
```
(one surviving branch, one file; no `rewound`.)

`--surviving --verbose` (the byte-lock for the §6 content tests; the `### <path>`
header carries the per-run temp dir and is NOT asserted):
```
revision 0  @ 2026-06-18T16:05:22.238Z  (1 lines)
     1 | line one

revision 1  @ 2026-06-18T16:05:32.027Z  (2 lines)
     1 | line one
     2 | line two

revision 2  @ 2026-06-18T16:05:50.452Z  (1 lines)
     1 | line two

revision 3  @ 2026-06-18T16:05:50.452Z  (2 lines)
     1 | LINE ONE
     2 | line two

revision 4  @ 2026-06-18T16:06:00.300Z  (3 lines)
     1 | LINE ONE
     2 | line two
     3 | line three
```

---

## 3. Why NO engine change is needed (reference map — cite these in impl-notes)

The existing machinery already produces §2 exactly. The implementing agent does
**not** modify any of this; it is documented here so the tests assert against the right
concepts and so the impl-notes can explain *why* m3 is a no-op lock.

- **Redirect extraction (no content in JSONL):** `parseRedirect` matches `>>`/`>` and
  emits an `AppendEvent`/`OverwriteEvent` with **empty** content —
  `src/reconstruction_extract.ts` (redirect branch; spec 26). The `>>` becomes an
  `AppendEvent`.
- **Sidecar recovery of append content:** `fillRedirectContent` looks up the first
  backup snapshot strictly after the redirect timestamp (`findBackupAfter`), resolves
  its cwd-relative path, and reads the blob through the injected `BackupReader` —
  `src/reconstruction_sidecar.ts:60-71,139-157` (specs 25, 27). For m3: C → `@v3`
  (`line one\nline two`), E → `@v5` (`LINE ONE\nline two\nline three`).
- **Append replay (carry prefix, birth tail):** `appendRevision` carries the present
  file's lines forward unchanged (identity back-pointers via `carryAt`) and births the
  redirect's NEW tail lines as genesis, kind `append` —
  `src/reconstruction_replay_edit.ts:145-169` (spec 24, 28). So C carries `line one` and
  births `line two`; E carries `LINE ONE`/`line two` and births `line three`.
- **Edit replay = removal revision + addition revision (the established pair):**
  `applyEdit` splices each hunk against the latest revision; a hunk with any `-` pushes a
  removal revision (`keepSurvivingLines`), a hunk with any `+` pushes an addition
  revision (`insertHunkAdditions`), both carrying the Edit's changeId —
  `src/reconstruction_replay_edit.ts:174-187`. This is the long-standing two-revision
  model locked by `tests/reconstruction_engine.test.ts:103`
  (`test_edit_splices_into_paired_removal_and_addition_revisions`) and described in the
  design doc at `:338` ("emits a removal revision … then an addition revision"). m3's
  hunk `["-line one","+LINE ONE"," line two"]` yields rev 2 (`line two`) then rev 3
  (`LINE ONE`/`line two`); the ` line two` context line carries the prior append's line
  via `resolveContextLine`/`carryAt` (`src/reconstruction_replay_edit.ts:96-138`).
- **The reseed is INERT (the key dormancy property):** `seedStaleEditBases` walks the
  lineage and, before each edit, splices a synthetic backup-seeded `Write` ONLY when
  `editBaseIsStale` is true — `src/reconstruction_branches.ts:108-122`. `editBaseIsStale`
  reconstructs the base from prior events and checks each hunk context/remove line
  position-by-position (the S23 per-line generalisation) —
  `src/reconstruction_branches.ts:60-88`. For m3, the reconstructed base after the
  append revision is `["line one","line two"]`, and the Edit's hunk references exactly
  `-line one` at index 0 and context ` line two` at index 1 — every position matches, so
  `editBaseIsStale` is **false** and NO reseed Write is injected. (This is why the
  observed revision count is 5, not 6: write + append + edit-removal + edit-addition +
  append.) m3 is the first scenario to prove this dormancy when the edit's base was
  produced by a backup-recovered append.
- **Why m3 differs from S19/S23 (where the reseed FIRES):** in S19/S23 the surviving
  branch's reconstructed base does NOT match the edit's recorded base (off-branch edits
  or an uncaptured user edit advanced disk past the on-branch base), so
  `editBaseIsStale` is true and a backup-seeded Write is required. In m3 the append
  revision already reconstructs the exact base the edit recorded (`line one`/`line two`),
  so no reseed is needed — same code, opposite (dormant) outcome. m3 thus regression-locks
  that the S23 per-line `editBaseIsStale` walk does not FALSE-positive on an
  append-advanced base.
- **Precedent:** `s5-bash-redirect` (specs 24-28; `tests/reconstruction_engine_s5.test.ts`)
  for redirect extraction/sidecar/append replay; the paired-edit-revision lock at
  `tests/reconstruction_engine.test.ts:103`; S19/S23 reseed at
  `src/reconstruction_branches.ts:60-122`. m3 composes all three for the first time on a
  single file.

---

## 4. Task 1 — Baseline & fixture (do first)

**4.1 Confirm baseline GREEN** (so the +9 delta is unambiguous):
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 287 pass / 0 fail
npx tsc --noEmit  # expect clean
```
If baseline is not 287/clean, STOP and report — the tree drifted from the m2 handoff.
NOTE: 287 = the 278 committed baseline (HEAD `91ac563`, which already includes S23 + m1)
plus m2's 9 tests. m2 may still be **uncommitted** in the working tree (its tests/docs
present, no `src/` change). Do not revert it; m3 layers on top and SHARES the doc files
(`fixtures.ts`, `roadmap.md`, `implementation-notes-…md`,
`reconstruction-engine-design.md`), which carry m2's edits — **never** `git add -A` and
**never** `git checkout`/`restore` them.

**4.2 Add the fixture.** Edit `tests/fixtures.ts`: append, after the `M2_JSONL` entry, a
new constant (Desktop path, mirroring every other `S*_JSONL`/`M*_JSONL`):
```typescript
export const M3_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl";
```
Rationale: the suite reads transcripts from the Desktop RevEng tree, not the worktree
(confirmed: every `S*_JSONL`/`M*_JSONL` uses that root, and the m3 JSONL is present there
under the same UUID).

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_m3.test.ts`, 4 tests)

Create the file below. Unlike m2, it is **reader-wired**: it builds an in-memory
`BackupReader` from the §2.3 blobs (the s5 pattern — `tests/reconstruction_engine_s5.test.ts:11-16`)
and passes it to `reconstructAll`. The `finalTextOf` helper is copied verbatim from the
s5/m1/m2 suites (local convention permits this noun-phrase accessor; keep it identical).

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import type { FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { M3_JSONL } from "./fixtures.ts";

// The real backup blobs, keyed by the backupFileName the snapshots name (an in-memory
// sidecar — mirrors tests/reconstruction_engine_s5.test.ts). The `>>` redirects (C, E)
// have no content in the JSONL; the engine recovers them from these snapshots.
const M3_BACKUPS: Record<string, string> = {
    "936191f45d79faed@v2": "line one\n",
    "936191f45d79faed@v3": "line one\nline two\n",
    "936191f45d79faed@v4": "LINE ONE\nline two\n",
    "936191f45d79faed@v5": "LINE ONE\nline two\nline three\n",
};
const m3Reader: BackupReader = (name) => M3_BACKUPS[name.toString()] ?? "";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// m3 is one file mutated four times (write, >> append, edit, >> append). The single Edit
// becomes the engine's standard removal+addition pair, so the history is FIVE revisions
// [write, append, edit, edit, append], ending at the 29-byte ground truth.
test("test_m3_history_is_write_append_edit_edit_append_five_revisions", () => {
    const histories = reconstructAll(loadRecords(M3_JSONL), m3Reader);
    assert.equal(histories.length, 1);
    const revisions = histories[0]!.revisions;
    assert.equal(revisions.length, 5);
    assert.deepEqual(
        revisions.map((r) => r.kind),
        [EventKind.write, EventKind.append, EventKind.edit, EventKind.edit, EventKind.append],
    );
    assert.equal(finalTextOf(revisions[4]!), "LINE ONE\nline two\nline three");
});

// Property 1 (backup-recovered append content): both `>>` redirects carry the present
// file forward and birth their tail line from the file-history backup. The tool result
// is empty — `line two`/`line three` come ONLY from the BackupReader.
test("test_m3_bash_appends_recover_tail_lines_from_file_history_backups", () => {
    const revisions = reconstructAll(loadRecords(M3_JSONL), m3Reader)[0]!.revisions;
    // revision 1 = append C: line one carried (oldLineNum 0), line two born from @v3.
    assert.equal(revisions[1]!.kind, EventKind.append);
    assert.equal(revisions[1]!.lines[0]!.oldLineNum, 0);
    assert.equal(finalTextOf(revisions[1]!), "line one\nline two");
    // revision 4 = append E: LINE ONE + line two carried, line three born from @v5.
    assert.equal(revisions[4]!.kind, EventKind.append);
    assert.equal(revisions[4]!.lines[0]!.oldLineNum, 0);
    assert.equal(revisions[4]!.lines[1]!.oldLineNum, 1);
    assert.equal(finalTextOf(revisions[4]!), "LINE ONE\nline two\nline three");
});

// THE CRUX (property 2 — the edit splices onto the backup-recovered append base): the
// single Edit (line one -> LINE ONE) is the established two-revision pair. The removal
// revision drops `line one` leaving the appended `line two`; the addition revision births
// `LINE ONE` over the carried `line two`. Both share the Edit's changeId.
test("test_m3_edit_is_paired_removal_then_addition_over_appended_base", () => {
    const revisions = reconstructAll(loadRecords(M3_JSONL), m3Reader)[0]!.revisions;
    // revision 2 = edit removal: line one (index 0) gone, the appended line two survives.
    assert.equal(revisions[2]!.kind, EventKind.edit);
    assert.equal(finalTextOf(revisions[2]!), "line two");
    // revision 3 = edit addition: LINE ONE born over the carried line two.
    assert.equal(revisions[3]!.kind, EventKind.edit);
    assert.equal(finalTextOf(revisions[3]!), "LINE ONE\nline two");
    // both halves come from the one Edit, so they share a changeId.
    assert.equal(revisions[2]!.changeId.toString(), revisions[3]!.changeId.toString());
});

// Property 3 (reseed INERT): the Edit's recorded base (line one/line two) matches the
// reconstructed append revision exactly, so editBaseIsStale is false and seedStaleEditBases
// injects NO synthetic Write. The proof: there is exactly ONE write-kind revision (rev 0),
// and the history stays at five revisions — a spurious reseed would add a second write.
test("test_m3_aligned_edit_base_keeps_reseed_inert_single_write_revision", () => {
    const revisions = reconstructAll(loadRecords(M3_JSONL), m3Reader)[0]!.revisions;
    assert.equal(revisions.length, 5);
    const writeRevisions = revisions.filter((r) => r.kind === EventKind.write);
    assert.equal(writeRevisions.length, 1);
    assert.equal(writeRevisions[0]!.changeId.toString(), revisions[0]!.changeId.toString());
});
```

**TDD for a char-lock (do this per the tdd guide):**
1. Write the file; run `node --import tsx --test tests/reconstruction_engine_m3.test.ts`.
   Expect all 4 GREEN immediately (engine already correct).
2. **Prove the crux locks actually bite** (record each RED→GREEN in impl-notes):
   - In `test_m3_edit_is_paired_removal_then_addition_over_appended_base`, temporarily
     change the removal expectation `"line two"` to `"line one"` and re-run — it MUST go
     RED (it proves the removal revision really drops `line one`, i.e. the edit spliced
     onto the appended base rather than a stale one). Restore.
   - In `test_m3_aligned_edit_base_keeps_reseed_inert_single_write_revision`, temporarily
     change `assert.equal(writeRevisions.length, 1)` to `2` and re-run — it MUST go RED
     (proving exactly one write exists, i.e. no reseed Write was injected). Restore.
3. If step 1 is NOT all-green, STOP — the no-fix premise is violated (the reseed would be
   firing, or the append/edit replay would be wrong).

> If `reconstructAll`'s signature differs, match the engine's actual call site — it takes
> the records then the optional `BackupReader` (the s5 test calls
> `reconstructAll(loadRecords(S5_JSONL), s5Reader)`). Do NOT change the engine to fit the
> test.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_m3.test.ts`, 5 tests)

`runCli([M3_JSONL, ...flags])` builds its own real on-disk sidecar reader internally
(`buildSidecarReader`), so pass **NO** reader — these tests exercise the real
`~/.claude/file-history` blobs end-to-end. Assertions use `assert.ok(out.includes(...))`
on the byte-exact strings captured in §2.5 (two-space column gaps; kind column padded to
width 6). The `### <path>` verbose header carries a per-run temp dir and is NOT asserted.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M3_JSONL } from "./fixtures.ts";

// m3's conversationDAG is LINEAR: a single root prompt A with B..E beneath it and NO
// branch/rewind lines. The two `>>` redirects surface as `append` turns (C, E).
test("test_m3_default_conversationDAG_lists_prompt_and_four_linear_events", () => {
    const out = runCli([M3_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #6ae088f4"));
    assert.ok(out.includes("  B  write   m3_mixed.txt  #01D2sbvo"));
    assert.ok(out.includes("  C  append  m3_mixed.txt  #01VfBVfA"));
    assert.ok(out.includes("  D  edit    m3_mixed.txt  #015Don8V"));
    assert.ok(out.includes("  E  append  m3_mixed.txt  #01JDsxQb"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The fileDAG groups all four events under the single m3_mixed.txt node, in order.
test("test_m3_default_fileDAG_groups_single_file_four_events", () => {
    const out = runCli([M3_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "m3_mixed.txt\n  B  write   #01D2sbvo\n  C  append  #01VfBVfA\n  D  edit    #015Don8V\n  E  append  #01JDsxQb",
    ));
});

// One surviving branch, no rewound branch (linear scenario); the single file is listed.
test("test_m3_list_branches_single_surviving_one_file", () => {
    const out = runCli([M3_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #6076417b"));
    assert.ok(out.includes("m3_mixed.txt"));
    assert.ok(!out.includes("rewound"));
});

// THE EDIT BYTE-LOCK: the surviving verbose shows the Edit's removal+addition pair — a
// `(1 lines)` revision holding only `line two` (line one removed), then a `(2 lines)`
// revision holding `LINE ONE`/`line two`. Exactly five revisions (0..4), no sixth.
test("test_m3_surviving_verbose_byte_locks_edit_removal_addition_pair", () => {
    const out = runCli([M3_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0"));
    assert.ok(out.includes("revision 4"));
    assert.ok(!out.includes("revision 5"));          // exactly five revisions — no spurious reseed
    assert.ok(out.includes("(1 lines)\n     1 | line two"));        // rev 2 = edit removal (unique block)
    assert.ok(out.includes("     1 | LINE ONE\n     2 | line two")); // rev 3 = edit addition
});

// THE BASH-REDIRECT BYTE-LOCK (end-to-end through the real sidecar reader): the append
// revisions recover their tail lines from the file-history backups — rev 1 is
// `line one`/`line two`, and the final rev 4 is the 29-byte ground truth.
test("test_m3_surviving_verbose_appends_recover_backup_content_to_ground_truth", () => {
    const out = runCli([M3_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("     1 | line one\n     2 | line two"));                       // rev 1 = append C
    assert.ok(out.includes("     1 | LINE ONE\n     2 | line two\n     3 | line three")); // rev 4 = final ground truth
});
```

**TDD:** run `node --import tsx --test tests/reconstruction_cli_m3.test.ts` — expect all 5
GREEN. If a multi-line `includes` (the fileDAG block, or a verbose block) fails, re-capture
the exact block with
`npx tsx src/reconstruction_cli.ts "scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl" --surviving --verbose 2>/dev/null`
(stderr carries only the debugger banner) and reconcile whitespace — the strings in §2.5
are the authority (kind column padded to width 6, two-space gaps, five leading spaces
before the line-number column). As a prove-the-lock step, in
`test_m3_surviving_verbose_appends_recover_backup_content_to_ground_truth` temporarily
change `line three` to `line THREE-SENTINEL` and confirm RED (a sentinel that appears
NOWHERE else — per the m2 handoff lesson, do NOT reuse `(2 lines)`/`(1 lines)` which
appear in multiple blocks), then restore.

---

## 7. Task 4 — Docs (3 edits)

**7.1 `plans/roadmap.md`** — flip the empty `[ ] M3 ->` placeholder (line 27) to checked,
mirroring the M1/M2 line style. Suggested text:
```
[x] M3 -> [x] bash-REDIRECT interleaved with an EDIT: one file m3_mixed.txt is written (`line one`), `>>`-appended (`line two`), edited (`line one`->`LINE ONE`), then `>>`-appended again (`line three`). The two `>>` redirects carry NO content in the JSONL — recovered from ~/.claude/file-history backups (@v3, @v5) via the BackupReader; the Edit's base (line one/line two) is content the append revision recovered from a backup. Reconstructs as ONE five-revision history [write, append, edit, edit, append] ending at the 29-byte `LINE ONE\nline two\nline three`; the Edit is the engine's standard removal+addition pair spliced onto the appended base, and — because the Edit's recorded base matches the reconstructed append revision — the S19/S23 stale-edit-base reseed stays INERT (exactly one write revision, five revisions not six). FIRST scenario to interleave an Edit between two bash redirects on one file, and the first to prove the S23 per-line editBaseIsStale walk does not false-positive on a backup-recovered append base. Linear (no rewind), one surviving branch tip #6076417b. Engine ALREADY correct (characterization LOCK, NO src change): parseRedirect/fillRedirectContent/findBackupAfter recover the append content, appendRevision carries+births it, applyEdit emits the removal+addition pair, and seedStaleEditBases/editBaseIsStale stay dormant. 9 new tests (4 engine + 5 CLI); 296 green; S1–S23 + m1 + m2 byte-for-byte unchanged.
```

**7.2 `plans/implementation-notes-api-from-scenarios.md`** — PREPEND a new entry at the
very top (newest-first), in the established heading format:
```
## <YYYY-MM-DD:HH:MM:SS> — m3 reconstruction (bash-redirect interleaved with an edit) — COMPLETE; characterization/regression LOCK, NO src change; 296 tests green
Chat title: <this session's title>
Path to JSONL log: <this session's JSONL>
```
Then the standard sub-sections: `### References` (link this plan, the m2 handoff that
gated it, and §3's file:line map), `### Design decisions` (why NO engine change — restate
§3: redirect extraction + `fillRedirectContent`/`findBackupAfter` sidecar recovery,
`appendRevision` carry+birth, `applyEdit` removal+addition pair, and especially
`editBaseIsStale`/`seedStaleEditBases` staying INERT because the edit base aligns with the
backup-recovered append; note m3 is the FIRST Edit-between-two-redirects scenario and the
first reseed-dormancy proof over a backup-recovered base), `### Deviations` (record the
prove-the-lock RED→GREEN steps from §5/§6), `### Tradeoffs` (engine tests wire an in-memory
`BackupReader` per the s5 pattern; CLI tests use the real on-disk reader), `### Open
questions` (none expected).

**7.3 `plans/reconstruction-engine-design.md`** — append a short **m3** note immediately
after the **m2** note (same per-scenario style). NO new spec number (engine unchanged).
Suggested content:
```
m3 (`m3-bash-redirect`) interleaves a real Edit between two bash `>>` appends on one file (m3_mixed.txt): write `line one`, `>>` append `line two`, Edit `line one`->`LINE ONE`, `>>` append `line three`. No new machinery — it is locked, not fixed. It composes three existing guarantees together for the first time: (a) redirect recovery — `parseRedirect` emits content-less append events and `fillRedirectContent`/`findBackupAfter` recover `line two`/`line three` from the file-history backups @v3/@v5 (specs 24-28, as in s5); (b) the paired edit — `applyEdit` emits the standard removal revision (`line one` dropped, leaving the appended `line two`) then addition revision (`LINE ONE`/`line two`), here for the first time spliced onto a base produced by a backup-recovered append; (c) reseed dormancy — because the Edit's recorded base (line one/line two) matches the reconstructed append revision exactly, `editBaseIsStale` is false and `seedStaleEditBases` injects no synthetic Write, so the history is five revisions (one write), not six. m3 thus regression-locks that the S23 per-line `editBaseIsStale` walk does not false-positive on an append-advanced base (the dormant complement of S19/S23, where it fires). Linear (no rewind): one surviving branch.
```

> Do NOT `git checkout`/`git restore` the shared docs (`fixtures.ts`, `roadmap.md`,
> `implementation-notes-…md`, `reconstruction-engine-design.md`) to undo a temp edit —
> revert the specific lines by hand (they carry uncommitted m2 edits).

---

## 8. Task 5 — Full verification

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 296 pass / 0 fail (287 baseline + 9 new)
npx tsc --noEmit  # expect clean
git diff --stat src/   # expect EMPTY — m3 adds ZERO src change
```
- **`git diff src/` must be EMPTY for m3.** HEAD `91ac563` already commits S23 + m1, and
  m2 added no `src/`, so the only way a `src/` change appears is if you broke the no-fix
  premise. If ANY `src/` file (or new hunk) appears, STOP and escalate.
- End-to-end byte check (belt-and-suspenders, against the worktree JSONL):
  ```
  P="scenarios/executed/m3-bash-redirect/0a7f5fa5-deda-4208-823e-1cfe7d650a74.jsonl"
  npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
  ```
  and eyeball that `m3_mixed.txt` shows five revisions ending at the 3-line
  `LINE ONE`/`line two`/`line three`, with the `(1 lines)` removal block holding only
  `line two`; and that `--list-branches` lists `m3_mixed.txt` under `surviving tip #6076417b`
  with NO `rewound`.

---

## 9. Task 6 — Commit (on user approval ONLY) then HAND OFF

Project rule: **one commit per scenario, only after the user approves.** Stage EXACTLY
these 7 files — do **NOT** `git add -A` (other scenarios share
fixtures/roadmap/impl-notes/design, which carry uncommitted m2 edits, and the worktree
handoff layout under `plans/sN/`/`plans/m1/`/`plans/m2/` must not be swept in):
- `tests/fixtures.ts`
- `tests/reconstruction_engine_m3.test.ts`
- `tests/reconstruction_cli_m3.test.ts`
- `plans/roadmap.md`
- `plans/implementation-notes-api-from-scenarios.md`
- `plans/reconstruction-engine-design.md`
- `plans/m3/m3-reconstruction-plan.md` (this plan)

There is **no `src/` file** in the commit (m3 is a no-src-change lock).
Suggested message: `Implemented m3 handling`.

**Then CREATE A HANDOFF** via the `/jot:handoff-prompt` skill documenting the completed
m3 implementation (tests green count = 296, no-src-change confirmation, files staged) and
naming the **NEXT scenario: m4 (`m4-delete-recreate`)** — plan it the same way
(ground-truth-first: run the CLI live, verify byte-for-byte, then char-lock or real-fix
depending on whether the engine is already correct). This handoff is a **required
deliverable**, not optional.

---

## 10. Acceptance criteria (Definition of Done)

- [ ] `tests/fixtures.ts` has `M3_JSONL` (Desktop path), appended after `M2_JSONL`.
- [ ] `tests/reconstruction_engine_m3.test.ts` — 4 tests, reader-wired (in-memory
      `M3_BACKUPS`), all green; both crux tests proven to bite (RED when the removal
      expectation is flipped to `"line one"`, and when `writeRevisions.length` is flipped
      to `2`).
- [ ] `tests/reconstruction_cli_m3.test.ts` — 5 tests, all green; linear (asserts no
      `branch`/`rewound`); the edit removal+addition pair and the backup-recovered append
      content are byte-locked; `revision 5` proven absent.
- [ ] `npm test` = **296 pass / 0 fail**; `npx tsc --noEmit` clean.
- [ ] `git diff src/` is **EMPTY** (m3 adds no engine change).
- [ ] roadmap M3 line flipped to `[x]`; impl-notes entry prepended; design.md m3 note
      appended after the m2 note (NO new spec number).
- [ ] Committed (exact 7-file list) only after user approval, message `Implemented m3 handling`.
- [ ] **Completion handoff written via `/jot:handoff-prompt`** (names m4 as the next scenario).
