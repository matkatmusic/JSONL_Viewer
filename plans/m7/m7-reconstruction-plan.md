# Reconstruction Plan — Scenario **m7** (`m7-conv-rewind-no-user-edits`)

> **Type: characterization / regression LOCK. NO `src/` change.**
> The engine **already** reconstructs m7 byte-for-byte correct **when given a `BackupReader`**
> (verified live — see §2). This plan locks that behaviour with 10 new tests (5 engine + 5 CLI)
> and 3 doc edits, exactly mirroring the **m5** reader-dependent lock (m5/m6 each added a 5th
> engine test for the reader). It is **not** a real engine fix (unlike S19/S23/m6). If, while
> implementing, any test cannot be made GREEN without touching `src/`, **STOP and escalate** —
> that would mean the live verification in §2 was wrong, and the plan must be revised, not the
> engine.

Implementing agent: read `~/.claude/guides/tdd.md` and `plans/coding-requirements.md` before
starting. The test code below already conforms (enum-member comparisons via `EventKind.*`, the
verbatim `finalTextOf`/`historyEndingWith` accessors carried over from the m5 suite, an
in-memory `BackupReader` stub like m5/m6).

---

## 1. Goal

Lock — with tests — that `reconstruction_cli` correctly reconstructs the file-change history of
`m7-conv-rewind-no-user-edits`, a **conversation-only rewind with NO user edits**. ONE source
file (`m7_conv.py`) plus its sibling test (`tests/test_m7_conv.py`). The sequence (real-time,
left on disk):

1. `Write` `m7_conv.py` = `def step1(): return 1` (event B)
2. `Write` `tests/test_m7_conv.py` = step1 test (event C)
3. `Edit` `m7_conv.py` — append `step2()` (event D)
4. `Edit` `m7_conv.py` — append `step3()` (event E)
5. `"Looking good."` (conversational; no file change)
6. **`Rewind: 3`** — a **conversation-only** rewind (disk is **NOT** restored): the conversation
   forks back to just after the step1 Write, discarding the turns that produced D and E, **but
   the on-disk file still contains step1+step2+step3.**
7. `Edit` `m7_conv.py` — insert `step2_alt()` **before** `step3` (event F)
8. `"Thanks."`

This produces TWO branches of `m7_conv.py`:

- **rewound** (abandoned; tip `#8037716c`, rewind @ `#a76d12e8`): `step1 → +step2 → +step3` —
  **already correct, reader-INDEPENDENT** (every Edit base is carried in the JSONL).
- **surviving** (tip `#b6d67431`): `step1 → [disk silently at step1+step2+step3] → +step2_alt`
  — **already correct, but ONLY with a `BackupReader`.** F's on-branch conversational parent is
  the 2-line step1 Write, yet F's Edit was computed against the 10-line on-disk file
  (step1+step2+step3) that the off-branch edits D and E left behind. The engine recovers that
  10-line base from a file-history backup (the S19/m5 stale-edit-base reseed), inserts it as an
  `overwrite` revision, then applies F. **Without the reader the surviving branch is WRONG**
  (see §2.6).

The two reconstructed branches are byte-identical to ground truth: the surviving final
`m7_conv.py` equals the 14-line on-disk file (`step1, step2, step2_alt, step3`); the rewound
final is the 10-line `step1, step2, step3`.

### 1.1 Why m7 is distinct from every prior scenario

