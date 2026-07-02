# Reconstruction Plan — Scenario **S26** (`s26-script-rename-csv-map`)

> **MUST READ FIRST:** [`plans/script-handling.txt`](../script-handling.txt) — the HAS-BEACON vs
> NO-BEACON / forward-validation premise. S26 builds directly on S24/S25's HAS-BEACON case.
>
> **Bottom line for the implementer:** S26 is a **characterization / regression LOCK**. The engine
> ALREADY reconstructs all four tracked files **byte-perfect** with **zero `src/` change** — and
> (unlike S25) **every file is reader-INDEPENDENT** (no backup-seed fires). Your job is to ADD a
> fixture, ADD lock tests, and ADD docs — nothing more. **If ANY test cannot be made GREEN without
> touching `src/`, STOP and escalate** — that means the live ground truth in §2 drifted and the plan
> must be revised, NOT the engine.
>
> **The one twist vs S25 (S26's reason for existing):** S26 **inverts** S25's crux. In S25,
> `geo_report.py` had a post-script Edit whose base was the *disk* state, while its beacon snapshot was
> *incomplete* → the m6 **backup-seed** had to fire (a synthetic `overwrite` revision). In S26,
> `billing.py` ALSO has a post-script Edit (`print_invoice`, step 5), but its beacon is a **complete**
> 149-line snapshot, so that Edit splices **cleanly** onto the beacon → **NO backup-seed, NO
> `overwrite` revision, reader-INDEPENDENT**. S26 proves that a post-script Edit alone does NOT force
> reader-dependence — only an *incomplete* beacon does. Lock every file the S24 way (reader-free with a
> poison guard), and ADD a lock that the `overwrite` reseed is ABSENT for `billing.py`.

---

## 1. Goal

Add a fixture (`S26_JSONL`), an engine lock test (6 tests), a CLI lock test (6 tests), and three doc
edits, locking the engine's **already-correct** reconstruction of S26 and taking the suite from
**359 → 371 tests** with **no `src/` change**.

### 1.1 What S26 is

S26 is the **CSV-map** variant of S25's multi-file script rename: a single `python3 apply_renames.py`
run through the **Bash tool** rewrites **two** tracked source files at once, but the rename mapping is
read from a **CSV data file** (`renames.csv`) rather than hardcoded in the script. The ladder (from
`scenarios/s26-script-rename-csv-map.txt`):

1. Write `billing.py` (terse fn names `calc_tot`, `fmt_money`, `chk_stock`, `apply_disc`, `mk_order`)
   and `tests/test_billing.py` (covering `calc_tot`, `fmt_money`).
2. Edit `billing.py` — add `validate(items)`.
3. Write `renames.csv` (header `old,new` + 4 rows: `calc_tot,calculate_total`,
   `fmt_money,format_currency`, `chk_stock,check_stock`, `apply_disc,apply_discount`).
4. Write `apply_renames.py` and **run it with `python3` via the Bash tool** — it READS `renames.csv`
   (mapping NOT hardcoded) and applies each old→new pair as a **whole-word** rename to BOTH
   `billing.py` and `tests/test_billing.py` by `read()`/substitute/`write()`. **The scenario forbids
   using Edit/Write to rename** — the change happens only through the script, so there is NO Edit/Write
   `tool_use` for the rename.
5. Edit `billing.py` — add `print_invoice(order)` that builds a string using the **renamed**
   `calculate_total` and `format_currency`.
6. `Thanks.` / exit.

### 1.2 Why S26 reconstructs correctly — the HAS-BEACON rule

The script write leaves **no Edit/Write record**. What rescues each rewritten file is a **beacon**:
immediately after the script runs, the Claude Code harness auto-snapshots the changed files and injects
them as `edited_text_file` **attachment** records. The single `python3 apply_renames.py` run produces
**two** beacons (one for `billing.py`, one for `tests/test_billing.py`). The engine's existing S15
machinery (`userEditEventFrom` → `userEditChangesContent` → `userEditRevision`) turns each beacon into
a `user-edit` revision carrying the renamed content. `renames.csv` and `apply_renames.py` are ordinary
Claude `Write`s (visible directly). This is S24 ×2 + two driver Writes.

**Why no backup-seed (the inverse of S25):** `billing.py`'s beacon is a **complete** 149-line snapshot
of the post-rename disk state, and the step-5 `print_invoice` Edit's recorded base IS that same 149-line
state — so the Edit splices cleanly onto the beacon revision (149 → 177 lines) with no reseed. The m5/m6
stale-edit-base machinery (`seedEditBaseFromBackup` / `backupSeedWriteFor`) stays **INERT**: no backup
is requested, so the file is byte-identical with no reader, a poison reader, and the real reader. The
opaque `python3` run is **not parsed** and produces zero file events (the m3 contrast).

### 1.3 Per-file reader-dependence — ALL INDEPENDENT (verified live, §2.5)

| File | revisions | reader-INDEPENDENT? | why |
|---|---|---|---|
| `billing.py` | 4 | **YES** | beacon is a complete 149-line snapshot; the later `print_invoice` Edit applies cleanly on it → no backup needed |
| `tests/test_billing.py` | 2 | **YES** | beacon is a complete 60-line snapshot; no later Edits |
| `renames.csv` | 1 | **YES** | ordinary Claude `Write` (the rename map); no script, no beacon |
| `apply_renames.py` | 1 | **YES** | ordinary Claude `Write` (the driver script); no beacon |

### 1.4 How S26 differs from every prior scenario

| Prior | S26 differs |
|---|---|
| **S25** (multi-file, mixed reader-dependence; `geo_report` needs the `@v4` backup-seed) | S26 is the **INVERSION**: a post-script Edit (`print_invoice`) exists, but the beacon is **complete**, so **NO** backup-seed fires and **all** files are reader-INDEPENDENT. First scenario that proves "post-script Edit ⇏ reader-dependent." |
| **S24** (single-file HAS-BEACON, reader-INDEPENDENT) | S26 is **multi-file** (one Bash run → 2 beacons) AND carries a **data-driven** rename: the mapping lives in a tracked `renames.csv` the script READS, not in the script body. |
| **m3** (bash `>>` redirects, parsed) | S26's `python3` run is **opaque** (not parsed); recovery is via the in-JSONL beacons; the driver `apply_renames.py` and the map `renames.csv` are plain Writes. |
| **m5/m6/m7 rewinds** | S26 is **linear** — one surviving branch, no rewound branch. |

---

## 2. Ground truth (VERIFIED LIVE against the engine at worktree HEAD, suite 359 green)

> Everything in §2 was captured by running the real engine/CLI over the S26 transcript (no-reader,
> poison-reader, and the real sidecar reader — all three agree for every file). Treat these as the
> exact assertions. If a re-run disagrees, STOP — do not "fix" the engine to match the plan.

### 2.1 Scenario source & inputs
- Script: `scenarios/s26-script-rename-csv-map.txt`
- Executed output (JSONL + rendered files): `scenarios/executed/s26-script-rename-csv-map/`
- Rendered ground-truth files (byte targets) in that folder: `billing.py` (177 lines),
  `tests/test_billing.py` (60 lines), `renames.csv` (5 lines), `apply_renames.py` (43 lines).
- **The fixture transcript (canonical Desktop path, mirroring every other `S*_JSONL`/`M*_JSONL`):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s26-script-rename-csv-map/fd98c8aa-7264-4945-a83c-0d23a3d3a2ab.jsonl`
  (CONFIRMED present at that path under this UUID; 248.7 KB.)
- **sessionId** (file-history dir name): `fd98c8aa-7264-4945-a83c-0d23a3d3a2ab` (same as the JSONL
  filename). The file-history dir exists, but **no backup is requested** during S26 reconstruction —
  every file is reader-independent. (The real CLI still builds the sidecar reader; it is simply inert.)

### 2.2 Event ladder (DAG nodes, by real timestamp; the rename is the OPAQUE python run)

| node | time (Z) | record | effect |
|----|----------|--------|--------|
| A | 20:01:2x | prompt `#122ba017` | — |
| B | 20:01:27.335 | Write `billing.py` `#018abLNH` (`toolu_018abL…`) | billing rev0 (131 lines, terse) |
| C | 20:01:33.326 | Write `tests/test_billing.py` `#01Hqxhox` | test rev0 (60 lines, terse) |
| D | 20:01:58.714 | Edit `billing.py` `#01MVSbjC` (add `validate`) | billing rev1 (149 lines, terse) |
| E | 20:02:11.619 | Write `renames.csv` `#01P7ZSHL` | renames.csv rev0 (5 lines) |
| F | 20:02:23.898 | Write `apply_renames.py` `#01CRFECp` (`toolu_01CRFE…`) | apply_renames rev0 (43 lines) |
| – | **≈20:02:29.030** | **Bash `python3 apply_renames.py` `T_exec`** | **OPAQUE — 0 file events** |
| **G** | **20:02:52.622** | **beacon `edited_text_file` `billing.py` `#298a585d`** | **billing rev2 — user-edit, 149 lines, RENAMED (complete snapshot)** |
| **H** | **20:02:52.622** | **beacon `edited_text_file` `tests/test_billing.py` `#507c3e6b`** | **test rev1 — user-edit, 60 lines, RENAMED** |
| I | 20:03:14.006 | Edit `billing.py` `#01JBQ5ch` (add `print_invoice`) | billing rev3 (177 lines, final) |

The two `edited_text_file` attachments (G, H) are the ONLY evidence of the rename. There are **exactly
2** such attachments in the transcript, one per rewritten source file. The `python3` Bash run yields no
`tool_use` file op (opaque — the m3 contrast). No edits occur between `T_exec` and the beacons, so the
PostScriptBeacon == the beacon directly (HAS-BEACON, no-op rewind — exactly as in S24).

> **changeId rule (verified):** a beacon user-edit's `changeId` is the attachment record's own
> `entry.uuid` (per `userEditEventFrom`), NOT a `toolu_` id and NOT the `parent_uuid`. The full uuids:
> `billing` G = `298a585d-4536-4574-a388-66f477b3f2fa`; `test_billing` H =
> `507c3e6b-ad1e-4b61-bc1a-49358388e0e0`.

### 2.3 Reconstructed revision ladders (VERIFIED via `reconstructBranches`; identical with no reader, poison reader, real reader)

**`billing.py` — 4 revisions, reader-INDEPENDENT.** Kinds `[write, edit, userEdit, edit]`:

| rev | kind | lines | changeId | renamed? |
|----|------|------|----------|----------|
| 0 | write | 131 | `toolu_018abL…` (B) | no |
| 1 | edit | 149 | `toolu_01MVSbjC…` (D, add `validate`) | no |
| 2 | **userEdit** | 149 | **`298a585d-…`** (beacon G) | **YES (complete snapshot)** |
| 3 | edit | 177 | `toolu_01JBQ5ch…` (I, add `print_invoice`) | YES (final) |

> Final: **177 lines / 5813 chars.** Unlike S25, billing.py's edits are **pure insertions** (each adds
> a function without removing lines), so each DAG Edit maps to exactly **one** revision — 4 DAG events →
> 4 revisions, no (removal, addition) splitting. The kinds array above is the lock. **There is NO
> `overwrite` revision** — the step-3 Edit splices straight onto the complete beacon (rev2).

