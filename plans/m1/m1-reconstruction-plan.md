# Reconstruction Plan — Scenario **m1** (`m1-cp-fork`)

> **Type: characterization / regression LOCK. NO `src/` change.**
> The engine **already** reconstructs m1 byte-for-byte correct (verified live —
> see §2). This plan locks that behaviour with 9 new tests (4 engine + 5 CLI) and
> 3 doc edits, exactly mirroring the S20/S21/S22 char-locks. It is **not** a real
> engine fix (unlike S19/S23). If, while implementing, any test cannot be made
> GREEN without touching `src/`, STOP and escalate — that would mean the live
> verification in §2 was wrong, and the plan must be revised, not the engine.

Implementing agent: read `~/.claude/guides/tdd.md` and
`plans/coding-requirements.md` before starting. Test code below already conforms
(enum-member comparisons via `EventKind.*`, wrapped `Path`/`Uuid`, the verbatim
`finalTextOf`/`historyEndingWith` noun-phrase accessors carried over from the S23
suite).

---

## 1. Goal

Lock — with tests — that `reconstruction_cli` correctly reconstructs the
file-change history of `m1-cp-fork`, the **copy-fork** scenario: a `cp` creates a
second file (`m1_fork.py`) from a first (`m1_base.py`), and **both** files are then
edited independently. The lock must pin the two properties that make m1 novel:

1. **Copy-time snapshot (temporal correctness):** `m1_fork.py`'s born content is
   `m1_base.py` *as of the `cp` moment* (`init + enable_debug`, 7 lines) — **not**
   `m1_base.py`'s final content (which later gains `disable_all`).
2. **Per-file independence (no cross-contamination):** the post-copy edit to the
   source (`disable_all` on `m1_base.py`) does **not** appear in `m1_fork.py`, and
   the post-copy edit to the copy (`enable_verbose` on `m1_fork.py`) does **not**
   appear in `m1_base.py`.

m1 is **linear** — there is NO conversation or code rewind, so exactly ONE branch
(`surviving`, tip `#3740a519`) and NO rewound branch. This is the inverse axis of
S20–S23 (those forked the *conversation*; m1 forks a *file*).

---

## 2. Ground truth (VERIFIED live against the engine at HEAD `ce18413` + uncommitted S23)

### 2.1 Scenario source & inputs
- Scenario script: `scenarios/m1-cp-fork.txt`
- Executed transcript (worktree copy): `scenarios/executed/m1-cp-fork/6dd28b9c-6553-4a42-ba00-0b681bd890bb.jsonl`
- **Fixture path (Desktop — this is what `tests/fixtures.ts` must point at, like every other `S*_JSONL`):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m1-cp-fork/6dd28b9c-6553-4a42-ba00-0b681bd890bb.jsonl`
  (confirmed present on Desktop.)
- File-history backups exist at `~/.claude/file-history/6dd28b9c-6553-4a42-ba00-0b681bd890bb/` (6 blobs) but are **NOT needed** for m1 reconstruction — copy seeding reconstructs the source inline (see §3). Engine tests run **reader-free** (pass no `BackupReader`); the CLI builds its own real reader internally and is unaffected.

### 2.2 Event ladder (the `cp` is event E)
| Turn | Kind | File | changeId | Effect |
|------|------|------|----------|--------|
| A | prompt | — | `#04e2614d` | root user prompt |
| B | write | `m1_base.py` | `#011qDCBo` | create `Config` (init: debug/verbose=False) — 4 lines |
| C | write | `test_m1_base.py` | `#01ReNqPU` | create test — 5 lines |
| D | edit | `m1_base.py` | `#01DPFPpW` | add `enable_debug` — base → 7 lines |
| **E** | **copy** | **`m1_fork.py`** | **`#01GL8xRo`** | **`cp m1_base.py m1_fork.py`** — fork born = base@D (7 lines) |
| F | edit | `m1_fork.py` | `#01TUUPpu` | add `enable_verbose` — fork → 10 lines |
| G | edit | `m1_base.py` | `#0149eWBD` | add `disable_all` — base → 11 lines |

Surviving branch tip: `#3740a519`. No rewind point. No rewound branch.

### 2.3 Final reconstructed content (byte-identical to on-disk ground truth — VERIFIED via `diff`)