- **FIRST pure conversation rewind in the m-series.** m5 was full-interleave (no rewind); m6
  was a `cp`-fork + user edit + rewind. m7 is the plain conv-only rewind: one file forked by a
  `Rewind: N` with **no user edits anywhere** (the title's "no-user-edits").
- **FIRST scenario where the stale-edit-base reseed (S19/S23/m5) fires because of OFF-BRANCH
  CLAUDE EDITS, not a user edit.** In S19 and m5 the disk advanced past the surviving edit's
  on-branch base because a *user* out-of-band edit (with no JSONL content) left lines behind.
  In m7 there is no user edit: the disk advanced because the **rewound branch's** Claude edits
  (D = step2, E = step3) ran on disk and the conversation rewind did **not** restore the file.
  The surviving edit F then edits that 10-line disk, so its base is stale-too-short relative to
  the surviving branch's 2-line reconstructed base, and the reseed recovers the off-branch disk
  from a backup. This is the conv-rewind analogue of the m5 reseed.
- **Reader-ASYMMETRIC across the two branches.** The rewound branch is reader-independent (its
  bases — step1, step1+step2 — are all present as `originalFile` in the JSONL). The surviving
  branch is reader-DEPENDENT (its 10-line base is NOT in the surviving lineage's JSONL and must
  come from the backup). m7 is the FIRST scenario that is reader-independent on one branch and
  reader-dependent on the other. §5 test 5 locks the rewound branch's reader-independence; §5
  test 4 locks the surviving branch's reader-dependence.
- **Distinct from the S14/S17 conv-only family.** S14 (surviving branch only reads) and S17
  (surviving branch re-edits an EXISTING line via a hunk whose context fully covers the
  off-branch content → the spec-39 *born-path* materialises it reader-free) did **not** need a
  reader. m7's surviving edit F inserts `step2_alt` between `step2` and `step3`; F's hunk
  context references only `step3` (`old_string = "def step3():\n    return 3"`), so it does
  **not** carry `step2` as context — the born-path alone would DROP `step2` (verified: §2.6).
  Only the backup reseed restores the full 10-line base. This is why m7 is reader-dependent
  where S17 was not.

---

## 2. Ground truth (VERIFIED live against the engine at the current worktree HEAD + uncommitted m2–m6)

### 2.1 Scenario source & inputs

- Scenario script: `scenarios/m7-conv-rewind-no-user-edits.txt`
- Executed transcript (worktree copy, used for live CLI runs):
  `scenarios/executed/m7-conv-rewind-no-user-edits/725204e2-8678-4c45-82d0-262557bff0ad.jsonl`
  (134 lines; sessionId `725204e2-8678-4c45-82d0-262557bff0ad`).
- **Fixture path (Desktop — this is what `tests/fixtures.ts` must point at, like every other
  `S*_JSONL`/`M*_JSONL`):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m7-conv-rewind-no-user-edits/725204e2-8678-4c45-82d0-262557bff0ad.jsonl`
  (confirmed present on Desktop, 185693 bytes, same UUID as the worktree copy.)
- Final on-disk `m7_conv.py` in the executed folder is the **surviving** state (14 lines):
  ```
  def step1():
      return 1


  def step2():
      return 2


  def step2_alt():
      return "2alt"


  def step3():
      return 3
  ```
- **m7 is READER-DEPENDENT on the surviving branch (the m5 pattern), reader-INDEPENDENT on the
  rewound branch.** The surviving branch needs a `BackupReader` to recover the 10-line disk base
  (backup blob `29a113119f194d6f@v4`); the rewound branch's bases are all in the JSONL. No event
  is a bash `>>`/`>` redirect — the reader is needed for the stale-edit-base reseed, not for
  redirect recovery.

### 2.2 Event ladder (by real timestamp — executed order matches the script)

| Lbl | time (Z) | op | file | tool_use id | changeId (short) | branch | effect |
|-----|----------|----|------|-------------|------------------|--------|--------|
| A | 16:07:31* | prompt (rewind point) | — | — | `#a76d12e8` | (fork) | root prompt the two branches fork from |
| B | 16:07:31.978 | write | m7_conv.py | `toolu_01FNKuwckTT95HukRB1NdYm1` | `#01FNKuwc` | trunk | create — `def step1(): return 1` (2 lines) |
| C | 16:07:32.987 | write | test_m7_conv.py | `toolu_01AYTKLosUzhs4zqTGSaar9T` | `#01AYTKLo` | trunk | create — step1 test (5 lines) |
| D | 16:07:54.760 | edit | m7_conv.py | `toolu_01Q1AfdvB25DQ3yMacqpdHHi` | `#01Q1Afdv` | **rewound** | append `step2()` → 6 lines |
| E | 16:08:08.028 | edit | m7_conv.py | `toolu_01KgnABQxqZpYvXzsfnPeQLY` | `#01KgnABQ` | **rewound** | append `step3()` → 10 lines |
| F | 16:08:40.473 | edit | m7_conv.py | `toolu_01KWHULijYZChADK6i1ZF7hj` | `#01KWHULi` | **surviving** | insert `step2_alt()` before `step3` → 14 lines |

(*A is the prompt/system record the post-rewind branches fork from; B is its assistant turn's
Write.) **Fork proof:** D and F both descend from the rewind point `#a76d12e8`; E descends from
D (linear continuation of the rewound branch). So rewound = B→D→E, surviving = B→…→F.

Full ids:
- **Surviving branch tip** = `b6d67431-6b98-43b8-8483-d5f91f7cc28b` (`rewindPoint: undefined`).
- **Rewound branch tip** = `8037716c-b633-4787-ae71-a115580b4e42`.
- **Rewind point** = `a76d12e8-ded8-43fa-96b9-f3cdb43c8cc2`.

### 2.3 The backup blob (the surviving reseed source)

The surviving branch's stale-edit-base reseed recovers the 10-line disk base from file-history
backup **`29a113119f194d6f@v4`** (backupTime 16:08:12.997, which is **before** F's edit at
16:08:40.473, so it is found by the standard `findBackupAtOrBefore` lookup — m7 does **not**
exercise the m6 `includeAfter` after-fallback). Content (verbatim, 10 lines):
```
def step1():
    return 1


def step2():
    return 2


def step3():
    return 3
```
This backup lives in the live `~/.claude/file-history/725204e2-.../` tree (confirmed: the live
reader returned it). The engine tests use an in-memory stub keyed by this blob name (§5); the
CLI tests use the live reader (§6).

### 2.4 Reconstructed revisions (VERIFIED live via `reconstructBranches`)

**SURVIVING (2 histories):**

- `m7_conv.py` — **3 revisions** `[write, overwrite, edit]`:
  - rev0 `write` `toolu_01FNKuwckTT95HukRB1NdYm1` @ 16:07:31.978 → 2 lines (`def step1():` / `    return 1`)
  - rev1 `overwrite` **`29a113119f194d6f@v4`** @ 16:08:12.997 → 10 lines (step1+step2+step3) —
    the **backup-seeded** base for F (reader-recovered off-branch disk)
  - rev2 `edit` `toolu_01KWHULijYZChADK6i1ZF7hj` @ 16:08:40.473 → 14 lines (step1+step2+**step2_alt**+step3)
- `tests/test_m7_conv.py` — **1 revision** `[write]`:
  - rev0 `write` `toolu_01AYTKLosUzhs4zqTGSaar9T` @ 16:07:32.987 → 5 lines (step1 test; never edited)

**REWOUND (1 branch, 1 history) — reader-INDEPENDENT:**

- `m7_conv.py` — **3 revisions** `[write, edit, edit]`:
  - rev0 `write` `toolu_01FNKuwckTT95HukRB1NdYm1` @ 16:07:31.978 → 2 lines (step1)
  - rev1 `edit` `toolu_01Q1AfdvB25DQ3yMacqpdHHi` @ 16:07:54.760 → 6 lines (step1+step2)
  - rev2 `edit` `toolu_01KgnABQxqZpYvXzsfnPeQLY` @ 16:08:08.028 → 10 lines (step1+step2+step3)

### 2.5 Final reconstructed content (byte-identical to ground truth)

- **Surviving `m7_conv.py`** (rev2, 14 lines):
  `def step1():\n    return 1\n\n\ndef step2():\n    return 2\n\n\ndef step2_alt():\n    return "2alt"\n\n\ndef step3():\n    return 3`
- **Surviving `tests/test_m7_conv.py`** (rev0, 5 lines):
  `from m7_conv import step1\n\n\ndef test_step1_returns_1():\n    assert step1() == 1`
- **Rewound `m7_conv.py`** (rev2, 10 lines):
  `def step1():\n    return 1\n\n\ndef step2():\n    return 2\n\n\ndef step3():\n    return 3`

### 2.6 The reader is LOAD-BEARING on the surviving branch (the regression guard)

Run **without** a reader, the surviving `m7_conv.py` is **WRONG**: only **2 revisions**
`[write, edit]`, and the edit revision (11 lines) is corrupted — the born-path mis-materialises
F's context against the 2-line step1 base, collapsing `step2`:
```
def step1():
    return 1
    return 2          ← MANGLED: stray "return 2", NO "def step2():" header, blanks dropped


def step2_alt():
    return "2alt"


def step3():
    return 3
```
i.e. the no-reader final text **contains the substring** `"    return 1\n    return 2"` and
**does NOT contain** `"def step2():"`. WITH the reader it is the correct 3-revision, 14-line
result (§2.5) that does NOT contain that corruption. This is the m6-style "reader is
load-bearing" property; §5 test 4 locks both directions.

### 2.7 Exact CLI output (captured live — the byte source-of-truth for the §6 CLI tests)

Column gaps are **two spaces**. The CLI builds its own reader internally (`buildSidecarReader`
→ the live `~/.claude/file-history`), so its output is the correct (reader-recovered) result.

Default (`runCli([M7_JSONL])`):
```
══ conversationDAG ══
A  prompt  #a76d12e8   (rewind point)
│
├─ branch rewound (rewound; tip #8037716c; rewind @ #a76d12e8)
│  D  edit  m7_conv.py  #01Q1Afdv
│  E  edit  m7_conv.py  #01KgnABQ
│
└─ branch surviving (surviving; tip #b6d67431)
   F  edit  m7_conv.py  #01KWHULi

══ fileDAG ══
m7_conv.py
  B  write  #01FNKuwc
  D  edit   #01Q1Afdv
  E  edit   #01KgnABQ
  F  edit   #01KWHULi
test_m7_conv.py
  C  write  #01AYTKLo
```

`--list-branches`:
```
surviving  tip #b6d67431    m7_conv.py, test_m7_conv.py
rewound    tip #8037716c  rewind @ #a76d12e8    m7_conv.py
```

`--surviving --verbose` — `m7_conv.py` (3 revisions; the `### <path>` header carries the per-run
temp dir and is NOT asserted):
```
revision 0  @ 2026-06-18T16:07:31.978Z  (2 lines)
     1 | def step1():
     2 |     return 1

revision 1  @ 2026-06-18T16:08:12.997Z  (10 lines)
     1 | def step1():
     2 |     return 1
     3 | 
     4 | 
     5 | def step2():
     6 |     return 2
     7 | 
     8 | 
     9 | def step3():
    10 |     return 3

revision 2  @ 2026-06-18T16:08:40.473Z  (14 lines)
     1 | def step1():
     2 |     return 1
     3 | 
     4 | 
     5 | def step2():
     6 |     return 2
     7 | 
     8 | 
     9 | def step2_alt():
    10 |     return "2alt"
    11 | 
    12 | 
    13 | def step3():
    14 |     return 3
```
then `tests/test_m7_conv.py` (1 revision):
```
revision 0  @ 2026-06-18T16:07:32.987Z  (5 lines)
     1 | from m7_conv import step1
     2 | 
     3 | 
     4 | def test_step1_returns_1():
     5 |     assert step1() == 1
```

`--branch 8037716c --verbose` (rewound) — `m7_conv.py` (3 revisions):
```
revision 0  @ 2026-06-18T16:07:31.978Z  (2 lines)
     1 | def step1():
     2 |     return 1

revision 1  @ 2026-06-18T16:07:54.760Z  (6 lines)
     1 | def step1():
     2 |     return 1
     3 | 
     4 | 
     5 | def step2():
     6 |     return 2

revision 2  @ 2026-06-18T16:08:08.028Z  (10 lines)
     1 | def step1():
     2 |     return 1
     3 | 
     4 | 
     5 | def step2():
     6 |     return 2
     7 | 
     8 | 
     9 | def step3():
    10 |     return 3
```

---

## 3. Why NO engine change is needed (reference map — cite these in impl-notes)

The existing machinery already produces §2 exactly. The implementing agent does **not** modify
any of this; it is documented here so the tests assert against the right concepts and so the
impl-notes can explain *why* m7 is a no-op lock.

- **Branch enumeration + structural rewound discovery:** `findConversationBranches`
  (`src/reconstruction_branch.ts:150-168`) builds the surviving branch then appends the rewound
  one; the rewound tip is named by NO last-prompt head (a conv rewind re-prompts from the fork),
  so it is discovered structurally from the parentUuid fork via `findStructuralRewoundBranches`
  (`src/reconstruction_fork.ts`, called `reconstruction_branch.ts:166`). `findRewindPoint`
  (`:75-102`) resolves the fork uuid. `selectBranchRecords` (`:172-183`) scopes each branch to
  its tip's ancestor chain — so the surviving branch's `m7_conv.py` events are **Write(step1) +
  Edit(step2_alt)** only (D and E are off-branch and excluded). This is the same path S14/S16/S17
  exercise.
- **THE CRUX — surviving stale-edit-base reseed (reader-dependent):** because D and E are
  off-branch, the surviving branch's reconstructed base for F is the 2-line step1 Write, but F's
  structuredPatch was computed against the 10-line on-disk file. `editBaseIsStale`
  (`src/reconstruction_branches.ts:71`, generalised by S23 to a per-line context-match walk)
  DETECTS the stale base; `staleEditSeedFor` (`:92`) → `backupSeedWriteFor`
  (`src/reconstruction_sidecar.ts`) recovers the 10-line disk from backup `29a113119f194d6f@v4`
  and `seedStaleEditBases` (`:108-122`) inserts it as an `overwrite` revision BEFORE replaying F.
  This is the S19/m5 reseed; m7 is the conv-rewind case where it fires due to off-branch Claude
  edits rather than a user edit. The reseed is reader-gated (`reconstructFileOver`,
  `reconstruction_branches.ts:41-58`, only seeds when `reader` is present), which is exactly why
  §2.6 holds.
- **Why NOT the born-path alone:** `resolveContextLine`/`insertHunkAdditions`
  (`src/reconstruction_replay_edit.ts:96-139`) would materialise only the context lines present
  in F's hunk (`step3`), dropping `step2` — see §2.6. The reseed is what restores `step2`. (The
  born-path is still what materialises off-branch content for S17, where the hunk's context
  fully covers it; m7 differs because F's hunk context does not.)
- **m7 does NOT exercise the m6 `includeAfter` fallback:** the surviving reseed's backup
  (`@v4`, 16:08:12.997) is BEFORE F (16:08:40.473), so `findBackupAtOrBefore` finds it directly;
  the m6 `backupSeedWriteFor(..., includeAfter=true)` after-fallback path is not taken. (Do not
  write tests that assert on `includeAfter` for m7.)
- **Rewound branch is reader-independent:** its Edit bases (step1, step1+step2) are carried as
  `originalFile` in the JSONL, so `reconstructFileOver` replays them without the reseed firing.
  m7 test 5 (§5) locks that the rewound branch is byte-identical with and without a reader.
- **Reader plumbing:** `reconstructBranches(records, reader?)`
  (`src/reconstruction_engine.ts`) takes an OPTIONAL `BackupReader`; the CLI builds the live one
  via `buildSidecarReader`/`createSidecarReader` (`src/reconstruction_cli.ts:114-122,189`;
  `src/reconstruction_sidecar.ts:178-188`). This matches m5/m6 (engine tests pass an in-memory
  reader; CLI tests use the live one).
- **Precedent:** S17 (`tests/reconstruction_engine_s17.test.ts`,
  `tests/reconstruction_cli_s17.test.ts`) for the conv-only rewind + structural rewound branch;
  m5 (`tests/reconstruction_engine_m5.test.ts`, `tests/reconstruction_cli_m5.test.ts`) for the
  reader-dependent stale-edit-base reseed and the reader-load-bearing / reader-independence test
  pair. m7 composes the conv-rewind topology (S17) with the reader-dependent reseed (m5) for the
  first time.

---

## 4. Task 1 — Baseline & fixture (do first)

**4.1 Confirm baseline GREEN** (so the +10 delta is unambiguous):
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 327 pass / 0 fail
npx tsc --noEmit  # expect clean
```
If baseline is not 327/clean, STOP and report — the tree drifted from the m6 handoff.
NOTE on baseline: the worktree carries **uncommitted m2–m6 work**. In particular `src/`
already contains m6's changes (`reconstruction_branches.ts`, `reconstruction_sidecar.ts`). That
is the m7 baseline — m7 adds **ZERO** further `src/` change on top of it. Do **NOT** revert or
`git checkout`/`restore` any of it (the worktree-git-checkout hazard documented since S18); the
shared docs (`tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-…md`,
`plans/reconstruction-engine-design.md`) carry m2–m6 edits — never `git add -A`.

**4.2 Add the fixture.** Edit `tests/fixtures.ts`: append, after the `M6_JSONL` entry, a new
constant (Desktop path, mirroring every other `S*_JSONL`/`M*_JSONL`):
```typescript
export const M7_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m7-conv-rewind-no-user-edits/725204e2-8678-4c45-82d0-262557bff0ad.jsonl";
```
Rationale: the suite reads transcripts from the Desktop RevEng tree, not the worktree
(confirmed: every `S*_JSONL`/`M*_JSONL` uses that root, and the m7 JSONL is present there under
the same UUID).

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_m7.test.ts`, 5 tests)

