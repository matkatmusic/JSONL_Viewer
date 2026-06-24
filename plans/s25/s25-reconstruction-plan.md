# Reconstruction Plan — Scenario **S25** (`s25-script-rename-multi-file`)

> **MUST READ FIRST:** [`plans/script-handling.txt`](../script-handling.txt) — the HAS-BEACON vs
> NO-BEACON / forward-validation premise. S25 builds directly on S24's HAS-BEACON case.
>
> **Bottom line for the implementer:** S25 is a **characterization / regression LOCK**. The engine
> ALREADY reconstructs all three tracked files **byte-perfect via the real sidecar reader** (the CLI
> path) with **zero `src/` change**. Your job is to ADD a fixture, ADD lock tests, and ADD docs —
> nothing more. **If ANY test cannot be made GREEN without touching `src/`, STOP and escalate** —
> that means the live ground truth in §2 drifted and the plan must be revised, NOT the engine.
>
> **The one twist vs S24:** S25 is **mixed reader-dependence**. `geo_core.py` and
> `tests/test_geo_core.py` are reader-INDEPENDENT (S24-style, lock reader-free with a poison guard).
> `geo_report.py` is reader-DEPENDENT: its beacon snapshot is *incomplete*, so the m5/m6 **backup-seed**
> fires (a synthetic `overwrite` revision keyed `a5675d5dd5201ac8@v4`) to supply the base the later
> `totals` Edit was computed against. Lock `geo_report.py` the m7 way (hermetic backup map).

---

## 1. Goal

Add a fixture (`S25_JSONL`), an engine lock test (6 tests), a CLI lock test (6 tests), and three doc
edits, locking the engine's **already-correct** reconstruction of S25 and taking the suite from
**347 → 359 tests** with **no `src/` change**.

### 1.1 What S25 is

S25 is the **multi-file** extension of S24: a single `python3 rename_geo.py` run through the **Bash
tool** rewrites **three** tracked files at once. The ladder (from `scenarios/s25-script-rename-multi-file.txt`):

1. Write `geo_core.py` (terse names `area`, `perim`, `vol`, `diag`, `scale`), `geo_report.py`
   (imports `geo_core`, defines `build_report`/`summary_line`), and `tests/test_geo_core.py`.
2. Edit `geo_core.py` — add `midpoint`.
3. Edit `geo_report.py` — add `summary_line`.
4. **Write `rename_geo.py` and run it with `python3` via the Bash tool** — whole-word rename ACROSS
   all three files: `area→rectangle_area`, `perim→rectangle_perimeter`, `vol→box_volume`, by
   `read()`/substitute/`write()`. **The scenario forbids using Edit/Write to rename** — the change
   happens only through the script, so there is NO Edit/Write `tool_use` for the rename.
5. Edit `geo_report.py` — add `totals` (references the renamed `rectangle_area`, `box_volume`).
6. Edit `geo_core.py` — add `bounding_box`.

### 1.2 Why S25 reconstructs correctly — the HAS-BEACON rule, refined

The script write leaves **no Edit/Write record**. What rescues each file is a **beacon**: immediately
after the script runs, the Claude Code harness auto-snapshots the changed files and injects them as
`edited_text_file` **attachment** records. The single `python3 rename_geo.py` run at
`T_exec = 20:02:53.938Z` produces **three** beacons at `20:02:55.775Z` (one per file). The engine's
existing S15 machinery (`userEditEventFrom` → `userEditChangesContent` → `userEditRevision`) turns each
beacon into a `user-edit` revision carrying the renamed content. This is S24 ×3.

**The S25 refinement (the load-bearing finding):** a beacon being PRESENT does not always mean
"beacon alone suffices for the whole file." `geo_report.py`'s beacon is an **incomplete** 77-line
snapshot, but the post-script `totals` Edit (step 5) was computed against the true **95-line** disk
state. So that Edit's recorded base is *stale* relative to the 77-line beacon belief, and the engine's
m5/m6 stale-edit-base machinery (`seedEditBaseFromBackup` / `backupSeedWriteFor` / `findBackupPointAfter`)
**reseeds the base from a file-history backup** — a synthetic `overwrite` revision keyed
`a5675d5dd5201ac8@v4` (the 95-line disk state) — and then replays the `totals` Edit cleanly onto it.

This **refines, does not contradict,** the `script-handling.txt` premise. The premise's "beacon alone,
no script-replay" rule is about the *post-script revision itself* (the beacon correctly establishes
it — no forward-validation needed). The base-alignment of a *later* Edit is the m6 concern, and m6
already solves it with a backup-seed (NOT a script transform). S25 needs **no** script-execution-replay
feature; it reuses the shipped m6 reseed. The two opaque `python3` runs are **not parsed** and produce
zero file events (the m3 contrast).

### 1.3 Per-file reader-dependence — THE CRUX (verified live, §2.5)

| File | revisions (real reader) | reader-INDEPENDENT? | why |
|---|---|---|---|
| `geo_core.py` | 8 | **YES** | beacon is a complete 169-line snapshot; later Edits (M, N) apply cleanly on it → no backup needed |
| `tests/test_geo_core.py` | 2 | **YES** | beacon is a complete 42-line snapshot; no later Edits |
| `geo_report.py` | 7 | **NO** | beacon is an *incomplete* 77-line snapshot; later `totals` Edit's base is stale → m6 backup-seed (`@v4`, 95 lines) is required |

### 1.4 How S25 differs from every prior scenario