**`tests/test_billing.py` — 2 revisions, reader-INDEPENDENT.** Kinds `[write, userEdit]`:

| rev | kind | lines | changeId | renamed? |
|----|------|------|----------|----------|
| 0 | write | 60 | `toolu_01Hqxh…` (C) | no |
| 1 | **userEdit** | 60 | **`507c3e6b-…`** (beacon H) | **YES** |

> Final: **60 lines / 1394 chars.** The rename does not change the line count (whole-word substitution).

**`renames.csv` — 1 revision** `[write]`, `toolu_01P7ZS…` (E). Final: **5 lines / 106 chars** (the
rename map: header `old,new` + the 4 pairs).

**`apply_renames.py` — 1 revision** `[write]`, `toolu_01CRFE…` (F). Final: **43 lines / 1125 chars**
(the driver script; reads `renames.csv`).

### 2.4 No backup-seed is requested (the inverse of S25 §2.4)
During S26 reconstruction the engine requests **no** file-history backup for any file — confirmed by
the no-reader, poison-reader, and real-reader runs all producing byte-identical histories. There is no
`overwrite` revision anywhere. This is the structural contrast with S25, whose `geo_report.py` REQUIRED
the `a5675d5dd5201ac8@v4` backup-seed because its beacon was incomplete relative to a later Edit's base.

