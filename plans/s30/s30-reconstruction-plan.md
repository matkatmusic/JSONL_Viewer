# Reconstruction Plan — Scenario **S30** (`s30-script-rename-count-mismatch`)

> **MUST READ FIRST:** [`plans/script-handling.txt`](../script-handling.txt) — the
> HAS-BEACON vs NO-BEACON / forward-validation premise every script-rename scenario
> rests on.

> **VERDICT: this is a CHARACTERIZATION / REGRESSION LOCK — NO ENGINE SOURCE CHANGE.**
> S30 already reconstructs **all 4 files byte-for-byte** on the current
> (post-S28 / post-S29) engine. Every value below was **verified live** during
> planning with the real sidecar reader, plus three mutation probes proving exactly
> one stage is load-bearing. The implementer adds **one fixture + one engine test
> file + one CLI test file + 3 doc edits** and changes **zero** lines of `src/`.

---

## 1. Goal

Lock S30's byte-perfect reconstruction and prove which existing engine code makes
it work, so a future change that breaks the partial-apply / elided-beacon
composition is caught.

### 1.1 What S30 is

S30 (`scenarios/s30-script-rename-count-mismatch.txt`) builds a pricing module and
renames functions across it with a **CSV-driven, count-guarded** script that
**conditionally refuses** one of its two renames:

1. Claude **writes** `pricing.py` (~100-line pricing module: `base_price`,
   `net_price`, `bulk_price`, `round_price`, `tax_price`; `base_price` referenced
   several times) and `tests/test_pricing.py` (covers `base_price` + `round_price`).
2. Claude **edits** `pricing.py` to add `quote(item)` (calls `base_price` then
   `round_price`). *(The engine renders this as two `edit` revisions, §2.3.)*
3. Claude **writes** `count_renames.csv` — header `old,new,count` and **two rows**:
   one row renaming `round_price`→`round_to_cents` with the **CORRECT** count, and
   one row renaming `base_price`→`unit_price` with a **deliberately WRONG** count
   (off by one).
4. Claude **writes** `safe_rename.py` and **runs it with `python3` via the Bash
   tool**. For each CSV row the script counts whole-word occurrences of `old` in
   `pricing.py`; **iff** the count equals the row's count it applies the rename to
   **both** `pricing.py` and `tests/test_pricing.py`, **else** it prints a
   `MISMATCH` line and leaves that name unchanged everywhere (no partial write).
5. Claude **confirms** the output shows `MISMATCH` for the `base_price` row.
6. Claude **edits** `pricing.py` to add `receipt(item)` (calls `round_to_cents`) —
   a *post-rename* Edit.
7. "Thanks." / Exit.

### 1.2 The count-mismatch outcome (the headline property)

`count_renames.csv` (the off-by-one proof, verified live):

```
old,new,count
round_price,round_to_cents,8
base_price,unit_price,10
```

- `round_price` whole-word count in `pricing.py` at script time = **8** → matches →
  **APPLIED** to `pricing.py` and `tests/test_pricing.py`.
- `base_price` whole-word count = **11**, but the CSV says **10** → off-by-one →
  **`MISMATCH` → REFUSED** → `base_price` is **kept** in every file and
  `unit_price` is **never produced anywhere**.

### 1.3 Why S30 needs NO engine fix — it is the S28 elided path + a refusal that costs nothing

The single Bash run emits **two `edited_text_file` beacons** (one per file the
script actually rewrote — both `pricing.py` and `tests/test_pricing.py`, because the
`round_price` rename *did* apply to both). The engine reconstructs each file **from
its beacon**, never by re-deriving the rename — so the refusal of
`base_price`→`unit_price` is captured **for free**: the beacons already show
`base_price` retained, and nothing in the pipeline can fabricate `unit_price`.

| File | Beacon | Shape | Handled by | Reader-dependence |
|---|---|---|---|---|
| `pricing.py`           | user-edit `#9a1c303d`, 155 lines, contiguous | **COMPLETE** (file is 155 lines at that point) | adopted verbatim; the later `receipt` Edit replays on top | **reader-INDEPENDENT** |
| `tests/test_pricing.py`| user-edit `#388074da`, 39 lines with a bare `...` (lines 19–20 elided) | **ELIDED / WINDOWED** (file is 40 lines) | `completeElidedBeacons` (S28) | **reader-DEPENDENT** |