| Prior | S25 differs |
|---|---|
| **S24** (single-file HAS-BEACON, reader-INDEPENDENT) | S25 is **multi-file** (one Bash run → 3 beacons) and **mixed** reader-dependence — the first scenario where a HAS-BEACON file (`geo_report.py`) STILL needs the backup reader because its beacon is incomplete relative to a later Edit's base. |
| **m5/m6** (backup-seed on a rewind / copy) | S25's backup-seed fires **after a beacon user-edit** (script-driven), not after a rewind/copy — first time the reseed bridges a beacon→later-Edit gap. |
| **m3** (bash `>>` redirects, parsed) | S25's `python3` run is **opaque** (not parsed); recovery is via the in-JSONL beacons + (for `geo_report`) a backup. |
| **m5/m6/m7 rewinds** | S25 is **linear** — one surviving branch, no rewound branch. |

---

## 2. Ground truth (VERIFIED LIVE against the engine at worktree HEAD, suite 347 green)

> Everything in §2 was captured by running the real engine/CLI over the S25 transcript (no-reader,
> poison-reader, and the real sidecar reader). Treat these as the exact assertions. If a re-run
> disagrees, STOP — do not "fix" the engine to match the plan.

### 2.1 Scenario source & inputs
- Script: `scenarios/s25-script-rename-multi-file.txt`
- Executed output (JSONL + rendered files): `scenarios/executed/s25-script-rename-multi-file/`
- Rendered ground-truth files (byte targets): `geo_core.py` (196 lines), `geo_report.py` (120 lines),
  `tests/test_geo_core.py` (42 lines) in that folder.
- **The fixture transcript (canonical Desktop path, mirroring every other `S*_JSONL`/`M*_JSONL`):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s25-script-rename-multi-file/354de589-44a9-4f52-a1a0-0cd57738f713.jsonl`
  (CONFIRMED present at that path under this UUID; 350,154 bytes.)
- **sessionId** (file-history dir name): `354de589-44a9-4f52-a1a0-0cd57738f713` (same as the JSONL
  filename). The `geo_report` backup the real reader needs lives at
  `~/.claude/file-history/354de589-44a9-4f52-a1a0-0cd57738f713/a5675d5dd5201ac8@v4` (3026 bytes).

### 2.2 Event ladder (DAG nodes, by real timestamp; the rename is the OPAQUE python run)

| node | time (Z) | record | effect |
|----|----------|--------|--------|
| A | 20:00:5x | prompt `#6c99d0f7` | — |
| B | 20:00:57.190 | Write `geo_core.py` `#01THW3x6` | geo_core rev0 (146 lines, terse) |
| C | 20:01:06.600 | Write `geo_report.py` `#019B3GDX` | geo_report rev0 (73 lines, terse) |
| D | 20:01:10.816 | Write `tests/test_geo_core.py` `#01JaqY5L` | test rev0 (42 lines, terse) |
| E | 20:01:42.925 | Edit `geo_core.py` `#01D1xvSR` (add `midpoint`) | geo_core rev1+rev2 |
| F | 20:01:54.063 | Edit `geo_core.py` `#01FUSAse` | geo_core rev3 |
| G | 20:02:19.747 | Edit `geo_report.py` `#01TG3Gfc` (add `summary_line`) | geo_report rev1+rev2 |
| H | 20:02:46.713 | Write `rename_geo.py` `#01133d7F` | rename_geo rev0 |
| – | **20:02:53.938** | **Bash `python3 rename_geo.py` `T_exec`** | **OPAQUE — 0 file events** |
| **I** | **20:02:55.775** | **beacon `edited_text_file` `geo_report.py` `#dd04eabc`** | **geo_report rev3 — user-edit, 77 lines, RENAMED** |
| **J** | **20:02:55.775** | **beacon `edited_text_file` `geo_core.py` `#755a78dd`** | **geo_core rev4 — user-edit, 169 lines, RENAMED** |
| **K** | **20:02:55.775** | **beacon `edited_text_file` `tests/test_geo_core.py` `#fcaacf80`** | **test rev1 — user-edit, 42 lines, RENAMED** |
| L | 20:03:1x/20:03:20 | Edit `geo_report.py` `#01SEtJ2G` (add `totals`) | geo_report rev5+rev6 (after the `@v4` reseed) |
| M | 20:03:44.021 | Edit `geo_core.py` `#0187Nojk` | geo_core rev5+rev6 |
| N | 20:03:54.457 | Edit `geo_core.py` `#01EFcMWD` (add `bounding_box`) | geo_core rev7 (final) |

The three `edited_text_file` attachments (I, J, K) are the ONLY evidence of the rename. There are
**exactly 3** such attachments in the transcript, one per file. The two `python3` Bash runs yield no
`tool_use` file op (opaque — the m3 contrast).

> **changeId rule (verified):** a beacon user-edit's `changeId` is the attachment record's own
> `entry.uuid` (per `userEditEventFrom`), NOT a `toolu_` id and NOT the `parent_uuid`. The full uuids:
> `geo_report` I = `dd04eabc-2a17-4bc9-bad9-f24de83736bd`; `geo_core` J =
> `755a78dd-6b12-48db-969e-d41c2a97bd3a`; `test` K = `fcaacf80-7df6-4625-820b-25520527a7a3`.

### 2.3 Reconstructed revision ladders (VERIFIED via `reconstructBranches` with the REAL reader)

**`geo_core.py` — 8 revisions, reader-INDEPENDENT.** Kinds
`[write, edit, edit, edit, userEdit, edit, edit, edit]`:

