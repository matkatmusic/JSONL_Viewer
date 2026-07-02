# S37 Reconstruction Plan — `s37-script-rename-driver-back-and-forth-mcp` (CHAR-LOCK, no engine change)

## Verdict
`reconstruction_cli` processes Scenario s37 **without needing any engine modifications**. With the
**default real file-history reader** all four touched files reconstruct **byte-identical** to their
independently-rendered ground truth, and `runCli` runs all modes with **no exception** (the MCP
`ctx_execute` records parse cleanly).

s37 is the **MCP-sandbox twin of S34**: the exact same `ledger.py` "driver-back-and-forth" rename shape
(CSV user-edited twice, mid-stream, with split provenance; a post-script `report` edit on renamed names),
but the rename script is run through the **context-mode MCP sandbox** (`ctx_execute`) instead of the Bash
tool — so loading the JSONL **depends on S32's parser fix** (the MCP run's assistant records carry
`attributionMcpServer` / `attributionMcpTool` keys). That fix is **already in the worktree**
(`src/parse/loadTranscript.ts`), as are every rescue stage s37 leans on (S27 `completeTruncatedBeacon`,
S28 `completeElidedBeacons`, S34 `outOfWindowEditSeed`). The engine therefore clears s37 end-to-end with
**no new code**.

The implementation is a **characterization / regression LOCK** — add a fixture, write engine + CLI tests
that pin the current correct output (including one parser-gate test proving the MCP dependency), update
three docs. **No `src/` change.**

This was verified live at HEAD (baseline below): see "Verification already performed" — the implementer
must **re-confirm, not re-derive**.

## Baseline
- Suite **499/499 green** at HEAD (`cededae` + uncommitted S28–S36 work — NOTHING committed). After this
  lock: **499 → 511** (6 engine + 6 CLI = 12 new tests).
- `npx tsc --noEmit` clean.
- **If `npm test` is not 499**, STOP and reconcile with the S36 completion handoff
  (`plans/s36/handoff-api-from-scenarios-20260624-2105.md`) before continuing.

## The scenario (inputs on disk)
- Definition: `scenarios/s37-script-rename-driver-back-and-forth-mcp.txt`
- Executed run + rendered files: `scenarios/executed/s37-script-rename-driver-back-and-forth-mcp/`
  (`ledger.py`, `tests/test_ledger.py`, `renames.csv`, `apply_renames.py`).
- JSONL (fixture target, sibling store — byte-identical to the worktree copy):
  `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s37-script-rename-driver-back-and-forth-mcp/8f4366d3-271d-4116-a9e0-6da462fed449.jsonl`

### What the session did
1. Wrote `ledger.py` (terse-named `add_entry`/`rm_entry`/`tot_debits`/`tot_credits`/`bal` + helpers) and
   `tests/test_ledger.py` (covers `bal`).
2. **Edit** `ledger.py`: prepended `# ledger module — managed by finance` (pre-script user-edit `#d6a766e2`).
3. **Edit** `ledger.py`: added `audit(book)` calling `tot_debits` / `tot_credits` (pre-script, `#01PYH1VX`).
   Because it is BEFORE the run, the rename later rewrites its body in place.
4. **Wrote** `renames.csv` with header + **2** rows: `add_entry,record_entry` / `rm_entry,remove_entry`.
5. **User-edit** `renames.csv`: appended `tot_debits,total_debits` (3rd row → 4 lines). A genuine direct-Edit
   `edited_text_file` user-edit beacon (`#22de8fa9`). ← first half of the "back and forth".
6. Wrote `apply_renames.py` (reads `renames.csv`, applies each pair as a whole-word rename to both
   `ledger.py` and `tests/test_ledger.py`). **Not run yet.**
7. **User-edit** `renames.csv`: appended `tot_credits,total_credits` (4th row → 5 lines). ← second half of
   the "back and forth". This append left **NO beacon** — recovered from a file-history backup by the
   existing **S27 `completeTruncatedBeacon`**.
