# S36 Reconstruction Plan — `s36-script-rename-csv-user-edit-mcp` (CHAR-LOCK, no engine change)

## Verdict
`reconstruction_cli` processes Scenario s36 **without needing any engine modifications**. All four
touched files reconstruct **byte-identical** to their independently-rendered ground truth with the
**default real sidecar reader**, and the reconstruction is **reader-INDEPENDENT** (HAS-BEACON — every
script-phase state surfaces as a COMPLETE `edited_text_file` beacon; no rescue stage fires).

s36 is the **MCP-sandbox twin of S33**: same CSV-user-edit rename shape, but the rename script is run
through the **context-mode MCP sandbox** (`ctx_execute`) instead of the Bash tool. The ONLY thing that
makes s36 distinct from s33 is that loading the JSONL **depends on S32's parser fix** (the assistant
records of the MCP run carry `attributionMcpServer` / `attributionMcpTool` keys). That fix is **already
in the worktree** (`src/parse/loadTranscript.ts`), so the engine clears s36 end-to-end with no new code.

The implementation is therefore a **characterization / regression LOCK** — add a fixture, write engine
+ CLI tests that pin the current correct output (including one parser-gate test proving the MCP
dependency), update three docs. **No `src/` change.**

This was verified live at HEAD (baseline below): see "Verification already performed" — the implementer
must re-confirm, not re-derive.

## Baseline
- Suite **487/487 green** at HEAD (`cededae` + uncommitted S28–S35 work — NOTHING committed). After this
  lock: **487 → 499** (6 engine + 6 CLI = 12 new tests).
- `npx tsc --noEmit` clean.
- **If `npm test` is not 487**, STOP and reconcile with the S35 completion handoff
  (`plans/s35/handoff-api-from-scenarios-20260624-2045.md`) before continuing.

## The scenario (inputs on disk)
- Definition: `scenarios/s36-script-rename-csv-user-edit-mcp.txt`
- Executed run + rendered files: `scenarios/executed/s36-script-rename-csv-user-edit-mcp/`
  (`billing.py`, `tests/test_billing.py`, `renames.csv`, `apply_renames.py`).
- JSONL (fixture target, sibling store — byte-identical to the worktree copy):
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s36-script-rename-csv-user-edit-mcp/e8fa105c-74ae-414f-8208-aa95820af08e.jsonl`

### What the session did
1. Wrote `billing.py` (terse-named `calc_tot`/`fmt_money`/`chk_stock`/`apply_disc` + helpers) and
   `tests/test_billing.py` (covers `calc_tot`, `fmt_money`).
2. **Edit** `billing.py`: added `validate(items)` (pre-script). Its body references **no** terse name,
   so the later rename leaves it unchanged.
3. **Wrote** `renames.csv` with header + **3** rows: `calc_tot,calculate_total` /
   `fmt_money,format_currency` / `apply_disc,apply_discount`.
4. **User-edit** `renames.csv`: appended a **4th** row `chk_stock,check_stock`. ← **the CSV-edit element
   (shared with S33).** A genuine direct-Edit `edited_text_file` user-edit (NOT a script beacon).
5. Wrote `apply_renames.py` (reads `renames.csv`, applies each pair as a whole-word
   `re.sub(r"\b" + re.escape(old) + r"\b", new, text)` to both `billing.py` and
   `tests/test_billing.py`), then ran it **once through the context-mode MCP sandbox**
   (`ctx_execute`, NOT Bash). ← **the NOVEL element vs S33.** The run rewrites both files → surfaces as
   **two `edited_text_file` beacons** (HAS-BEACON), no Edit/Write record of its own. The MCP run's
   assistant records carry `attributionMcpServer:"plugin:context-mode:context-mode"` /
   `attributionMcpTool:"ctx_execute"` (7 such records) — these are the keys S32's parser fix admits.
6. **Edit** `billing.py`: added `reorder(item, qty)` (post-script) that calls **`check_stock`** and
   **`calculate_total`** — the renamed names, one of which (`check_stock`) exists only because of the
   step-4 CSV user-edit.

## Reconstructed structure (live-verified — the LOCK targets)

### conversationDAG (default view) — linear, one prompt, no rewind
```
A  prompt     #fdce1bb9
  B  write      billing.py        #01TM2Vqi
  C  write      test_billing.py   #01Qbyi3X
  D  edit       billing.py        #01VU5maD
  E  write      renames.csv       #01J6kqHe
  F  user-edit  renames.csv       #96b40a66
  G  write      apply_renames.py  #01HKg84y
  H  user-edit  billing.py        #de1f5023
  I  user-edit  test_billing.py   #aecbb827
  J  edit       billing.py        #01MCcReq