| rev | kind | lines | chars | changeId | renamed? |
|----|------|------|------|----------|----------|
| 0 | write | 146 | 3600 | `toolu_01THW3x6…` | no |
| 1 | edit | 145 | 3548 | `toolu_01D1xvSR…` (E, split) | no |
| 2 | edit | 146 | 3612 | `toolu_01D1xvSR…` (E, split) | no |
| 3 | edit | 169 | 4245 | `toolu_01FUSAse…` (F) | no |
| 4 | **userEdit** | 169 | 4492 | **`755a78dd-…`** (beacon J) | **YES** |
| 5 | edit | 168 | 4397 | `toolu_0187Nojk…` (M, split) | YES |
| 6 | edit | 169 | 4508 | `toolu_0187Nojk…` (M, split) | YES |
| 7 | edit | 196 | **5263** | `toolu_01EFcMWD…` (N) | YES |

> Edits E and M each splice as a (removal, addition) **revision pair sharing one changeId** — that is
> why 6 DAG events expand to 8 revisions. This is the engine's normal edit-application model, not a
> bug. The kinds array above is the lock.

**`geo_report.py` — 7 revisions, reader-DEPENDENT (real reader).** Kinds
`[write, edit, edit, userEdit, overwrite, edit, edit]`:

| rev | kind | lines | chars | changeId | note |
|----|------|------|------|----------|------|
| 0 | write | 73 | 2235 | `toolu_019B3GDX…` | terse |
| 1 | edit | 72 | 2208 | `toolu_01TG3Gfc…` (G, split) | terse |
| 2 | edit | 95 | 2877 | `toolu_01TG3Gfc…` (G, split) | terse |
| 3 | **userEdit** | 77 | 2516 | **`dd04eabc-…`** (beacon I) | RENAMED, **incomplete 77-line snapshot** |
| 4 | **overwrite** | 95 | 3023 | **`a5675d5dd5201ac8@v4`** | **m6 backup-seed — the 95-line disk base** |
| 5 | edit | 94 | 2980 | `toolu_01SEtJ2G…` (L, split) | RENAMED |
| 6 | edit | 120 | **3810** | `toolu_01SEtJ2G…` (L, split) | RENAMED + `totals` (final) |

**`tests/test_geo_core.py` — 2 revisions, reader-INDEPENDENT.** Kinds `[write, userEdit]`:

| rev | kind | lines | chars | changeId | renamed? |
|----|------|------|------|----------|----------|
| 0 | write | 42 | 1025 | `toolu_01JaqY5L…` | no |
| 1 | **userEdit** | 42 | **1145** | **`fcaacf80-…`** (beacon K) | **YES** |

**`rename_geo.py` — 1 revision** `[write]`, `toolu_01133d7F…` (the driver script; no ground-truth
file to compare).

### 2.4 The `geo_report.py` backup-seed (`a5675d5dd5201ac8@v4`)
The ONLY backup key the engine requests during S25 reconstruction is `a5675d5dd5201ac8@v4` (3024
chars when read utf8; 3026 bytes). Its content is the renamed-but-pre-`totals` `geo_report.py` disk
state (95 lines): it contains `rectangle_area`, `rectangle_perimeter`, `box_volume`, `summary_line`,
and `build_report`, but NOT `totals`. `geo_core.py` and `tests/test_geo_core.py` request **no** backup.

### 2.5 Reader-dependence matrix (VERIFIED LIVE — the regression guard)

| File | no reader | poison reader | real reader | verdict |
|---|---|---|---|---|
| `geo_core.py` | 8 revs, final 196 ln / 5263 ch | identical | identical | **reader-INDEPENDENT** |
| `tests/test_geo_core.py` | 2 revs, final 42 ln / 1145 ch | identical | identical | **reader-INDEPENDENT** |
| `geo_report.py` | **6 revs, final 102 ln / 3276 ch (WRONG)** | 7 revs, 35 ln / 970 ch (CORRUPTED) | 7 revs, 120 ln / 3810 ch (✓ GT) | **reader-DEPENDENT** |

The no-reader `geo_report.py` has **6** revisions (NO `overwrite` rev4 — the reseed can't fire without
a backup) and a truncated final; this proves the `@v4` backup is **load-bearing**. The poison reader
(returning garbage) yields a corrupted 35-line final — proving the reseed reads real backup content.

### 2.6 Branch shape — LINEAR
One surviving branch, **no rewound branch**: `branched.rewound.length === 0`,
`branched.surviving.length === 4`, surviving tip `#e3b43fcc`, four files: `geo_core.py`,
`geo_report.py`, `test_geo_core.py`, `rename_geo.py`.

### 2.7 Exact CLI output (captured live — the byte source for the §6 CLI tests)

