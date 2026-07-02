# S33 Reconstruction Plan — `s33-script-rename-csv-user-edit` (CHAR-LOCK, no engine change)

## Verdict
`reconstruction_cli` processes Scenario s33 **without needing any engine modifications**. All four
touched files reconstruct **byte-identical** to their independently-rendered ground truth, both with
**no `BackupReader`** and under a **poison reader** (reader-INDEPENDENT, HAS-BEACON, clean poison
matrix). This is the sibling of S25/S29/S31/S32: a script rename that surfaces only through
`edited_text_file` beacons, plus the engine's native user-edit handling (S15 mechanism).

The implementation is therefore a **characterization / regression LOCK** — add a fixture, write
engine + CLI tests that pin the current correct output, update three docs. **No `src/` change.**

This was verified live at HEAD (baseline below): see "Verification already performed" — the
implementer must re-confirm, not re-derive.

## Baseline
- Suite **451/451 green** at HEAD (`cededae` + uncommitted S28/S29/S30/S31/S32 work — NOTHING
  committed). After this lock: **451 → 463** (6 engine + 6 CLI = 12 new tests).
- `npx tsc --noEmit` clean.

## The scenario (inputs on disk)
- Definition: `scenarios/s33-script-rename-csv-user-edit.txt`
- Executed run + rendered files: `scenarios/executed/s33-script-rename-csv-user-edit/`
  (`billing.py`, `tests/test_billing.py`, `renames.csv`, `apply_renames.py`) — byte-identical to the
  sibling store the fixture points at.
- JSONL (fixture target, sibling store): `…/RevEng/plans/scenarios/executed/s33-script-rename-csv-user-edit/b54eafa5-e6c9-4c78-a5c6-52129f2e6503.jsonl` (byte-identical to the worktree copy).

### What the session did
1. Wrote `billing.py` (terse-named `calc_tot`/`fmt_money`/`chk_stock`/`apply_disc` + helpers) and
   `tests/test_billing.py` (covers `calc_tot`, `fmt_money`).
2. **Edit** `billing.py`: added `validate(items)` (pre-script). Its body references **no** terse name,
   so the later script leaves it unchanged.
3. **Wrote** `renames.csv` with header + **3** rows: `calc_tot,calculate_total` /
   `fmt_money,format_currency` / `apply_disc,apply_discount`.
4. **User-edit** `renames.csv`: appended a **4th** row `chk_stock,check_stock`. ← **the novel element.**
   This is a genuine direct-Edit `edited_text_file` user-edit (NOT a script beacon).
5. Wrote `apply_renames.py` (reads `renames.csv`, applies each pair as a whole-word
   `re.sub(rf"\b{re.escape(old)}\b", new, text)` to both `billing.py` and `tests/test_billing.py`),
   then ran it **once via Bash** (`python3 apply_renames.py`). The run rewrites both files →
   surfaces as **two `edited_text_file` beacons** (HAS-BEACON), no Edit/Write record of its own.
6. **Edit** `billing.py`: added `reorder(item, qty)` (post-script) that calls **`check_stock`** and
   **`calculate_total`** — the renamed names, one of which (`check_stock`) exists only because of the
   step-4 CSV user-edit.

## Reconstructed structure (live-verified — the LOCK targets)

### conversationDAG (default view) — linear, one prompt, no rewind
```
A  prompt     #a542586f
  B  write      billing.py        #01UfPrAb
  C  write      test_billing.py   #01VRJBSC
  D  edit       billing.py        #01YJgz9B
  E  write      renames.csv       #01AREH5S
  F  user-edit  renames.csv       #b8591d24
  G  write      apply_renames.py  #01Epb4R7
  H  user-edit  billing.py        #4480f645
  I  user-edit  test_billing.py   #c7415420
  J  edit       billing.py        #017YhvtC
```

### fileDAG / `--graphFile` node ladders (exact, per file)
```
billing.py
  B  write      #01UfPrAb
  D  edit       #01YJgz9B
  H  user-edit  #4480f645
  J  edit       #017YhvtC
test_billing.py
  C  write      #01VRJBSC
  I  user-edit  #c7415420
renames.csv
  E  write      #01AREH5S
  F  user-edit  #b8591d24
apply_renames.py
  G  write      #01Epb4R7
```

### `--list-branches`
`surviving  tip #c3d6846d    billing.py, test_billing.py, renames.csv, apply_renames.py` — **no
rewound branch**, `rewound.length === 0`, `surviving.length === 4`.