`m1_base.py` — **3 revisions** (write→edit→edit), final **11 lines**:
```
class Config:
    def __init__(self):
        self.debug = False
        self.verbose = False

    def enable_debug(self):
        self.debug = True

    def disable_all(self):
        self.debug = False
        self.verbose = False
```

`m1_fork.py` — **2 revisions**, final **10 lines**:
- revision 0 = **copy** (kind `EventKind.copy`), born = base@D, **7 lines** (has `enable_debug`, NOT `disable_all`):
  ```
  class Config:
      def __init__(self):
          self.debug = False
          self.verbose = False

      def enable_debug(self):
          self.debug = True
  ```
- revision 1 = edit (`enable_verbose`), final **10 lines**:
  ```
  class Config:
      def __init__(self):
          self.debug = False
          self.verbose = False

      def enable_debug(self):
          self.debug = True

      def enable_verbose(self):
          self.verbose = True
  ```

`test_m1_base.py` — **1 revision** (write), **5 lines**:
```
from m1_base import Config


def test_config_debug_is_false():
    assert Config().debug == False
```

### 2.4 Exact CLI output (captured live — the byte source-of-truth for the CLI tests in §5)

Default (`runCli([M1_JSONL])`), column gaps are **two spaces**, file column padded:
```
══ conversationDAG ══
A  prompt  #04e2614d
  B  write  m1_base.py       #011qDCBo
  C  write  test_m1_base.py  #01ReNqPU
  D  edit   m1_base.py       #01DPFPpW
  E  copy   m1_fork.py       #01GL8xRo
  F  edit   m1_fork.py       #01TUUPpu
  G  edit   m1_base.py       #0149eWBD

══ fileDAG ══
m1_base.py
  B  write  #011qDCBo
  D  edit   #01DPFPpW
  G  edit   #0149eWBD
test_m1_base.py
  C  write  #01ReNqPU
m1_fork.py
  E  copy   #01GL8xRo
  F  edit   #01TUUPpu
```
Note: NO `branch …` lines appear (linear scenario).

`--list-branches`:
```
surviving  tip #3740a519    m1_base.py, test_m1_base.py, m1_fork.py
```

`--surviving --verbose` — the `m1_fork.py` copy revision header (the crux byte-lock):
```
revision 0  copy  <…>/m1_base.py → <…>/m1_fork.py  @ 2026-06-18T16:05:03.562Z  (7 lines)
```
(`m1_base.py` final block is headed `revision 2  @ …  (11 lines)`; `m1_fork.py` final block is `revision 1  @ …  (10 lines)`.)

---

## 3. Why NO engine change is needed (reference map — cite these in impl-notes)

The existing copy machinery already produces §2 exactly. The implementing agent
does not modify any of this; it is documented here so the tests assert against the
right concepts and so the impl-notes can explain *why* m1 is a no-op fix.

- **Parse:** `parseCpPaths` / `bashEventFrom` build a `CopyEvent{from,to,seedLines:[]}` — `src/reconstruction_extract.ts:57-65, 102-123`. `CopyEvent` type — `src/reconstruction_engine.ts:98-105`; `EventKind.copy` — `src/structures/vocabulary.ts:106`.
- **Copy-time snapshot (property 1):** `seedOneCopy` reconstructs the SOURCE lineage and picks `lastRevisionAtOrBefore(sourceRevisions, event.timestamp)` — `src/reconstruction_branches.ts:139-156`. This is exactly why the fork's born content is base@D, not base-final. Post-copy source edits cannot leak in because the snapshot is taken at the `cp` timestamp.
- **Per-file independence (property 2):** events are partitioned by final path; copy's key is `event.to` (`turnTarget`/`contentPathOf` → destination) — `src/reconstruction_graph.ts:76-81, 108-123`, `src/reconstruction_lineage.ts:33-52`. Copies are deliberately excluded from the rename chain (`buildRenameChain` only follows `EventKind.rename`) — `src/reconstruction_lineage.ts:9-15` — so source and copy are two histories, not one. Reconstructing `m1_base.py` filters the copy event OUT (its content-path is the fork); reconstructing `m1_fork.py` keeps copy+its own edits and drops the base's `disable_all`.
- **Genesis marking:** `copyRevision` marks every copied line `oldLineNum = DOES_NOT_EXIST_YET` with the copy timestamp — `src/reconstruction_replay.ts:80-93`, `src/reconstruction_replay_edit.ts:26-28`.
- **Precedent:** `s3-copy-file` already exercises copy lineage (design doc lines 86-101). m1 is the FIRST scenario to edit BOTH the source and the copy after the fork; that combination flows through the same per-path filter with no special case, which the new independence tests pin.