Create the file below. It mirrors `tests/reconstruction_engine_m5.test.ts` exactly (same
imports, `finalTextOf`, `historyEndingWith`, `loadRecords`, an in-memory `BackupReader`). The
surviving branch is reader-dependent, so it is reconstructed **with** `m7Reader`; the
reader-load-bearing test (test 4) compares with vs without; the rewound test (test 5) proves the
rewound branch is reader-independent. `historyEndingWith` suffixes MUST lead with a slash
(`/m7_conv.py`) so they do not also match `/test_m7_conv.py`.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { M7_JSONL } from "./fixtures.ts";

// each line's latest value, newline-joined
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
// The single history whose target path ends with `suffix`. m7 touches TWO files; a
// leading-slash suffix disambiguates ("/m7_conv.py" does not match "/test_m7_conv.py").
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// The 10-line off-branch disk base, recovered from file-history backup 29a113119f194d6f@v4.
// On the surviving branch the conv-only rewind left step1+step2+step3 on disk; the surviving
// Edit (step2_alt) was computed against it, so the engine reseeds this as an `overwrite`
// revision before replaying the Edit.
const M7_BACKUPS: Record<string, string> = {
    "29a113119f194d6f@v4":
        "def step1():\n    return 1\n\n\ndef step2():\n    return 2\n\n\ndef step3():\n    return 3\n",
};
const m7Reader: BackupReader = (name) => M7_BACKUPS[name.toString()] ?? "";

