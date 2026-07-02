# Reconstruction Plan — Scenario **S29** (`s29-script-rename-repo-walk`)

> **MUST READ FIRST:** [`plans/script-handling.txt`](../script-handling.txt) — the
> HAS-BEACON vs NO-BEACON / forward-validation premise every script-rename scenario
> rests on.

> **VERDICT: this is a CHARACTERIZATION / REGRESSION LOCK — NO ENGINE SOURCE CHANGE.**
> S29 already reconstructs **all 8 files byte-for-byte** on the current
> (post-S28) engine. Every value below was **verified live** during planning with
> the real sidecar reader, plus two mutation probes proving the locks are
> load-bearing. The implementer adds **one fixture + one engine test file + one CLI
> test file + 3 doc edits** and changes **zero** lines of `src/`.

---

## 1. Goal

Lock S29's byte-perfect reconstruction and prove which existing engine code makes
it work, so a future change that breaks the S27/S28/vendor-skip composition is
caught.

### 1.1 What S29 is

S29 (`scenarios/s29-script-rename-repo-walk.txt`) builds a small Python package
and renames a function across it **with a script that walks the directory tree**:

1. Claude writes a package: `pkg/a.py`, `pkg/b.py`, `pkg/vendor/c.py`, `main.py`,
   `tests/test_pkg.py` (and creates `pkg/__init__.py`, `pkg/vendor/__init__.py`).
   Each non-vendor module defines a function `helper`; the two vendor files also
   define `helper` **as the control that must NOT be renamed**.
2. Claude **edits `pkg/a.py`** (adds `preprocess` calling `helper`) — a *pre-rename*
   Edit.
3. Claude writes `walk_rename.py` and **runs it with `python3` via the Bash tool**.
   The script `os.walk`s the tree, collects every `.py` file **SKIPPING any
   directory named `vendor`**, and whole-word renames `helper` → `compute_value` in
   each collected file. The file list is discovered by walking — not hardcoded.
4. Claude **edits `pkg/b.py`** (adds `pipeline` calling `compute_value`) — a
   *post-rename* Edit.
5. "Thanks." / Exit.

### 1.2 Why S29 needs NO engine fix — it is the composition of S27 + S28 + control

The single Bash run at `T_exec = 2026-06-24T20:05:41.628Z` emits **six
`edited_text_file` beacons** at `20:05:48.798Z` — one per `.py` file the walk
actually rewrote. These beacons arrive in **every shape the engine already
handles**, all in one run:

| File | Beacon snippet (`cat -n`) | Shape | Handled by |
|---|---|---|---|
| `pkg/__init__.py`  | lines 1–13, contiguous            | **COMPLETE** (file is 13 lines) | adopted verbatim |
| `tests/test_pkg.py`| lines 1–34, contiguous            | **TRUNCATED** (file is 51 lines) | `completeTruncatedBeacon` (S27) |
| `main.py`          | lines 1–40, contiguous            | **TRUNCATED** (file is 71 lines) | `completeTruncatedBeacon` (S27) |
| `pkg/b.py`         | lines 1–93, contiguous            | **TRUNCATED** (file is 101 lines) | `completeTruncatedBeacon` (S27) — but see §2.4 |
| `walk_rename.py`   | lines 1–9, contiguous             | **TRUNCATED** (file is 51 lines) | `completeTruncatedBeacon` (S27) |
| `pkg/a.py`         | lines 1–99 with a bare `...`      | **ELIDED / WINDOWED** (file is 128 lines) | `completeElidedBeacons` (S28) |

The two **vendor** files (`pkg/vendor/c.py`, `pkg/vendor/__init__.py`) get **NO
beacon at all** — the walk skipped them — so the engine simply keeps their original
`write` revision. That is the control: they must still read `helper`, never
`compute_value`, with no fabricated rename.

Because S27's truncated-beacon completion and S28's elided-beacon completion are
both already in the engine (uncommitted in the working tree — see §1.4), every
beacon is completed from a content-validated file-history backup and **all 8 files
reconstruct byte-identically**. There is nothing new for the engine to learn; S29
is the **integration test** that all three behaviours compose under one script run.

### 1.3 New structural wrinkles S29 exercises (none needs new code)