8. Ran `apply_renames.py` **once through the context-mode MCP sandbox** (`ctx_execute`, NOT Bash). ← **the
   NOVEL element vs S34.** The run rewrites both `ledger.py` and `tests/test_ledger.py` → surfaces as two
   `edited_text_file` beacons (`ledger #9022d09a`, `test_ledger #a4d3d115`), no Edit/Write record of its
   own. The MCP run's assistant records carry
   `attributionMcpServer:"plugin:context-mode:context-mode"` / `attributionMcpTool:"ctx_execute"` — the
   keys S32's parser fix admits. **Both run beacons arrive incomplete**, so the rescue stages complete them.
9. **Edit** `ledger.py`: appended `# names normalized via rename script` (post-script).
10. **Edit** `ledger.py`: added `report(book)` calling `record_entry` and `total_debits` — the **renamed**
    names, which exist only because the CSV user-edits + the MCP run applied them (`#01LDWkZ4`).

## Reconstructed structure (live-verified — the LOCK targets)

### conversationDAG (default view) — linear, one prompt, no rewind
```
A  prompt  #ba6aa3a0
  B  write      ledger.py         #01CYqN83
  C  write      test_ledger.py    #01WpEmo9
  D  user-edit  ledger.py         #d6a766e2
  E  edit       ledger.py         #01PYH1VX
  F  write      renames.csv       #01Y47SEb
  G  user-edit  renames.csv       #22de8fa9
  H  write      apply_renames.py  #013qfmtR
  I  user-edit  test_ledger.py    #a4d3d115
  J  user-edit  ledger.py         #9022d09a
  K  edit       ledger.py         #01LDWkZ4
```

### fileDAG / `--graphFile` node ladders (exact, per file)
```
ledger.py
  B  write      #01CYqN83
  D  user-edit  #d6a766e2
  E  edit       #01PYH1VX
  J  user-edit  #9022d09a
  K  edit       #01LDWkZ4
test_ledger.py
  C  write      #01WpEmo9
  I  user-edit  #a4d3d115
renames.csv
  F  write      #01Y47SEb
  G  user-edit  #22de8fa9
apply_renames.py
  H  write      #013qfmtR
```
The step-7 NO-BEACON CSV append, the MCP-run beacon completions, and the synthetic prepend completion add
**no node** (their changeId is the blob name, kept out of the graphs — spec 40), which is why the verbose
revision counts below exceed the node counts.

### `--list-branches`
`surviving  tip #b86404ef    ledger.py, test_ledger.py, renames.csv, apply_renames.py` — **no rewound
branch**, `rewound.length === 0`, `surviving.length === 4`.

### Revision ladders (`--verbose`; line counts per revision)
| file | revisions | final lines | ladder (lines per revision) |
|------|-----------|-------------|------------------------------|
| `ledger.py` | **7** (rev 0..6) | **151** | 119 → 9 → 120 → 137 → 137 → 138 → 151 |
| `tests/test_ledger.py` | **3** (rev 0..2) | **69** | 69 → 68 → 69 |
| `renames.csv` | **3** (rev 0..2) | **5** | 3 → 4 → 5 |
| `apply_renames.py` | **1** (rev 0) | **66** | 66 |

- **ledger.py** rev1 (9 lines) is the **raw step-2 prepend beacon snippet**; rev2 (120) is that prepend
  completed onto the 119-line write. rev3 (137) = `audit` edit; rev4 (137) = MCP-run rename beacon
  (whole-word, line count steady); rev5 (138) = step-9 trailing-comment append; rev6 (151) = `report` edit.
  (The exact intermediate provenance is the engine's current output — lock the counts as emitted; the
  implementer re-confirms via a live `--verbose` probe.)
- **test_ledger.py** 69 → 68 → 69: rev0 write, rev1 the incomplete MCP rename beacon (68), rev2 the rescue
  completion back to 69 (the renamed import surfaces here).
- **renames.csv** 3 → 4 → 5: rev0 write (header + 2 rows), rev1 step-5 manual beacon (4 lines, no
  `tot_credits,total_credits`), rev2 step-7 NO-BEACON append completed via S27 (5 lines, all 4 rows).