`count_renames.csv` and `safe_rename.py` get **no beacon** (they are not renamed by
the script) and reconstruct from their `write` events alone — reader-independent.

Because S28's `completeElidedBeacons` is already in the engine (uncommitted in the
working tree — see §1.5), the elided test-file beacon is completed from a
content-validated file-history backup and **all 4 files reconstruct byte-identically**.
There is nothing new for the engine to learn; S30 is the **regression test** that the
elided path + a conditional refusal + a complete beacon followed by a downstream
Edit all compose under one count-guarded script run.

### 1.4 New structural wrinkles S30 exercises (none needs new code)

- **Conditional / partial script application** — first script-rename scenario where
  the script's own logic **declines** part of its work (`base_price`→`unit_price`
  refused). The lock proves the engine **never fabricates** the refused rename and
  **keeps `base_price`** in both files. This is the structural inverse of S29's
  vendor control (there: no-beacon files keep the old name; here: a beacon-bearing
  file keeps the *refused* name while the *applied* rename shows through).
- **A COMPLETE beacon on a renamed file that then receives a downstream Edit**
  (`pricing.py`: complete 155-line beacon, then the `receipt` Edit → 170 lines).
  This makes `pricing.py` fully reader-independent — proven by Probe C (§2.6):
  `seedStaleEditBases` is **inert** here; the `receipt` Edit replays directly off the
  complete beacon.
- **Same-line-count version selection on the elided file** — the chosen backup for
  `tests/test_pricing.py` is `@v3` (40 lines, post-rename `round_to_cents`), picked
  over `@v2` (also 40 lines, pre-rename `round_price`) **by content, not recency**.

### 1.5 Engine baseline (READ THIS BEFORE RUNNING ANYTHING)

The S28 fix (`completeElidedBeacons`) and the S29 char-lock tests are **present but
UNCOMMITTED** in the working tree (HEAD = `cededae`; S1–S27 + m1–m7 committed). The
pipeline order in `src/reconstruction_branches.ts:54-56` is:

```
const unelided = reader ? completeElidedBeacons(records, based, reader) : based;       // S28
const restaged = reader ? seedStaleEditBases(records, unelided, reader) : unelided;    // S19/S23
const completed = reader ? completeTruncatedBeacon(records, restaged, reader) : restaged; // S27
```

All values in this plan were measured **with that work present**. If `npm test`
does not report **412 passing**, STOP — the baseline is wrong and every measurement
below is invalid. Do **not** commit the S28/S29 work here (their implementers own
those commits); just build on top of it.

---

## 2. Ground truth (VERIFIED LIVE — real sidecar reader)

Branch shape: **LINEAR** — `surviving.length === 4`, `rewound.length === 0`,
surviving tip **`#e61d0ae0`**, prompt **`#b2ad40c6`**.

### 2.1 Scenario source & inputs

- Scenario script: `scenarios/s30-script-rename-count-mismatch.txt`
- Executed transcript + rendered files (BOTH the worktree copy and the Desktop
  store contain the full rendered set — `pricing.py`, `tests/test_pricing.py`,
  `count_renames.csv`, `safe_rename.py`; **no ground-truth gap**, unlike S29):
  `scenarios/executed/s30-script-rename-count-mismatch/`