---

## 4. Task 1 — Baseline & fixture (do first)

**4.1 Confirm baseline GREEN** (so the +9 delta is unambiguous):
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 269 pass / 0 fail
npx tsc --noEmit  # expect clean
```
If baseline is not 269/clean, STOP and report — the tree drifted from the S23
handoff. NOTE: 269 already includes the uncommitted S23 work (the
`src/reconstruction_branches.ts` fix and the present-but-untracked
`tests/reconstruction_{engine,cli}_s23.test.ts`). Do not revert or commit that S23
work; m1 layers on top of it and shares the doc files (`fixtures.ts`, `roadmap.md`,
`implementation-notes…md`, `reconstruction-engine-design.md`), which already carry
S23 edits — never `git add -A` and never `git checkout`/`restore` them.

**4.2 Add the fixture.** Edit `tests/fixtures.ts`: append, after the `S23_JSONL`
entry, a new constant (Desktop path, mirroring every other `S*_JSONL`):
```typescript
export const M1_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/m1-cp-fork/6dd28b9c-6553-4a42-ba00-0b681bd890bb.jsonl";
```
Rationale: the suite reads transcripts from the Desktop RevEng tree, not the
worktree (confirmed: every `S*_JSONL` uses that root, and the m1 JSONL is present
there).

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_m1.test.ts`, 4 tests)

Create the file below. It is **reader-free** (`reconstructAll(loadRecords(M1_JSONL))`
with no `BackupReader`), because m1 needs no sidecar (see §2.1/§3). The
`finalTextOf` and `historyEndingWith` helpers are copied verbatim from
`tests/reconstruction_engine_s23.test.ts` (local convention permits these
noun-phrase accessors; keep them identical for consistency).

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { M1_JSONL } from "./fixtures.ts";

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

const BASE_AT_COPY =
    "class Config:\n    def __init__(self):\n        self.debug = False\n        self.verbose = False\n\n    def enable_debug(self):\n        self.debug = True";
const BASE_FINAL =
    "class Config:\n    def __init__(self):\n        self.debug = False\n        self.verbose = False\n\n    def enable_debug(self):\n        self.debug = True\n\n    def disable_all(self):\n        self.debug = False\n        self.verbose = False";
const FORK_FINAL =
    "class Config:\n    def __init__(self):\n        self.debug = False\n        self.verbose = False\n\n    def enable_debug(self):\n        self.debug = True\n\n    def enable_verbose(self):\n        self.verbose = True";
const TEST_FINAL =
    "from m1_base import Config\n\n\ndef test_config_debug_is_false():\n    assert Config().debug == False";

// m1 is linear: exactly three file histories, no rewound branch, and the base's
// own history is write→edit→edit ending at disable_all (the copy event does NOT
// appear in the base's lineage — it is keyed to the fork's destination path).
test("test_m1_base_history_is_write_edit_edit_ending_at_disable_all", () => {
    const histories = reconstructAll(loadRecords(M1_JSONL));
    const base = historyEndingWith(histories, "m1_base.py", true);
    assert.equal(base.revisions.length, 3);
    assert.deepEqual(
        base.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.edit],
    );
    assert.equal(finalTextOf(base.revisions[base.revisions.length - 1]!), BASE_FINAL);
});

// THE CRUX (property 1 — copy-time snapshot): the fork is born as a copy whose
// content is the base AS OF THE cp MOMENT (init + enable_debug, 7 lines), NOT the
// base's final content (which later gains disable_all). revision 0's kind is copy
// and its `copy.from` is the base path.
test("test_m1_fork_born_as_copy_of_base_at_copy_time_without_disable_all", () => {
    const histories = reconstructAll(loadRecords(M1_JSONL));
    const fork = historyEndingWith(histories, "m1_fork.py", false);
    assert.equal(fork.revisions[0]!.kind, EventKind.copy);
    assert.ok(fork.revisions[0]!.copy!.from.toString().endsWith("/m1_base.py"));
    assert.equal(finalTextOf(fork.revisions[0]!), BASE_AT_COPY);
    assert.ok(!finalTextOf(fork.revisions[0]!).includes("disable_all"));
});