```

### fileDAG / `--graphFile` node ladders (exact, per file)
```
billing.py
  B  write      #01TM2Vqi
  D  edit       #01VU5maD
  H  user-edit  #de1f5023
  J  edit       #01MCcReq
test_billing.py
  C  write      #01Qbyi3X
  I  user-edit  #aecbb827
renames.csv
  E  write      #01J6kqHe
  F  user-edit  #96b40a66
apply_renames.py
  G  write      #01HKg84y
```

### `--list-branches`
`surviving  tip #a7ed17a3    billing.py, test_billing.py, renames.csv, apply_renames.py` — **no rewound
branch**, `rewound.length === 0`, `surviving.length === 4`.

### Revision ladders (`--verbose`; final-revision line counts)
| file | revisions | final lines | ladder (lines per revision) |
|------|-----------|-------------|------------------------------|
| `billing.py` | **4** (rev 0..3) | **219** | 156 → 184 → 184 → 219 |
| `tests/test_billing.py` | **2** (rev 0..1) | **50** | 50 → 50 |
| `renames.csv` | **2** (rev 0..1) | **5** | **4 → 5** (write 4 lines → user-edit appends 5th) |
| `apply_renames.py` | **1** (rev 0) | **51** | 51 |

billing.py ladder = write (B) → `validate` edit (D) → script beacon (H, line count steady at 184,
whole-word rename) → `reorder` edit (J, +35 → 219). test_billing.py is **50 → 50** (the rename keeps the
line count; rev0 imports `calc_tot, fmt_money`, rev1 imports `calculate_total, format_currency`).

### `extractFileEvents` multiset (HAS-BEACON)
`writes = 4`, `edits = 2` (both on `billing.py`: D `validate`, J `reorder`), `overwrites = 0`,
`userEdits = 3` with ids **`["96b40a66","aecbb827","de1f5023"]`** (sorted). Provenance differs but the
engine treats all three uniformly as user-edits: `de1f5023` (billing) and `aecbb827` (test) are the
**MCP-run beacons**; `96b40a66` (renames.csv) is the **manual step-4 CSV edit**. That uniformity is why
no engine change is needed.

### The renames (4 whole-word pairs)
`calc_tot→calculate_total`, `fmt_money→format_currency`, `apply_disc→apply_discount`,
`chk_stock→check_stock`. The 4th (`chk_stock`) exists **only** because of the step-4 CSV user-edit.

