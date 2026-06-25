# S35 Reconstruction Plan — `s35-script-rename-script-user-edit` (CHAR-LOCK, no engine change)

## Verdict
`reconstruction_cli` processes Scenario s35 **without any engine modifications**. All three touched
files reconstruct **byte-identical** to their independently-rendered ground truth **with the real
file-history reader**. S35 is **reader-DEPENDENT (MIXED)** — like S25:
- `inventory.py` is reader-INDEPENDENT (its script-run beacon is COMPLETE → 244 lines with or without a reader).
- `test_inventory.py` and `rename_inv.py` are reader-DEPENDENT — their script-phase beacons are
  INCOMPLETE (truncated / elided), so the engine's S27/S28 rescue stages complete them from
  file-history backups. With NO reader they fall back to the raw fragments (51 / 17 lines).

This is the **complement of S33** (`s33-script-rename-csv-user-edit`): same "a file is user-edited
before the script run" shape, but where S33's beacons were all COMPLETE (every rescue stage INERT),
S35's beacons are INCOMPLETE so the rescue stages FIRE. S35 composes already-shipped machinery:
- **S27 `completeTruncatedBeacon`** — the truncated terminal beacon on `test_inventory.py`.
- **S28 `completeElidedBeacons`** — the head+tail-elided terminal beacon on `rename_inv.py`.
- **S15 native user-edit** — the complete beacon on `inventory.py` and the post-script `restock` edit.

The novel composition: the user-edited file is the **rename script itself** (`rename_inv.py`), and its
**two** user-edits (scenario steps 4 & 5) **coalesce into a single elided `edited_text_file` beacon**
(only one beacon, `#c67cfd9c`, lands for it). The completion machinery already handles this.

The implementation is therefore a **characterization / regression LOCK** — add a fixture, write engine
+ CLI tests that pin the current correct output, update three docs. **No `src/` change.**

This was verified live at HEAD (baseline below): the implementer must **re-confirm, not re-derive**.

## Baseline
- Suite **475/475 green** at HEAD (`cededae` + uncommitted S28–S34 work — NOTHING committed). After
  this lock: **475 → 487** (6 engine + 6 CLI = 12 new tests).
- `npx tsc --noEmit` clean.
- If `npm test` is not 475, STOP and reconcile with the S34 handoff
  (`plans/s34/handoff-api-from-scenarios-20260624-2010.md`) before continuing.

## The scenario (inputs on disk)
- Definition: `scenarios/s35-script-rename-script-user-edit.txt`
- Executed run + rendered files (worktree copy): `scenarios/executed/s35-script-rename-script-user-edit/`
  (`inventory.py`, `tests/test_inventory.py`, `rename_inv.py`) — byte-identical (md5-verified) to the
  sibling RevEng store the fixture points at.
- JSONL (fixture target, sibling store):
  `…/RevEng/plans/scenarios/executed/s35-script-rename-script-user-edit/2a208e10-4881-4f85-8006-2e24dfd523b7.jsonl`
  (md5-identical to the worktree copy). Same UUID ⇒ shared file-history backups under
  `~/.claude/file-history/2a208e10-4881-4f85-8006-2e24dfd523b7/`.

### What the session did (transcript-verified)
1. **Write** `inventory.py` (terse-named `qty_chk`/`add_item`/`rm_item`/`find_item`/`tot_value` + helpers)
   and `tests/test_inventory.py` (covers `qty_chk`, `tot_value`).
2. **Edit** `inventory.py`: added `low_stock(store, threshold)` (pre-script; references no renamed name).
3. **Write** `rename_inv.py` with `RENAMES` holding **one** tuple `("qty_chk", "check_quantity")`.
4. **User-edit** `rename_inv.py`: inserted `("add_item", "insert_item"),`. ← user-edits the **script**.
5. **User-edit** `rename_inv.py`: inserted `("rm_item", "remove_item"),`. ← second script user-edit.
   *Steps 4 & 5 land as a SINGLE coalesced `edited_text_file` beacon (`#c67cfd9c`), which is ELIDED.*
6. **Ran** `python3 rename_inv.py` **via Bash** (NOT the context-mode MCP sandbox). The run rewrites
   `inventory.py` and `tests/test_inventory.py` → surfaces as **two `edited_text_file` beacons**
   (`#dbc2e4c1` inventory = COMPLETE; `#f3e90535` test = TRUNCATED). No Edit/Write record of its own.