**Default (no flags) — `══ conversationDAG ══`** (then `══ fileDAG ══`):
```
A  prompt  #6c99d0f7
  B  write      geo_core.py       #01THW3x6
  C  write      geo_report.py     #019B3GDX
  D  write      test_geo_core.py  #01JaqY5L
  E  edit       geo_core.py       #01D1xvSR
  F  edit       geo_core.py       #01FUSAse
  G  edit       geo_report.py     #01TG3Gfc
  H  write      rename_geo.py     #01133d7F
  I  user-edit  geo_report.py     #dd04eabc
  J  user-edit  geo_core.py       #755a78dd
  K  user-edit  test_geo_core.py  #fcaacf80
  L  edit       geo_report.py     #01SEtJ2G
  M  edit       geo_core.py       #0187Nojk
  N  edit       geo_core.py       #01EFcMWD
```
`══ fileDAG ══` blocks (note: the synthetic `overwrite` reseed is NOT a DAG node — only the 4
`geo_report` events appear):
```
geo_core.py
  B  write      #01THW3x6
  E  edit       #01D1xvSR
  F  edit       #01FUSAse
  J  user-edit  #755a78dd
  M  edit       #0187Nojk
  N  edit       #01EFcMWD
geo_report.py
  C  write      #019B3GDX
  G  edit       #01TG3Gfc
  I  user-edit  #dd04eabc
  L  edit       #01SEtJ2G
test_geo_core.py
  D  write      #01JaqY5L
  K  user-edit  #fcaacf80
rename_geo.py
  H  write      #01133d7F
```

**`--list-branches`:**
```
surviving  tip #e3b43fcc    geo_core.py, geo_report.py, test_geo_core.py, rename_geo.py
```
(no `rewound` line.)

**`--surviving --verbose`:** each file is a section headed `### <full path>/<file>` followed by
`revision N  @ <ts>  (NN lines)` blocks and `   N | <line>` content rows. The header does NOT print
the revision KIND — so the `geo_report` `overwrite` reseed is visible ONLY as `revision 4`'s content
(95 lines), not as the word "overwrite". Per-file revision counts: `geo_core.py` → `revision 0`..`7`
(8); `geo_report.py` → `revision 0`..`6` (7); `tests/test_geo_core.py` → `revision 0`..`1` (2);
`rename_geo.py` → `revision 0` (1).

---

## 3. Why NO engine change is needed (reference map — cite in impl-notes)

| Step | Code (file:function) | What it does for S25 |
|---|---|---|
| Detect each beacon | `src/reconstruction_user_edit.ts` `userEditEventFrom` | Reads each `attachment.type === edited_text_file`; `changeId = entry.uuid` (the 3 message uuids); strips `cat -n` prefixes. |
| Inject among tool events | `src/reconstruction_extract.ts` `collectEventsFromRecord` / `extractFileEvents` | Pushes the 3 user-edits alongside writes/edits; sorts by timestamp. The 2 `python3` runs add nothing. |
| Content-aware guard (S15) | `src/reconstruction_replay.ts` `userEditChangesContent` / `userEditRevision` | Records each beacon as a `user-edit` revision (content differs from the terse belief). |
| Edit base reseed (m5/m6) | `src/reconstruction_sidecar.ts` `seedEditBaseFromBackup` / `backupSeedWriteFor` / `findBackupPointAfter` | For `geo_report`, the `totals` Edit's recorded base is stale vs the 77-line beacon belief → reseeds `@v4` (95-line disk) as an `overwrite` revision, then the Edit replays cleanly. For `geo_core`/`test`, the base already matches → reseed stays INERT. |
| Replay Edits | `src/reconstruction_replay_edit.ts` `applyEdit` | Splices removal+addition pairs onto the (reseeded, for geo_report) base. |

S25 generalizes the S24 HAS-BEACON family from "single file, beacon suffices" to "multi-file, with a
backup-seed bridging an incomplete beacon to a later Edit" — with **no code delta**.

---

## 4. Task 1 — Baseline & fixture (do first)

**4.1 Confirm baseline GREEN** (so the +12 delta is unambiguous):
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 347 pass / 0 fail
npx tsc --noEmit  # expect: No errors found
```
If baseline is not 347/clean, STOP and report — the tree drifted.

**4.2 Add the fixture.** In `tests/fixtures.ts`, append immediately after the `S24_JSONL` entry:
```typescript
export const S25_JSONL =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s25-script-rename-multi-file/354de589-44a9-4f52-a1a0-0cd57738f713.jsonl";
```
Rationale: the suite reads transcripts from the Desktop RevEng tree (every `S*_JSONL`/`M*_JSONL` uses
that root); the S25 JSONL is present there under this UUID.

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_s25.test.ts`, 6 tests)

Create the file. Mirror `tests/reconstruction_engine_s24.test.ts` (reader-free helpers) AND
`tests/reconstruction_engine_m7.test.ts` (the hermetic backup-map reader for the reader-dependent
file). Use **leading-slash** suffixes (`/geo_core.py`) so `/geo_core.py` does not also match a sibling.

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
import { S25_JSONL } from "./fixtures.ts";

function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}
// whole-word checks: match `def <name>(` headers, never bare substrings.
const TERSE_DEFS = ["def area(", "def perim(", "def vol("];
const RENAMED_DEFS = ["def rectangle_area(", "def rectangle_perimeter(", "def box_volume("];

// geo_report.py is reader-DEPENDENT: the post-script `totals` Edit's base is the 95-line disk state,
// recovered from file-history backup a5675d5dd5201ac8@v4 (m6 backup-seed). Hermetic map (mirrors m7).
const S25_GEO_REPORT_BACKUP = `<<PASTE THE @v4 CONTENT — capture command below>>`;
const s25Reader: BackupReader = (name) =>
    name.toString() === "a5675d5dd5201ac8@v4" ? S25_GEO_REPORT_BACKUP : "";