### 2.5 Reader-dependence matrix (VERIFIED LIVE — the regression guard)

| File | no reader | poison reader | real reader | verdict |
|---|---|---|---|---|
| `billing.py` | 4 revs, final 177 ln / 5813 ch | identical | identical | **reader-INDEPENDENT** |
| `tests/test_billing.py` | 2 revs, final 60 ln / 1394 ch | identical | identical | **reader-INDEPENDENT** |
| `renames.csv` | 1 rev, final 5 ln / 106 ch | identical | identical | **reader-INDEPENDENT** |
| `apply_renames.py` | 1 rev, final 43 ln / 1125 ch | identical | identical | **reader-INDEPENDENT** |

A poison reader (returning garbage) NEVER corrupts any final — proving no backup blob is consulted. The
`billing.py` history is identical with no reader and with the real reader DESPITE the post-script Edit:
this is S26's load-bearing finding — **the complete beacon makes the file reader-independent**.

### 2.6 Branch shape — LINEAR
One surviving branch, **no rewound branch**: `branched.rewound.length === 0`,
`branched.surviving.length === 4`, surviving tip `#ae7838c8`, four files: `billing.py`,
`test_billing.py`, `renames.csv`, `apply_renames.py`.

### 2.7 Exact CLI output (captured live — the byte source for the §6 CLI tests)

