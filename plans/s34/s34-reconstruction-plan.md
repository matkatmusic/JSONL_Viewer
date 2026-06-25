# S34 Reconstruction Plan — `s34-script-rename-driver-back-and-forth` (REAL ENGINE FIX, reader-dependent)

## Verdict
`reconstruction_cli` **does NOT** reconstruct Scenario s34 correctly at HEAD. One file is wrong:
`ledger.py` reconstructs to **186** lines; ground truth is **187**. The dropped line is a NO-BEACON
manual append (`# names normalized via rename script`) that landed on disk BETWEEN a beacon and a later
Claude `Edit`, OUTSIDE that edit's hunk window — so the existing stale-edit-base detector
(`editBaseIsStale`, hunk-context only) misses it. This needs a **REAL engine fix** in
`src/reconstruction_reseed.ts` (the first real engine fix since m6/S28). The other three files already
reconstruct byte-perfectly (one of them, `renames.csv`, only via the existing S27
`completeTruncatedBeacon` — see "Reader dependence").

This was verified live at HEAD: the fix below was prototyped (suite 463→463 green, `ledger.py`→187, all
four files byte-equal, `tsc` clean) and then reverted byte-clean. The implementer must re-apply and
re-confirm, not re-derive.

## Baseline
- Suite **463/463 green** at HEAD (`cededae` + uncommitted S28–S33 work — NOTHING committed). After this
  fix + lock tests: **463 → 475** (6 engine + 6 CLI = 12 new tests). `npx tsc --noEmit` clean.
- If the count is not 463, STOP and reconcile with the S33 handoff
  (`plans/s33/handoff-api-from-scenarios-20260624-1932.md`) before continuing.

## The scenario (inputs on disk)
- Definition: `scenarios/s34-script-rename-driver-back-and-forth.txt`
- Executed run + rendered files: `scenarios/executed/s34-script-rename-driver-back-and-forth/`
  (`ledger.py`, `tests/test_ledger.py`, `renames.csv`, `apply_renames.py`) — byte-identical to the
  sibling store the fixture points at.
- JSONL (fixture target, sibling store):
  `…/RevEng/plans/scenarios/executed/s34-script-rename-driver-back-and-forth/709c9b35-62d2-44c9-84ed-5e63ca90073e.jsonl`
  (byte-identical to the worktree copy).

### What the session did (the "back and forth" = interleaved CSV edits around the driver write)
1. Wrote `ledger.py` (terse-named `add_entry`/`rm_entry`/`tot_debits`/`tot_credits`/`bal` + helpers,
   156 lines) and `tests/test_ledger.py` (covers `bal`, 57 lines).
2. **Manual edit** `ledger.py`: prepended `# ledger module — managed by finance` → **beacon @157**.
3. **Claude Edit** `ledger.py`: added `audit(book)` (pre-script) → 173 lines.
4. **Wrote** `renames.csv` with header + **2** rows: `add_entry,record_entry` / `rm_entry,remove_entry`
   (3 lines).
5. **Manual edit** `renames.csv`: appended `tot_debits,total_debits` → **beacon @4 lines**.
6. **Wrote** `apply_renames.py` (driver; reads `renames.csv`, applies each pair as a whole-word
   `re.sub(rf"\b{re.escape(old)}\b", new, text)` to both `ledger.py` and `tests/test_ledger.py`).
   ← the driver is written BETWEEN the two CSV edits ("back and forth").
7. **Manual edit** `renames.csv`: appended `tot_credits,total_credits` → 5 lines. **NO BEACON** (this
   echo is absent from the transcript — recovered only from a file-history backup; S27 path).
8. **Ran** `apply_renames.py` **once via Bash** → rewrites `ledger.py` (4 whole-word renames, still 173
   lines) and `tests/test_ledger.py` (57 lines). Surfaces as **two `edited_text_file` beacons**.
9. **Manual edit** `ledger.py`: appended `# names normalized via rename script` → 174 lines. **NO
   BEACON** (this echo is absent from the transcript — the sole engine gap; recovered only from a
   file-history backup, the NEW fix).