// Final ground-truth literals (capture commands below; trailing newline stripped to match the
// engine's newline-joined revision text).
const S25_GEO_CORE_FINAL = `<<PASTE geo_core.py FINAL — 196 lines, length 5263>>`;
const S25_GEO_REPORT_FINAL = `<<PASTE geo_report.py FINAL — 120 lines, length 3810>>`;
const S25_TEST_FINAL = `<<PASTE tests/test_geo_core.py FINAL — 42 lines, length 1145>>`;
```

**Capture commands** (run from the repo root; do NOT hand-type the literals):
```
# @v4 backup (geo_report base seed) — 3024 chars:
node -e 'console.log("const S25_GEO_REPORT_BACKUP = "+JSON.stringify(require("fs").readFileSync(process.env.HOME+"/.claude/file-history/354de589-44a9-4f52-a1a0-0cd57738f713/a5675d5dd5201ac8@v4","utf8"))+";")'
# finals (trailing newline stripped):
node -e 'const f=require("fs");const r="scenarios/executed/s25-script-rename-multi-file/";for(const [name,v] of [["S25_GEO_CORE_FINAL","geo_core.py"],["S25_GEO_REPORT_FINAL","geo_report.py"],["S25_TEST_FINAL","tests/test_geo_core.py"]]){const t=f.readFileSync(r+v,"utf8").replace(/\n$/,"");console.log("const "+name+" = "+JSON.stringify(t)+"; // "+t.length+" chars, "+(t.split("\n").length)+" lines");}'
```
The expected lengths MUST come out to: backup 3024; geo_core 5263 (196 lines); geo_report 3810 (120
lines); test 1145 (42 lines). If any differs, STOP — the ground truth drifted.

**Test 1 — branch shape: linear, four files, no rewound.**
> *Why:* locks §2.6 — the multi-file script run forks nothing.
```typescript
test("test_S25_linear_one_surviving_branch_four_files_no_rewound", () => {
    const branched = reconstructBranches(loadRecords(S25_JSONL), s25Reader);
    assert.equal(branched.rewound.length, 0);
    assert.equal(branched.surviving.length, 4);
    for (const suffix of ["/geo_core.py", "/geo_report.py", "/test_geo_core.py", "/rename_geo.py"]) {
        assert.ok(branched.surviving.some((h) => h.target.toString().endsWith(suffix)), `missing ${suffix}`);
    }
});
```

**Test 2 — `geo_core.py`: 8-rev ladder, beacon user-edit at rev4, reader-INDEPENDENT, byte-lock.**
> *Why:* locks §2.3 (geo_core) + §2.5 — the script rename surfaces as rev4 `userEdit` (changeId
> `755a78dd…`, renamed) and the file reconstructs identically with no reader and a poison reader.
```typescript
test("test_S25_geo_core_eight_revs_userEdit_rev4_reader_independent_bytelock", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL)).surviving, "/geo_core.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL), poison).surviving, "/geo_core.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit, EventKind.edit,
        EventKind.userEdit, EventKind.edit, EventKind.edit, EventKind.edit,
    ]);
    const rev4 = without.revisions[4]!;
    assert.equal(rev4.kind, EventKind.userEdit);
    assert.equal(rev4.changeId.toString(), "755a78dd-6b12-48db-969e-d41c2a97bd3a");
    const rev4Text = finalTextOf(rev4);
    for (const def of RENAMED_DEFS) assert.ok(rev4Text.includes(def), `rev4 missing ${def}`);
    for (const def of TERSE_DEFS) assert.ok(!rev4Text.includes(def), `rev4 still has ${def}`);
    // reader-independence + byte-lock
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    assert.ok(!historyFinalText(withPoison).includes("POISONED"));
    const finalText = historyFinalText(without);
    assert.equal(finalText.split("\n").length, 196);
    assert.equal(finalText.length, 5263);
    assert.equal(finalText, S25_GEO_CORE_FINAL);
    assert.ok(finalText.includes("def bounding_box(")); // N replayed on renamed base
});
```

**Test 3 — `tests/test_geo_core.py`: 2-rev ladder, beacon user-edit, reader-INDEPENDENT, byte-lock.**
> *Why:* locks §2.3 (test) + §2.5 — the purest single-beacon file (write → beacon, no later edits).
```typescript
test("test_S25_test_geo_core_two_revs_userEdit_reader_independent_bytelock", () => {
    const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
    const without = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL)).surviving, "/test_geo_core.py");
    const withPoison = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL), poison).surviving, "/test_geo_core.py");
    assert.deepEqual(without.revisions.map((r) => r.kind), [EventKind.write, EventKind.userEdit]);
    assert.equal(without.revisions[1]!.changeId.toString(), "fcaacf80-7df6-4625-820b-25520527a7a3");
    assert.equal(historyFinalText(without), historyFinalText(withPoison));
    const finalText = historyFinalText(without);
    assert.equal(finalText.split("\n").length, 42);
    assert.equal(finalText.length, 1145);
    assert.equal(finalText, S25_TEST_FINAL);
    assert.ok(finalText.includes("rectangle_area") && !/\bdef area\(/.test(finalText));
});
```

**Test 4 — THE CRUX: `geo_report.py` reader-DEPENDENT 7-rev ladder with the `@v4` backup-seed.**
> *Why:* locks §2.3 (geo_report) + §2.4 — the incomplete 77-line beacon (rev3) + the m6 backup-seed
> `overwrite` (rev4, `a5675d5dd5201ac8@v4`, 95 lines) + the `totals` Edit replayed onto it → 120-line
> final. This is S25's reason for existing.
```typescript
test("test_S25_geo_report_seven_revs_backup_seed_overwrite_then_totals", () => {
    const h = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL), s25Reader).surviving, "/geo_report.py");
    assert.deepEqual(h.revisions.map((r) => r.kind), [
        EventKind.write, EventKind.edit, EventKind.edit,
        EventKind.userEdit, EventKind.overwrite, EventKind.edit, EventKind.edit,
    ]);
    const rev3 = h.revisions[3]!; // incomplete beacon
    assert.equal(rev3.kind, EventKind.userEdit);
    assert.equal(rev3.changeId.toString(), "dd04eabc-2a17-4bc9-bad9-f24de83736bd");
    assert.equal(rev3.lines.length, 77);
    const rev4 = h.revisions[4]!; // m6 backup-seed
    assert.equal(rev4.kind, EventKind.overwrite);
    assert.equal(rev4.changeId.toString(), "a5675d5dd5201ac8@v4");
    assert.equal(rev4.lines.length, 95);
    const finalText = historyFinalText(h);
    assert.equal(finalText.split("\n").length, 120);
    assert.equal(finalText.length, 3810);
    assert.equal(finalText, S25_GEO_REPORT_FINAL);
    assert.ok(finalText.includes("def totals("));        // step-5 Edit replayed on the reseeded base
    for (const def of RENAMED_DEFS) assert.ok(finalText.includes(def));
    for (const def of TERSE_DEFS) assert.ok(!finalText.includes(def));
});
```

**Test 5 — `geo_report.py` reader-dependence is load-bearing (no-reader ≠ ground truth).**
> *Why:* locks §2.5 — without a backup the reseed cannot fire: 6 revisions (no `overwrite`), and the
> final diverges from ground truth. This proves the `@v4` backup is essential (contrast S24, where the
> file was reader-independent).
```typescript
test("test_S25_geo_report_without_reader_is_wrong_no_overwrite_six_revs", () => {
    const h = historyEndingWith(reconstructBranches(loadRecords(S25_JSONL)).surviving, "/geo_report.py");
    assert.equal(h.revisions.length, 6);
    assert.ok(!h.revisions.some((r) => r.kind === EventKind.overwrite));
    assert.notEqual(historyFinalText(h), S25_GEO_REPORT_FINAL); // truncated without the backup
});
```

**Test 6 — `extractFileEvents`: three beacon user-edits, no events from the opaque python run.**
> *Why:* locks §2.2 — the rename is recovered ONLY from the three beacons, not from parsing the Bash
> command (the m3 contrast). The synthetic `overwrite` reseed is NOT an extracted event.
```typescript
test("test_S25_extractFileEvents_three_userEdits_four_writes_six_edits", () => {
    const events = extractFileEvents(loadRecords(S25_JSONL));
    const userEdits = events.filter((e) => e.kind === EventKind.userEdit);
    assert.equal(userEdits.length, 3);
    assert.deepEqual(
        userEdits.map((e) => e.changeId.toString().slice(0, 8)).sort(),
        ["755a78dd", "dd04eabc", "fcaacf80"],
    );
    assert.equal(events.filter((e) => e.kind === EventKind.write).length, 4);   // B,C,D,H
    assert.equal(events.filter((e) => e.kind === EventKind.edit).length, 6);    // E,F,G,L,M,N
    assert.equal(events.filter((e) => e.kind === EventKind.overwrite).length, 0); // reseed is synthetic
    assert.equal(events.filter((e) => e.kind === EventKind.append).length, 0);
});
```

**TDD for this char-lock (per the tdd guide):**
1. Write all 6 tests; run `node --import tsx --test tests/reconstruction_engine_s25.test.ts` — expect
   all 6 GREEN immediately (engine already correct).
2. **Prove the crux locks bite** (record each RED→GREEN in impl-notes, then revert):
   - Test 2: change the expected changeId `755a78dd…` → `deadbeef…` → MUST go RED. Restore.
   - Test 4: change the `overwrite` changeId `a5675d5dd5201ac8@v4` → `wrong@v9` → MUST go RED. Restore.
   - Test 4: change `S25_GEO_REPORT_FINAL` by one character → MUST go RED. Restore.
   - Test 5: temporarily assert `historyFinalText(h) === S25_GEO_REPORT_FINAL` → MUST go RED (proving
     the no-reader path is genuinely wrong / backup is load-bearing). Restore.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_s25.test.ts`, 6 tests)