- **JSONL (canonical Desktop store, matching S24–S29):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s30-script-rename-count-mismatch/29634d79-a1f4-4a26-9a2d-0c79798e42e7.jsonl`
- File-history backups for this session:
  `~/.claude/file-history/29634d79-a1f4-4a26-9a2d-0c79798e42e7/`

### 2.2 The two beacons (`attachment.type = edited_text_file`)

| File | beacon changeId | snippet lines | shape |
|---|---|---|---|
| `tests/test_pricing.py` | `388074da-0a6d-4101-9a05-23e94cc67521` | 1–40 with a bare `...` (lines 19–20 elided → 39 printed) | **elided** |
| `pricing.py`            | `9a1c303d-6cd9-4050-a1ec-2fa6be62d728` | 1–155 contiguous | **complete** |

`count_renames.csv` and `safe_rename.py` have **no beacon**.

### 2.3 Reconstructed revision ladders (VERIFIED LIVE, real reader) + final byte lengths

The "believed final text" of a history = each line's latest value, `\n`-joined (the
engine drops one trailing newline at replay, so it equals the rendered file minus
its trailing `\n`).

| File | Final bytes | Revision-kind ladder (changeId, line count) |
|---|---|---|
| `pricing.py` | **5863** | `write #01TYChTi (140L)`, `edit #01Gb6PRJ (141L)`, `edit #017QLHmt (155L)`, `user-edit #9a1c303d (155L)`, `edit #01RonDvN (170L)` |
| `tests/test_pricing.py` | **1035** | `write #011voEjh (40L)`, `user-edit #388074da (39L)`, `overwrite #b1770edab554937c@v3 (40L)` |
| `count_renames.csv` | **67** | `write #014iwvDL (3L)` |
| `safe_rename.py` | **2252** | `write #01FMppx9 (68L)` |

> The two consecutive `edit` revisions on `pricing.py` (`#01Gb6PRJ` 141L, `#017QLHmt`
> 155L) are the `quote()` step rendered as two intermediate revisions. The final
> `edit #01RonDvN` (170L) is the `receipt()` step. Lock the ladder exactly as shown.
> `tests/test_pricing.py`'s `overwrite` is the **synthetic** revision injected by
> `completeElidedBeacons`; its `changeId` is the backup key `b1770edab554937c@v3`.

### 2.4 Version selection is by CONTENT, not recency (the elided crux)

`tests/test_pricing.py`'s synthetic `overwrite` is seeded from a **content-validated**
backup, and the chosen version is **NOT** the only candidate:

- `b1770edab554937c@v2` — 40 lines, 1012 bytes, **pre-rename** (`round_price`×8,
  `base_price`×5). **REJECTED.**
- `b1770edab554937c@v3` — 40 lines, 1036 bytes, **post-rename** (`round_to_cents`×8,
  `base_price`×5). **CHOSEN.** The elided beacon's surviving window shows
  `round_to_cents` and `base_price`, so `@v2` fails validation and `@v3` is selected
  even though both are the **same 40-line length**.

Note **both** candidates keep `base_price`×5 — the refused rename never appears in
any backup, so there is no version in which `unit_price` exists.

### 2.5 Reader-dependence & poison matrix (VERIFIED LIVE — the regression guard)

`without` = `reconstructBranches(records)` (no reader); `poison` = a reader that
returns the constant `"POISONED-BACKUP-SHOULD-NOT-BE-USED"` for every key.

| File | correct (real reader) | WITHOUT reader | POISON reader |
|---|---|---|---|
| `pricing.py` | 5863, `round_to_cents`+`base_price`+`receipt`, no `unit_price` | **5863 (identical)** | **5863 (identical)** |
| `count_renames.csv` | 67 | **67 (identical)** | **67 (identical)** |
| `safe_rename.py` | 2252 | **2252 (identical)** | **2252 (identical)** |
| `tests/test_pricing.py` | 1035 | 977 (`...` survives, WRONG) | 977, no overwrite, **no leak** |

Reader-**INDEPENDENT** (correct without any reader): `pricing.py` (complete beacon +
replayed `receipt` Edit), `count_renames.csv`, `safe_rename.py`.
Reader-**DEPENDENT**: `tests/test_pricing.py` only.