10. **Claude Edit** `ledger.py`: added `report(book, entry=None)` (post-script; calls `record_entry` and
    `total_debits` — the renamed names) → 187 lines.

The four renames applied by the script: `add_entry→record_entry`, `rm_entry→remove_entry`,
`tot_debits→total_debits`, `tot_credits→total_credits`. The last two exist only because of the step-5
and step-7 CSV manual edits.

## Reconstructed structure (live-verified — the LOCK targets)

### conversationDAG (default view) — linear, one prompt, no rewind
```
A  prompt  #7d7450c2
  B  write      ledger.py         #0185fBUs
  C  write      test_ledger.py    #01La3fdo
  D  user-edit  ledger.py         #0ee68aad
  E  edit       ledger.py         #01JBokec
  F  write      renames.csv       #01P4fRne
  G  user-edit  renames.csv       #ba8ee917
  H  write      apply_renames.py  #01FTauF3
  I  user-edit  ledger.py         #2a0d75ba
  J  user-edit  test_ledger.py    #720ee20c
  K  edit       ledger.py         #01KcAiCq
```
`#01KcAiCq` (K) is the **successful** `report` edit. The session also has a FAILED `report` edit
(`toolu_01Q1y1…`, "file modified since read") that carries NO `structuredPatch` and therefore produces
NO event/node — this is the marker that step-9 changed the file on disk. The step-7 and step-9 manual
edits have NO beacon, so they appear as NO node here either.

### fileDAG / `--graphFile` node ladders (exact, per file — SAME with or without the fix)
```
ledger.py
  B  write      #0185fBUs
  D  user-edit  #0ee68aad
  E  edit       #01JBokec
  I  user-edit  #2a0d75ba
  K  edit       #01KcAiCq
test_ledger.py
  C  write      #01La3fdo
  J  user-edit  #720ee20c
renames.csv
  F  write      #01P4fRne
  G  user-edit  #ba8ee917
apply_renames.py
  H  write      #01FTauF3
```
The fix adds NO node here: the synthetic backup-seed Write has `changeId = blob name` (spec-40), so it
stays out of the graphs; it surfaces only as an extra **revision** in `--verbose`.

### `--list-branches`
`surviving  tip #97e510eb    ledger.py, test_ledger.py, renames.csv, apply_renames.py` — no rewound
branch, `rewound.length === 0`, `surviving.length === 4`.

### Revision ladders (`--verbose`; final-revision line counts, WITH the real reader)
| file | revisions | final lines | ladder (lines per revision) |
|------|-----------|-------------|------------------------------|
| `ledger.py` | **6** | **187** | 156 → 157 → 173 → 173 → **174** → 187 |
| `tests/test_ledger.py` | 2 | 57 | 57 → 57 |
| `renames.csv` | **3** | **5** | 3 → 4 → **5** |
| `apply_renames.py` | 1 | 54 | 54 |

- `ledger.py`: write(B 156) → prepend beacon(D 157) → `audit` edit(E 173) → script-rename beacon(I 173)
  → **synthetic v4 reseed (174 — the NEW fix; the step-9 append)** → `report` edit(K 187).
- `renames.csv`: write(F 3) → CSV beacon(G 4) → **synthetic completion (5 — existing S27
  `completeTruncatedBeacon`; the step-7 append)**.

### `extractFileEvents` multiset (no reader)
`write = 4`, `edit = 2` (E `audit`, K `report` — both `ledger.py`), `overwrite = 0`, `userEdit = 4`
with ids sorted `["0ee68aad","2a0d75ba","720ee20c","ba8ee917"]`. NOTE: only **one** `renames.csv`
user-edit (`ba8ee917`, the step-5 @4-line beacon) and **two** `ledger.py` user-edits (`0ee68aad`
prepend, `2a0d75ba` script beacon) — step-7 and step-9 left no beacon, so they are NOT in the event
multiset. They are recovered from file-history backups at replay time, not from events.