// Property 2 (independence): the fork's post-copy edit adds enable_verbose and the
// fork NEVER gains the base's disable_all. Two revisions total (copy then edit).
test("test_m1_fork_final_adds_enable_verbose_and_never_gains_disable_all", () => {
    const histories = reconstructAll(loadRecords(M1_JSONL));
    const fork = historyEndingWith(histories, "m1_fork.py", false);
    assert.equal(fork.revisions.length, 2);
    assert.equal(fork.revisions[1]!.kind, EventKind.edit);
    assert.equal(finalTextOf(fork.revisions[fork.revisions.length - 1]!), FORK_FINAL);
    assert.ok(!finalTextOf(fork.revisions[fork.revisions.length - 1]!).includes("disable_all"));
});

// The test file is a single write, untouched by the fork; m1 yields exactly three
// histories (base, test, fork) — proof the copy did not collapse paths.
test("test_m1_test_file_single_write_and_three_total_histories", () => {
    const histories = reconstructAll(loadRecords(M1_JSONL));
    assert.equal(histories.length, 3);
    const testFile = historyEndingWith(histories, "test_m1_base.py", false);
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
    assert.equal(finalTextOf(testFile.revisions[0]!), TEST_FINAL);
});
```

**TDD for a char-lock (do this per the tdd guide):**
1. Write the file; run `node --import tsx --test tests/reconstruction_engine_m1.test.ts`. Expect all 4 GREEN immediately (engine already correct).
2. **Prove the crux lock actually bites:** temporarily change `BASE_AT_COPY` to `BASE_FINAL` in the test and re-run — `test_m1_fork_born_as_copy_of_base_at_copy_time…` MUST go RED (proving the test distinguishes copy-time from final content). Then restore `BASE_AT_COPY`. Record this RED→GREEN proof in impl-notes.
3. If step 1 is NOT all-green, STOP — the no-fix premise is violated.

> If `reconstructAll`'s signature requires a reader argument at the call site,
> pass `undefined` explicitly (`reconstructAll(loadRecords(M1_JSONL), undefined)`).
> Do NOT build an in-memory backup map — m1 needs none.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_m1.test.ts`, 5 tests)

`runCli([M1_JSONL, ...flags])` builds its own sidecar reader internally — pass NO
reader. Assertions use `assert.ok(out.includes(...))` on the byte-exact strings
captured in §2.4. Use the two-space column gaps exactly as shown.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { M1_JSONL } from "./fixtures.ts";