- **Recursive `os.walk` over nested dirs** (`pkg/`, `pkg/vendor/`, `tests/`) with a
  dynamically discovered file list → **six beacons from one Bash run** (S25 had 3).
- **A skipped `vendor/` directory** → two no-beacon **control** files that must keep
  `helper`. This is the headline S29 lock.
- **Self-modifying script:** `walk_rename.py` is itself a `.py` file in the tree, so
  the walk renames the string literals **in its own source** (`'helper'` →
  `'compute_value'`). Its truncated beacon (9 lines) is completed to the post-self-
  rename 51-line file.
- **Pre-rename Edit** (`pkg/a.py` `preprocess`) and **post-rename Edit** (`pkg/b.py`
  `pipeline`) bracketing the script run — combined with truncated/elided beacons.

### 1.4 Engine baseline (READ THIS BEFORE RUNNING ANYTHING)

The S28 fix (`completeElidedBeacons`) is **implemented but UNCOMMITTED** in the
working tree (HEAD = `cededae`, S1–S27 + m1–m7 committed). The pipeline order in
`src/reconstruction_branches.ts:54-56` is:

```
const unelided = reader ? completeElidedBeacons(records, based, reader) : based;       // S28
const restaged = reader ? seedStaleEditBases(records, unelided, reader) : unelided;    // S19/S23
const completed = reader ? completeTruncatedBeacon(records, restaged, reader) : restaged; // S27
```

All values in this plan were measured **with that S28 work present**. If `npm test`
does not report **398 passing**, STOP — the baseline is wrong (S28 not applied) and
every measurement below is invalid. Do **not** commit S28 here (the S28 implementer
owns that commit); just build on top of it.

---

## 2. Ground truth (VERIFIED LIVE — real sidecar reader)

Branch shape: **LINEAR** — `surviving.length === 8`, `rewound.length === 0`,
surviving tip **`#e6bfddf3`**, prompt **`#726893c2`**.

### 2.1 Scenario source & inputs

- Scenario script: `scenarios/s29-script-rename-repo-walk.txt`
- Executed transcript + rendered files:
  `scenarios/executed/s29-script-rename-repo-walk/`