> **NO poison leak anywhere** — a clean matrix (unlike S29's `pkg/b.py`). S30 never
> exercises `seedStaleEditBases`, so no degenerate-reader content can reach any
> file. Every file is poison-stable.

### 2.6 Load-bearing proof (mutation probes, VERIFIED LIVE during planning)

Each probe: neutralize one pipeline stage in `reconstruction_branches.ts`, re-run
the reconstruction, diff every file's final text against the known-good baseline,
restore from `/tmp/s30-branches.bak`.

- **Probe A — neutralize `completeElidedBeacons` (line 54 → `const unelided =
  based;`):** diverged = **`tests/test_pricing.py` only** (1035 → 977, ladder drops
  to `[write, user-edit]`, a `...` line survives). **This is the sole crux.**
- **Probe B — neutralize `completeTruncatedBeacon` (line 56 → `const completed =
  restaged;`):** **nothing diverged** — S30 has no truncated beacon.
- **Probe C — neutralize `seedStaleEditBases` (line 55 → `const restaged =
  unelided;`):** **nothing diverged** — `pricing.py`'s `receipt` Edit replays
  directly off the complete beacon; the stale-edit-base path is inert for S30.

So the **only** load-bearing stage is **`completeElidedBeacons` (S28)**, and only for
`tests/test_pricing.py`. That is the exact mutation the crux lock test (§5 T3) must
turn RED. Source was restored byte-identically after all three probes
(`diff /tmp/s30-branches.bak src/reconstruction_branches.ts` → identical).

### 2.7 Raw event stream (`extractFileEvents`)

`writes = 4`, `edits = 3`, `userEdits = 2`, `overwrites = 0`. The two user-edit
changeIds (8-char): `388074da`, `9a1c303d`. **`overwrites = 0`** — the synthetic
`overwrite` in §2.3 is a reconstructed *revision*, never an extracted *event*, so it
never leaks into the event stream or the graph views.

---

## 3. NO engine change — confirm, do not edit `src/`

There is **no §3 "engine fix"** as in S27/S28. The Definition of Done requires
**zero S30-authored `src/` change**. The tree is **not** clean at S30 start: the
uncommitted S28 work (`src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`,
`_user_edit.ts`) and the `src/Plan_template.md` / `src/Impl_template.md` edits are
already present. So the check is **not** "empty diff" — it is "**no change beyond the
S30-start baseline**":

```sh
# FIRST thing, before any edits:
git diff src/ > /tmp/s30-src-before.diff
# …after all S30 work…
diff /tmp/s30-src-before.diff <(git diff src/)   # MUST be identical (no new src hunks)
```

If any lock test fails, the fix is in the **test literal/reader**, never in `src/`.
(If a genuine engine gap were found, STOP and escalate — planning proved there is
none.)

---

## 4. Task 1 — Baseline & fixture (do first)

1. `cd` to the worktree. Run `npm test` → **must be 412 pass / 0 fail** and
   `npx tsc --noEmit` clean. If not 412, STOP (see §1.5).
2. Add to `tests/fixtures.ts`, immediately after `S29_JSONL`, following the exact
   existing style (Desktop canonical path):

   ```ts
   export const S30_JSONL =
       "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s30-script-rename-count-mismatch/29634d79-a1f4-4a26-9a2d-0c79798e42e7.jsonl";
   ```

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_s30.test.ts`)

**TDD for a char-lock:** write each test; it passes GREEN immediately (it locks
current behaviour). Then prove the crux is load-bearing by the §2.6 Probe-A mutation
(RED), and restore (GREEN). Do the mutation proof for the crux test T3 explicitly
(§9).

Model the file on `tests/reconstruction_engine_s29.test.ts`: reuse the
`finalTextOf` / `historyFinalText` / `historyEndingWith` / `stripTrailingNewline`
helpers verbatim, `loadRecords` from `./utilities.ts`, `S30_JSONL` from
`./fixtures.ts`, and a `readGroundTruth` reader rooted at the rendered store. **Every
file has a rendered ground truth (no S29-style gap)**, so all expected values come
from the rendered files — a real cross-source check.

```ts
const S30_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s30-script-rename-count-mismatch";
// readGroundTruth(rel) → readFileSync(`${S30_GT}/${rel}`, "utf8")
const S30_PRICING_FINAL = stripTrailingNewline(readGroundTruth("pricing.py"));            // 5863
const S30_TEST_FINAL = stripTrailingNewline(readGroundTruth("tests/test_pricing.py"));    // 1035
const S30_CSV_FINAL = stripTrailingNewline(readGroundTruth("count_renames.csv"));         // 67
const S30_RENAME_FINAL = stripTrailingNewline(readGroundTruth("safe_rename.py"));         // 2252
```

**Readers** — the real on-disk sidecar reader for the chosen-version path, plus
`without` and `poison` for the guards. Use `createSidecarReader` exactly as the CLI
does (`buildSidecarReader`), or the rendered-file hermetic pattern from the S29
engine test. Either way the chosen `overwrite` must resolve to
`b1770edab554937c@v3`:

```ts
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
```

Write these **six** tests (all values from §2; use `EventKind` members, never bare
strings):

- **T1 `test_S30_linear_four_surviving_no_rewound`** — `reconstructBranches(…,
  reader)`: `rewound.length === 0`, `surviving.length === 4`, and every one of these
  suffixes is present: `/pricing.py`, `/tests/test_pricing.py`, `/count_renames.csv`,
  `/safe_rename.py`.

- **T2 `test_S30_refused_rename_never_fabricates_unit_price`** — THE headline lock.
  With the real reader, for **both** `/pricing.py` and `/tests/test_pricing.py`:
  `historyFinalText` includes the whole word `base_price`, **excludes** the whole
  word `unit_price`, and includes `round_to_cents`. Assert `unit_price` is absent
  with a word-boundary regex (`/\bunit_price\b/`), and `round_price` is absent as a
  whole word in both finals (the applied rename is complete). This is the
  count-mismatch behaviour: applied rename present, refused rename never invented.

- **T3 `test_S30_elided_test_beacon_completed_version_selected_by_content`** — the
  **S28 crux** (mutation: neutralize `completeElidedBeacons` → this test RED, §9).
  With the real reader, for `/tests/test_pricing.py`: ladder
  `[write, user-edit, overwrite]` (kinds via `EventKind`); the `overwrite` `changeId`
  equals **`b1770edab554937c@v3`** (chosen over the same-40-line `@v2` — the
  content-validation lock) and its `lines.length === 40`; `historyFinalText` equals
  `S30_TEST_FINAL` and its length is **1035**; includes `round_to_cents` and
  `base_price`; excludes whole-word `round_price`; and **no line equals `"..."`**.

- **T4 `test_S30_elided_test_beacon_without_reader_is_wrong`** — the S28 guard.
  WITHOUT reader, `/tests/test_pricing.py`: ladder `[write, user-edit]` (no
  overwrite), `historyFinalText` length **977**, **≠** `S30_TEST_FINAL`, and **some**
  line equals `"..."` (the window survives). With `poison`: still no `overwrite`,
  length 977, contains no `POISONED`. (Locks reader-dependence + no poison leak.)

- **T5 `test_S30_pricing_complete_beacon_reader_independent_bytelock`** — the
  reader-independence lock. For `/pricing.py`, reconstruct three ways — real reader,
  **without** reader, and `poison` — and assert all three `historyFinalText` are
  **identical**, equal `S30_PRICING_FINAL`, length **5863**; the ladder is
  `[write, edit, edit, user-edit, edit]` (via `EventKind`); the final includes
  `round_to_cents`, `base_price`, and `receipt`; excludes whole-word `round_price`
  and `unit_price`; no line equals `"..."`; contains no `POISONED`. (Proves the
  complete beacon + replayed `receipt` Edit need no backup — Probe C, §2.6.)

- **T6 `test_S30_extractFileEvents_two_userEdits_no_overwrite_events`** —
  `extractFileEvents(loadRecords(S30_JSONL))`: filtered by `EventKind`,
  `userEdit`-kind length `=== 2` with sorted 8-char ids `["388074da","9a1c303d"]`;
  `overwrite`-kind length `=== 0` (synthetic seeds never become events);
  `write`-kind length `=== 4`; `edit`-kind length `=== 3`.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_s30.test.ts`)