**Default (no flags) — `══ conversationDAG ══`** then `══ fileDAG ══`:
```
A  prompt  #122ba017
  B  write      billing.py        #018abLNH
  C  write      test_billing.py   #01Hqxhox
  D  edit       billing.py        #01MVSbjC
  E  write      renames.csv       #01P7ZSHL
  F  write      apply_renames.py  #01CRFECp
  G  user-edit  billing.py        #298a585d
  H  user-edit  test_billing.py   #507c3e6b
  I  edit       billing.py        #01JBQ5ch
```
`══ fileDAG ══` blocks (each file's events; no `overwrite` reseed exists, so nothing synthetic appears):
```
billing.py
  B  write      #018abLNH
  D  edit       #01MVSbjC
  G  user-edit  #298a585d
  I  edit       #01JBQ5ch
test_billing.py
  C  write      #01Hqxhox
  H  user-edit  #507c3e6b
renames.csv
  E  write      #01P7ZSHL
apply_renames.py
  F  write      #01CRFECp
```

**`--list-branches`:**
```
surviving  tip #ae7838c8    billing.py, test_billing.py, renames.csv, apply_renames.py
```
(no `rewound` line.)

**`--surviving --verbose`:** each file is a section headed `### <full path>/<file>` followed by
`revision N  @ <ts>  (NN lines)` blocks and `   N | <line>` content rows. Per-file revision counts and
line counts: `billing.py` → `revision 0`..`3` (4): 131, 149, 149, 177 lines; `tests/test_billing.py` →
`revision 0`..`1` (2): 60, 60 lines; `renames.csv` → `revision 0` (1): 5 lines; `apply_renames.py` →
`revision 0` (1): 43 lines. `revision 0` appears for ALL four files, so per-file verbose assertions
MUST be scoped to one file's `### …/<file>` section (use the `fileVerboseBlock` helper).

---

## 3. Why NO engine change is needed (reference map — cite in impl-notes)

| Step | Code (file:function) | What it does for S26 |
|---|---|---|
| Detect each beacon | `src/reconstruction_user_edit.ts` `userEditEventFrom` | Reads each `attachment.type === edited_text_file`; `changeId = entry.uuid` (the 2 message uuids); strips `cat -n` prefixes. |
| Inject among tool events | `src/reconstruction_extract.ts` `collectEventsFromRecord` / `extractFileEvents` | Pushes the 2 user-edits alongside the 4 writes / 2 edits; sorts by timestamp. The `python3` run adds nothing. |
| Content-aware guard (S15) | `src/reconstruction_replay.ts` `userEditChangesContent` / `userEditRevision` | Records each beacon as a `user-edit` revision (content differs from the terse belief). |
| Edit base reseed (m5/m6) | `src/reconstruction_sidecar.ts` `seedEditBaseFromBackup` / `backupSeedWriteFor` | **INERT for S26.** The `print_invoice` Edit's recorded base already matches the complete 149-line beacon, so no reseed fires and no backup is read. |
| Replay Edits | `src/reconstruction_replay_edit.ts` `applyEdit` | Splices each Edit (`validate`, `print_invoice`) onto the prior base (149 → 177 for the final). |

S26 stays inside the S24/S25 HAS-BEACON family with **no code delta** — and it is the case that proves
the m5/m6 backup-seed correctly STAYS DORMANT when the beacon is complete.

---

## 4. Task 1 — Baseline & fixture (do first)

**4.1 Confirm baseline GREEN** (so the +12 delta is unambiguous):
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 359 pass / 0 fail
npx tsc --noEmit  # expect: No errors found
```
If baseline is not 359/clean, STOP and report — the tree drifted. (S25 is COMMITTED at
`1b78786 S25 handling implemented`; HEAD at plan time is `063054a added skills for spawning agents`.
The only uncommitted item is the untracked `plans/s26/` dir.)

**4.2 Add the fixture.** In `tests/fixtures.ts`, append immediately after the `S25_JSONL` entry:
```typescript
export const S26_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s26-script-rename-csv-map/fd98c8aa-7264-4945-a83c-0d23a3d3a2ab.jsonl";
```
Rationale: the suite reads transcripts from the Desktop RevEng tree (every `S*_JSONL`/`M*_JSONL` uses
that root); the S26 JSONL is present there under this UUID.

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_s26.test.ts`, 6 tests)

Create the file. Mirror `tests/reconstruction_engine_s24.test.ts` / `reconstruction_engine_s25.test.ts`
(reader-free helpers + poison guard). **No hermetic backup map is needed** — every file is
reader-independent. Use **leading-slash** suffixes (`/billing.py`, `/test_billing.py`) so a suffix never
also matches a sibling.

**Shared header:**
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructBranches } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { loadRecords } from "./utilities.ts";
import { S26_JSONL } from "./fixtures.ts";

function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}
// Whole-word checks: match `def <name>(` headers, never bare substrings.
// `apply_disc` is a substring of `apply_discount`, so a bare check would phantom-match — the trailing
// `(` is load-bearing. Only calc_tot/fmt_money/chk_stock/apply_disc are renamed; mk_order/validate/
// print_invoice are NOT — do not assert their absence.
const TERSE_DEFS = ["def calc_tot(", "def fmt_money(", "def chk_stock(", "def apply_disc("];
const RENAMED_DEFS = ["def calculate_total(", "def format_currency(", "def check_stock(", "def apply_discount("];