## Reader dependence (BOTH wrong files need the reader; the fix is reader-gated)
| file | NO reader | real reader at HEAD | real reader after fix |
|------|-----------|---------------------|------------------------|
| `ledger.py` | 186 ✗ | **186 ✗** | **187 ✓** ← NEW fix |
| `renames.csv` | 4 ✗ | **5 ✓** | 5 ✓ ← existing S27 |
| `tests/test_ledger.py` | 57 ✓ | 57 ✓ | 57 ✓ |
| `apply_renames.py` | 54 ✓ | 54 ✓ | 54 ✓ |

S34 is **reader-DEPENDENT**. The CLI always builds the real on-disk reader, so the CLI bytes are correct
after the fix. The new code runs only inside `seedStaleEditBases`, which `reconstructFileOver` calls only
when `reader` is present — so reader-free reconstruction is byte-for-byte untouched (every pre-s34
scenario unaffected).

## Root cause (the sole engine gap)
`reconstructFileOver` (`src/reconstruction_branches.ts:39-58`) runs `seedStaleEditBases` as pipeline
stage 5. For each `Edit`, `staleEditSeedFor` → `editBaseIsStale` checks ONLY whether the edit's **first
hunk context** lines match the reconstructed base. For the `report` edit (K), the hunk centres on
`if __name__ == "__main__":`, which is present and correctly positioned in the 173-line script beacon
base — so `editBaseIsStale` returns **false**, no reseed fires, and the step-9 trailing line (which the
`report` hunk never references) is silently lost → 186.

The step-9 content IS on disk and IS backed up: file-history backup `d5ade1bd80e08f91@v4` (174 lines,
last line `# names normalized via rename script`), taken at `19:51:20` — AFTER the script beacon
(`19:50:57`) and AT/BEFORE the `report` edit (`19:51:37`). `findBackupAtOrBefore(reportEditTime)` already
returns exactly this backup. The engine just never asks for it because the hunk-context test passes.

## The fix (one file: `src/reconstruction_reseed.ts`)
Add a SECOND staleness trigger — an Edit whose hunk context matches the reconstructed base but whose real
pre-edit disk state carried an UNCAPTURED manual change OUTSIDE the hunk window. Detect it by content,
not by hunk position, and forward-validate (never fabricate).

### Refactor `editBaseIsStale` to share its hunk-matching logic
```ts
// Whether an edit's first hunk splices cleanly onto `base`: each context/removed line must equal the
// base line at its position; a mismatch — or a position past the base — means it lands on wrong lines.
function firstHunkMatchesBase(event: EditEvent, base: string[]): boolean {
    const firstHunk = event.hunks[0];
    if (firstHunk === undefined) {
        return true;
    }
    let index = firstHunk.oldStart - 1;
    for (const line of firstHunk.lines) {
        if (line.startsWith("+")) {
            continue;
        }
        if (index >= base.length || base[index] !== line.slice(1)) {
            return false;
        }
        index += 1;
    }
    return true;
}

function editBaseIsStale(event: EditEvent, priorEvents: FileEvent[]): boolean {
    return !firstHunkMatchesBase(event, reconstructedBaseText(priorEvents));
}
```