// m1's conversationDAG is LINEAR: a single root prompt A with B..G beneath it and
// NO branch/rewind lines. The cp surfaces as its own `copy` turn (E).
test("test_m1_default_conversationDAG_lists_seven_linear_turns_with_copy", () => {
    const out = runCli([M1_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #04e2614d"));
    assert.ok(out.includes("B  write  m1_base.py       #011qDCBo"));
    assert.ok(out.includes("C  write  test_m1_base.py  #01ReNqPU"));
    assert.ok(out.includes("D  edit   m1_base.py       #01DPFPpW"));
    assert.ok(out.includes("E  copy   m1_fork.py       #01GL8xRo"));
    assert.ok(out.includes("F  edit   m1_fork.py       #01TUUPpu"));
    assert.ok(out.includes("G  edit   m1_base.py       #0149eWBD"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});

// The fileDAG keeps base, test, and fork as THREE independent groups; the copy
// event (E) lives only under m1_fork.py, and m1_base.py shows write→edit→edit.
test("test_m1_default_fileDAG_groups_base_test_and_fork_independently", () => {
    const out = runCli([M1_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes("m1_base.py\n  B  write  #011qDCBo\n  D  edit   #01DPFPpW\n  G  edit   #0149eWBD"));
    assert.ok(out.includes("test_m1_base.py\n  C  write  #01ReNqPU"));
    assert.ok(out.includes("m1_fork.py\n  E  copy   #01GL8xRo\n  F  edit   #01TUUPpu"));
});

// One surviving branch, no rewound branch (linear scenario).
test("test_m1_list_branches_single_surviving_no_rewind", () => {
    const out = runCli([M1_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #3740a519"));
    assert.ok(out.includes("m1_base.py, test_m1_base.py, m1_fork.py"));
    assert.ok(!out.includes("rewound"));
});

// Surviving verbose: m1_base.py ends at the 11-line disable_all version.
test("test_m1_surviving_verbose_base_ends_at_disable_all_eleven_lines", () => {
    const out = runCli([M1_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("(11 lines)"));
    assert.ok(out.includes("    def disable_all(self):"));
});

// THE CRUX CLI BYTE-LOCK (property 1): m1_fork.py's revision 0 is a `copy` from the
// base, seeded with the 7-line base@copy content (so the copy block is 7 lines, NOT
// 11 — disable_all is absent), and the fork's final revision is the 10-line
// enable_verbose version.
test("test_m1_surviving_verbose_fork_copy_is_seven_line_base_at_copy_time", () => {
    const out = runCli([M1_JSONL, "--surviving", "--verbose"]);
    assert.ok(out.includes("revision 0  copy  "));
    assert.ok(out.includes("m1_base.py → "));
    assert.ok(out.includes("m1_fork.py"));
    assert.ok(out.includes("(7 lines)"));   // copy born content — base@D, not base-final
    assert.ok(out.includes("(10 lines)"));  // fork final — enable_verbose
    assert.ok(out.includes("    def enable_verbose(self):"));
});
```

**TDD:** run `node --import tsx --test tests/reconstruction_cli_m1.test.ts` — expect
all 5 GREEN. If the `fileDAG` multi-line `includes` fails, re-capture the exact
block with `npx tsx src/reconstruction_cli.ts "<worktree m1 jsonl>" 2>/dev/null`
(stderr carries only the debugger banner) and reconcile whitespace — the strings in
§2.4 are the authority. As a prove-the-lock step, temporarily change `(7 lines)` to
`(11 lines)` in the crux test and confirm RED, then restore.

---

## 7. Task 4 — Docs (3 edits)

**7.1 `plans/roadmap.md`** — flip the empty `[ ] M1 ->` placeholder (currently
line 25) to checked, mirroring the S23 line's style. Suggested text:
```
[x] M1 -> [x] cp-FORK: a `cp` forks a second file that then diverges. B writes `m1_base.py` (Config: debug/verbose=False); D adds `enable_debug`; E `cp m1_base.py m1_fork.py` (fork born = base@D, init+enable_debug, 7 lines); F adds `enable_verbose` to the FORK; G adds `disable_all` to the BASE. FIRST file-level fork (all of S7–S23 forked the conversation; m1 has no rewind — one surviving branch, tip #3740a519). Engine ALREADY correct (characterization LOCK, NO src change): copy born-content is the source AS OF THE cp moment (`seedOneCopy`/`lastRevisionAtOrBefore`), and per-path partitioning keeps base's `disable_all` out of the fork and the fork's `enable_verbose` out of the base. Reuses the S3 copy lineage; FIRST scenario to edit BOTH source and copy post-fork. 9 new tests (4 engine + 5 CLI); 278 green; S1–S23 byte-for-byte unchanged.
```

**7.2 `plans/implementation-notes-api-from-scenarios.md`** — PREPEND a new entry at
the very top (newest-first), in the established heading format:
```
## <YYYY-MM-DD:HH:MM:SS> — m1 reconstruction (cp-fork: copy then independent edits to both files) — COMPLETE; characterization/regression LOCK, NO src change; 278 tests green
Chat title: <this session's title>
Path to JSONL log: <this session's JSONL>
```
Then the standard sub-sections: `### References` (link this plan, the S23 handoff
that gated it, and §3's file:line map), `### Design decisions` (why NO engine
change — restate §3, esp. `seedOneCopy`/`lastRevisionAtOrBefore` for copy-time
snapshot and the per-path filter for independence; note m1 is the FIRST file-level
fork and the FIRST to edit both source and copy after a `cp`), `### Deviations`
(record the prove-the-lock RED→GREEN steps from §5/§6), `### Tradeoffs`
(reader-free engine tests since m1 needs no sidecar), `### Open questions` (none
expected).

**7.3 `plans/reconstruction-engine-design.md`** — append a short **m1** note after
the S23 note (~line 219), in the same per-scenario style. NO new spec number
(engine unchanged). Suggested content:
```
m1 (`m1-cp-fork`) is the first *file-level* fork: a `cp` (event E) creates `m1_fork.py` from `m1_base.py`, then BOTH files are edited independently (G adds `disable_all` to the base; F adds `enable_verbose` to the fork). No new machinery — it is locked, not fixed. It exercises two existing guarantees together for the first time: (a) copy-time snapshot — `seedOneCopy` seeds the fork from `lastRevisionAtOrBefore(sourceRevisions, cpTimestamp)`, so the fork is born as base@D (init+enable_debug) and the later `disable_all` never leaks in; (b) per-path independence — the copy event is keyed to its destination (`contentPathOf`/`turnTarget`) and excluded from the rename chain, so source and copy stay two histories. Generalises the S3 copy lineage from "copy then edit the COPY" to "copy then edit BOTH". Linear (no rewind): one surviving branch.
```

> Do NOT `git checkout`/`git restore` the shared docs (`fixtures.ts`,
> `roadmap.md`, `implementation-notes-…md`, `reconstruction-engine-design.md`) to
> undo a temp edit — revert the specific lines by hand (S23 handoff hazard note).

---

## 8. Task 5 — Full verification

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 278 pass / 0 fail (269 baseline + 9 new)
npx tsc --noEmit  # expect clean
git diff --stat src/   # see note below
```
- **`git diff src/` will NOT be empty at the moment you start** — the uncommitted
  S23 fix (`src/reconstruction_branches.ts`, ~+28/-5) is in the working tree (the
  269 baseline includes the present-but-untracked S23 tests). m1 must add **NOTHING
  new** to `src/`. So the check is: `git diff --stat src/` shows **ONLY**
  `src/reconstruction_branches.ts` (the pre-existing S23 change) — and **no other
  src file, and no new hunks in that file beyond S23's**. If S23 has since been
  committed, `git diff src/` should then be empty. If any OTHER src change appears,
  the no-fix premise broke — STOP and escalate.
- End-to-end byte check (optional belt-and-suspenders, against the worktree JSONL):
  ```
  P="scenarios/executed/m1-cp-fork/6dd28b9c-6553-4a42-ba00-0b681bd890bb.jsonl"
  npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null
  ```
  and eyeball that `m1_base.py` ends at `disable_all` (11 lines), `m1_fork.py`'s
  revision 0 copy block is 7 lines, and its final is 10 lines (`enable_verbose`).

---

## 9. Task 6 — Commit (on user approval ONLY) then HAND OFF

Project rule: **one commit per scenario, only after the user approves.** Stage
EXACTLY these 7 files — do **NOT** `git add -A` (other scenarios share
fixtures/roadmap/impl-notes/design):
- `tests/fixtures.ts`
- `tests/reconstruction_engine_m1.test.ts`
- `tests/reconstruction_cli_m1.test.ts`
- `plans/roadmap.md`
- `plans/implementation-notes-api-from-scenarios.md`
- `plans/reconstruction-engine-design.md`
- `plans/m1/m1-reconstruction-plan.md` (this plan)

There is **no `src/` file** in the commit (m1 is a no-src-change lock).
Suggested message: `Implemented m1 handling`.

**Then CREATE A HANDOFF** via the `/jot:handoff-prompt` skill documenting the
completed m1 implementation (tests green count, no-src-change confirmation, files
staged, what a follow-on agent would do next). This handoff is a required
deliverable, not optional.

---

## 10. Acceptance criteria (Definition of Done)

- [ ] `tests/fixtures.ts` has `M1_JSONL` (Desktop path).
- [ ] `tests/reconstruction_engine_m1.test.ts` — 4 tests, reader-free, all green; crux test proven to bite (RED when expectation flipped to base-final).
- [ ] `tests/reconstruction_cli_m1.test.ts` — 5 tests, all green; linear (asserts no `branch`/`rewound`).
- [ ] `npm test` = **278 pass / 0 fail**; `npx tsc --noEmit` clean.
- [ ] `git diff src/` is **empty** (no engine change).
- [ ] roadmap M1 line flipped to `[x]`; impl-notes entry prepended; design.md m1 note appended.
- [ ] Committed (exact file list) only after user approval, message `Implemented m1 handling`.
- [ ] **Completion handoff written via `/jot:handoff-prompt`.**