// Final ground-truth literals (capture commands below; trailing newline stripped to match the
// engine's newline-joined revision text). NO backup literal — S26 is fully reader-independent.
const S26_BILLING_FINAL = `<<PASTE billing.py FINAL — 177 lines, length 5813>>`;
const S26_TEST_FINAL = `<<PASTE tests/test_billing.py FINAL — 60 lines, length 1394>>`;
const S26_RENAMES_CSV = `<<PASTE renames.csv FINAL — 5 lines, length 106>>`;
const S26_APPLY_RENAMES = `<<PASTE apply_renames.py FINAL — 43 lines, length 1125>>`;
```

**Capture commands** (run from the repo root; do NOT hand-type the literals):
```
node -e 'const f=require("fs");const r="scenarios/executed/s26-script-rename-csv-map/";for(const [name,v] of [["S26_BILLING_FINAL","billing.py"],["S26_TEST_FINAL","tests/test_billing.py"],["S26_RENAMES_CSV","renames.csv"],["S26_APPLY_RENAMES","apply_renames.py"]]){const t=f.readFileSync(r+v,"utf8").replace(/\n$/,"");console.log("const "+name+" = "+JSON.stringify(t)+"; // "+t.length+" chars, "+(t.split("\n").length)+" lines");}'
```
The expected lengths MUST come out to: billing 5813 (177 lines); test 1394 (60 lines); renames.csv 106
(5 lines); apply_renames 1125 (43 lines). If any differs, STOP — the ground truth drifted.

**Test 1 — branch shape: linear, four files, no rewound.**
> *Why:* locks §2.6 — the multi-file script run forks nothing.
```typescript
test("test_S26_linear_one_surviving_branch_four_files_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S26_JSONL));
    assert.equal(branched.rewound.length, 0);
    assert.equal(branched.surviving.length, 4);
    for (const suffix of ["/billing.py", "/test_billing.py", "/renames.csv", "/apply_renames.py"]) {
        assert.ok(branched.surviving.some((h) => h.target.toString().endsWith(suffix)), `missing ${suffix}`);
    }
});
```

**Test 2 — THE CRUX: `billing.py` 4-rev ladder, beacon user-edit at rev2, clean post-script splice, reader-INDEPENDENT, byte-lock.**
> *Why:* locks §2.3 (billing) + §2.5 — the script rename surfaces as rev2 `userEdit` (changeId
> `298a585d…`, renamed, 149-line complete snapshot); the step-5 `print_invoice` Edit splices cleanly to
> the 177-line final with no reader and a poison reader (no backup needed).
```typescript
test("test_S26_billing_four_revs_userEdit_rev2_clean_splice_reader_independent_bytelock", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL)).surviving, "/billing.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL), poison).surviving, "/billing.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.userEdit, EventKind.edit,
    ]);
    const rev2 = without.revisions[2]!;
    assert.equal(rev2.kind, EventKind.userEdit);
    assert.equal(rev2.changeId.toString(), "298a585d-4536-4574-a388-66f477b3f2fa");
    assert.equal(rev2.lines.length, 149);                 // complete beacon snapshot
    const rev2Text = finalTextOf(rev2);
    for (const def of RENAMED_DEFS) assert.ok(rev2Text.includes(def), `rev2 missing ${def}`);
    for (const def of TERSE_DEFS) assert.ok(!rev2Text.includes(def), `rev2 still has ${def}`);
    // reader-independence + byte-lock
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    assert.ok(!historyFinalText(withPoison).includes("POISONED"));
    const finalText = historyFinalText(without);
    assert.equal(finalText.split("\n").length, 177);
    assert.equal(finalText.length, 5813);
    assert.equal(finalText, S26_BILLING_FINAL);
    assert.ok(finalText.includes("def print_invoice(")); // step-5 Edit replayed on the renamed beacon
});
```

**Test 3 — S26's SIGNATURE: `billing.py` has NO backup-seed `overwrite` (inverts S25).**
> *Why:* locks §2.4 / §2.5 — despite the post-script Edit, the complete beacon means NO `overwrite`
> revision is injected and the no-reader history equals the real-reader history (the reseed is INERT).
> This is the precise contrast with S25's `geo_report.py`, which DID get an `overwrite` reseed.
```typescript
test("test_S26_billing_no_backup_seed_overwrite_inert_reseed", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL)).surviving, "/billing.py");
    const withReal = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL), poison).surviving, "/billing.py");
    assert.ok(!without.revisions.some((r) => r.kind === EventKind.overwrite), "unexpected overwrite reseed");
    assert.equal(without.revisions.length, 4);
    // no-reader history is byte-identical to the (poison) reader history → reseed never consulted a backup
    assert.deepEqual(without.revisions.map((r) => r.kind), withReal.revisions.map((r) => r.kind));
    assert.equal(historyFinalText(without), historyFinalText(withReal));
});
```

**Test 4 — `tests/test_billing.py`: 2-rev ladder, beacon user-edit, reader-INDEPENDENT, byte-lock + rename.**
> *Why:* locks §2.3 (test) + §2.5 — write → beacon, no later edits. The rename lock uses the **import
> line + call sites**, NOT bare tokens: the whole-word rename correctly LEAVES terse substrings inside
> test METHOD names (`test_calc_tot_empty`, `test_fmt_money_zero`, …), so a bare `calc_tot` absence
> check would falsely fail. The definitive rename signal is the renamed `from billing import …` line.
```typescript
test("test_S26_test_billing_two_revs_userEdit_reader_independent_bytelock", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL)).surviving, "/test_billing.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S26_JSONL), poison).surviving, "/test_billing.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit]);
    assert.equal(without.revisions[1]!.changeId.toString(), "507c3e6b-ad1e-4b61-bc1a-49358388e0e0");
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    const finalText = historyFinalText(without);
    assert.equal(finalText.split("\n").length, 60);
    assert.equal(finalText.length, 1394);
    assert.equal(finalText, S26_TEST_FINAL);
    // rename lock via the import + call sites (NOT bare tokens — method names keep terse substrings)
    assert.ok(finalText.includes("from billing import calculate_total, format_currency"));
    assert.ok(finalText.includes("calculate_total(") && finalText.includes("format_currency("));
    assert.ok(!finalText.includes("import calc_tot") && !finalText.includes("import fmt_money"));
    assert.ok(!/\bcalc_tot\(/.test(finalText) && !/\bfmt_money\(/.test(finalText)); // terse call forms gone
});
```

**Test 5 — driver files: `renames.csv` (the rename MAP) and `apply_renames.py` (the driver) — single Writes, byte-lock, reader-INDEPENDENT.**
> *Why:* locks §2.3 (driver files) — S26's distinguishing data file is `renames.csv`; the rename mapping
> lives there (the script READS it). Lock both bodies byte-exact and confirm they are plain single-Write
> histories (no beacon, no reseed).
```typescript
test("test_S26_driver_files_renames_csv_and_apply_renames_single_writes_bytelock", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const branched = reconstructBranches(loadRecords(S26_JSONL));
    const branchedPoison = reconstructBranches(loadRecords(S26_JSONL), poison);

    const csv = historyEndingWith(branched.surviving, "/renames.csv");
    assert.deepEqual(csv.revisions.map((r) => r.kind), [EventKind.write]);
    const csvText = historyFinalText(csv);
    assert.equal(csvText.split("\n").length, 5);
    assert.equal(csvText.length, 106);
    assert.equal(csvText, S26_RENAMES_CSV);
    for (const pair of [
        "old,new", "calc_tot,calculate_total", "fmt_money,format_currency",
        "chk_stock,check_stock", "apply_disc,apply_discount",
    ]) assert.ok(csvText.includes(pair), `csv missing ${pair}`);
    assert.equal(csvText, historyFinalText(historyEndingWith(branchedPoison.surviving, "/renames.csv")));

    const drv = historyEndingWith(branched.surviving, "/apply_renames.py");
    assert.deepEqual(drv.revisions.map((r) => r.kind), [EventKind.write]);
    const drvText = historyFinalText(drv);
    assert.equal(drvText.split("\n").length, 43);
    assert.equal(drvText.length, 1125);
    assert.equal(drvText, S26_APPLY_RENAMES);
    assert.ok(drvText.includes("renames.csv")); // reads the mapping from the CSV (not hardcoded)
    assert.equal(drvText, historyFinalText(historyEndingWith(branchedPoison.surviving, "/apply_renames.py")));
});
```

**Test 6 — `extractFileEvents`: two beacon user-edits, four writes, two edits, no events from the opaque python run.**
> *Why:* locks §2.2 — the rename is recovered ONLY from the two beacons, not from parsing the Bash
> command (the m3 contrast). There is NO synthetic `overwrite` (the S25 contrast) and no `append`.
```typescript
test("test_S26_extractFileEvents_two_userEdits_four_writes_two_edits", () => {
    const events = extractFileEvents(loadRecords(S26_JSONL));
    const userEdits = events.filter((e) => e.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 2);
    assert.deepEqual(
        userEdits.map((e) => e.changeId.toString().slice(0, 8)).sort(),
        ["298a585d", "507c3e6b"],
    );
    assert.equal(events.filter((e) => e.kind === EventKind.write).length, 4);   // B,C,E,F
    assert.equal(events.filter((e) => e.kind === EventKind.edit).length, 2);    // D,I
    assert.equal(events.filter((e) => e.kind === EventKind.overwrite).length, 0);
    assert.equal(events.filter((e) => e.kind === EventKind.append).length, 0);
});
```

**TDD for this char-lock (per the tdd guide):**
1. Write all 6 tests; run `node --import tsx --test tests/reconstruction_engine_s26.test.ts` — expect
   all 6 GREEN immediately (engine already correct).
2. **Prove the crux locks bite** (record each RED→GREEN in impl-notes, then revert):
   - Test 2: change the expected changeId `298a585d…` → `deadbeef…` → MUST go RED. Restore.
   - Test 2: change `S26_BILLING_FINAL` by one character → MUST go RED. Restore.
   - Test 3: temporarily assert `without.revisions.some((r) => r.kind === EventKind.overwrite)` → MUST
     go RED (proving no reseed fires — the inverse-of-S25 signature). Restore.
   - Test 5: change `S26_RENAMES_CSV` by one character → MUST go RED. Restore.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_s26.test.ts`, 6 tests)