- **JSONL (canonical Desktop store, matching S24–S28):**
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s29-script-rename-repo-walk/543492c4-1d45-47b7-a4a1-a2d14857161f.jsonl`
- File-history backups for this session:
  `~/.claude/file-history/543492c4-1d45-47b7-a4a1-a2d14857161f/`

> **⚠ GROUND-TRUTH GAP (differs from S28):** the rendered executed-scenario folder
> (both the worktree copy and the Desktop store) contains **only** `main.py`,
> `walk_rename.py`, `tests/test_pkg.py`, plus harness scaffolding. The entire
> **`pkg/` subtree was NOT captured** on disk. So `pkg/a.py`, `pkg/b.py`,
> `pkg/vendor/c.py`, `pkg/__init__.py`, `pkg/vendor/__init__.py` have **no rendered
> ground-truth file** — their independent ground truth lives only in the
> file-history backups. The test strategy in §5–§6 accounts for this: the three
> rendered files are byte-locked against the rendered originals; the `pkg/*` files
> are locked via inline backup blobs (engine test) and the real reader (CLI test),
> plus byte-length + content-marker + version-selection asserts.

### 2.2 The six beacons (all `attachment.type = edited_text_file`, all `2026-06-24T20:05:48.798Z`)

Each beacon's `snippet` is `cat -n` form (`N\t<text>`; a bare `...` line marks an
elision). Per-file user-edit changeIds (the beacon revisions):

| File | beacon changeId | snippet lines | shape |
|---|---|---|---|
| `tests/test_pkg.py` | `b27e66ab-899b-447c-be23-98e442161aab` | 1–34 | truncated |
| `main.py`           | `1e9f8dd1-9139-…` | 1–40 | truncated |
| `pkg/__init__.py`   | `1527f907-1b36-…` | 1–13 | complete |
| `pkg/b.py`          | `4c52c762-6692-…` | 1–93 | truncated |
| `pkg/a.py`          | `e30c1bc6-d91b-…` | 1–99 + `...` | elided |
| `walk_rename.py`    | `d16b6b3b-fca7-…` | 1–9 | truncated |

`pkg/vendor/c.py` and `pkg/vendor/__init__.py` have **no beacon**.

### 2.3 Reconstructed revision ladders (VERIFIED LIVE, real reader) + final byte lengths

The "believed final text" of a history = each line's latest value, `\n`-joined
(the engine drops one trailing newline at replay).

| File | Final bytes | Revision-kind ladder | Synthetic `overwrite` changeId (lines) |
|---|---|---|---|
| `pkg/__init__.py`      | **399**  | `write, user-edit` | — (complete beacon) |
| `pkg/a.py`             | **3460** | `write, edit, user-edit, overwrite` | `38dbed748662c3cb@v4` (128L) |
| `pkg/b.py`             | **3330** | `write, user-edit, overwrite, edit` | `e5663c2564dcb2d1@v3` (101L) |
| `pkg/vendor/__init__.py`| **289** | `write` | — (no beacon; control) |
| `pkg/vendor/c.py`      | **2031** | `write` | — (no beacon; control) |
| `main.py`              | **1788** | `write, edit, edit, edit, user-edit, overwrite` | `75e112d1b7c35b86@v3` (71L) |
| `tests/test_pkg.py`    | **1601** | `write, edit, edit, edit, user-edit, overwrite` | `d7f33f1259aa3a18@v3` (51L) |
| `walk_rename.py`       | **1530** | `write, user-edit, overwrite` | `e13888a28cfa9bd5@v2` (51L) |

> The three consecutive `edit` revisions on `main.py` / `test_pkg.py` all share one
> changeId (`toolu_01TrLD51` / `toolu_01KNLuF5`) — the engine renders one Edit tool
> call as three intermediate revisions. Lock the ladder exactly as shown.

### 2.4 Version-selection is by CONTENT, not recency (the crux property)

Each synthetic `overwrite` is seeded from a **content-validated** backup version,
and the chosen version is **NOT always the latest**:

- `pkg/a.py` → **@v4**, chosen over **@v3 of the SAME line count (128L)**. `@v3` is
  post-`preprocess` but **pre-rename** (`helper`); `@v4` is post-rename
  (`compute_value`). The elided beacon shows `compute_value`, so `@v3` fails
  validation and `@v4` is chosen. (`@v2` is 106L, pre-`preprocess`.)
- `pkg/b.py` → **@v3** (101L, post-rename), chosen over **@v2 (also 101L, pre-rename
  `helper`)** — then the `pipeline` Edit replays on top to reach `@v4`-equivalent
  (123L, 3330 bytes). The chosen overwrite is **NOT** the latest `@v4`.
- `main.py` → **@v3** (71L, post-rename) over **@v2 (71L, pre-rename)**.
- `tests/test_pkg.py` → **@v3** (51L, post-rename) over **@v2 (51L, pre-rename)**.
- `walk_rename.py` → **@v2** (only version; pure truncation completion, no
  competition — the clean isolation of truncation detection from version selection).

### 2.5 Reader-dependence & poison matrix (VERIFIED LIVE — the regression guard)

`without` = `reconstructBranches(records)` (no reader); `poison` = a reader that
returns the constant `"POISONED-BACKUP"` for every key.

| File | correct (real reader) | WITHOUT reader | POISON reader |
|---|---|---|---|
| `pkg/vendor/c.py`      | 2031, `helper` kept | **2031 (identical)** | **2031 (identical)** |
| `pkg/vendor/__init__.py`| 289, `helper` kept | **289 (identical)**  | **289 (identical)** |
| `pkg/__init__.py`      | 399 (complete beacon) | **399 (identical)** | **399 (identical)** |
| `main.py`              | 1788 | 1140 (truncated, WRONG) | 1140, no overwrite, **no leak** |
| `tests/test_pkg.py`    | 1601 | 1127 (truncated, WRONG) | 1127, no overwrite, **no leak** |
| `walk_rename.py`       | 1530 | 290 (truncated, WRONG)  | 290, no overwrite, **no leak** |
| `pkg/a.py`             | 3460 | 2881 (`...` survives, WRONG) | 2881, no overwrite, **no leak** |
| `pkg/b.py`             | 3330 | 3229 (WRONG)            | **680, LEAKS `POISONED`** ⚠ |

Reader-**INDEPENDENT** (correct without any reader): the two vendor controls + the
complete-beacon `pkg/__init__.py`. Reader-**DEPENDENT**: the four
truncated/elided files + `pkg/b.py`.

> **`pkg/b.py` LEAKS poison** because, with a degenerate reader, the pre-existing
> `seedStaleEditBases` (S19/S23) path injects the poison content for the stale base
> of the `pipeline` Edit — identical to S28's `catalog_view` behaviour. This is
> established prior-scenario behaviour against a degenerate test-only reader, **not**
> something S29 introduces. **Therefore `pkg/b.py` is EXCLUDED from poison
> assertions.** The clean poison guards are `pkg/a.py` (elided path) and the three
> truncated files.

### 2.6 Raw event stream (`extractFileEvents`)

`writes = 8`, `edits = 4`, `user-edits = 6`, `overwrites = 0`. The six user-edit
changeIds (8-char): `1527f907, 1e9f8dd1, 4c52c762, b27e66ab, d16b6b3b, e30c1bc6`.
**`overwrites = 0`** — every synthetic `overwrite` in §2.3 is a reconstructed
*revision*, never an extracted *event*, so nothing the fix injects leaks into the
event stream or the graph views.

### 2.7 Load-bearing proof (mutation probes, VERIFIED LIVE during planning)

Both probes: neutralize one pipeline stage in `reconstruction_branches.ts`, re-run
the CLI, diff every file's final revision against the known-good baseline, restore.

- **Probe A — neutralize `completeTruncatedBeacon` (line 56):** diverged =
  **`main.py`, `tests/test_pkg.py`, `walk_rename.py`**. (`pkg/b.py` did NOT diverge —
  its truncated beacon is independently repaired by `seedStaleEditBases` via the
  later `pipeline` Edit's stale base.)
- **Probe B — neutralize `completeElidedBeacons` (line 54):** diverged =
  **`pkg/a.py`** only.

So the unique cruxes are: **S27 truncated completion ⇒ `main.py` / `test_pkg.py` /
`walk_rename.py`**; **S28 elided completion ⇒ `pkg/a.py`**. These are the exact
mutations the lock tests in §5 must turn RED.

### 2.8 Capture command for the test literals (run once)

```sh
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
FH="$HOME/.claude/file-history/543492c4-1d45-47b7-a4a1-a2d14857161f"
# Engine-test inline blobs (pkg/* has no rendered ground truth) — exact byte/line counts:
#   38dbed748662c3cb@v3  3387B 128L  pkg/a.py PRE-rename  (must be REJECTED)
#   38dbed748662c3cb@v4  3471B 128L  pkg/a.py POST-rename (must be CHOSEN; == final, 3460 after newline strip)
#   e5663c2564dcb2d1@v2  2676B 101L  pkg/b.py PRE-rename  (must be REJECTED)
#   e5663c2564dcb2d1@v3  2746B 101L  pkg/b.py POST-rename (must be CHOSEN as the overwrite base)
wc -c "$FH/38dbed748662c3cb@v3" "$FH/38dbed748662c3cb@v4" "$FH/e5663c2564dcb2d1@v2" "$FH/e5663c2564dcb2d1@v3"
# Paste each file's RAW bytes into the matching const in the engine test (see §5).
```

---

## 3. NO engine change — confirm, do not edit `src/`

There is **no §3 "engine fix"** as in S27/S28. The Definition of Done requires
**zero S29-authored `src/` change**. Note the tree is **not** clean at S29 start:
the uncommitted S28 work (`src/reconstruction_branches.ts`, `_sidecar.ts`,
`_reseed.ts`, `_user_edit.ts`) and unrelated `src/Plan_template.md` /
`src/Impl_template.md` edits are already present. So the check is **not** "empty
diff" — it is "**no change beyond the S29-start baseline**":

```sh
# FIRST thing, before any edits:
git diff src/ > /tmp/s29-src-before.diff
# …after all S29 work…
git diff src/ > /tmp/s29-src-after.diff
diff /tmp/s29-src-before.diff /tmp/s29-src-after.diff   # MUST be identical (no new src hunks)
```

If any lock test fails, the fix is in the **test literal/reader**, never in `src/`.
(If a genuine engine gap were found, STOP and escalate — planning proved there is
none.)

---

## 4. Task 1 — Baseline & fixture (do first)

1. `cd` to the worktree. Run `npm test` → **must be 398 pass / 0 fail** and
   `npx tsc --noEmit` clean. If not 398, STOP (see §1.4).
2. Add to `tests/fixtures.ts`, immediately after `S28_JSONL`, following the exact
   existing style (Desktop canonical path):

   ```ts
   export const S29_JSONL =
       "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s29-script-rename-repo-walk/543492c4-1d45-47b7-a4a1-a2d14857161f.jsonl";
   ```

---

## 5. Task 2 — Engine lock (`tests/reconstruction_engine_s29.test.ts`)

**TDD for a char-lock:** write each test; it passes GREEN immediately (it locks
current behaviour). Then prove it is load-bearing by the §2.7 mutation (RED), and
restore (GREEN). Do the mutation proof for the two crux tests T3 and T5 explicitly
(§9).

Model the file on `tests/reconstruction_engine_s28.test.ts`: reuse the
`finalTextOf` / `historyFinalText` / `historyEndingWith` / `stripTrailingNewline`
helpers verbatim, `loadRecords` from `./utilities.ts`, `S29_JSONL` from
`./fixtures.ts`, and the `S29_GT` rendered-file reader pattern.

```ts
const S29_GT =
    "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s29-script-rename-repo-walk";
// readGroundTruth(rel) → readFileSync(`${S29_GT}/${rel}`, "utf8")
const S29_MAIN_FINAL = stripTrailingNewline(readGroundTruth("main.py"));            // 1788
const S29_TEST_PKG_FINAL = stripTrailingNewline(readGroundTruth("tests/test_pkg.py")); // 1601
const S29_WALK_FINAL = stripTrailingNewline(readGroundTruth("walk_rename.py"));     // 1530
```

**Inline backup blobs** (pkg/* has no rendered file — paste RAW bytes per §2.8):

```ts
const S29_A_V3 = "…";  // 38dbed748662c3cb@v3 (pre-rename, helper) — REJECTED candidate
const S29_A_V4 = "…";  // 38dbed748662c3cb@v4 (post-rename, compute_value) — CHOSEN; ground truth for a.py
const S29_B_V2 = "…";  // e5663c2564dcb2d1@v2 (pre-rename, helper) — REJECTED candidate
const S29_B_V3 = "…";  // e5663c2564dcb2d1@v3 (post-rename, compute_value) — CHOSEN overwrite base
```

**Hermetic reader** — serves the chosen version of each truncated file from the
rendered file (byte-identical modulo trailing newline, the S28 pattern), the four
inline blobs for the two pkg cruxes, and `""` (rejected) for everything else:

```ts
const s29Reader: BackupReader = (name) => {
    const blob = name.toString();
    if (blob === "75e112d1b7c35b86@v3") return readGroundTruth("main.py");
    if (blob === "d7f33f1259aa3a18@v3") return readGroundTruth("tests/test_pkg.py");
    if (blob === "e13888a28cfa9bd5@v2") return readGroundTruth("walk_rename.py");
    if (blob === "38dbed748662c3cb@v3") return S29_A_V3;
    if (blob === "38dbed748662c3cb@v4") return S29_A_V4;
    if (blob === "e5663c2564dcb2d1@v2") return S29_B_V2;
    if (blob === "e5663c2564dcb2d1@v3") return S29_B_V3;
    return "";
};
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
```

Write these **eight** tests (all values from §2; use `EventKind` members, never
bare strings):

- **T1 `test_S29_linear_eight_surviving_no_rewound`** — `reconstructBranches(…,
  s29Reader)`: `rewound.length === 0`, `surviving.length === 8`, and every one of
  these suffixes is present: `/pkg/__init__.py`, `/pkg/a.py`, `/pkg/b.py`,
  `/pkg/vendor/__init__.py`, `/pkg/vendor/c.py`, `/main.py`, `/tests/test_pkg.py`,
  `/walk_rename.py`.

- **T2 `test_S29_vendor_control_reader_independent_keeps_helper`** — THE headline
  lock. For `/pkg/vendor/c.py` (reconstruct WITHOUT reader AND with `poison`):
  ladder `[write]`, `historyFinalText` **identical** across no-reader and poison
  (reader-independent), length **2031**, includes `def helper(`, does **NOT**
  include `compute_value`, and contains no `POISONED`. Assert the same
  reader-independence + `helper`-kept (length **289**) for `/pkg/vendor/__init__.py`.

- **T3 `test_S29_three_truncated_beacons_completed_bytelock`** — the **S27 crux**
  (mutation: neutralize `completeTruncatedBeacon` → this test RED, §9). With
  `s29Reader`, for each of `/main.py`, `/tests/test_pkg.py`, `/walk_rename.py`:
  ladder ends in `EventKind.overwrite` whose `changeId` equals the exact value in
  §2.3 (`75e112d1b7c35b86@v3` / `d7f33f1259aa3a18@v3` / `e13888a28cfa9bd5@v2`);
  full ladder equals §2.3; `historyFinalText` equals `S29_MAIN_FINAL` /
  `S29_TEST_PKG_FINAL` / `S29_WALK_FINAL` and the lengths 1788 / 1601 / 1530; no
  line equals `"..."`. Add a marker assert: `walk_rename.py` final contains
  `compute_value` and **not** the bare token `helper` (self-rename applied).

- **T4 `test_S29_truncated_files_without_reader_are_wrong`** — the S27 guard. WITHOUT
  reader, `/main.py` length **1140**, `/tests/test_pkg.py` **1127**,
  `/walk_rename.py` **290**, each **≠** its `*_FINAL`. (Locks reader-dependence.)

- **T5 `test_S29_elided_beacon_completed_version_selected_by_content`** — the **S28
  crux** (mutation: neutralize `completeElidedBeacons` → this test RED, §9). With
  `s29Reader`, for `/pkg/a.py`: ladder `[write, edit, user-edit, overwrite]`; the
  `overwrite` `changeId` equals **`38dbed748662c3cb@v4`** (chosen over the
  same-128-line `@v3` that the reader also serves — the content-validation lock) and
  its `lines.length === 128`; `historyFinalText` length **3460**, equals
  `stripTrailingNewline(S29_A_V4)`, includes `def preprocess(` and `compute_value`,
  excludes the bare token `helper`, and no line equals `"..."`.

- **T6 `test_S29_elided_without_reader_and_poison_never_fabricate`** — the S28
  guard. WITHOUT reader: `/pkg/a.py` ladder `[write, edit, user-edit]` (no
  overwrite), length **2881**, and **some** line equals `"..."` (the window
  survives). With `poison`: `/pkg/a.py` still has **no** `overwrite`, length 2881,
  no `POISONED`. (Do **not** assert `pkg/b.py` under poison — §2.5.)

- **T7 `test_S29_truncated_then_pipeline_edit_b_py`** — `pkg/b.py` integration. With
  `s29Reader`: ladder `[write, user-edit, overwrite, edit]`; the `overwrite`
  `changeId` equals **`e5663c2564dcb2d1@v3`** (chosen over the same-101-line `@v2`)
  with `lines.length === 101`; final length **3330**, includes `def pipeline(` and
  `compute_value`, excludes the bare token `helper`.

- **T8 `test_S29_extractFileEvents_six_userEdits_no_overwrite_events`** —
  `extractFileEvents(loadRecords(S29_JSONL))`: `userEdits.length === 6` with sorted
  8-char ids `["1527f907","1e9f8dd1","4c52c762","b27e66ab","d16b6b3b","e30c1bc6"]`;
  `overwrites.length === 0` (synthetic seeds never become events); `writes.length
  === 8`; `edits.length === 4`.

---

## 6. Task 3 — CLI lock (`tests/reconstruction_cli_s29.test.ts`)

Model on `tests/reconstruction_cli_s28.test.ts`: `runCli` (the **real** sidecar
reader), `S29_JSONL`, and the `fileVerboseBlock(out, suffix)` slicer verbatim.
Write **six** tests:

- **C1 `test_S29_default_conversationDAG_shows_six_script_rename_user_edits`** —
  `runCli([S29_JSONL])` includes `══ conversationDAG ══`, `A  prompt  #726893c2`,
  and these six user-edit lines (substrings; the six beacons): `user-edit  test_pkg.py     #b27e66ab`,
  `user-edit  main.py         #1e9f8dd1`, `user-edit  __init__.py     #1527f907`,
  `user-edit  b.py            #4c52c762`, `user-edit  a.py            #e30c1bc6`,
  `user-edit  walk_rename.py  #d16b6b3b`; and `!out.includes("branch ")` (linear,
  no rewind). (Match the spacing produced by the renderer — copy it from a live run,
  see §8.)

- **C2 `test_S29_fileDAG_vendor_control_has_no_user_edit`** — THE control lock in
  the graph view. `runCli([S29_JSONL])` includes `══ fileDAG ══` and the block
  `c.py\n  F  write      #01U9Uyao` with **no** `user-edit` line under `c.py` (the
  walk skipped it). Also assert `a.py` shows `Q  user-edit  #e30c1bc6` and `b.py`
  shows both `P  user-edit  #4c52c762` and `S  edit       #01Mmn9pd`. (The synthetic
  overwrites never appear as DAG nodes.)

- **C3 `test_S29_list_branches_single_surviving_eight_files`** —
  `runCli([S29_JSONL, "--list-branches"])` includes `surviving  tip #e6bfddf3`, the
  basenames `a.py`, `b.py`, `c.py`, `main.py`, `test_pkg.py`, `walk_rename.py`, and
  `!out.includes("rewound")`.

- **C4 `test_S29_verbose_three_rendered_files_bytelock`** — for each of `/main.py`
  (6 revisions, 0..5), `/tests/test_pkg.py` (6 revisions), `/walk_rename.py` (3
  revisions): `fileVerboseBlock` includes the last `revision N  @` and not `revision
  N+1`; the final revision slice contains `compute_value` and (for `walk_rename.py`)
  no bare `helper` token; and contains no line matching `/\|\s*\.\.\.\s*$/` (no
  window survived).

- **C5 `test_S29_verbose_vendor_c_kept_helper`** — `fileVerboseBlock(…, "/pkg/vendor/c.py")`
  has exactly one revision (`revision 0  @`, not `revision 1`), contains `def helper(`,
  and does **not** contain `compute_value` (the control, rendered view).

- **C6 `test_S29_verbose_a_py_elided_completed`** — `fileVerboseBlock(…, "/pkg/a.py")`
  shows `revision 3  @` and not `revision 4`; the final revision slice contains
  `def preprocess(` and `compute_value`, no bare `helper`, and no windowed `...`
  line. (CRUX A, rendered.)

---

## 7. Task 4 — Docs (3 edits, no fixture file beyond §4)

Mirror the S28 doc edits:

1. `plans/roadmap.md` — add the S29 line: char-lock, no src change, 398→**412**
   (8 engine + 6 CLI), "first scenario where one Bash run emits complete +
   truncated + elided beacons together plus two no-beacon vendor controls; S27 +
   S28 + vendor-skip compose, byte-perfect, no engine change."
2. `plans/implementation-notes-api-from-scenarios.md` — full S29 entry: the six-
   beacon taxonomy (§2.2), the §2.4 content-not-recency version selection, the §2.5
   reader/poison matrix, the §2.7 mutation results, and the **ground-truth gap**
   (`pkg/*` not rendered → inline backup blobs). Note `pkg/b.py` poison-leak is
   pre-existing `seedStaleEditBases`, not new.
3. `plans/reconstruction-engine-design.md` — one S29 design note: S29 adds no
   code; it is the composition/regression lock for `completeTruncatedBeacon` +
   `completeElidedBeacons` + the no-beacon vendor control under a single recursive-
   walk script run.

---

## 8. Task 5 — Full verification

```sh
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # 412 pass / 0 fail  (398 baseline + 8 engine + 6 CLI)
npx tsc --noEmit         # No errors found
node --import tsx --test tests/reconstruction_engine_s29.test.ts   # 8 green
node --import tsx --test tests/reconstruction_cli_s29.test.ts      # 6 green
diff /tmp/s29-src-before.diff <(git diff src/)   # identical → zero S29 src change (see §3)
git status               # S29-authored: tests/fixtures.ts (mod), 2 new test files,
                         #       3 plans/*.md (mod), plans/s29/ (untracked);
                         #       PLUS the pre-existing uncommitted S28 src + templates
```

For the C1/C4 exact-spacing assertions, capture the live renderer output once and
copy substrings from it (do not hand-count spaces):

```sh
node --import tsx src/reconstruction_cli.ts \
  "scenarios/executed/s29-script-rename-repo-walk/543492c4-1d45-47b7-a4a1-a2d14857161f.jsonl" \
  2>/dev/null
```

---

## 9. Task 6 — Prove the locks are load-bearing (mutation, then restore)

Char-lock tests must demonstrably catch regressions. Run both probes from §2.7,
confirming RED, then restore `src/reconstruction_branches.ts` to its exact prior
bytes (back it up first; the file is uncommitted S28 work, so `git checkout` will
NOT restore it):

1. `cp src/reconstruction_branches.ts /tmp/branches.bak`
2. Edit line 56 → `const completed = restaged;` → run
   `node --import tsx --test tests/reconstruction_engine_s29.test.ts` → **T3 RED**
   (T5/others green). Restore from `/tmp/branches.bak`.
3. Edit line 54 → `const unelided = based;` → run the engine test → **T5 RED** (T3
   others green). Restore from `/tmp/branches.bak`.
4. `diff /tmp/branches.bak src/reconstruction_branches.ts` → identical;
   `npm test` → 412 green; `git diff --stat src/` → empty.

Record the RED→GREEN results in the completion handoff.

---

## 10. Task 7 — Commit (USER APPROVAL ONLY) then HAND OFF

1. **Commit is USER-APPROVAL-ONLY.** `git status` first. Stage **exactly**:
   `tests/fixtures.ts`, `tests/reconstruction_engine_s29.test.ts`,
   `tests/reconstruction_cli_s29.test.ts`, `plans/roadmap.md`,
   `plans/implementation-notes-api-from-scenarios.md`,
   `plans/reconstruction-engine-design.md`, and `plans/s29/` (this plan + the
   handoff). **NEVER `git add -A`.** Do **NOT** stage `src/*` (there must be no src
   change), nor `src/Plan_template.md`, `src/Impl_template.md`, `monitor-handoff.sh`,
   `plans/monitor-handoff-spec.md`, or any uncommitted S28 files. Message:
   `Implemented S29 handling` + the standard Co-Authored-By / Claude-Session
   trailers. **Note:** S28 is uncommitted in the tree; if it is still uncommitted at
   commit time, coordinate so S29's commit does not accidentally include or depend
   on un-staged S28 src — stage only the S29 files listed above.
2. **CREATE HANDOFF** with `/jot:handoff-prompt`. Put `MUST READ:
   plans/script-handling.txt` near the top after the header. Title must contain
   `Scenario s29 … IMPLEMENTED` (so the s30 planner's `monitor-handoff.sh s29 impl`
   fires). Next scenario: **s30**.

---

## 11. Acceptance criteria (Definition of Done)

- `npm test` → **412 / 0**; `npx tsc --noEmit` clean.
- **Zero S29 `src/` change** — `git diff src/` identical to the S29-start baseline
  (§3); no new `reconstruction_*.ts` hunks.
- `tests/reconstruction_engine_s29.test.ts` (8) + `tests/reconstruction_cli_s29.test.ts`
  (6) green; both crux mutations (§9) proven RED→GREEN and recorded.
- All 8 files byte-locked to §2.3; the two **vendor controls keep `helper`**
  (reader-independent + poison-stable); `pkg/a.py` version selection (@v4 over the
  same-line @v3) and `pkg/b.py` (@v3 over @v2) locked by `changeId`.
- Every new test uses `EventKind` members (no bare-string discriminants) and
  verb-named helpers, per `plans/coding-requirements.md`.
- Docs (§7) updated; handoff written with the `s29 … IMPLEMENTED` title.