Model on `tests/reconstruction_cli_s29.test.ts`: `runCli` (the **real** sidecar
reader), `S30_JSONL`, and the `fileVerboseBlock(out, suffix)` slicer verbatim.
Write **six** tests:

- **C1 `test_S30_default_conversationDAG_shows_two_script_rename_user_edits`** —
  `runCli([S30_JSONL])` includes `══ conversationDAG ══`, `A  prompt  #b2ad40c6`,
  and these two user-edit lines (substrings; the two beacons):
  `user-edit  test_pricing.py    #388074da` and
  `user-edit  pricing.py         #9a1c303d`; and `!out.includes("branch ")` (linear,
  no rewind). (Match the spacing produced by the renderer — copy it from a live run,
  see §8.)

- **C2 `test_S30_fileDAG_pricing_five_nodes_test_two_nodes`** — `runCli([S30_JSONL])`
  includes `══ fileDAG ══` and, under `pricing.py`, all five nodes
  `B  write      #01TYChTi`, `D  edit       #01Gb6PRJ`, `E  edit       #017QLHmt`,
  `I  user-edit  #9a1c303d`, `J  edit       #01RonDvN`; and under `test_pricing.py`,
  exactly `C  write      #011voEjh` and `H  user-edit  #388074da` with **no**
  `overwrite` line (the synthetic overwrite is never a DAG node). Also assert the
  `count_renames.csv` and `safe_rename.py` blocks each show a single `write` node.