### `extractFileEvents` multiset (HAS-BEACON for the captured ops)
`write = 4`, `edit = 2` (both on `ledger.py`: E `audit`, K `report`), `overwrite = 0`, `userEdit = 4` with
ids sorted **`["22de8fa9","9022d09a","a4d3d115","d6a766e2"]`**. Provenance: `d6a766e2` = step-2 ledger
prepend (manual); `22de8fa9` = step-5 renames.csv manual beacon; `9022d09a` = ledger MCP-run beacon;
`a4d3d115` = test_ledger MCP-run beacon. The step-7 and step-9 appends left NO beacon, so they are NOT in
the multiset. The engine treats all four user-edits uniformly — that uniformity is why no engine change is
needed.

### The renames (4 whole-word pairs)
`add_entry→record_entry`, `rm_entry→remove_entry`, `tot_debits→total_debits`, `tot_credits→total_credits`.
The last two pairs exist only because of the step-5 / step-7 CSV user-edits; all four flowed through the
**MCP** run.

### `ledger.py` final (rev6, 151 lines)
Contains `def report(`, `def audit(`, trailing line `# names normalized via rename script`; whole-word OLD
names `add_entry`/`rm_entry`/`tot_debits`/`tot_credits` all ABSENT. `test_ledger.py` final import line:
`from ledger import record_entry, bal, remove_entry`.

### `apply_renames.py` substitution literal (verbatim — **PRECOMPILED two-line form**, NOT s34's inline)
```python
pattern = r"\b" + re.escape(old) + r"\b"
text = re.sub(pattern, new, text)
```
Do **not** assert the s34 inline `re.sub(r"\b" + re.escape(old) + r"\b", new, text)` — s37 precompiles into
a `pattern` variable first. Assert both lines (use `String.raw`).

## Reader-dependence — MIXED (like S25 / S35)
Captured live (real reader = byte-perfect; no reader = degraded only where a rescue stage needs a backup):

| file | real reader | no reader | dependence |
|------|-------------|-----------|------------|
| `ledger.py` | 151 (byte-perfect, incl. trailing comment) | **151** (same, incl. trailing comment) | **INDEPENDENT** |
| `apply_renames.py` | 66 | **66** | **INDEPENDENT** |
| `tests/test_ledger.py` | 69 (renamed import) | **68** | **DEPENDENT** (MCP beacon completion) |
| `renames.csv` | 5 (4 rows) | **4** (drops `tot_credits,total_credits`) | **DEPENDENT** (S27 completion) |

So s37's *correctness* needs the reader only for `test_ledger.py` and `renames.csv`; `ledger.py` and
`apply_renames.py` reconstruct correctly from beacons alone.

### Poison-reader caveat (READ BEFORE writing the poison test — s34's T6 shape is WRONG for s37)
Reconstructing with a poison reader (`() => "POISONED\nPOISONED\n"`) gives, live:

| file | poison line count | leaks `POISONED`? |
|------|-------------------|-------------------|
| `tests/test_ledger.py` | 68 | **no** (S28 guard rejects poison → falls back to 68) |
| `renames.csv` | 4 | **no** (S27 guard rejects poison → falls back to 4) |
| `apply_renames.py` | 66 | **no** (no rescue stage touches it) |
| `ledger.py` | **19** | **YES** (2 occurrences) |

`ledger.py`'s reconstruction path **accepts** the poison backup (its forward-validation guard does not
reject it here), collapsing to 19 lines and leaking `POISONED`. This is a **latent robustness gap in a
rescue stage, NOT a correctness gap for s37** — with the real reader (and even with NO reader) `ledger.py`
reconstructs byte-perfectly to 151. No real scenario exercises the poison path, and fixing the guard is an
engine change with regression risk across all 511 tests, so it is **OUT OF SCOPE** for this char-lock.
**Consequence for the test:** do NOT assert `!includes("POISONED")` or a fallback line count on `ledger.py`
in the poison test — assert poison-cleanliness only on the three files that stay clean
(`test_ledger.py` 68, `renames.csv` 4, `apply_renames.py` 66), and add a comment documenting the ledger.py
exclusion (so a future reader knows it was a deliberate, characterized omission — not an oversight).