const SURVIVING_DERIVED_FINAL =
    'def step1():\n    return 1\n\n\ndef step2():\n    return 2\n\n\ndef step2_alt():\n    return "2alt"\n\n\ndef step3():\n    return 3';
const REWOUND_DERIVED_FINAL =
    "def step1():\n    return 1\n\n\ndef step2():\n    return 2\n\n\ndef step3():\n    return 3";

// m7 is a conversation-only rewind, no user edits. The surviving branch has TWO files:
// m7_conv.py is THREE revisions [write, overwrite, edit] (the overwrite is the backup-seeded
// 10-line off-branch disk base that the surviving step2_alt Edit was computed against), and the
// sibling test is ONE write revision (never edited).
test("test_m7_surviving_two_histories_conv_three_revs_test_one_rev", () => {
    const { surviving } = reconstructBranches(loadRecords(M7_JSONL), m7Reader);
    assert.equal(surviving.length, 2);
    const conv = historyEndingWith(surviving, "/m7_conv.py");
    assert.deepEqual(
        conv.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.overwrite, EventKind.edit],
    );
    const testFile = historyEndingWith(surviving, "/test_m7_conv.py");
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
});

// The surviving m7_conv.py ends at the 14-line ground truth (step1, step2, step2_alt, step3):
// step2_alt is inserted BEFORE step3, and step2 (left on disk by the off-branch edit) survives.
test("test_m7_surviving_conv_ends_at_step2_alt_inserted_before_step3", () => {
    const { surviving } = reconstructBranches(loadRecords(M7_JSONL), m7Reader);
    const conv = historyEndingWith(surviving, "/m7_conv.py");
    assert.equal(finalTextOf(conv.revisions[conv.revisions.length - 1]!), SURVIVING_DERIVED_FINAL);
});