7. **Edit** `inventory.py`: added `restock(store, name, n)` (post-script) that calls **`check_quantity`**
   and **`insert_item`** — the renamed names. Load-bearing: proves the edit applied on the renamed beacon.

### The renames (3 whole-word pairs)
`qty_chk→check_quantity`, `add_item→insert_item`, `rm_item→remove_item`. Applied with
`re.sub(r"\b" + re.escape(old) + r"\b", new, text)` (whole-word). `find_item` and `tot_value` are terse
but **NOT** in the list → they survive unchanged (kept-name hazard, below).

## Reconstructed structure (live-verified — the LOCK targets)

### conversationDAG (default view) — linear, one prompt, no rewind
```
A  prompt     #da499f4e
  B  write      inventory.py       #018onbtn
  C  write      test_inventory.py  #019Dbqca
  D  edit       inventory.py       #01QJk3w5
  E  write      rename_inv.py      #017SLne6
  F  user-edit  rename_inv.py      #c67cfd9c   ← the coalesced ELIDED script beacon (steps 4+5)
  G  user-edit  inventory.py       #dbc2e4c1   ← script-run beacon, COMPLETE
  H  user-edit  test_inventory.py  #f3e90535   ← script-run beacon, TRUNCATED
  I  edit       inventory.py       #01WWAP3d   ← restock (post-script)
```

### fileDAG / `--graphFile` node ladders (exact, per file)
The synthetic overwrite revisions add **no DAG node** (their changeId is the backup blob name, spec 40 —
same as S34), so the fileDAG shows only the OBSERVED events:
```
inventory.py
  B  write      #018onbtn
  D  edit       #01QJk3w5
  G  user-edit  #dbc2e4c1
  I  edit       #01WWAP3d
test_inventory.py
  C  write      #019Dbqca
  H  user-edit  #f3e90535
rename_inv.py
  E  write      #017SLne6
  F  user-edit  #c67cfd9c
```

### `--list-branches`
`surviving  tip #72049b4a    inventory.py, test_inventory.py, rename_inv.py` — **no rewound branch**,
`rewound.length === 0`, `surviving.length === 3`.

### Revision ladders (`--verbose`; with the real reader) — the LOCK targets
| file | revisions | kinds | ladder (lines/rev) | final lines |
|------|-----------|-------|--------------------|-------------|
| `inventory.py` | **4** (rev 0..3) | write, edit, user-edit, edit | 172 → 192 → 192 → 244 | **244** |
| `tests/test_inventory.py` | **3** (rev 0..2) | write, user-edit, **overwrite** | 79 → **51** → 79 | **79** |
| `rename_inv.py` | **3** (rev 0..2) | write, user-edit, **overwrite** | 43 → **17** → 45 | **45** |

- `inventory.py`: write (B) → `low_stock` edit (D) → script beacon (G, COMPLETE, 192, whole-word rename
  keeps line count) → `restock` edit (I, +52 → 244).
- `test_inventory.py`: write (C, 79, terse) → **truncated** script beacon (H, rev1 = first 51 of 79 lines)
  → **synthetic overwrite** completed from backup `5ea404c2628560f6@v3` (rev2 = 79, renamed). **S27 path.**
- `rename_inv.py`: write (E, 43, ONE rename tuple) → **elided** script beacon (F, rev1 = 17 lines, the
  head+tail-cut middle window) → **synthetic overwrite** from backup `41364cab6ad88cbb@v2` (rev2 = 45,
  THREE rename tuples). **S28 path.** This is the fragment+synthetic two-revision shape that S27/S28/S30
  established and lock (write + userEdit-fragment + overwrite-completion); S35 reproduces it exactly.

The `--verbose` revision header is `revision N  @ <ISO-timestamp>  (M lines)` — it shows neither the
changeId nor an `@vN`/`overwrite` marker. CLI tests therefore lock revision **count**, **line count**,
and **content**, not the synthetic changeId (assert the changeId in the ENGINE tests instead).

### `extractFileEvents` multiset
`write = 3`, `edit = 2` (both on `inventory.py`: D `low_stock`, I `restock`), `overwrite = 0`,
`userEdit = 3` with short ids (sorted) **`["c67cfd9c", "dbc2e4c1", "f3e90535"]`**. All three are
`edited_text_file` user-edits; provenance differs: `c67cfd9c` (rename_inv.py) is the coalesced **script
user-edit**; `dbc2e4c1` (inventory) and `f3e90535` (test) are the **script-run beacons**. `overwrite = 0`
because the synthetic completions are injected during per-file replay (a later pipeline stage), NOT by
`extractFileEvents`.