### Revision ladders (`--verbose`; final-revision line counts)
| file | revisions | final lines | ladder (lines per revision) |
|------|-----------|-------------|------------------------------|
| `billing.py` | **4** (rev 0..3) | **187** | 146 → 164 → 164 → 187 |
| `tests/test_billing.py` | **2** (rev 0..1) | **51** | 51 → 51 |
| `renames.csv` | **2** (rev 0..1) | **5** | **4 → 5** (write 4 lines → user-edit appends 5th) |
| `apply_renames.py` | **1** (rev 0) | **51** | 51 |

billing.py ladder = write (B) → `validate` edit (D) → script beacon (H, line count steady at 164,
whole-word rename) → `reorder` edit (J, +23 → 187).

### `extractFileEvents` multiset (HAS-BEACON)
`writes = 4`, `edits = 2` (both on `billing.py`: D `validate`, J `reorder`), `overwrites = 0`,
`userEdits = 3` with ids **`["4480f645","b8591d24","c7415420"]`** (sorted). All three are
`edited_text_file` user-edits, but provenance differs: `4480f645` (billing) and `c7415420` (test)
are the **script-run beacons**; `b8591d24` (renames.csv) is the **manual step-4 CSV edit**. The engine
treats all three uniformly as user-edits — that uniformity is why no engine change is needed.

### The renames (4 whole-word pairs)
`calc_tot→calculate_total`, `fmt_money→format_currency`, `apply_disc→apply_discount`,
`chk_stock→check_stock`. The 4th (`chk_stock`) exists **only** because of the step-4 CSV user-edit.

## Crux (what this scenario uniquely exercises)
1. **Ordering across a manual CSV user-edit:** `write renames.csv (3 rows)` → `user-edit renames.csv
   (4 rows)` precedes the script run, so `renames.csv` must reconstruct to **5 lines** (rev0 = 4 lines
   WITHOUT `chk_stock,check_stock`; rev1/final = 5 lines WITH it). A wrong order would drop the 4th
   rename.
2. **The CSV user-edit is load-bearing for `billing.py`:** the post-script `reorder` edit (J) calls
   `check_stock` — a name that exists only because the user-edited CSV added the `chk_stock→check_stock`
   row that the script then applied. So `billing.py`'s final correctness depends transitively on the
   manual CSV edit. Lock `reorder`'s body to the renamed names, scoped to its own `def` block.
3. **Whole-word rename:** every old terse name is absent as a whole word in final `billing.py` /
   `tests/test_billing.py`; the renamed import and call sites carry the new names.

### Hazards (carry into test assertions)
- **Prose hazard:** the NEW names appear ~16× in `billing.py` docstrings/prose (e.g. `reorder`'s
  docstring `:func:`check_stock``). That is expected — assert **absence of OLD whole-word names**,
  never absence of new names.
- **No kept-name hazard here (unlike S31/S32):** `tests/test_billing.py`'s method names are
  `test_empty_is_zero`, `test_single_item`, … — they embed **no** terse substring, so there is no
  `test_calc_tot`-style kept name to defend. Do not import the S31/S32 kept-name control; it has no
  subject in s33. Still use `\bold\b` regex for old-name absence (cheap correctness, and the import/
  call sites are the real renamed surface).
- **Path disambiguation:** suffix `"/billing.py"` (leading slash) so it does not also match
  `"/tests/test_billing.py"`. Reconstructed paths live under
  `/private/var/folders/.../run-scenario.uheh27w3/…`.

## Tasks (TDD order)

> Tests assert the CURRENT (correct) engine output → they pass on first run (no RED phase: there is no
> bug to fix). The "test" here is a regression LOCK. Each test must encode an independent cross-source
> fact, not merely echo the engine.

1. **Confirm baseline.** `npm test` → 451/0; `npx tsc --noEmit` clean. If not 451, STOP and reconcile
   with the S32 handoff (`plans/s32/handoff-api-from-scenarios-20260624-1911.md`) before continuing.

2. **Add the fixture.** In `tests/fixtures.ts`, after `S32_JSONL`, add:
   ```ts
   export const S33_JSONL =
       "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s33-script-rename-csv-user-edit/b54eafa5-e6c9-4c78-a5c6-52129f2e6503.jsonl";
   ```

3. **Write `tests/reconstruction_engine_s33.test.ts`** (6 engine tests T1–T6). Copy the helper
   block verbatim from `tests/reconstruction_engine_s32.test.ts` (`finalTextOf`, `historyFinalText`,
   `historyEndingWith`, `stripTrailingNewline`, `defBlock`, `readGroundTruth`, `poison`) — change only
   the ground-truth constant to the s33 sibling-store path:
   `…/RevEng/plans/scenarios/executed/s33-script-rename-csv-user-edit`.