Create the file. Mirror `tests/reconstruction_cli_s24.test.ts` / `reconstruction_cli_m7.test.ts`:
import `runCli` and `S25_JSONL`, call the REAL CLI (it builds the real sidecar reader, so
`geo_report.py` reconstructs correctly). Assert against the exact byte strings in §2.7.

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/reconstruction_cli.ts";
import { S25_JSONL } from "./fixtures.ts";

// Slice one file's `--verbose` section: from its `### …/<suffix>` header to the next `### ` or EOF.
// Disambiguates the overlapping `revision N` numbers across files (geo_core & geo_report both reach 6/7).
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

**Test 1 — default conversationDAG: the three script-rename beacons as user-edit turns; linear.**
```typescript
test("test_S25_default_conversationDAG_shows_three_script_rename_user_edits", () => {
    const out = runCli([S25_JSONL]);
    assert.ok(out.includes("══ conversationDAG ══"));
    assert.ok(out.includes("A  prompt  #6c99d0f7"));
    assert.ok(out.includes("  H  write      rename_geo.py     #01133d7F"));
    assert.ok(out.includes("  I  user-edit  geo_report.py     #dd04eabc"));
    assert.ok(out.includes("  J  user-edit  geo_core.py       #755a78dd"));
    assert.ok(out.includes("  K  user-edit  test_geo_core.py  #fcaacf80"));
    assert.ok(out.includes("  L  edit       geo_report.py     #01SEtJ2G"));
    assert.ok(!out.includes("branch ")); // linear — no rewind
});
```