- **C3 `test_S30_list_branches_single_surviving_four_files`** —
  `runCli([S30_JSONL, "--list-branches"])` includes `surviving  tip #e61d0ae0`, the
  basenames `pricing.py`, `test_pricing.py`, `count_renames.csv`, `safe_rename.py`,
  and `!out.includes("rewound")`.

- **C4 `test_S30_verbose_test_pricing_elided_completed`** —
  `fileVerboseBlock(…, "/tests/test_pricing.py")` shows `revision 2  @` and **not**
  `revision 3`; the final revision slice contains `round_to_cents` and `base_price`,
  no whole-word `round_price`, and **no** windowed line matching `/\|\s*\.\.\.\s*$/`
  (the elision was completed). (CRUX, rendered view.)

- **C5 `test_S30_verbose_pricing_receipt_and_refusal`** —
  `fileVerboseBlock(…, "/pricing.py")` shows `revision 4  @` and **not** `revision 5`;
  the final revision slice contains `round_to_cents`, `base_price`, and `def receipt(`,
  and does **not** contain `unit_price` or whole-word `round_price`.

- **C6 `test_S30_csv_records_off_by_one_and_no_unit_price_in_code`** — the refusal's
  paper trail. `fileVerboseBlock(…, "/count_renames.csv")` contains the literal row
  `base_price,unit_price,10` (the deliberately wrong count that caused the refusal)
  and `round_price,round_to_cents,8`. Separately assert that **neither** the
  `pricing.py` nor the `test_pricing.py` verbose block contains `unit_price` — the
  rename named in the CSV was refused and never reached any reconstructed code.

---

## 7. Task 4 — Docs (3 edits)

Mirror the S29 doc edits:

1. `plans/roadmap.md` — add the S30 line: char-lock, no src change, 412→**424**
   (6 engine + 6 CLI), "first script-rename scenario where the script **conditionally
   refuses** a rename (count mismatch): the applied rename (`round_price`→
   `round_to_cents`) shows through both files while the refused rename
   (`base_price`→`unit_price`) is never fabricated; the S28 elided-beacon completion
   handles the test file and a complete beacon + downstream `receipt` Edit makes
   `pricing.py` reader-independent — byte-perfect, no engine change."
2. `plans/implementation-notes-api-from-scenarios.md` — full S30 entry: the two-beacon
   taxonomy (§2.2), the count-mismatch outcome (§1.2), the §2.4 content-not-recency
   version selection (same-40-line `@v3` over `@v2`), the §2.5 reader/poison matrix
   (clean — no leak), and the §2.6 three-probe result (sole crux =
   `completeElidedBeacons`; `seedStaleEditBases` and `completeTruncatedBeacon` inert).
3. `plans/reconstruction-engine-design.md` — one S30 design note: S30 adds no code;
   it is the regression lock for `completeElidedBeacons` under a conditional /
   partial-apply script run, plus the reader-independence of a complete beacon
   followed by a downstream Edit.

---

## 8. Task 5 — Full verification

```sh
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 424 pass / 0 fail  (412 baseline + 6 engine + 6 CLI)
npx tsc --noEmit         # No errors found
node --import tsx --test tests/reconstruction_engine_s30.test.ts   # 6 green
node --import tsx --test tests/reconstruction_cli_s30.test.ts      # 6 green
diff /tmp/s30-src-before.diff <(git diff src/)   # identical → zero S30 src change (see §3)
git status               # S30-authored: tests/fixtures.ts (mod), 2 new test files,
                         #       3 plans/*.md (mod), plans/s30/ (untracked);
                         #       PLUS the pre-existing uncommitted S28/S29 files
```

For the C1/C2/C4/C5 exact-spacing assertions, capture the live renderer output once
and copy substrings from it (do not hand-count spaces):