## Crux (what this scenario uniquely exercises)
1. **MCP-run dependency on the S32 parser fix (the s37-distinct crux):** the rename ran through
   `ctx_execute`, so the MCP-run assistant records carry `attributionMcpServer` / `attributionMcpTool`.
   Loading the JSONL is only possible because those keys are in the assistant allow-set in
   `src/parse/loadTranscript.ts` (S32's fix). A dedicated parser-gate assertion pins this. Were S32's fix
   reverted, `loadRecords(S37_JSONL)` would throw `UnmodeledFieldError`.
2. **Driver-back-and-forth CSV (two user-edits, split provenance):** `renames.csv` must reconstruct to **5
   lines** — rev0 (3 lines), rev1 (4 lines, step-5 manual beacon, NO `tot_credits` row), rev2 (5 lines,
   step-7 NO-BEACON append completed by S27 from a backup). A wrong order or a missed completion drops a
   rename pair.
3. **Incomplete MCP-run beacons completed by the rescue stages:** both run beacons arrive incomplete; the
   existing completion machinery (S27/S28) rebuilds `test_ledger.py` to 69 and the ledger rename to its
   full width. This is the reader-DEPENDENT half.
4. **Edit-ordering across the run:** `report` (post-run edit K) calls `record_entry`/`total_debits` —
   renamed names that exist only because the CSV edits + MCP run applied them; `audit` (pre-run edit E) had
   its body renamed in place to `total_debits`/`total_credits`. Both defs reaching the renamed names proves
   the CSV edits flowed through the MCP run; scope each assertion to its own `def` block.
5. **Whole-word rename:** every old terse name is absent as a whole word in final `ledger.py` /
   `tests/test_ledger.py`; the renamed import + call sites carry the new names.

## Hazards (carry into test assertions)
- **WHOLE-WORD, not substring (always):** assert old-name absence with `/\bold\b/`, never a bare
  `includes("old")`. The new names recur in docstrings/prose (e.g. `report`'s docstring naming
  `record_entry` / `total_debits`) — that is expected; assert **absence of OLD whole-word names**, never
  absence of new names.
- **No rename-pair substring hazard (simpler than S36):** none of the four new names contains an old name
  as a `\bold\b` match (`total_debits` does not contain whole-word `tot_debits`; `remove_entry` does not
  contain `rm_entry`; etc.). So unlike S36's `apply_disc`/`apply_discount` trap there is no pair that fools
  a naive check — but still use `\bold\b` for uniformity and future-proofing.
- **Kept-name check:** `tests/test_ledger.py` covers `bal` (not renamed). Confirm via the live probe that
  no test **method name** embeds a renamed terse name (e.g. no `test_add_entry`); if one does, it is a
  KEPT-NAME control (the method name keeps its substring while the import is renamed) — assert old-name
  absence on the **import line region**, not the whole file, in that case. Live capture showed the final
  import is `from ledger import record_entry, bal, remove_entry`; default to no kept-name control unless the
  probe shows otherwise.
- **Path disambiguation:** use the leading-slash suffix `"/ledger.py"` so it does not also match
  `"/tests/test_ledger.py"`. Reconstructed paths live under `/private/var/folders/.../run-scenario.<rand>/…`.
- **apply_renames.py literal form:** the PRECOMPILED two-line `pattern = …` / `text = re.sub(pattern, …)`
  form — NOT s34's inline form. (See above.)

## Tasks (TDD order)

> Tests assert the CURRENT (correct) engine output → they pass on first run (no RED phase: there is no bug
> to fix). The "test" here is a regression LOCK. Each test must encode an independent cross-source fact, not
> merely echo the engine. **LESSON (S33/S34/S35/S36), apply it:** capture exact CLI strings from a live
> `runCli` run (throwaway probe in the scratchpad, deleted after) BEFORE writing the CLI assertions, so the
> `revision N  @<id>` content-hash strings and DAG lines are pinned to the real output.

1. **Confirm baseline.** `npm test` → 499/0; `npx tsc --noEmit` clean. If not 499, STOP and reconcile with
   the S36 completion handoff (`plans/s36/handoff-api-from-scenarios-20260624-2105.md`) first.

2. **Add the fixture.** In `tests/fixtures.ts`, after `S36_JSONL`, add:
   ```ts
   export const S37_JSONL =
       "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s37-script-rename-driver-back-and-forth-mcp/8f4366d3-271d-4116-a9e0-6da462fed449.jsonl";
   ```

3. **Write `tests/reconstruction_engine_s37.test.ts`** (6 engine tests T1–T6). Copy the helper block
   **verbatim** from `tests/reconstruction_engine_s34.test.ts` (`finalTextOf`, `historyFinalText`,
   `historyEndingWith`, `stripTrailingNewline`, `defBlock`, `realReader`, `poison`, the `FILES` and
   `RENAMES` constants) — change only the ground-truth constant `S37_GT` to
   `…/scenarios/executed/s37-script-rename-driver-back-and-forth-mcp` (the worktree copy is byte-identical
   to the sibling store). `RENAMES` is the same four pairs as S34.

4. **Write `tests/reconstruction_cli_s37.test.ts`** (6 CLI tests C1–C6). Copy `fileVerboseBlock` and
   `finalRevisionSlice` **verbatim** from `tests/reconstruction_cli_s34.test.ts`.

5. **Update docs** (append/prepend an S37 entry, mirroring the S36 entries — DO NOT rewrite prior entries):
   `plans/roadmap.md` (S37 line, suite 511), `plans/reconstruction-engine-design.md` (S37 note immediately
   after the S36 block), `plans/implementation-notes-api-from-scenarios.md` (prepend an S37 entry).

6. **Verify & commit (USER APPROVAL ONLY).** `npm test` → 511/0; `npx tsc --noEmit` clean;
   `git diff --stat -- src/` shows **zero S37 hunks**. Then commit per "Commit hygiene".

## Engine tests — `tests/reconstruction_engine_s37.test.ts`

Constants (same shape as S34):
```ts
const FILES = [
  { suffix: "/ledger.py", rel: "ledger.py" },
  { suffix: "/tests/test_ledger.py", rel: "tests/test_ledger.py" },
  { suffix: "/renames.csv", rel: "renames.csv" },
  { suffix: "/apply_renames.py", rel: "apply_renames.py" },
];
const RENAMES: ReadonlyArray<readonly [string, string]> = [
  ["add_entry", "record_entry"], ["rm_entry", "remove_entry"],
  ["tot_debits", "total_debits"], ["tot_credits", "total_credits"],
];
const poison: BackupReader = () => "POISONED\nPOISONED\n";
```

- **T1 — `test_S37_ledger_bytelock`.** `reconstructBranches(loadRecords(S37_JSONL), realReader(records)).surviving`;
  assert `historyFinalText(historyEndingWith(surviving, "/ledger.py")) === stripTrailingNewline(readGroundTruth("ledger.py"))`,
  final **151** lines, and final line ends with `# names normalized via rename script`.
- **T2 — `test_S37_mixed_reader_dependence`.** The MIXED-reader fact. With **NO reader**
  (`reconstructBranches(loadRecords(S37_JSONL)).surviving`): assert `tests/test_ledger.py` = **68** lines
  and `renames.csv` = **4** lines and `!renamesFinal.includes("tot_credits,total_credits")` (the
  reader-DEPENDENT files degrade); AND `ledger.py` = **151** lines still ending with the trailing comment
  and `apply_renames.py` = **66** lines (the reader-INDEPENDENT files are unchanged vs the real-reader run).
  Comment: ledger.py/apply_renames.py reconstruct from beacons alone; only test_ledger.py and renames.csv
  need a backup (MCP-beacon completion / S27 step-7 append).
- **T3 — `test_S37_renames_csv_three_revisions_via_s27`.** On `historyEndingWith(surviving /*real reader*/,
  "/renames.csv")`: `revisions.length === 3`; `finalTextOf(rev1)` has **4** lines and does NOT include
  `tot_credits,total_credits`; `historyFinalText` (rev2) has **5** lines, includes all four rows
  (`add_entry,record_entry` / `rm_entry,remove_entry` / `tot_debits,total_debits` /
  `tot_credits,total_credits`), and equals `stripTrailingNewline(readGroundTruth("renames.csv"))`. Also
  byte-lock `apply_renames.py` (1 revision, 66 lines) here and assert its body includes BOTH literal lines
  `pattern = r"\b" + re.escape(old) + r"\b"` and `text = re.sub(pattern, new, text)` (use `String.raw`).
- **T4 — `test_S37_renames_whole_word`.** Final `ledger.py` (real reader): for each `[old,new]` in RENAMES,
  `!new RegExp(String.raw`\b${old}\b`).test(ledgerText)` and `ledgerText.includes(new)`. Final
  `test_ledger.py`: `includes("from ledger import record_entry, bal, remove_entry")`, and `!/\badd_entry\b/`,
  `!/\brm_entry\b/`.
- **T5 — `test_S37_edit_ordering_report_on_renamed_audit_present`.** On final `ledger.py` (real reader):
  `defBlock(text, "report")` includes `record_entry` AND `total_debits`, with no whole-word
  `add_entry`/`tot_debits`; `defBlock(text, "audit")` includes `total_debits` AND `total_credits`, with no
  whole-word `tot_debits`/`tot_credits`. Comment: report reaching the renamed names proves the step-5/step-7
  CSV user-edits flowed through the **MCP** run.
- **T6 — `test_S37_event_multiset_and_poison_partial_rejection`.** Two parts:
  (a) **Parser gate / MCP dependency + multiset:** `loadRecords(S37_JSONL)` must not throw; assert at least
  one assistant record exposes `attributionMcpTool === "ctx_execute"` (and `attributionMcpServer` present)
  — pins that s37 is the MCP twin and S32's allow-set is load-bearing. (If the loaded record type does not
  expose those keys, fall back to a minimal raw-JSONL read of the fixture to assert the keys are present;
  the load-not-throwing assertion is the always-available half.) Then `extractFileEvents(loadRecords(S37_JSONL))`:
  `write=4`, `edit=2`, `overwrite=0`, `userEdit` ids sorted `=== ["22de8fa9","9022d09a","a4d3d115","d6a766e2"]`.
  (b) **Poison rejection on the guarded files (NOT ledger.py — see the poison caveat):** reconstruct with
  `poison`; for `tests/test_ledger.py` (68 lines), `renames.csv` (4 lines), `apply_renames.py` (66 lines)
  assert the final text does NOT include `POISONED`. **Do not assert anything about `ledger.py` under
  poison** — add a comment: ledger.py is reader-INDEPENDENT for real inputs (151 with or without a reader)
  but its rescue path accepts a poison backup (collapses to 19, leaks `POISONED`); that is a latent guard
  gap out of scope for this char-lock, deliberately not locked here.