## Crux (what this scenario uniquely exercises)
1. **MCP-run dependency on the S32 parser fix (the s36-distinct crux):** the rename ran through
   `ctx_execute`, so 7 assistant records carry `attributionMcpServer` / `attributionMcpTool`. Loading
   the JSONL is only possible because those keys are in the assistant allow-set in
   `src/parse/loadTranscript.ts` (S32's fix). A dedicated parser-gate test (T6 below) pins this: it is
   the single fact that distinguishes the s36 lock from the s33 lock. Were S32's fix reverted,
   `loadRecords(S36_JSONL)` would throw `UnmodeledFieldError`.
2. **Ordering across a manual CSV user-edit:** `write renames.csv (3 rows)` → `user-edit renames.csv
   (4 rows)` precedes the script run, so `renames.csv` must reconstruct to **5 lines** (rev0 = 4 lines
   WITHOUT `chk_stock,check_stock`; rev1/final = 5 lines WITH it). A wrong order would drop the 4th
   rename.
3. **The CSV user-edit is load-bearing for `billing.py`:** the post-script `reorder` edit (J) calls
   `check_stock` — a name that exists only because the user-edited CSV added the `chk_stock→check_stock`
   row that the MCP run then applied. So `billing.py`'s final correctness depends transitively on the
   manual CSV edit. Lock `reorder`'s body to the renamed names, scoped to its own `def` block.
4. **Whole-word rename:** every old terse name is absent as a whole word in final `billing.py` /
   `tests/test_billing.py`; the renamed import and call sites carry the new names.

## Hazards (carry into test assertions)
- **WHOLE-WORD HAZARD — `apply_disc` (s36-specific, MUST defend):** the renamed `apply_discount` appears
  **5×** in final `billing.py`, and each contains `apply_disc` as a **prefix substring**. A bare
  `text.includes("apply_disc")` would WRONGLY report the old name as present (substring count 5). Assert
  old-name absence with the **whole-word** regex `/\bapply_disc\b/` (count 0 — `\b` after `disc`
  requires a non-word char, and `apply_discount` has `o` there, so it does not match). Same for the
  other three pairs, but `apply_disc` is the one a naive `includes` check fails on.
- **Prose hazard:** the NEW names appear many times in `billing.py` docstrings/prose (e.g. `reorder`'s
  docstring `:func:`check_stock`` / `:func:`calculate_total``). That is expected — assert **absence of
  OLD whole-word names**, never absence of new names.
- **No kept-name hazard here (unlike S31/S32):** `tests/test_billing.py`'s method names are
  `test_empty_is_zero`, `test_single_item`, `test_zero`, … — they embed **no** terse rename substring,
  so there is no `test_calc_tot`-style kept name to defend. Do not import the S31/S32 kept-name control;
  it has no subject in s36. Still use `\bold\b` regex for old-name absence.
- **Path disambiguation:** suffix `"/billing.py"` (leading slash) so it does not also match
  `"/tests/test_billing.py"`. Reconstructed paths live under
  `/private/var/folders/.../run-scenario.<rand>/…`.

## Tasks (TDD order)

> Tests assert the CURRENT (correct) engine output → they pass on first run (no RED phase: there is no
> bug to fix). The "test" here is a regression LOCK. Each test must encode an independent cross-source
> fact, not merely echo the engine. **LESSON (S33/S34/S35), apply it:** capture exact CLI strings from a
> live `runCli` run (throwaway probe in the scratchpad, deleted after) BEFORE writing the CLI
> assertions, so revision-`@`-id strings and DAG lines are pinned to the real output.

1. **Confirm baseline.** `npm test` → 487/0; `npx tsc --noEmit` clean. If not 487, STOP and reconcile
   with the S35 completion handoff (`plans/s35/handoff-api-from-scenarios-20260624-2045.md`) first.

2. **Add the fixture.** In `tests/fixtures.ts`, after `S35_JSONL`, add:
   ```ts
   export const S36_JSONL =
       "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s36-script-rename-csv-user-edit-mcp/e8fa105c-74ae-414f-8208-aa95820af08e.jsonl";
   ```

3. **Write `tests/reconstruction_engine_s36.test.ts`** (6 engine tests T1–T6). Copy the helper block
   verbatim from `tests/reconstruction_engine_s35.test.ts` (`finalTextOf`, `historyFinalText`,
   `historyEndingWith`, `stripTrailingNewline`, `defBlock`, `readGroundTruth`, `poison`, plus the
   `realReader` helper if present) — change only the ground-truth constant to the s36 store path:
   `scenarios/executed/s36-script-rename-csv-user-edit-mcp` (the worktree copy is byte-identical to the
   sibling store, so either resolves the same bytes).

4. **Write `tests/reconstruction_cli_s36.test.ts`** (6 CLI tests C1–C6). Copy `fileVerboseBlock` and
   `finalRevisionSlice` verbatim from `tests/reconstruction_cli_s35.test.ts`.

5. **Update docs** (append/prepend an S36 entry, mirroring the S35 entries — DO NOT rewrite prior
   entries): `plans/roadmap.md` (S36 line, suite 499), `plans/reconstruction-engine-design.md` (S36
   note immediately after the S35 block), `plans/implementation-notes-api-from-scenarios.md` (prepend
   an S36 entry).

6. **Verify & commit (USER APPROVAL ONLY).** `npm test` → 499/0; `npx tsc --noEmit` clean;
   `git diff --stat -- src/` shows **zero S36 hunks** (no `src/` file changed by S36). Then commit per
   "Commit hygiene".

## Engine tests — `tests/reconstruction_engine_s36.test.ts`

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

- **T1 — `test_S36_billing_bytelock`.** Reconstruct `loadRecords(S36_JSONL)` (default real reader, or no
  reader — s36 is reader-INDEPENDENT, both agree); assert
  `historyFinalText(historyEndingWith(surviving, "/billing.py")) === stripTrailingNewline(readGroundTruth("billing.py"))`.
  Assert the final has **219** lines.
- **T2 — `test_S36_test_file_bytelock`.** Same for `"/tests/test_billing.py"` vs `"tests/test_billing.py"`;
  assert final **50** lines and `includes("from billing import calculate_total, format_currency")`.
- **T3 — `test_S36_renames_csv_user_edit_two_revisions`.** The CSV-edit element. On `historyEndingWith(
  surviving, "/renames.csv")`: assert `history.revisions.length === 2`; `finalTextOf(rev0)` has **4**
  lines and does **NOT** include `"chk_stock,check_stock"`; `historyFinalText` (rev1) has **5** lines,
  **includes** `"chk_stock,check_stock"` AND the other three rows
  (`calc_tot,calculate_total` / `fmt_money,format_currency` / `apply_disc,apply_discount`), and equals
  `stripTrailingNewline(readGroundTruth("renames.csv"))`. Also byte-lock `apply_renames.py` (1 revision)
  here and assert its body includes the string-concat substitution literal
  `re.sub(r"\b" + re.escape(old) + r"\b", new, text)` (use `String.raw`).
- **T4 — `test_S36_renames_whole_word`.** Final `billing.py`: for each `[old,new]` in RENAMES,
  `!new RegExp(String.raw`\b${old}\b`).test(billingText)` and `billingText.includes(new)`. **Comment must
  call out the `apply_disc` hazard:** a whole-word `\bapply_disc\b` is 0 even though `apply_discount`
  contains `apply_disc` as a substring 5×. Final `test_billing.py`:
  `includes("from billing import calculate_total, format_currency")`, and `!/\bcalc_tot\b/` and
  `!/\bfmt_money\b/`.
- **T5 — `test_S36_edit_ordering_reorder_on_renamed_validate_unaffected`.** On final `billing.py`:
  `defBlock(text, "reorder")` includes `check_stock` AND `calculate_total` and has **no** whole-word
  `chk_stock`/`calc_tot`; `defBlock(text, "validate")` is present and references **no** renamed call
  (its body has neither old nor new terse names — it is the pre-script edit the rename left untouched).
  Comment must state: `check_stock` reaching `reorder` proves the step-4 CSV user-edit's 4th row flowed
  through the **MCP** run.
- **T6 — `test_S36_mcp_run_parses_and_reader_independent`.** The **s36-distinct** lock. Two parts:
  (a) **Parser gate / MCP dependency:** `loadRecords(S36_JSONL)` must not throw, and the loaded records
  must include the MCP-run attribution — assert at least one assistant record exposes
  `attributionMcpTool === "ctx_execute"` (and `attributionMcpServer` present). This pins that s36 is the
  MCP twin and that S32's `loadTranscript.ts` allow-set is load-bearing here. Then
  `extractFileEvents(loadRecords(S36_JSONL))`: `write=4`, `edit=2`, `overwrite=0`, `userEdit` ids sorted
  `=== ["96b40a66","aecbb827","de1f5023"]`.
  (b) **Reader-independence:** reconstruct with `poison` reader; for every `FILES` suffix assert the
  poisoned final text equals the no-reader/default final text and never `includes("POISONED")`.
  > If the engine helpers do not already expose `attributionMcpTool` on the loaded record type, assert
  > the MCP dependency at the CLI level instead (the run beacon's provenance) or via a minimal raw-JSONL
  > read of the fixture; the load-not-throwing assertion is the load-bearing half and is always available.

## CLI tests — `tests/reconstruction_cli_s36.test.ts`

> Capture the exact `revision N  @<id>` strings from a live `runCli([S36_JSONL,"--verbose"])` run before
> writing C4–C6 — the `@`-suffixed ids are content-hash strings that must match the real output.

- **C1 — `test_S36_default_conversationDAG_and_fileDAG`.** `runCli([S36_JSONL])` includes
  `"══ conversationDAG ══"`, `"══ fileDAG ══"`, `"A  prompt  #fdce1bb9"`,
  `"user-edit  renames.csv"` + `"#96b40a66"`, `"user-edit  billing.py"` + `"#de1f5023"`,
  `"user-edit  test_billing.py"` + `"#aecbb827"`; and `!includes("branch ")` (linear).
- **C2 — `test_S36_list_branches_single_surviving_four_files`.** `runCli([S36_JSONL,"--list-branches"])`
  includes `"surviving  tip #a7ed17a3"` and each basename
  (`billing.py`,`test_billing.py`,`renames.csv`,`apply_renames.py`); `!includes("rewound")`.
- **C3 — `test_S36_graphFile_node_ladders`.** `runCli([S36_JSONL,"--graphFile"])` includes each exact
  block (use `"<file>\n  X  kind  #id\n…<next-file>"` boundaries to pin node counts):
  billing.py [B write #01TM2Vqi, D edit #01VU5maD, H user-edit #de1f5023, J edit #01MCcReq],
  test_billing.py [C write #01Qbyi3X, I user-edit #aecbb827],
  renames.csv [E write #01J6kqHe, F user-edit #96b40a66],
  apply_renames.py [G write #01HKg84y].
- **C4 — `test_S36_verbose_billing_final_revision_renamed`.** `fileVerboseBlock(runCli([S36_JSONL,
  "--verbose"]), "/billing.py")`: includes `"revision 3  @"`, `!includes("revision 4  @")`. On
  `finalRevisionSlice`: includes `"(219 lines)"`, `"def calculate_total("`, `"def format_currency("`,
  `"def check_stock("`, `"def apply_discount("`, `"def reorder("`, `"def validate("`; and
  `!/\bcalc_tot\b/`, `!/\bfmt_money\b/`, `!/\bchk_stock\b/`, `!/\bapply_disc\b/`.
- **C5 — `test_S36_verbose_test_file_renamed_import`.** `fileVerboseBlock(…, "/tests/test_billing.py")`:
  includes `"revision 1  @"`, `!includes("revision 2  @")`. On `finalRevisionSlice`: includes
  `"(50 lines)"`, `"from billing import calculate_total, format_currency"`; `!/\bcalc_tot\b/`,
  `!/\bfmt_money\b/`.
- **C6 — `test_S36_verbose_renames_csv_user_edit_and_apply_script`.** `fileVerboseBlock(…,"/renames.csv")`:
  includes `"revision 0  @"` + `"(4 lines)"` and `"revision 1  @"` + `"(5 lines)"`,
  `!includes("revision 2  @")`; the block includes `"chk_stock,check_stock"` (final row) and the other
  three rows. `fileVerboseBlock(…,"/apply_renames.py")`: includes `"revision 0  @"`, `"(51 lines)"`,
  `!includes("revision 1  @")`, and the string-concat substitution literal
  `re.sub(r"\b" + re.escape(old) + r"\b", new, text)` (use `String.raw`).

## Verification already performed (re-confirm, don't re-derive)
At HEAD (baseline 487), `reconstructBranches` of `loadRecords(S36_JSONL)` produced: `rewound=0`,
`surviving=4`; all four files byte-equal to the rendered ground truth (subagent byte-compared
`disk_bytes === reconstructed.join("\n") + "\n"`, exact, for all four — zero whitespace/newline diffs).
Ladders (default reader): billing.py [156,184,184,219], test_billing.py [50,50], renames.csv [4,5],
apply_renames.py [51]. `extractFileEvents` = `{write:4, edit:2, userEdit:3, overwrite:0}` with ids
`["96b40a66","aecbb827","de1f5023"]`. The JSONL carries 7 assistant records with
`attributionMcpServer:"plugin:context-mode:context-mode"` / `attributionMcpTool:"ctx_execute"` and loads
cleanly (S32 parser fix present). No rescue stage (`completeTruncatedBeacon` S27 / `completeElidedBeacons`
S28 / `seedStaleEditBases` S19) fires — every beacon is a COMPLETE `edited_text_file` snapshot, so the
lock is reader-INDEPENDENT.

## Commit hygiene (USER APPROVAL ONLY)
Stage EXACTLY these S36 paths — never `git add -A`, never any `src/*` (S36 changes no source):
`tests/fixtures.ts`, `tests/reconstruction_engine_s36.test.ts`,
`tests/reconstruction_cli_s36.test.ts`, `plans/roadmap.md`,
`plans/reconstruction-engine-design.md`, `plans/implementation-notes-api-from-scenarios.md`,
`plans/s36/`.

**COORDINATION HAZARD (same as S28–S35):** the worktree carries uncommitted prior-scenario work —
`src/parse/loadTranscript.ts` (the S32 fix that s36 depends on), `src/reconstruction_reseed.ts`,
`src/reconstruction_beacons.ts`, `src/reconstruction_branches.ts`, `_sidecar.ts`, `_user_edit.ts`, the
S28–S35 test/plan/doc files, and unrelated `src/Plan_template.md` / `src/Impl_template.md` edits by
other agents. The three doc files in this commit also carry S28–S35 edits. `git diff --stat` is NOT
S36-only — confirm the commit-split with the user; do not `git add -A`.

## How to verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 499 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s36.test.ts tests/reconstruction_cli_s36.test.ts   # 12/12
git diff --stat -- src/    # NO s36-attributable change (S36 is a pure characterization lock)
```