```sh
node --import tsx src/reconstruction_cli.ts \
  "scenarios/executed/s30-script-rename-count-mismatch/29634d79-a1f4-4a26-9a2d-0c79798e42e7.jsonl" \
  2>/dev/null
node --import tsx src/reconstruction_cli.ts \
  "scenarios/executed/s30-script-rename-count-mismatch/29634d79-a1f4-4a26-9a2d-0c79798e42e7.jsonl" \
  --verbose 2>/dev/null
```

---

## 9. Task 6 — Prove the crux lock is load-bearing (mutation, then restore)

Char-lock tests must demonstrably catch regressions. Run Probe A from §2.6,
confirming RED, then restore `src/reconstruction_branches.ts` to its exact prior
bytes (back it up first; the file is uncommitted S28 work, so `git checkout` will
NOT restore it):

1. `cp src/reconstruction_branches.ts /tmp/s30-branches.bak`
2. Edit line 54 → `const unelided = based;` → run
   `node --import tsx --test tests/reconstruction_engine_s30.test.ts` → **T3 RED**
   (T1/T2/T4/T5/T6 stay green; T4 already asserts the no-reader 977 state). Restore
   from `/tmp/s30-branches.bak`.
3. (Optional, documents the negative result) Edit line 56 → `const completed =
   restaged;` and line 55 → `const restaged = unelided;` each in turn → the engine
   test stays **all green** (Probes B and C, §2.6 — neither stage is load-bearing for
   S30). Restore after each.
4. `diff /tmp/s30-branches.bak src/reconstruction_branches.ts` → identical;
   `npm test` → 424 green; `git diff --stat src/` shows only the pre-existing S28
   files.

Record the RED→GREEN result in the completion handoff.

---

## 10. Task 7 — Commit (USER APPROVAL ONLY) then HAND OFF

1. **Commit is USER-APPROVAL-ONLY.** `git status` first. Stage **exactly**:
   `tests/fixtures.ts`, `tests/reconstruction_engine_s30.test.ts`,
   `tests/reconstruction_cli_s30.test.ts`, `plans/roadmap.md`,
   `plans/implementation-notes-api-from-scenarios.md`,
   `plans/reconstruction-engine-design.md`, and `plans/s30/` (this plan + the
   handoff). **NEVER `git add -A`.** Do **NOT** stage `src/*` (there must be no src
   change), nor `src/Plan_template.md`, `src/Impl_template.md`, `monitor-handoff.sh`,
   `plans/monitor-handoff-spec.md`, or any uncommitted S28/S29 files. **COORDINATION
   HAZARD:** the three doc files ALSO carry S28/S29 uncommitted doc edits, so staging
   them brings that content too — confirm with the user how to split the S28/S29/S30
   commits before committing. Message: `Implemented S30 handling` + the standard
   Co-Authored-By / Claude-Session trailers.
2. **CREATE HANDOFF** with `/jot:handoff-prompt`. Put `MUST READ:
   plans/script-handling.txt` near the top after the header. Title must contain
   `Scenario s30 … IMPLEMENTED` (so the s31 planner's `monitor-handoff.sh s30 impl`
   fires). Next scenario: **s31** (`s31-script-rename-many-rows`).

---

## 11. Acceptance criteria (Definition of Done)

- `npm test` → **424 / 0**; `npx tsc --noEmit` clean.
- **Zero S30 `src/` change** — `git diff src/` identical to the S30-start baseline
  (§3); no new `reconstruction_*.ts` hunks.
- `tests/reconstruction_engine_s30.test.ts` (6) + `tests/reconstruction_cli_s30.test.ts`
  (6) green; the crux mutation (§9 Probe A) proven RED→GREEN and recorded.
- All 4 files byte-locked to §2.3; the **refused rename is never fabricated**
  (`unit_price` absent, `base_price` kept in both `pricing.py` and
  `tests/test_pricing.py`); `tests/test_pricing.py` version selection (`@v3` over the
  same-40-line `@v2`) locked by `changeId`; `pricing.py` proven reader-independent
  (real == without == poison).
- Every new test uses `EventKind` members (no bare-string discriminants) and
  verb-named helpers, per `plans/coding-requirements.md`.
- Docs (§7) updated; handoff written with the `s30 … IMPLEMENTED` title.
```