**Test 2 — default fileDAG groups each file's events (overwrite reseed is NOT a node).**
```typescript
test("test_S25_default_fileDAG_groups_each_file_events", () => {
    const out = runCli([S25_JSONL]);
    assert.ok(out.includes("══ fileDAG ══"));
    assert.ok(out.includes(
        "geo_core.py\n  B  write      #01THW3x6\n  E  edit       #01D1xvSR\n  F  edit       #01FUSAse\n  J  user-edit  #755a78dd\n  M  edit       #0187Nojk\n  N  edit       #01EFcMWD",
    ));
    assert.ok(out.includes(
        "geo_report.py\n  C  write      #019B3GDX\n  G  edit       #01TG3Gfc\n  I  user-edit  #dd04eabc\n  L  edit       #01SEtJ2G",
    ));
    assert.ok(out.includes("test_geo_core.py\n  D  write      #01JaqY5L\n  K  user-edit  #fcaacf80"));
    assert.ok(out.includes("rename_geo.py\n  H  write      #01133d7F"));
});
```

**Test 3 — list-branches: one surviving, four files, no rewound.**
```typescript
test("test_S25_list_branches_single_surviving_four_files", () => {
    const out = runCli([S25_JSONL, "--list-branches"]);
    assert.ok(out.includes("surviving  tip #e3b43fcc"));
    for (const f of ["geo_core.py", "geo_report.py", "test_geo_core.py", "rename_geo.py"]) {
        assert.ok(out.includes(f), `missing ${f}`);
    }
    assert.ok(!out.includes("rewound"));
});
```

**Test 4 — verbose `geo_core.py`: exactly eight revisions; renamed defs; no terse.**
```typescript
test("test_S25_verbose_geo_core_eight_revisions_renamed", () => {
    const block = fileVerboseBlock(runCli([S25_JSONL, "--surviving", "--verbose"]), "/geo_core.py");
    assert.ok(block.includes("revision 7  @"));
    assert.ok(!block.includes("revision 8"));            // exactly eight
    assert.ok(block.includes("| def rectangle_area(") && block.includes("| def box_volume("));
    assert.ok(block.includes("| def bounding_box("));
    assert.ok(!block.includes("| def area(") && !block.includes("| def vol("));
});
```

**Test 5 — verbose `geo_report.py`: exactly seven revisions; final has `totals` + renamed; no terse.**
> *Why:* locks §2.7 — the backup-seeded base lets the `totals` Edit render; seven revisions (rev4 is
> the 95-line reseed, shown as content only).
```typescript
test("test_S25_verbose_geo_report_seven_revisions_totals_renamed", () => {
    const block = fileVerboseBlock(runCli([S25_JSONL, "--surviving", "--verbose"]), "/geo_report.py");
    assert.ok(block.includes("revision 6  @"));
    assert.ok(!block.includes("revision 7"));            // exactly seven
    assert.ok(block.includes("(120 lines)"));            // final
    assert.ok(block.includes("| def totals("));
    assert.ok(block.includes("| def summary_line(") && block.includes("rectangle_area"));
    assert.ok(!block.includes("| def area(") && !block.includes("| def vol("));
});
```

**Test 6 — verbose `tests/test_geo_core.py`: exactly two revisions; renamed final.**
```typescript
test("test_S25_verbose_test_geo_core_two_revisions_renamed", () => {
    const block = fileVerboseBlock(runCli([S25_JSONL, "--surviving", "--verbose"]), "/test_geo_core.py");
    assert.ok(block.includes("revision 1  @"));
    assert.ok(!block.includes("revision 2"));            // exactly two
    assert.ok(block.includes("rectangle_area"));
    assert.ok(!/\| def area\(/.test(block));
});
```

**TDD:** run `node --import tsx --test tests/reconstruction_cli_s25.test.ts` — expect all 6 GREEN.
**Prove liveness** (record in impl-notes, then revert): change a unique assertion (e.g. `#dd04eabc` →
`#deadbeef` in Test 1, or `def totals(` → `def TOTALS(` in Test 5) → confirm RED, then restore.

---

## 7. Task 4 — Docs (3 edits + the fixture from Task 1)

**7.1 `plans/roadmap.md`** — add a NEW `S25` line after the `S24` line. It MUST state: multi-file
script-driven rename via one `python3 rename_geo.py` Bash run (no Edit/Write for the three files);
recovered via **three** `edited_text_file` beacons (one per file) as `user-edit` revisions; the two
`python3` runs are OPAQUE (0 file events, the m3 contrast); **mixed reader-dependence** —
`geo_core.py`/`test_geo_core.py` reader-INDEPENDENT (S24-style), `geo_report.py` reader-DEPENDENT (its
beacon is an incomplete 77-line snapshot, so the m5/m6 backup-seed `a5675d5dd5201ac8@v4` supplies the
95-line base for the later `totals` Edit); linear (one surviving branch, tip `#e3b43fcc`, 4 files);
engine ALREADY correct (characterization LOCK, NO src change); 12 new tests (6 engine + 6 CLI); 359
green; S1–S24 + m1–m7 byte-for-byte unchanged. Cite the HAS-BEACON rule (`script-handling.txt`).