## Reader-dependence matrix (live-verified — the LOCK targets)
| file | NO reader | REAL reader | POISON reader |
|------|-----------|-------------|---------------|
| `inventory.py` | 244, 4 revs ✓ | 244, 4 revs ✓ | 244 (never leaks POISONED) |
| `test_inventory.py` | **51, 2 revs** (fragment) | 79, 3 revs ✓ | falls back → 51 (never leaks POISONED) |
| `rename_inv.py` | **17, 2 revs** (fragment) | 45, 3 revs ✓ | falls back → 17 (never leaks POISONED) |

- **NO reader** ⇒ no overwrite completion: `test`/`rename` keep ONLY their raw fragment (2 revs each),
  `inventory` is unaffected (complete beacon). This is the reader-dependence proof.
- **POISON reader** (`() => "POISONED\nPOISONED\n"`) ⇒ the S27/S28 content guards reject it
  (`beaconIsTruncated` / elided content-validation fail), so the files fall back to the no-reader
  fragments. No final text ever contains `"POISONED"`. Safety proof (mirrors S34's poison test).

## Crux (what this scenario uniquely exercises)
1. **The rename SCRIPT itself is user-edited, and the engine completes its elided beacon.** `rename_inv.py`
   goes write (1 tuple) → user-edited (3 tuples) but lands as a single ELIDED `edited_text_file` beacon
   (`#c67cfd9c`, rev1 = 17 lines, head+tail cut). S28 `completeElidedBeacons` recovers the full 45-line
   3-tuple script from backup `41364cab6ad88cbb@v2`. Final `rename_inv.py` must hold all three tuples and
   the whole-word `re.sub` substitution literal.
2. **Mixed beacon completeness in one run.** The same Bash run leaves a COMPLETE beacon for `inventory.py`
   (no rescue) and a TRUNCATED beacon for `test_inventory.py` (S27 `completeTruncatedBeacon` → backup
   `5ea404c2628560f6@v3`). Lock both: inventory reader-INDEPENDENT, test reader-DEPENDENT.
3. **Load-bearing post-script edit on the renamed beacon.** Step-7 `restock` calls `check_quantity` and
   `insert_item` (renamed names). Scoped to its own `def` block, `restock` must contain the renamed names
   and no whole-word terse form — proving the edit replayed on top of the (renamed) script beacon.

## Hazards (carry into test assertions)
- **Kept-name hazard (S31/S32 pattern) — PRESENT here:**
  - `find_item` and `tot_value` are terse but **not** in the rename list → they **survive** as whole
    words in final `inventory.py` (`\bfind_item\b` and `\btot_value\b` present) and `test_inventory.py`
    keeps `from inventory import check_quantity, tot_value`. Assert these SURVIVE — do not assert their absence.
  - `test_inventory.py` method names `test_qty_chk_less_than_stock`, `test_qty_chk_equal_to_stock`, … keep
    `qty_chk` as a **substring** (preceded by `_`, so `\bqty_chk\b` does not match them and the rename left
    them untouched). So in final `test_inventory.py`: `\bqty_chk\b` count is **0** (import/call sites
    renamed) while the bare substring `qty_chk` count is **5** (method names). Assert old-name absence with
    `\bqty_chk\b` (whole-word) ONLY — a substring `includes("qty_chk")` check would WRONGLY fail.
- **Prose hazard:** the new names appear in docstrings (e.g. `restock`'s docstring `:func:`check_quantity``).
  That is expected — assert **absence of OLD whole-word names**, never absence of new names.
- **Path disambiguation:** suffix `"/inventory.py"` (leading slash) so it does not also match
  `"/tests/test_inventory.py"`. Reconstructed paths live under `/private/var/folders/.../run-scenario.11tr32v1/…`.
- **Reader is mandatory for the byte-locks.** Build it exactly as the CLI does:
  `createSidecarReader(findSessionId(records)!, getDefaultFileHistoryRoot())` (the `realReader` helper from
  the S34 engine test). Without it, `test`/`rename` byte-locks FAIL (they fall back to 51/17).

## Tasks (TDD order)

> Tests assert the CURRENT (correct) engine output → they pass on first run (no RED phase: there is no
> bug to fix). The "test" here is a regression LOCK. Each test must encode an independent cross-source
> fact, not merely echo the engine. **Capture exact CLI strings from a live `runCli` run before writing
> the CLI assertions** (S33 lesson) — a throwaway script that prints `runCli([S35_JSONL, "--verbose"])`.

1. **Confirm baseline.** `npm test` → 475/0; `npx tsc --noEmit` clean. If not 475, STOP (see Baseline).

2. **Add the fixture.** In `tests/fixtures.ts`, after `S34_JSONL`, add:
   ```ts
   export const S35_JSONL =
       "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s35-script-rename-script-user-edit/2a208e10-4881-4f85-8006-2e24dfd523b7.jsonl";
   ```

3. **Write `tests/reconstruction_engine_s35.test.ts`** (6 engine tests T1–T6). Copy the helper block
   **verbatim** from `tests/reconstruction_engine_s34.test.ts` — it already has everything S35 needs:
   `finalTextOf`, `historyFinalText`, `historyEndingWith`, `stripTrailingNewline`, `defBlock`,
   `readGroundTruth`, `realReader`, and `poison`. Change ONLY the ground-truth constant to the s35
   sibling-store path and the `FILES` array (below).

4. **Write `tests/reconstruction_cli_s35.test.ts`** (6 CLI tests C1–C6). Copy `fileVerboseBlock` and
   `finalRevisionSlice` **verbatim** from `tests/reconstruction_cli_s34.test.ts`.

5. **Update docs** (append/prepend an S35 entry, mirroring the S34 entries — DO NOT rewrite prior
   entries): `plans/roadmap.md` (S35 line, suite 487), `plans/reconstruction-engine-design.md`
   (S35 note immediately after the S34 block), `plans/implementation-notes-api-from-scenarios.md`
   (prepend an S35 entry).

6. **Verify & commit (USER APPROVAL ONLY).** `npm test` → 487/0; `npx tsc --noEmit` clean;
   `git diff --stat -- src/` shows **zero S35 hunks** (no `src/` file changed by S35). Then commit per
   "Commit hygiene".

## Engine tests — `tests/reconstruction_engine_s35.test.ts`

Constants (after the copied helpers):
```ts
const S35_GT =
  "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s35-script-rename-script-user-edit";
const FILES = [
  { suffix: "/inventory.py", rel: "inventory.py" },
  { suffix: "/tests/test_inventory.py", rel: "tests/test_inventory.py" },
  { suffix: "/rename_inv.py", rel: "rename_inv.py" },
];
const RENAMES: ReadonlyArray<readonly [string, string]> = [
  ["qty_chk", "check_quantity"], ["add_item", "insert_item"], ["rm_item", "remove_item"],
];
```
(Have `readGroundTruth` read from `S35_GT`.)

- **T1 — `test_S35_all_files_bytelock_with_reader`.** `const recs = loadRecords(S35_JSONL); const surviving =
  reconstructBranches(recs, realReader(recs)).surviving;` For EACH `FILES` entry assert
  `historyFinalText(historyEndingWith(surviving, suffix)) === stripTrailingNewline(readGroundTruth(rel))`.
  Locks all three final states byte-for-byte (244 / 79 / 45) against the independently-rendered files.
- **T2 — `test_S35_rename_script_elided_beacon_completed_from_backup`.** The headline crux.
  `historyEndingWith(surviving, "/rename_inv.py")`: assert
  `revisions.map(r => r.kind) === [write, userEdit, overwrite]` (use `EventKind`), `revisions.length === 3`;
  `finalTextOf(rev0)` has **43** lines and includes only `("qty_chk", "check_quantity")` (NOT `insert_item`
  / `remove_item`); `rev1.kind === userEdit` with `rev1.lines.length === 17` (the elided fragment) and its
  first line is `"boundaries) so that substrings inside longer identifiers are left alone."`; `rev2.kind ===
  overwrite`, `rev2.changeId.toString() === "41364cab6ad88cbb@v2"`, `rev2.lines.length === 45`; and
  `historyFinalText` includes all three tuples — `("qty_chk", "check_quantity")`, `("add_item",
  "insert_item")`, `("rm_item", "remove_item")` — plus the substitution literal
  `String.raw`re.sub(r"\b" + re.escape(old) + r"\b", new, text)``. Comment must state: the single coalesced
  elided beacon (steps 4+5) is completed from `@v2`.
- **T3 — `test_S35_test_file_truncated_beacon_and_inventory_complete_beacon`.** Contrast the two
  script-run beacons. `historyEndingWith(surviving, "/tests/test_inventory.py")`:
  `revisions.map(r => r.kind) === [write, userEdit, overwrite]`, `length === 3`; `rev1.lines.length === 51`
  (truncated prefix); `rev2.kind === overwrite`, `rev2.changeId.toString() === "5ea404c2628560f6@v3"`,
  `rev2.lines.length === 79`. `historyEndingWith(surviving, "/inventory.py")`:
  `revisions.map(r => r.kind) === [write, edit, userEdit, edit]`, `length === 4`, ladder line counts
  `[172, 192, 192, 244]`, and the rev2 user-edit (the COMPLETE beacon) has `lines.length === 192` (no
  overwrite revision exists for inventory.py). Comment: same run, mixed beacon completeness.
- **T4 — `test_S35_renames_whole_word_and_kept_names`.** Final `inventory.py` (`const inv = historyFinalText(
  historyEndingWith(surviving, "/inventory.py"))`): for each `[old, new]` in RENAMES,
  `!new RegExp(\`\\b${old}\\b\`).test(inv)` and `inv.includes(new)`; AND kept names survive:
  `/\bfind_item\b/.test(inv)` and `/\btot_value\b/.test(inv)`. Final `test_inventory.py`:
  `includes("from inventory import check_quantity, tot_value")`, `!/\bqty_chk\b/.test(testText)`, and
  `testText.includes("def test_qty_chk_less_than_stock(")` (the kept SUBSTRING method name survives — the
  whole-word rename did not touch it). Comment must state the kept-name hazard explicitly.
- **T5 — `test_S35_restock_uses_renamed_names_lowstock_unaffected`.** On final `inventory.py`:
  `defBlock(inv, "restock")` includes `check_quantity` AND `insert_item` and has no whole-word `qty_chk` /
  `add_item` (`!/\bqty_chk\b/`, `!/\badd_item\b/` on the block); `defBlock(inv, "low_stock")` is present and
  contains neither old nor new terse names of the rename set (the pre-script edit the rename left
  untouched). Comment: `restock` calling the renamed names proves the post-script edit replayed on the
  renamed script beacon.
- **T6 — `test_S35_multiset_reader_dependence_and_poison_rejected`.** `extractFileEvents(loadRecords(
  S35_JSONL))`: counts `write === 3`, `edit === 2`, `overwrite === 0`, and the `userEdit` short ids
  (first 8 chars, sorted) `=== ["c67cfd9c", "dbc2e4c1", "f3e90535"]`. Reader-dependence: reconstruct with
  NO reader and assert `historyEndingWith(noReader, "/tests/test_inventory.py").revisions.length === 2`
  with final 51 lines, `historyEndingWith(noReader, "/rename_inv.py").revisions.length === 2` with final 17
  lines, and `historyEndingWith(noReader, "/inventory.py")` final still `=== stripTrailingNewline(
  readGroundTruth("inventory.py"))` (reader-INDEPENDENT). Poison: reconstruct with `poison`; for every
  `FILES` suffix assert the poisoned final text never `includes("POISONED")`, and the poisoned `test` /
  `rename` finals equal their NO-reader finals (guards reject the poison, falling back to the fragment).

## CLI tests — `tests/reconstruction_cli_s35.test.ts`

- **C1 — `test_S35_default_conversationDAG_and_fileDAG`.** `runCli([S35_JSONL])` includes
  `"══ conversationDAG ══"`, `"══ fileDAG ══"`, `"A  prompt  #da499f4e"`,
  `"user-edit  rename_inv.py"` + `"#c67cfd9c"`, `"user-edit  inventory.py"` + `"#dbc2e4c1"`,
  `"user-edit  test_inventory.py"` + `"#f3e90535"`; and `!includes("branch ")` (linear).
- **C2 — `test_S35_list_branches_single_surviving_three_files`.** `runCli([S35_JSONL, "--list-branches"])`
  includes `"surviving  tip #72049b4a"` and each basename (`inventory.py`, `test_inventory.py`,
  `rename_inv.py`); `!includes("rewound")`.
- **C3 — `test_S35_graphFile_node_ladders`.** `runCli([S35_JSONL, "--graphFile"])` includes each exact
  block (use the `"<file>\n  X  kind  #id\n…<next-file>"` boundaries to pin node counts; overwrite adds NO
  node): inventory.py [B write #018onbtn, D edit #01QJk3w5, G user-edit #dbc2e4c1, I edit #01WWAP3d],
  test_inventory.py [C write #019Dbqca, H user-edit #f3e90535],
  rename_inv.py [E write #017SLne6, F user-edit #c67cfd9c].
- **C4 — `test_S35_verbose_rename_script_three_revisions_completed`.** `fileVerboseBlock(runCli([S35_JSONL,
  "--verbose"]), "/rename_inv.py")`: includes `"revision 0  @"` + `"(43 lines)"`, `"revision 1  @"` +
  `"(17 lines)"`, `"revision 2  @"` + `"(45 lines)"`, `!includes("revision 3  @")`. On `finalRevisionSlice`:
  includes `("qty_chk", "check_quantity")`, `("add_item", "insert_item")`, `("rm_item", "remove_item")`,
  and `String.raw`re.sub(r"\b" + re.escape(old) + r"\b", new, text)``.
- **C5 — `test_S35_verbose_test_file_renamed_with_kept_substring`.** `fileVerboseBlock(…,
  "/tests/test_inventory.py")`: includes `"revision 0  @"` + `"(79 lines)"`, `"revision 1  @"` +
  `"(51 lines)"`, `"revision 2  @"` + `"(79 lines)"`, `!includes("revision 3  @")`. On `finalRevisionSlice`:
  includes `"from inventory import check_quantity, tot_value"` and `"def test_qty_chk_less_than_stock("`
  (kept substring), `!/\bqty_chk\b/`. (rev0's `finalRevisionSlice` is not used here; the kept-substring +
  whole-word-absence pair is the cross-fact.)
- **C6 — `test_S35_verbose_inventory_final_renamed_and_kept_names`.** `fileVerboseBlock(…, "/inventory.py")`:
  includes `"revision 3  @"` + `"(244 lines)"`, `!includes("revision 4  @")`. On `finalRevisionSlice`:
  includes `"def check_quantity("`, `"def insert_item("`, `"def remove_item("`, `"def restock("`,
  `"def find_item("`, `"def tot_value("`; and `!/\bqty_chk\b/`, `!/\badd_item\b/`, `!/\brm_item\b/`.

## Verification already performed (re-confirm, don't re-derive)
At HEAD (baseline 475), with `realReader`, `reconstructBranches(loadRecords(S35_JSONL), reader)` produced:
`rewound = 0`, `surviving = 3`. Final texts byte-equal to the rendered ground truth for all three files
(244 / 79 / 45). Revision ladders, kinds, and synthetic changeIds exactly as the tables above.
`extractFileEvents` = `{write:3, edit:2, userEdit:3, overwrite:0}` with short ids
`["c67cfd9c","dbc2e4c1","f3e90535"]`. With NO reader: `test` = 51/2-revs, `rename` = 17/2-revs,
`inventory` = 244/4-revs. With the poison reader: `test`/`rename` fall back to 51/17, no file leaks
`"POISONED"`. Rescue stages that FIRE: S28 `completeElidedBeacons` (rename_inv.py → `@v2`), S27
`completeTruncatedBeacon` (test_inventory.py → `@v3`). `seedStaleEditBases` (S19/S23/m6) and S34's
`outOfWindowEditSeed` do NOT fire. `inventory.py`'s beacon is COMPLETE (no rescue).

## Commit hygiene (USER APPROVAL ONLY)
Stage EXACTLY these S35 paths — never `git add -A`, never any `src/*` (S35 changes no source):
`tests/fixtures.ts`, `tests/reconstruction_engine_s35.test.ts`, `tests/reconstruction_cli_s35.test.ts`,
`plans/roadmap.md`, `plans/reconstruction-engine-design.md`,
`plans/implementation-notes-api-from-scenarios.md`, `plans/s35/`.

**COORDINATION HAZARD (same as S28–S34):** the worktree carries uncommitted prior-scenario work —
`src/parse/loadTranscript.ts` (S32 fix), `src/reconstruction_reseed.ts`, `src/reconstruction_beacons.ts`
(new in S34), `src/reconstruction_branches.ts`, `_sidecar.ts`, `_user_edit.ts`, the S28–S34
test/plan/doc files, and unrelated `src/Plan_template.md` / `src/Impl_template.md` edits by other
agents. The three doc files in this commit also carry S28–S34 edits. `git diff --stat` is NOT S35-only —
confirm the commit-split with the user; do not `git add -A`.

## How to verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 487 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s35.test.ts tests/reconstruction_cli_s35.test.ts   # 12/12
git diff --stat -- src/    # NO s35-attributable change (S35 is a pure characterization lock)
```