4. **Write `tests/reconstruction_cli_s33.test.ts`** (6 CLI tests C1–C6). Copy `fileVerboseBlock` and
   `finalRevisionSlice` verbatim from `tests/reconstruction_cli_s32.test.ts`.

5. **Update docs** (append/prepend an S33 entry, mirroring the S32 entries — DO NOT rewrite prior
   entries): `plans/roadmap.md` (S33 line, suite 463), `plans/reconstruction-engine-design.md`
   (S33 note immediately after the S32 block), `plans/implementation-notes-api-from-scenarios.md`
   (prepend an S33 entry).

6. **Verify & commit (USER APPROVAL ONLY).** `npm test` → 463/0; `npx tsc --noEmit` clean;
   `git diff --stat -- src/` shows **zero S33 hunks** (no `src/` file changed by S33). Then commit per
   "Commit hygiene".

## Engine tests — `tests/reconstruction_engine_s33.test.ts`

Constants:
```ts
const FILES = [
  { suffix: "/billing.py", rel: "billing.py" },
  { suffix: "/tests/test_billing.py", rel: "tests/test_billing.py" },
  { suffix: "/renames.csv", rel: "renames.csv" },
  { suffix: "/apply_renames.py", rel: "apply_renames.py" },
];
const RENAMES: ReadonlyArray<readonly [string, string]> = [
  ["calc_tot", "calculate_total"], ["fmt_money", "format_currency"],
  ["apply_disc", "apply_discount"], ["chk_stock", "check_stock"],
];
```

- **T1 — `test_S33_billing_bytelock`.** Reconstruct `loadRecords(S33_JSONL)` with NO reader; assert
  `historyFinalText(historyEndingWith(surviving, "/billing.py")) === stripTrailingNewline(readGroundTruth("billing.py"))`.
- **T2 — `test_S33_test_file_bytelock`.** Same for `"/tests/test_billing.py"` vs `"tests/test_billing.py"`.
- **T3 — `test_S33_renames_csv_user_edit_two_revisions`.** The NOVEL element. On `historyEndingWith(
  surviving, "/renames.csv")`: assert `history.revisions.length === 2`; `finalTextOf(rev0)` has **4**
  lines and does **NOT** include `"chk_stock,check_stock"`; `historyFinalText` (rev1) has **5** lines,
  **includes** `"chk_stock,check_stock"` AND the other three rows
  (`calc_tot,calculate_total` / `fmt_money,format_currency` / `apply_disc,apply_discount`), and equals
  `stripTrailingNewline(readGroundTruth("renames.csv"))`. Also assert `apply_renames.py` byte-lock
  (1 revision) here.
- **T4 — `test_S33_renames_whole_word`.** Final `billing.py`: for each `[old,new]` in RENAMES,
  `!new RegExp(\`\\b${old}\\b\`).test(billingText)` and `billingText.includes(new)`. Final
  `test_billing.py`: `includes("from billing import calculate_total, format_currency")`, and
  `!/\bcalc_tot\b/` and `!/\bfmt_money\b/`.
- **T5 — `test_S33_edit_ordering_reorder_on_renamed_validate_unaffected`.** On final `billing.py`:
  `defBlock(text, "reorder")` includes `check_stock` AND `calculate_total` and has **no** whole-word
  `chk_stock`/`calc_tot`; `defBlock(text, "validate")` is present and references **no** renamed call
  (its body has neither old nor new terse names — it is the pre-script edit the rename left untouched).
  Comment must state: `check_stock` reaching `reorder` proves the step-4 CSV user-edit's 4th row flowed
  through the script.
- **T6 — `test_S33_has_beacon_multiset_and_reader_independent`.** `extractFileEvents(loadRecords(S33_JSONL))`:
  `write=4`, `edit=2`, `overwrite=0`, `userEdit` ids sorted `=== ["4480f645","b8591d24","c7415420"]`.
  Then reconstruct with `poison` reader; for every `FILES` suffix assert the poisoned final text equals
  the no-reader final text and never `includes("POISONED")`.

## CLI tests — `tests/reconstruction_cli_s33.test.ts`

- **C1 — `test_S33_default_conversationDAG_and_fileDAG`.** `runCli([S33_JSONL])` includes
  `"══ conversationDAG ══"`, `"══ fileDAG ══"`, `"A  prompt  #a542586f"`,
  `"user-edit  renames.csv"` + `"#b8591d24"`, `"user-edit  billing.py"` + `"#4480f645"`,
  `"user-edit  test_billing.py"` + `"#c7415420"`; and `!includes("branch ")` (linear).