// THE RESEED (crux): the surviving m7_conv.py rev1 is an `overwrite` whose changeId is the
// backup blob name and whose content is the 10-line off-branch disk base. This is the S19/m5
// stale-edit-base reseed firing on a conv rewind (off-branch Claude edits, not a user edit).
test("test_m7_surviving_conv_rev1_is_backup_seeded_overwrite_ten_lines", () => {
    const { surviving } = reconstructBranches(loadRecords(M7_JSONL), m7Reader);
    const conv = historyEndingWith(surviving, "/m7_conv.py");
    const seed = conv.revisions[1]!;
    assert.equal(seed.kind, EventKind.overwrite);
    assert.equal(seed.changeId.toString(), "29a113119f194d6f@v4");
    assert.equal(finalTextOf(seed), REWOUND_DERIVED_FINAL); // the 10-line step1+step2+step3
});

// THE READER IS LOAD-BEARING (regression guard, m6-style): WITHOUT a reader the surviving
// m7_conv.py is WRONG — 2 revisions and a corrupted final ("    return 1\n    return 2", with
// no "def step2():"); WITH the reader it is the correct 3-revision, 14-line result.
test("test_m7_surviving_requires_reader_else_step2_collapses", () => {
    const without = reconstructBranches(loadRecords(M7_JSONL)); // no reader
    const convNo = historyEndingWith(without.surviving, "/m7_conv.py");
    assert.equal(convNo.revisions.length, 2);
    const finalNo = finalTextOf(convNo.revisions[convNo.revisions.length - 1]!);
    assert.ok(finalNo.includes("    return 1\n    return 2")); // the mangle
    assert.ok(!finalNo.includes("def step2():")); // step2's header was lost

    const withR = reconstructBranches(loadRecords(M7_JSONL), m7Reader);
    const convYes = historyEndingWith(withR.surviving, "/m7_conv.py");
    assert.equal(convYes.revisions.length, 3);
    const finalYes = finalTextOf(convYes.revisions[convYes.revisions.length - 1]!);
    assert.equal(finalYes, SURVIVING_DERIVED_FINAL);
    assert.ok(!finalYes.includes("    return 1\n    return 2"));
});