### Add the out-of-window detector + reseed (new helpers)
```ts
// The latest timestamp among `priorEvents` that touch `target` — the moment of the last state the
// engine already captured for the file. undefined when the file has no prior event on this lineage.
function lastPriorTimeFor(target: Path, priorEvents: FileEvent[]): Date | undefined {
    let latest: Date | undefined;
    for (const event of priorEvents) {
        if (!("target" in event) || event.target.toString() !== target.toString()) {
            continue;
        }
        if (latest === undefined || event.timestamp.getTime() > latest.getTime()) {
            latest = event.timestamp;
        }
    }
    return latest;
}

// s34: an Edit whose hunk context matches the reconstructed base (so editBaseIsStale is FALSE) but whose
// real pre-edit disk state carried an UNCAPTURED manual change OUTSIDE the hunk window (a trailing append
// left no `edited_text_file` beacon and no tool_use). The drift is invisible to the hunk-context test, so
// detect it by content: a file-history backup taken AFTER the last captured event yet AT/BEFORE the edit,
// whose content differs from the reconstructed base AND onto which the hunk still splices cleanly
// (forward-validation — a wrong/poison backup is rejected, never fabricated). Returns that backup as the
// synthetic reseed Write, else undefined.
function outOfWindowEditSeed(
    records: TranscriptRecord[],
    event: EditEvent,
    priorEvents: FileEvent[],
    reader: BackupReader,
): WriteEvent | undefined {
    const seed = backupSeedWriteFor(records, event.target, event.timestamp, reader);
    if (seed === undefined) {
        return undefined;
    }
    const lastPrior = lastPriorTimeFor(event.target, priorEvents);
    if (lastPrior !== undefined && seed.timestamp.getTime() <= lastPrior.getTime()) {
        return undefined;
    }
    const seedLines = splitLines(seed.content);
    const base = reconstructedBaseText(priorEvents);
    const unchanged = seedLines.length === base.length && seedLines.every((l, i) => l === base[i]);
    if (unchanged || !firstHunkMatchesBase(event, seedLines)) {
        return undefined;
    }
    return seed;
}

function staleEditSeedFor(
    records: TranscriptRecord[],
    event: FileEvent,
    priorEvents: FileEvent[],
    reader: BackupReader,
): WriteEvent | undefined {
    if (event.kind !== EventKind.edit) {
        return undefined;
    }
    if (editBaseIsStale(event, priorEvents)) {
        return backupSeedWriteFor(records, event.target, event.timestamp, reader, true); // s19/s23/m6
    }
    return outOfWindowEditSeed(records, event, priorEvents, reader); // s34
}
```
Also add `import { Path } from "./structures/domain.ts";`. No change to `reconstruction_branches.ts`
(the pipeline already calls `seedStaleEditBases` at stage 5) and no change to the existing
`completeTruncatedBeacon` that fixes `renames.csv`.

### Why this is safe (no regression to the 463 baseline)
- `outOfWindowEditSeed` fires only when ALL hold: (a) `editBaseIsStale` is already false (so the existing
  s19/s23/m6 path did NOT fire — disjoint), (b) an at/before backup exists that is STRICTLY NEWER than the
  last captured event for the file (so it represents disk state the engine missed, not an older stale
  blob), (c) that backup's content differs from the reconstructed base, and (d) the edit's first hunk
  still splices cleanly onto the backup (forward-validation rejects a wrong/poison backup). In a
  well-behaved scenario the backup at that point EQUALS the reconstructed base → condition (c) fails → no
  reseed. Prototyped: the full suite stays 463/463 green.