- **C2 — `test_S33_list_branches_single_surviving_four_files`.** `runCli([S33_JSONL,"--list-branches"])`
  includes `"surviving  tip #c3d6846d"` and each basename
  (`billing.py`,`test_billing.py`,`renames.csv`,`apply_renames.py`); `!includes("rewound")`.
- **C3 — `test_S33_graphFile_node_ladders`.** `runCli([S33_JSONL,"--graphFile"])` includes each exact
  block (use `"<file>\n  X  kind  #id\n…<next-file>"` boundaries to pin node counts):
  billing.py [B write #01UfPrAb, D edit #01YJgz9B, H user-edit #4480f645, J edit #017YhvtC],
  test_billing.py [C write #01VRJBSC, I user-edit #c7415420],
  renames.csv [E write #01AREH5S, F user-edit #b8591d24],
  apply_renames.py [G write #01Epb4R7].
- **C4 — `test_S33_verbose_billing_final_revision_renamed`.** `fileVerboseBlock(runCli([S33_JSONL,
  "--verbose"]), "/billing.py")`: includes `"revision 3  @"`, `!includes("revision 4  @")`. On
  `finalRevisionSlice`: includes `"(187 lines)"`, `"def calculate_total("`, `"def format_currency("`,
  `"def check_stock("`, `"def apply_discount("`, `"def reorder("`, `"def validate("`; and
  `!/\bcalc_tot\b/`, `!/\bfmt_money\b/`, `!/\bchk_stock\b/`, `!/\bapply_disc\b/`.
- **C5 — `test_S33_verbose_test_file_renamed_import`.** `fileVerboseBlock(…, "/tests/test_billing.py")`:
  includes `"revision 1  @"`, `!includes("revision 2  @")`. On `finalRevisionSlice`: includes
  `"(51 lines)"`, `"from billing import calculate_total, format_currency"`; `!/\bcalc_tot\b/`,
  `!/\bfmt_money\b/`.
- **C6 — `test_S33_verbose_renames_csv_user_edit_and_apply_script`.** `fileVerboseBlock(…,"/renames.csv")`:
  includes `"revision 0  @"` + `"(4 lines)"` and `"revision 1  @"` + `"(5 lines)"`,
  `!includes("revision 2  @")`; the block includes `"chk_stock,check_stock"` (final row) and the other
  three rows. `fileVerboseBlock(…,"/apply_renames.py")`: includes `"revision 0  @"`, `"(51 lines)"`,
  `!includes("revision 1  @")`, and the whole-word substitution literal
  `re.sub(rf"\b{re.escape(old)}\b", new, text)` (use `String.raw`).

## Verification already performed (re-confirm, don't re-derive)
At HEAD (baseline 451), `reconstructBranches(loadRecords(S33_JSONL))` produced: `rewound=0`,
`surviving=4`; all four files byte-equal to the rendered ground truth with NO reader **and** under the
poison reader; `extractFileEvents` = `{write:4, edit:2, userEdit:3, overwrite:0}` with the three ids
above. No rescue stage (`completeTruncatedBeacon` S27 / `completeElidedBeacons` S28 / `seedStaleEditBases`
S19) fires — every beacon is a COMPLETE `edited_text_file` snapshot.

## Commit hygiene (USER APPROVAL ONLY)
Stage EXACTLY these S33 paths — never `git add -A`, never any `src/*` (S33 changes no source):
`tests/fixtures.ts`, `tests/reconstruction_engine_s33.test.ts`,
`tests/reconstruction_cli_s33.test.ts`, `plans/roadmap.md`,
`plans/reconstruction-engine-design.md`, `plans/implementation-notes-api-from-scenarios.md`,
`plans/s33/`.

**COORDINATION HAZARD (same as S28–S32):** the worktree carries uncommitted prior-scenario work —
`src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`, `_user_edit.ts`,
`src/parse/loadTranscript.ts` (the S32 fix), the S28–S32 test/plan/doc files, and unrelated
`src/Plan_template.md` / `src/Impl_template.md` edits by other agents. The three doc files in this
commit also carry S28–S32 edits. `git diff --stat` is NOT S33-only — confirm the commit-split with the
user; do not `git add -A`.

## How to verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 463 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s33.test.ts tests/reconstruction_cli_s33.test.ts   # 12/12
git diff --stat -- src/    # NO s33-attributable change (S33 is a pure characterization lock)
```