## CLI tests — `tests/reconstruction_cli_s37.test.ts`

> Capture the exact `revision N  @<id>` strings from a live `runCli([S37_JSONL,"--verbose"])` run before
> writing C4–C6 — the `@`-suffixed ids are content-hash strings that must match the real output.

- **C1 — `test_S37_default_conversationDAG_and_fileDAG`.** `runCli([S37_JSONL])` includes
  `"══ conversationDAG ══"`, `"══ fileDAG ══"`, `"A  prompt  #ba6aa3a0"`, `"user-edit  ledger.py"` +
  `"#d6a766e2"`, `"user-edit  renames.csv"` + `"#22de8fa9"`, `"user-edit  test_ledger.py"` + `"#a4d3d115"`,
  `"#9022d09a"`; and `!includes("branch ")` (linear).
- **C2 — `test_S37_list_branches_single_surviving_four_files`.** `runCli([S37_JSONL,"--list-branches"])`
  includes `"surviving  tip #b86404ef"` and each basename
  (`ledger.py`,`test_ledger.py`,`renames.csv`,`apply_renames.py`); `!includes("rewound")`.
- **C3 — `test_S37_graphFile_node_ladders`.** `runCli([S37_JSONL,"--graphFile"])` includes each exact
  block (use `"<file>\n  X  kind  #id\n…<next-file>"` boundaries to pin node counts):
  ledger.py [B write #01CYqN83, D user-edit #d6a766e2, E edit #01PYH1VX, J user-edit #9022d09a,
  K edit #01LDWkZ4], test_ledger.py [C write #01WpEmo9, I user-edit #a4d3d115],
  renames.csv [F write #01Y47SEb, G user-edit #22de8fa9], apply_renames.py [H write #013qfmtR].
- **C4 — `test_S37_verbose_ledger_seven_revisions_final_renamed`.** `fileVerboseBlock(runCli([S37_JSONL,
  "--verbose"]), "/ledger.py")`: includes `"revision 6  @"`, `!includes("revision 7  @")`. On
  `finalRevisionSlice`: includes `"(151 lines)"`, `"def report("`, `"def audit("`,
  `"# names normalized via rename script"`; and `!/\badd_entry\b/`, `!/\brm_entry\b/`, `!/\btot_debits\b/`,
  `!/\btot_credits\b/`.
- **C5 — `test_S37_verbose_test_file_renamed`.** `fileVerboseBlock(…, "/tests/test_ledger.py")`: includes
  `"revision 2  @"`, `!includes("revision 3  @")`. On `finalRevisionSlice`: includes `"(69 lines)"`,
  `"from ledger import record_entry, bal, remove_entry"`; and `!/\badd_entry\b/`, `!/\brm_entry\b/`.
- **C6 — `test_S37_verbose_renames_csv_two_user_edits_and_apply_script`.** `fileVerboseBlock(…,"/renames.csv")`:
  includes `"revision 0  @"` + `"(3 lines)"`, `"revision 1  @"` + `"(4 lines)"`, `"revision 2  @"` +
  `"(5 lines)"`, `!includes("revision 3  @")`; the block includes `"tot_credits,total_credits"` (final row)
  and the other three rows. `fileVerboseBlock(…,"/apply_renames.py")`: includes `"revision 0  @"`,
  `"(66 lines)"`, `!includes("revision 1  @")`, and BOTH literal lines
  `pattern = r"\b" + re.escape(old) + r"\b"` and `text = re.sub(pattern, new, text)` (use `String.raw`).

## Verification already performed (re-confirm, don't re-derive)
At HEAD (baseline 499), live probes produced:
- `runCli([S37_JSONL])` (and `--list-branches`, `--graphFile`, `--verbose`) ran with **no exception**;
  `loadRecords(S37_JSONL)` does not throw (S32 parser fix present).
- `reconstructBranches(records, realReader)` → `rewound=0`, `surviving=4`; all four files byte-equal to the
  rendered ground truth (per-file delta is only the disk file's trailing newline, which the verbose
  renderer never emits — same as every prior scenario).
- Real-reader ladders: ledger.py [119,9,120,137,137,138,151], test_ledger.py [69,68,69],
  renames.csv [3,4,5], apply_renames.py [66]. Tip `#b86404ef`, prompt `#ba6aa3a0`.
- No-reader: ledger.py 151 (incl. trailing comment), apply_renames.py 66 (both INDEPENDENT);
  test_ledger.py 68, renames.csv 4 (both DEPENDENT).
- Poison-reader: test_ledger.py 68 / renames.csv 4 / apply_renames.py 66 stay clean of `POISONED`;
  ledger.py collapses to 19 and leaks `POISONED` (the documented, out-of-scope guard gap).
- `extractFileEvents` = `{write:4, edit:2, userEdit:4, overwrite:0}` with ids
  `["22de8fa9","9022d09a","a4d3d115","d6a766e2"]`.

## Commit hygiene (USER APPROVAL ONLY)
Stage EXACTLY these S37 paths — never `git add -A`, never any `src/*` (S37 changes no source):
`tests/fixtures.ts`, `tests/reconstruction_engine_s37.test.ts`, `tests/reconstruction_cli_s37.test.ts`,
`plans/roadmap.md`, `plans/reconstruction-engine-design.md`,
`plans/implementation-notes-api-from-scenarios.md`, `plans/s37/`.

**COORDINATION HAZARD (same as S28–S36):** the worktree carries uncommitted prior-scenario work —
`src/parse/loadTranscript.ts` (the S32 fix s37 depends on), `src/reconstruction_reseed.ts`,
`src/reconstruction_beacons.ts`, `src/reconstruction_branches.ts`, `_sidecar.ts`, `_user_edit.ts`, the
S28–S36 test/plan/doc files, and unrelated `src/Plan_template.md` / `src/Impl_template.md` edits by other
agents. The three doc files in this commit also carry S28–S36 edits. `git diff --stat` is NOT S37-only —
confirm the commit-split with the user; do not `git add -A`.

## How to verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 511 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s37.test.ts tests/reconstruction_cli_s37.test.ts   # 12/12
git diff --stat -- src/    # NO s37-attributable change (S37 is a pure characterization lock)
```