Create the file. Mirror `tests/reconstruction_cli_s24.test.ts` / `reconstruction_cli_s25.test.ts`:
import `runCli` and `S26_JSONL`, call the REAL CLI (it builds the real sidecar reader, which is inert
for S26). Assert against the exact byte strings in §2.7.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S26_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// `revision 0` appears for all four files, so per-file assertions must be scoped this way.
function fileVerboseBlock(out: string, suffix: string): string {
    const lines = out.split("\n");
    const start = lines.findIndex((l) => l.startsWith("### ") && l.endsWith(suffix));
    assert.ok(start >= 0, `no verbose section for ${suffix}`);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i]!.startsWith("### ")) { end = i; break; }
    }
    return lines.slice(start, end).join("\n");
}
```

**Test 1 — default conversationDAG: the two script-rename beacons as user-edit turns; linear.**
```typescript
test("test_S26_default_conversationDAG_shows_two_script_rename_user_edits", () => {
    const out = runCli([S26_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #122ba017"));
    assert.ok(out.includes("  F  write      apply_renames.py  #01CRFECp"));
    assert.ok(out.includes("  G  user-edit  billing.py        #298a585d"));
    assert.ok(out.includes("  H  user-edit  test_billing.py   #507c3e6b"));
    assert.ok(out.includes("  I  edit       billing.py        #01JBQ5ch"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});
```

**Test 2 — default fileDAG groups each file's events.**
```typescript
test("test_S26_default_fileDAG_groups_each_file_events", () => {
    const out = runCli([S26_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "billing.py\n  B  write      #018abLNH\n  D  edit       #01MVSbjC\n  G  user-edit  #298a585d\n  I  edit       #01JBQ5ch",
    ));
    assert.ok(out.includes("test_billing.py\n  C  write      #01Hqxhox\n  H  user-edit  #507c3e6b"));
    assert.ok(out.includes("renames.csv\n  E  write      #01P7ZSHL"));
    assert.ok(out.includes("apply_renames.py\n  F  write      #01CRFECp"));
});
```

**Test 3 — list-branches: one surviving, four files, no rewound.**
```typescript
test("test_S26_list_branches_single_surviving_four_files", () => {
    const out = runCli([S26_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #ae7838c8"));
    for (const f of ["billing.py", "test_billing.py", "renames.csv", "apply_renames.py"]) {
        assert.ok(out.includes(f), `missing ${f}`);
    }
    assert.ok(!out.includes("rewound"));
});
```

**Test 4 — verbose `billing.py`: exactly four revisions; final revision renamed + `print_invoice`; no terse.**
> *Why:* locks §2.7 — `--verbose` prints EVERY revision, and the terse pre-rename revisions (0..1)
> legitimately still contain `def calc_tot(` etc., so the rename lock must be scoped to the FINAL
> revision (revision 3), which is fully renamed and carries the `print_invoice` addition.
```typescript
test("test_S26_verbose_billing_four_revisions_renamed_print_invoice", () => {
    const block = fileVerboseBlock(runCli([S26_JSONL, "--surviving", "--verbose"]), "/billing.py");
    assert.ok(block.includes("revision 3  @"));
    assert.ok(!block.includes("revision 4"));            // exactly four
    const finalRev = block.slice(block.indexOf("revision 3  @")); // final rendered revision only
    assert.ok(finalRev.includes("| def calculate_total(") && finalRev.includes("| def format_currency("));
    assert.ok(finalRev.includes("| def check_stock(") && finalRev.includes("| def apply_discount("));
    assert.ok(finalRev.includes("| def print_invoice("));
    assert.ok(!finalRev.includes("| def calc_tot(") && !finalRev.includes("| def apply_disc("));
});
```

**Test 5 — verbose `tests/test_billing.py`: exactly two revisions; final renamed import/calls.**
```typescript
test("test_S26_verbose_test_billing_two_revisions_renamed", () => {
    const block = fileVerboseBlock(runCli([S26_JSONL, "--surviving", "--verbose"]), "/test_billing.py");
    assert.ok(block.includes("revision 1  @"));
    assert.ok(!block.includes("revision 2"));            // exactly two
    assert.ok(block.includes("from billing import calculate_total, format_currency"));
    assert.ok(!block.includes("import calc_tot") && !block.includes("import fmt_money"));
});
```

**Test 6 — verbose driver files: `renames.csv` and `apply_renames.py` each exactly one revision.**
> *Why:* locks §2.7 — the data file and driver are single Writes (no beacon, no later edit). `renames.csv`
> shows the rename map rows; `apply_renames.py` references `renames.csv`.
```typescript
test("test_S26_verbose_driver_files_single_revision_each", () => {
    const out = runCli([S26_JSONL, "--surviving", "--verbose"]);
    const csv = fileVerboseBlock(out, "/renames.csv");
    assert.ok(csv.includes("revision 0  @"));
    assert.ok(!csv.includes("revision 1"));              // exactly one
    assert.ok(csv.includes("| old,new") && csv.includes("| calc_tot,calculate_total"));
    const drv = fileVerboseBlock(out, "/apply_renames.py");
    assert.ok(drv.includes("revision 0  @"));
    assert.ok(!drv.includes("revision 1"));              // exactly one
    assert.ok(drv.includes("renames.csv"));
});
```

**TDD:** run `node --import tsx --test tests/reconstruction_cli_s26.test.ts` — expect all 6 GREEN.
**Prove liveness** (record in impl-notes, then revert): change a unique assertion (e.g. `#298a585d` →
`#deadbeef` in Test 1, or `def print_invoice(` → `def PRINT_INVOICE(` in Test 4) → confirm RED, restore.

---

## 7. Task 4 — Docs (3 edits + the fixture from Task 1)

**7.1 `plans/roadmap.md`** — add a NEW `S26` line immediately after the `S25` line (line 33). It MUST
state: CSV-MAP variant of the multi-file script rename — one `python3 apply_renames.py` Bash run rewrites
`billing.py` + `tests/test_billing.py`, with the rename mapping READ from a tracked `renames.csv` (not
hardcoded); recovered via **two** `edited_text_file` beacons as `user-edit` revisions; the `python3` run
is OPAQUE (0 file events, the m3 contrast); **all four files reader-INDEPENDENT** — `billing.py` carries
a post-script `print_invoice` Edit yet needs NO backup-seed because its beacon is a COMPLETE 149-line
snapshot (the **inversion** of S25's `geo_report.py`); linear (one surviving branch, tip `#ae7838c8`, 4
files); engine ALREADY correct (characterization LOCK, NO src change); 12 new tests (6 engine + 6 CLI);
371 green; S1–S25 + m1–m7 byte-for-byte unchanged. Cite the HAS-BEACON rule (`script-handling.txt`).

**7.2 `plans/implementation-notes-api-from-scenarios.md`** — PREPEND a new top entry (above the S25
entry at line 1), header form:
`## <YYYY-MM-DD:HH:MM:SS> — S26 reconstruction (CSV-map multi-file script rename via Bash python3) — COMPLETE; characterization/regression LOCK, NO src change; 371 tests green`
Include: `### What S26 is` (the §1 ladder), `### All reader-INDEPENDENT — the inversion of S25` (the
§1.3 table + why `billing.py`'s COMPLETE beacon keeps the m5/m6 reseed INERT despite the post-script
Edit), `### Why no engine change` (the §3 map — emphasize the backup-seed correctly STAYS DORMANT),
`### The CSV map` (the rename mapping lives in a tracked `renames.csv` the script reads — a data-driven
rename, the new wrinkle vs S24/S25), `### RED→GREEN liveness` (the §5/§6 probes), `### Tradeoffs` (all
engine tests are reader-free with a poison guard; no hermetic backup map is needed; the test-file rename
lock uses the import line + call sites because whole-word rename leaves terse substrings in test METHOD
names; CLI tests use the real, inert sidecar reader).

**7.3 `plans/reconstruction-engine-design.md`** — APPEND a short S26 note after the S25 note (line 344+):
S26 = CSV-map multi-file script rename (2 beacons from one Bash run; mapping in a tracked `renames.csv`).
First scenario where a HAS-BEACON file with a post-script Edit (`billing.py` + `print_invoice`) is STILL
reader-INDEPENDENT — the complete beacon means `seedEditBaseFromBackup`/`backupSeedWriteFor` stay INERT
(the structural inverse of S25's `geo_report`). Engine unchanged. Cite `userEditEventFrom` and the
dormant `seedEditBaseFromBackup`/`backupSeedWriteFor`.

---

## 8. Task 5 — Full verification

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
node --import tsx --test tests/reconstruction_engine_s26.test.ts   # 6 green
node --import tsx --test tests/reconstruction_cli_s26.test.ts      # 6 green
npm test          # expect 371 pass / 0 fail
npx tsc --noEmit  # expect: No errors found
git diff --stat src/   # expect EMPTY — S26 adds NO src change
```
If `git diff src/` is non-empty, you violated the lock contract — revert the src change and re-derive
(the engine was already correct). NOTE: at plan time the tree is clean except the untracked `plans/s26/`
dir. Run `git status` yourself before staging; never `git add -A`.

---

## 9. Task 6 — Commit (on user approval ONLY) then HAND OFF

**Do not commit without explicit user approval** (project rule: one commit per scenario, gated). On
approval, stage EXACTLY these files (never `git add -A` — verify with `git status` first; the untracked
`plans/s26/` is the plan dir, decide separately whether to commit it):
```
tests/fixtures.ts
tests/reconstruction_engine_s26.test.ts
tests/reconstruction_cli_s26.test.ts
plans/roadmap.md
plans/implementation-notes-api-from-scenarios.md
plans/reconstruction-engine-design.md
```
Commit message: `Implemented S26 handling` (+ the standard Co-Authored-By / Claude-Session trailers).
Decide separately whether to also commit the new `plans/s26/` (plan + handoffs).

**create handoff** — after implementation is verified (and regardless of commit), write a COMPLETION
handoff via the `/jot:handoff-prompt` skill into `plans/s26/`. Put `MUST READ: plans/script-handling.txt`
at the very top. It must record: 371 green / tsc clean / NO src change; the crux locks proven RED→GREEN;
the "all reader-INDEPENDENT — inversion of S25" framing (complete beacon → reseed inert, no `overwrite`);
and the next scenario: **`scenarios/s27-script-rename-edited-before-run.txt`** (check `scenarios/` —
s27–s38 are defined). Arm the downstream monitor on the S26 completion handoff.

---

## 10. Acceptance criteria (Definition of Done)
- [ ] `tests/fixtures.ts` has `S26_JSONL` (Desktop path) appended after `S25_JSONL`.
- [ ] `tests/reconstruction_engine_s26.test.ts` — 6 tests, all green: branch shape (4 files, no
      rewound); `billing.py` 4-rev ladder, rev2 userEdit `298a585d…` (149-line complete beacon),
      reader-independent, byte-locked to 177 ln / 5813 ch, `print_invoice` present; `billing.py` has NO
      `overwrite` reseed and no-reader == reader history (inverts S25); `tests/test_billing.py` 2-rev,
      rev1 userEdit `507c3e6b…`, byte-locked to 60 ln / 1394 ch, renamed import + call sites;
      `renames.csv` 1-rev byte-locked to 5 ln / 106 ch (contains the 4 pairs); `apply_renames.py` 1-rev
      byte-locked to 43 ln / 1125 ch (reads `renames.csv`); `extractFileEvents` = 2 user-edits / 4
      writes / 2 edits / 0 overwrite / 0 append.
- [ ] Crux locks proven to bite (RED when changeId / final literal / overwrite-presence / csv literal
      assertion is altered).
- [ ] `tests/reconstruction_cli_s26.test.ts` — 6 tests, all green: conversationDAG shows the 2 user-edit
      turns; fileDAG groups all 4 files; single surviving tip `#ae7838c8`; verbose billing 4 revs (final
      renamed + `print_invoice`), test 2 revs (renamed import), driver files 1 rev each; no terse `def`
      headers leak from the final revision.
- [ ] `npm test` = **371 pass / 0 fail**; `npx tsc --noEmit` clean.
- [ ] `git diff src/` is **EMPTY** — S26 adds no `src/` change.
- [ ] roadmap S26 line added; impl-notes entry prepended; design.md S26 note appended.
- [ ] Committed (exact 6-file list) only after user approval, message `Implemented S26 handling`.
- [ ] **Completion handoff written via `/jot:handoff-prompt`** into `plans/s26/` (MUST READ header;
      names the next scenario `s27-script-rename-edited-before-run` and arms the downstream monitor).