**7.2 `plans/implementation-notes-api-from-scenarios.md`** — PREPEND a new top entry (above the S24
entry), header form:
`## <YYYY-MM-DD:HH:MM:SS> — S25 reconstruction (multi-file script rename via Bash python3) — COMPLETE; characterization/regression LOCK, NO src change; 359 tests green`
Include: `### What S25 is` (the §1 ladder), `### Mixed reader-dependence` (the §1.3 table + why
`geo_report`'s incomplete beacon forces the backup-seed), `### Why no engine change` (the §3 map —
emphasize the m5/m6 reseed is REUSED, not new), `### The HAS-BEACON refinement` (beacon present ≠
beacon-alone-suffices when a later Edit's base is the disk state, not the beacon),
`### RED→GREEN liveness` (the §5/§6 probes), `### Tradeoffs` (geo_core/test engine tests are
reader-free with a poison guard; geo_report uses a hermetic `@v4` backup map mirroring m7; CLI tests
use the real sidecar reader mirroring m3/m7).

**7.3 `plans/reconstruction-engine-design.md`** — APPEND a short S25 note after the S24 note: S25 =
first MULTI-FILE script-driven beacon trigger (3 beacons from one Bash run) and first scenario where a
HAS-BEACON file (`geo_report`) needs the backup reader (incomplete beacon → m6 backup-seed bridges to
a later Edit). Reader-mixed; engine unchanged. Cite `userEditEventFrom` and `seedEditBaseFromBackup`/
`backupSeedWriteFor`/`findBackupPointAfter`.

---

## 8. Task 5 — Full verification

```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
node --import tsx --test tests/reconstruction_engine_s25.test.ts   # 6 green
node --import tsx --test tests/reconstruction_cli_s25.test.ts      # 6 green
npm test          # expect 359 pass / 0 fail
npx tsc --noEmit  # expect: No errors found
git diff --stat src/   # expect EMPTY — S25 adds NO src change
```
If `git diff src/` is non-empty, you violated the lock contract — revert the src change and re-derive
(the engine was already correct). NOTE: the tree already carries an unrelated `src/Plan_Impl_template.md`
modification (present before S25) — that is NOT yours; never stage it.

---

## 9. Task 6 — Commit (on user approval ONLY) then HAND OFF

**Do not commit without explicit user approval** (project rule: one commit per scenario, gated). On
approval, stage EXACTLY these files (never `git add -A` — the tree carries the unrelated
`src/Plan_Impl_template.md` edit and `plans/s24/`):
```
tests/fixtures.ts
tests/reconstruction_engine_s25.test.ts
tests/reconstruction_cli_s25.test.ts
plans/roadmap.md
plans/implementation-notes-api-from-scenarios.md
plans/reconstruction-engine-design.md
```
Commit message: `Implemented S25 handling` (+ the standard Co-Authored-By / Claude-Session trailers).
Decide separately whether to also commit the new `plans/s25/` (plan + handoffs).

**create handoff** — after implementation is verified (and regardless of commit), write a COMPLETION
handoff via the `/jot:handoff-prompt` skill into `plans/s25/`. It must record: 359 green / tsc clean /
NO src change; the crux locks proven RED→GREEN; the mixed-reader-dependence framing (geo_report's
incomplete beacon → m6 backup-seed); and the next scenario: **`scenarios/s26-script-rename-csv-map.txt`**
(check `scenarios/` — s26–s38 are defined). Arm the downstream monitor on the S25 completion handoff.

---

## 10. Acceptance criteria (Definition of Done)
- [ ] `tests/fixtures.ts` has `S25_JSONL` (Desktop path) appended after `S24_JSONL`.
- [ ] `tests/reconstruction_engine_s25.test.ts` — 6 tests, all green: branch shape (4 files, no
      rewound); `geo_core.py` 8-rev ladder, rev4 userEdit `755a78dd…`, reader-independent, byte-locked
      to 196 ln / 5263 ch; `tests/test_geo_core.py` 2-rev, rev1 userEdit `fcaacf80…`, byte-locked to
      42 ln / 1145 ch; `geo_report.py` 7-rev ladder with the `overwrite` backup-seed
      (`a5675d5dd5201ac8@v4`, 95 ln) + `totals`, byte-locked to 120 ln / 3810 ch; geo_report no-reader
      is wrong (6 revs, no overwrite); `extractFileEvents` = 3 user-edits / 4 writes / 6 edits.
- [ ] Crux locks proven to bite (RED when changeId / overwrite key / final literal / no-reader
      assertion is altered).
- [ ] `tests/reconstruction_cli_s25.test.ts` — 6 tests, all green: conversationDAG shows the 3
      user-edit turns; fileDAG groups all 4 files; single surviving tip `#e3b43fcc`; verbose geo_core
      8 revs, geo_report 7 revs (`totals` + renamed), test 2 revs; no terse headers leak.
- [ ] `npm test` = **359 pass / 0 fail**; `npx tsc --noEmit` clean.
- [ ] `git diff src/` is **EMPTY** — S25 adds no `src/` change.
- [ ] roadmap S25 line added; impl-notes entry prepended; design.md S25 note appended.
- [ ] Committed (exact 6-file list) only after user approval, message `Implemented S25 handling`.
- [ ] **Completion handoff written via `/jot:handoff-prompt`** into `plans/s25/` (names the next
      scenario `s26-script-rename-csv-map` and arms the downstream monitor).