// The REWOUND branch is reader-INDEPENDENT: exactly one rewound branch, tip + rewindPoint as
// captured, m7_conv.py = 3 revisions [write, edit, edit] ending at the 10-line step3 version,
// and BYTE-IDENTICAL whether or not a reader is supplied (its Edit bases are all in the JSONL,
// so the reseed never fires on it).
test("test_m7_rewound_is_step1_step2_step3_and_reader_independent", () => {
    const withR = reconstructBranches(loadRecords(M7_JSONL), m7Reader);
    assert.equal(withR.rewound.length, 1);
    const branch = withR.rewound[0]!;
    assert.equal(branch.tip.toString(), "8037716c-b633-4787-ae71-a115580b4e42");
    assert.equal(branch.rewindPoint!.toString(), "a76d12e8-ded8-43fa-96b9-f3cdb43c8cc2");
    const convR = historyEndingWith(branch.histories, "/m7_conv.py");
    assert.deepEqual(
        convR.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.edit],
    );
    assert.equal(finalTextOf(convR.revisions[convR.revisions.length - 1]!), REWOUND_DERIVED_FINAL);

    const without = reconstructBranches(loadRecords(M7_JSONL)); // no reader
    const convNo = historyEndingWith(without.rewound[0]!.histories, "/m7_conv.py");
    assert.equal(finalTextOf(convNo.revisions[convNo.revisions.length - 1]!), REWOUND_DERIVED_FINAL);
});
```

**TDD for a reader-dependent char-lock (per the tdd guide):**
1. Write the file; run `node --import tsx --test tests/reconstruction_engine_m7.test.ts`.
   Expect all 5 GREEN immediately (engine already correct WITH the reader).
2. **Prove the crux locks actually bite** (record each RED→GREEN in impl-notes):
   - In `test_m7_surviving_conv_rev1_is_backup_seeded_overwrite_ten_lines`, temporarily change
     the expected `changeId` to `"29a113119f194d6f@v3"` (a sentinel that does not match) and
     re-run — it MUST go RED (proving the reseed pulls the specific `@v4` blob). Restore.
   - In `test_m7_surviving_requires_reader_else_step2_collapses`, temporarily change the WITHOUT
     branch's `assert.equal(convNo.revisions.length, 2)` to `3` and re-run — it MUST go RED
     (proving the reader is load-bearing, not incidental). Restore.
3. If step 1 is NOT all-green, STOP — the no-fix premise is violated. In particular, if test 4's
   WITHOUT-reader branch does NOT show 2 corrupted revisions, the reseed plumbing changed and the
   plan must be re-derived against the live engine (do NOT change the engine to fit the test).

> Confirm the engine signature against the m5 call site: `reconstructBranches(records, reader?)`
> returns `{ surviving: FileHistory[], rewound: RewoundBranch[] }`, and a rewound branch exposes
> `.histories`, `.tip`, `.rewindPoint`. If the surviving-history accessor differs, match the m5
> suite, not the other way round.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_m7.test.ts`, 5 tests)

`runCli([M7_JSONL, ...flags])` builds its own sidecar reader internally from the live
`~/.claude/file-history` (the m5/m6 pattern), so pass **NO** reader and the output is the
correct reader-recovered result. Assertions use `assert.ok(out.includes(...))` on the byte-exact
strings captured in §2.7 (two-space column gaps; in the fileDAG the kind column is padded to
width 5 — widest kind shown is `write` — so `edit` renders as `edit ` + 2-space gap = `edit   `).
The `### <path>` verbose header carries a per-run temp dir and is NOT asserted.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M7_JSONL } from "./fixtures.ts";