### 250-line cap (MANDATORY — `split, never condense`)
The new code pushes `src/reconstruction_reseed.ts` from 216 to ~270 lines, over the project's 250-line
cap (the PostToolUse hook will flag it). Per the project rule ("split, never condense"), **move the
beacon-completion family to a new module** rather than golfing comments: create
`src/reconstruction_beacons.ts` holding `completeTruncatedBeacon`, `completeElidedBeacons`, and their
private helpers (`beaconIsTruncated`, `beaconIsElided`, `backupMatchesBeacon`, `elidedBeaconSeed`) with
their imports; leave the stale-edit-base family (s19/s23/s34) in `reconstruction_reseed.ts`. Then update
`src/reconstruction_branches.ts:16-20` to import `completeTruncatedBeacon`/`completeElidedBeacons` from
`./reconstruction_beacons.ts` and `seedStaleEditBases` from `./reconstruction_reseed.ts` directly (NO
re-export shim — per the project's no-forwarding-layers rule). Verify both files end up ≤250 lines and
`tsc` is clean. (If a different split keeps both files ≤250 and avoids a forwarding layer, that is
acceptable — this is the recommended one.)

## Hazards (carry into test assertions)
- **Prose hazard:** the NEW names appear in `ledger.py`/`test_ledger.py` docstrings and prose. Assert
  **absence of OLD whole-word names** (`\badd_entry\b`, `\brm_entry\b`, `\btot_debits\b`,
  `\btot_credits\b`), never absence of new names.
- **Reader is REQUIRED.** Engine bytelock tests for `ledger.py` and `renames.csv` MUST pass the real
  on-disk reader (build it as the CLI does: `createSidecarReader(findSessionId(records),
  getDefaultFileHistoryRoot())`), or use `runCli` (which builds it). A no-reader reconstruction yields
  186/4 and is the RED proof, not the lock target.
- **Path disambiguation:** suffix `"/ledger.py"` (leading slash) so it does not also match
  `"/tests/test_ledger.py"`. Reconstructed paths live under `/private/var/folders/.../run-scenario.88pfb8vd/…`.
- **Trailing line, not in-window:** the dropped line is the LAST line of `ledger.py`
  (`# names normalized via rename script`). The `report` edit inserts `def report(...)` ABOVE
  `if __name__ == "__main__":`, so the recovered comment stays the final line. Assert the final line.

## Tasks (TDD order)
1. **Confirm baseline.** `npm test` → 463/0; `npx tsc --noEmit` clean. If not 463, STOP (see Baseline).
2. **Add the fixture.** In `tests/fixtures.ts`, after `S33_JSONL`, add:
   ```ts
   export const S34_JSONL =
       "/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/executed/s34-script-rename-driver-back-and-forth/709c9b35-62d2-44c9-84ed-5e63ca90073e.jsonl";
   ```
3. **Write the RED engine test first (T1).** Reconstruct WITH the real reader; assert `ledger.py`
   byte-equals ground truth (187 lines, final line `# names normalized via rename script`). Run it —
   it MUST FAIL at HEAD (reconstructs 186). This proves the bug before the fix.
4. **Apply the engine fix** (`src/reconstruction_reseed.ts` per "The fix"), then perform the **250-line
   split** (`src/reconstruction_beacons.ts` + update `reconstruction_branches.ts` imports). Re-run T1 —
   now GREEN.
5. **Write the rest of the engine tests** (`tests/reconstruction_engine_s34.test.ts`, T2–T6). Copy the
   helper block (`finalTextOf`, `historyFinalText`, `historyEndingWith`, `stripTrailingNewline`,
   `defBlock`, `readGroundTruth`, `poison`) from `tests/reconstruction_engine_s33.test.ts`; change the
   ground-truth constant to the s34 sibling-store path; build the real reader for the bytelock tests.
6. **Write the CLI tests** (`tests/reconstruction_cli_s34.test.ts`, C1–C6). Copy `fileVerboseBlock` and
   `finalRevisionSlice` verbatim from `tests/reconstruction_cli_s33.test.ts`. **Capture live `runCli`
   output first** (throwaway script at project root, run, delete) to lock exact strings — the S33 lesson.
7. **Update docs** (append/prepend an S34 entry, mirroring S33 — DO NOT rewrite prior entries):
   `plans/roadmap.md` (S34 line, suite 475, note "real fix + module split"),
   `plans/reconstruction-engine-design.md` (S34 note immediately after the S33 block),
   `plans/implementation-notes-api-from-scenarios.md` (prepend an S34 entry).
8. **Verify & commit (USER APPROVAL ONLY).** `npm test` → 475/0; `npx tsc --noEmit` clean; both touched
   src modules ≤250 lines. Then commit per "Commit hygiene".

## Engine tests — `tests/reconstruction_engine_s34.test.ts`

Constants:
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
```
Build the real reader once: `const reader = createSidecarReader(findSessionId(records), getDefaultFileHistoryRoot());`
(import from `../src/reconstruction_sidecar.ts`).

- **T1 — `test_S34_ledger_bytelock_out_of_window_reseed`** (the crux / RED-before-fix). Reconstruct
  `loadRecords(S34_JSONL)` WITH `reader`; assert
  `historyFinalText(historyEndingWith(surviving, "/ledger.py")) === stripTrailingNewline(readGroundTruth("ledger.py"))`,
  and that the final text ends with `# names normalized via rename script` and has 187 lines. Comment:
  this line came from the step-9 NO-BEACON manual append, recovered via the out-of-window reseed.
- **T2 — `test_S34_ledger_no_reader_is_short_186`** (locks the reader-dependence + the RED state).
  Reconstruct with NO reader; assert `ledger.py` final has **186** lines and does NOT include
  `# names normalized via rename script`. (This is what the engine produced before the fix; it stays the
  no-reader behavior after the fix — the fix is reader-gated.)
- **T3 — `test_S34_renames_csv_three_revisions_via_s27`.** WITH `reader`, on
  `historyEndingWith(surviving, "/renames.csv")`: `revisions.length === 3`; `finalTextOf(rev1)` has 4
  lines and does NOT include `tot_credits,total_credits`; `historyFinalText` has 5 lines, INCLUDES all
  four rows (`add_entry,record_entry`/`rm_entry,remove_entry`/`tot_debits,total_debits`/`tot_credits,total_credits`)
  and byte-equals ground truth. Comment: the 5th line is the step-7 NO-BEACON append completed by the
  existing S27 `completeTruncatedBeacon`. Also assert `apply_renames.py` byte-lock (1 revision) here.
- **T4 — `test_S34_renames_whole_word`.** Final `ledger.py`: for each `[old,new]` in RENAMES,
  `!new RegExp(\`\\b${old}\\b\`).test(text)` and `text.includes(new)`. Final `test_ledger.py`: includes
  the renamed import/call surface (capture the exact `from ledger import …`/usage line live) and
  `!/\badd_entry\b/`, `!/\brm_entry\b/`, `!/\btot_debits\b/`, `!/\btot_credits\b/`.
- **T5 — `test_S34_edit_ordering_report_on_renamed_audit_present`.** On final `ledger.py`:
  `defBlock(text, "report")` includes `record_entry` AND `total_debits` and has no whole-word old names;
  `defBlock(text, "audit")` is present and references `total_debits`/`total_credits` (the script renamed
  its pre-script body). Comment: `report` reaching the renamed names proves the step-5/step-7 CSV edits
  flowed through the script, and the trailing comment survived underneath `report`.
- **T6 — `test_S34_event_multiset_and_reader_independence`.** `extractFileEvents(loadRecords(S34_JSONL))`:
  `write=4`, `edit=2`, `overwrite=0`, `userEdit` ids sorted `["0ee68aad","2a0d75ba","720ee20c","ba8ee917"]`.
  Then reconstruct with a `poison` reader (`() => "POISONED\nPOISONED\n"`); assert it does NOT throw and
  for every `FILES` suffix the poisoned final text never `includes("POISONED")` (the forward-validation
  guards reject the poison backup, so `ledger.py` falls back to 186 and `renames.csv` to 4 — assert
  those line counts to prove the poison was rejected, never fabricated into the output).

## CLI tests — `tests/reconstruction_cli_s34.test.ts`
- **C1 — `test_S34_default_conversationDAG_and_fileDAG`.** `runCli([S34_JSONL])` includes
  `"══ conversationDAG ══"`, `"══ fileDAG ══"`, `"A  prompt  #7d7450c2"`, each user-edit line
  (`"user-edit  ledger.py"`+`"#0ee68aad"`, `"user-edit  renames.csv"`+`"#ba8ee917"`,
  `"user-edit  ledger.py"`+`"#2a0d75ba"`, `"user-edit  test_ledger.py"`+`"#720ee20c"`), and
  `!includes("branch ")` (linear).
- **C2 — `test_S34_list_branches_single_surviving_four_files`.** `runCli([S34_JSONL,"--list-branches"])`
  includes `"surviving  tip #97e510eb"` and each basename
  (`ledger.py`,`test_ledger.py`,`renames.csv`,`apply_renames.py`); `!includes("rewound")`.
- **C3 — `test_S34_graphFile_node_ladders`.** `runCli([S34_JSONL,"--graphFile"])` includes each exact
  per-file block (use file-name boundaries to pin node counts), matching the fileDAG ladders above —
  including that `ledger.py` has exactly 5 nodes (B,D,E,I,K) and the synthetic reseed adds NONE.
- **C4 — `test_S34_verbose_ledger_six_revisions_174_reseed`.** `fileVerboseBlock(runCli([S34_JSONL,
  "--verbose"]), "/ledger.py")`: includes `"revision 5  @"`, `!includes("revision 6  @")`; the block
  includes a `"(174 lines)"` revision (the reseed) AND a `"(187 lines)"` final revision. On
  `finalRevisionSlice`: includes `"def report("`, `"def audit("`, the final line
  `"# names normalized via rename script"`, and `!/\badd_entry\b/`, `!/\brm_entry\b/`,
  `!/\btot_debits\b/`, `!/\btot_credits\b/`.
- **C5 — `test_S34_verbose_test_file_renamed`.** `fileVerboseBlock(…, "/tests/test_ledger.py")`:
  includes `"revision 1  @"`, `!includes("revision 2  @")`. On `finalRevisionSlice`: includes
  `"(57 lines)"` and the renamed import/usage surface (captured live); `!/\badd_entry\b/`, `!/\brm_entry\b/`.
- **C6 — `test_S34_verbose_renames_csv_three_revisions_and_apply_script`.**
  `fileVerboseBlock(…,"/renames.csv")`: includes `"revision 0  @"`+`"(3 lines)"`,
  `"revision 1  @"`+`"(4 lines)"`, `"revision 2  @"`+`"(5 lines)"`, `!includes("revision 3  @")`; the
  block includes `"tot_credits,total_credits"` (final row) and the other three rows.
  `fileVerboseBlock(…,"/apply_renames.py")`: includes `"revision 0  @"`, `"(54 lines)"`,
  `!includes("revision 1  @")`, and the whole-word substitution literal
  `re.sub(rf"\b{re.escape(old)}\b", new, text)` (use `String.raw`).

> All exact id/line-count/string anchors above were captured live; the S33 lesson still applies —
> re-capture `runCli` output before finalizing C-test string literals, since the verbose gutter and
> revision timestamps are environment-stable but worth re-confirming.

## Verification already performed (re-confirm, don't re-derive)
At HEAD (baseline 463): the fix in "The fix" was applied to `src/reconstruction_reseed.ts`, then:
- `npx tsc --noEmit` clean; `npm test` → **463/463 green** (no regression).
- `ledger.py` → **187** (ladder 156,157,173,173,**174**,187), `renames.csv` → 5, `test_ledger.py` → 57,
  `apply_renames.py` → 54 — ALL four byte-equal to rendered ground truth (with the real reader).
- The fix was then reverted byte-clean (`reconstruction_reseed.ts` back to 216 lines).
The 250-line split was NOT prototyped (it is a mechanical move); the implementer performs it as part of
Task 4 and confirms both files ≤250.

## Commit hygiene (USER APPROVAL ONLY)
Stage EXACTLY these S34 paths — never `git add -A`:
`src/reconstruction_reseed.ts`, `src/reconstruction_beacons.ts` (new), `src/reconstruction_branches.ts`
(import update only), `tests/fixtures.ts`, `tests/reconstruction_engine_s34.test.ts`,
`tests/reconstruction_cli_s34.test.ts`, `plans/roadmap.md`,
`plans/reconstruction-engine-design.md`, `plans/implementation-notes-api-from-scenarios.md`,
`plans/s34/`.

**COORDINATION HAZARD (same as S28–S33):** the worktree carries uncommitted prior-scenario work —
`src/parse/loadTranscript.ts` (S32 fix), `src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`,
`_user_edit.ts`, the S28–S33 test/plan/doc files, and unrelated `src/Impl_template.md` /
`src/Plan_template.md` edits by other agents. `src/reconstruction_reseed.ts` and
`src/reconstruction_branches.ts` ALSO carry S28–S33 edits — your S34 hunks are interleaved with those.
`git diff --stat` is NOT S34-only — confirm the commit-split with the user; do not `git add -A`.

## How to verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 475 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s34.test.ts tests/reconstruction_cli_s34.test.ts   # 12/12
wc -l src/reconstruction_reseed.ts src/reconstruction_beacons.ts   # both ≤ 250
```