// m7's conversationDAG shows the conv rewind: a rewind-point prompt A with TWO branches — the
// rewound branch (tip #8037716c, with the abandoned step2/step3 edits D,E) and the surviving
// branch (tip #b6d67431, with the step2_alt edit F).
test("test_m7_default_conversationDAG_shows_rewind_two_branches", () => {
    const out = runCli([M7_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #a76d12e8   (rewind point)"));
    assert.ok(out.includes("branch rewound (rewound; tip #8037716c; rewind @ #a76d12e8)"));
    assert.ok(out.includes("D  edit  m7_conv.py  #01Q1Afdv"));
    assert.ok(out.includes("E  edit  m7_conv.py  #01KgnABQ"));
    assert.ok(out.includes("branch surviving (surviving; tip #b6d67431)"));
    assert.ok(out.includes("F  edit  m7_conv.py  #01KWHULi"));
});

// The fileDAG groups m7_conv.py's four events (B/D/E/F) and test_m7_conv.py's one (C).
test("test_m7_default_fileDAG_groups_two_files", () => {
    const out = runCli([M7_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "m7_conv.py\n  B  write  #01FNKuwc\n  D  edit   #01Q1Afdv\n  E  edit   #01KgnABQ\n  F  edit   #01KWHULi",
    ));
    assert.ok(out.includes("test_m7_conv.py\n  C  write  #01AYTKLo"));
});

// One surviving branch (two files) and one rewound branch (m7_conv.py only).
test("test_m7_list_branches_surviving_two_files_rewound_one", () => {
    const out = runCli([M7_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #b6d67431    m7_conv.py, test_m7_conv.py"));
    assert.ok(out.includes("rewound    tip #8037716c  rewind @ #a76d12e8    m7_conv.py"));
});

// SURVIVING BYTE-LOCK: the surviving m7_conv.py ends at the 14-line ground truth — step2_alt
// inserted before step3, with step2 (off-branch disk) preserved. (The 14-line block is the
// reader-recovered result; a regression in the reseed would drop step2.)
test("test_m7_surviving_verbose_ends_at_step2_alt_before_step3", () => {
    const out = runCli([M7_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes(
        "(14 lines)\n     1 | def step1():\n     2 |     return 1\n     3 | \n     4 | \n     5 | def step2():\n     6 |     return 2\n     7 | \n     8 | \n     9 | def step2_alt():\n    10 |     return \"2alt\"\n    11 | \n    12 | \n    13 | def step3():\n    14 |     return 3",
    ));
});

// REWOUND BYTE-LOCK: the rewound branch ends at the 10-line step1+step2+step3 version and does
// NOT contain step2_alt (the surviving edit is off this branch).
test("test_m7_rewound_branch_verbose_is_step3_no_step2_alt", () => {
    const out = runCli([M7_JSONL, "--branch", "8037716c", "--verbose"]);
    assert.ok(out.includes(
        "(10 lines)\n     1 | def step1():\n     2 |     return 1\n     3 | \n     4 | \n     5 | def step2():\n     6 |     return 2\n     7 | \n     8 | \n     9 | def step3():\n    10 |     return 3",
    ));
    assert.ok(!out.includes("step2_alt"));
});
```

**TDD:** run `node --import tsx --test tests/reconstruction_cli_m7.test.ts` — expect all 5 GREEN.
If a multi-line `includes` (a fileDAG block, or a verbose block) fails, re-capture the exact
block with
`npx tsx src/reconstruction_cli.ts "scenarios/executed/m7-conv-rewind-no-user-edits/725204e2-8678-4c45-82d0-262557bff0ad.jsonl" --surviving --verbose 2>/dev/null`
(stderr carries only the debugger banner) and reconcile whitespace — the strings in §2.7 are the
authority. As a prove-the-lock step, in `test_m7_surviving_verbose_ends_at_step2_alt_before_step3`
temporarily change `def step2_alt():` to `def step2_alt_SENTINEL():` and confirm RED (a sentinel
that appears NOWHERE else — do NOT reuse `(14 lines)`/`(10 lines)` which recur), then restore.
Likewise, in the rewound test, the `!out.includes("step2_alt")` line already bites if the branch
isolation regresses (temporarily flip it to `out.includes("step2_alt")` to confirm RED, then
restore).

> **CLI-test reader dependency:** these CLI tests rely on the backup `29a113119f194d6f@v4`
> existing in the live `~/.claude/file-history/725204e2-…/` tree (the surviving branch needs it),
> exactly as the m5/m6 CLI tests depend on their session's backups. Confirmed present at planning
> time. If the surviving verbose block ever shows the corrupted `    return 1\n    return 2` (the
> §2.6 no-reader output), the live backup is missing — restore it (re-sync via
> `/jot:sync-jsonl-projects`) before concluding the engine regressed.

---

## 7. Task 4 — Docs (3 edits)

**7.1 `plans/roadmap.md`** — flip the `[ ] M7 ->` placeholder to checked, mirroring the
M1–M6 line style. Suggested text:
```
[x] M7 -> [x] CONVERSATION-ONLY REWIND, NO user edits. ONE source file m7_conv.py (+ sibling test). Write step1 → Edit +step2 → Edit +step3 → "Looking good" → Rewind:3 (conv-only; disk NOT restored) → Edit insert step2_alt before step3. TWO branches of m7_conv.py: rewound (tip #8037716c, rewind @ #a76d12e8) = step1→+step2→+step3 (3 revs [write, edit, edit], 10 lines), reader-INDEPENDENT (bases in JSONL); surviving (tip #b6d67431) = step1 → backup-seeded 10-line disk (overwrite #29a113119f194d6f@v4) → +step2_alt (3 revs [write, overwrite, edit], 14 lines), reader-DEPENDENT. FIRST pure conv rewind in the m-series and the FIRST time the S19/m5 stale-edit-base reseed fires because of OFF-BRANCH CLAUDE EDITS left on disk (not a user edit). Reader-ASYMMETRIC across branches (rewound independent, surviving dependent). Engine ALREADY correct (characterization LOCK, NO src change): findConversationBranches + findStructuralRewoundBranches enumerate the branches, editBaseIsStale/staleEditSeedFor/backupSeedWriteFor reseed the surviving base from backup, then the Edit replays. Does NOT use m6's includeAfter fallback (backup precedes the edit). 10 new tests (5 engine + 5 CLI); 337 green; S1–S23 + m1–m6 byte-for-byte unchanged.
```

**7.2 `plans/implementation-notes-api-from-scenarios.md`** — PREPEND a new entry at the very top
(newest-first), in the established heading format:
```
## <YYYY-MM-DD:HH:MM:SS> — m7 reconstruction (conversation-only rewind, no user edits) — COMPLETE; characterization/regression LOCK, NO src change; 337 tests green
Chat title: <this session's title>
Path to JSONL log: <this session's JSONL>
```
Then the standard sub-sections: `### References` (link this plan, the m6 handoff that gated it,
and §3's file:line map), `### Design decisions` (why NO engine change — restate §3:
branch enumeration + structural rewound discovery, the surviving stale-edit-base reseed firing
on a conv rewind via `backupSeedWriteFor`/backup `@v4`, why the born-path alone would drop step2,
why m6's `includeAfter` is NOT used; note m7 is the FIRST pure conv rewind in the m-series and the
first reseed driven by off-branch Claude edits), `### Deviations` (record the prove-the-lock
RED→GREEN steps from §5/§6), `### Tradeoffs` (engine tests use an in-memory reader like m5/m6;
surviving correctness is reader-dependent and locked both directions; rewound is reader-
independent and locked byte-identical with/without a reader), `### Open questions` (none expected).

**7.3 `plans/reconstruction-engine-design.md`** — append a short **m7** note immediately after
the **m6** note (same per-scenario style). NO new spec number (engine unchanged). Suggested
content:
```
m7 (`m7-conv-rewind-no-user-edits`) is a conversation-only rewind with NO user edits. One source file m7_conv.py: written (step1), edited (+step2), edited (+step3), then a Rewind:3 (conv-only — disk NOT restored) forks the conversation back to just after the step1 Write, and a final Edit inserts step2_alt before step3. Two branches of m7_conv.py: rewound = step1→+step2→+step3 (reader-independent; bases in the JSONL), surviving = step1 → [off-branch disk step1+step2+step3] → +step2_alt. No new machinery — it is locked, not fixed. It composes existing guarantees: (a) branch enumeration — findConversationBranches + findStructuralRewoundBranches discover the rewound branch structurally from the parentUuid fork (no last-prompt head, as in S14/S17); (b) the surviving stale-edit-base reseed — because the off-branch edits D/E are scoped out, the surviving branch's reconstructed base for the step2_alt Edit is the 2-line step1, but the Edit's structuredPatch expects the 10-line on-disk file, so editBaseIsStale detects the mismatch and backupSeedWriteFor recovers the 10-line disk from file-history backup 29a113119f194d6f@v4, inserted as an overwrite revision before the Edit replays (the S19/m5 reseed, here firing because OFF-BRANCH CLAUDE EDITS — not a user edit — advanced the disk; FIRST such case). The reseed precedes the edit so m6's includeAfter after-fallback is not used. The born-path alone would drop step2 (the surviving Edit's hunk context covers only step3), which is why m7 is reader-dependent where S17 was not. Reader-ASYMMETRIC: the surviving branch needs a BackupReader (without it step2 collapses and the file is 2 corrupted revisions), the rewound branch does not. Reader-free on the rewound branch, reader-dependent on the surviving branch; first scenario split that way.
```

> Do NOT `git checkout`/`git restore` the shared docs to undo a temp edit — revert the specific
> lines by hand (they carry uncommitted m2–m6 edits).

---

## 8. Task 5 — Full verification

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 337 pass / 0 fail (327 baseline + 10 new)
npx tsc --noEmit  # expect clean
git diff --stat src/   # expect: ONLY the uncommitted m6 files (reconstruction_branches.ts,
                       #         reconstruction_sidecar.ts) — m7 adds ZERO NEW src change
```
- **`git diff src/` must show NO m7-attributable change.** The only `src/` diff present is the
  pre-existing uncommitted m6 work; m7 must not add to it. If any *additional* `src/` hunk
  appears, STOP and escalate — the no-fix premise is broken.
- End-to-end byte check (belt-and-suspenders, against the worktree JSONL):
  ```
  P="scenarios/executed/m7-conv-rewind-no-user-edits/725204e2-8678-4c45-82d0-262557bff0ad.jsonl"
  npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
  npx tsx src/reconstruction_cli.ts "$P" --branch 8037716c --verbose 2>/dev/null
  ```
  Eyeball that the surviving `m7_conv.py` shows three revisions (2-line step1, the 10-line
  backup-seeded step1+step2+step3, then the 14-line step2_alt result) and that the rewound shows
  three revisions ending at the 10-line step3 version; and that `--list-branches` lists both
  files under `surviving tip #b6d67431` and `m7_conv.py` under `rewound tip #8037716c`.

---

## 9. Task 6 — Commit (on user approval ONLY) then HAND OFF

Project rule: **one commit per scenario, only after the user approves.** Stage EXACTLY these
7 files — do **NOT** `git add -A` (other scenarios share fixtures/roadmap/impl-notes/design,
which carry uncommitted m2–m6 edits, and the worktree handoff layout under `plans/sN/`/`plans/mN/`
must not be swept in):
- `tests/fixtures.ts`
- `tests/reconstruction_engine_m7.test.ts`
- `tests/reconstruction_cli_m7.test.ts`
- `plans/roadmap.md`
- `plans/implementation-notes-api-from-scenarios.md`
- `plans/reconstruction-engine-design.md`
- `plans/m7/m7-reconstruction-plan.md` (this plan)

There is **no `src/` file** in the m7 commit (m7 is a no-src-change lock; the uncommitted m6
`src/` files are a separate, earlier commit decision — do not bundle them). Suggested message:
`Implemented m7 handling`.

**Then CREATE A HANDOFF** via the `/jot:handoff-prompt` skill documenting the completed m7
implementation (tests green count = 337, no-src-change confirmation, files staged) and naming
the **NEXT scenario** (the next unchecked roadmap line after M7) — plan it the same way
(ground-truth-first: run the CLI live, verify byte-for-byte, then char-lock or real-fix depending
on whether the engine is already correct). **Name the next scenario ONLY in the handoff TITLE
line, never in loose body prose** (the downstream planning monitor matches the title; a body
mention false-fires it — the m4/m5 lesson). This handoff is a **required deliverable**, not
optional.

---

## 10. Acceptance criteria (Definition of Done)

- [ ] `tests/fixtures.ts` has `M7_JSONL` (Desktop path), appended after `M6_JSONL`.
- [ ] `tests/reconstruction_engine_m7.test.ts` — 5 tests, all green; surviving reconstructed
      WITH `m7Reader`; both crux locks proven to bite (RED when the reseed blob name is changed
      to `@v3`, and when the no-reader revision count is flipped to `3`).
- [ ] `tests/reconstruction_cli_m7.test.ts` — 5 tests, all green; asserts the rewind-point
      conversationDAG with two branches, the two-file fileDAG, `--list-branches`, the 14-line
      surviving byte-lock, and the 10-line rewound byte-lock with NO `step2_alt`.
- [ ] `npm test` = **337 pass / 0 fail**; `npx tsc --noEmit` clean.
- [ ] `git diff src/` shows **only the pre-existing uncommitted m6 files** — m7 adds **no** new
      `src/` change.
- [ ] roadmap M7 line flipped to `[x]`; impl-notes entry prepended; design.md m7 note appended
      after the m6 note (NO new spec number).
- [ ] Committed (exact 7-file list) only after user approval, message `Implemented m7 handling`.
- [ ] **Completion handoff written via `/jot:handoff-prompt`** (names the next scenario in the
      TITLE line only).
```
