# Reconstruction Plan — Scenario **S27** (`s27-script-rename-edited-before-run`)

> **MUST READ FIRST:** [`plans/script-handling.txt`](../script-handling.txt) — the HAS-BEACON vs
> NO-BEACON / forward-validation premise for files rewritten by a script. S27 is a script-rewrite
> scenario; this plan extends that premise to the **terminal truncated beacon** case.

> **STATUS: this is a REAL ENGINE FIX** — the first `src/` change in the script-rename series
> (S24/S25/S26 were all characterization locks; S25 was *rescued* by a downstream Edit). The fix was
> **prototyped live during planning** (S27 byte-perfect, full suite **371 → still 371 green**, `tsc`
> clean) then reverted. Every revision ladder, changeId, byte count, and line count below was
> **VERIFIED LIVE** against the engine at worktree HEAD with the prototype in place.

---

## 1. Goal

### 1.1 What S27 is
A single `python3 rename_inv.py` Bash run rewrites TWO tracked sources (`inventory.py`,
`tests/test_inventory.py`) with three whole-word renames — `qty_chk→check_quantity`,
`add_item→insert_item`, `rm_item→remove_item`. The twist that names the scenario: the rename script is
**written, then edited twice, BEFORE it is run** (the renames accumulate across three script revisions),
and `inventory.py` gets one more Edit (`restock`) AFTER the run. Source: `scenarios/s27-*.txt` steps 1–8.

### 1.2 Why S27 needs an engine fix — the terminal-truncated-beacon gap
The script run produces, per tracked file, a harness `edited_text_file` **beacon** (a disk snapshot
attachment). For `tests/test_inventory.py` that beacon is **TRUNCATED**: its snippet is only a 50-line
**prefix** of the true 73-line post-script file (it cuts off after `test_tot_value_empty_store_is_zero`,
dropping the last four test functions). Crucially, **`test_inventory.py` has NO Edit after the beacon** —
its only events are `[Write(terse), userEdit(truncated beacon)]`.

The engine adopts a terminal user-edit beacon **verbatim** as the final revision
(`reconstruction_replay.ts:170 → userEditRevision`). The existing backup-seed machinery cannot help:
- `seedEditBaseFromBackup` fires only when `events[0].kind === edit` (Edit-first file) — not here.
- `seedStaleEditBases` / `staleEditSeedFor` reseed the **base of a downstream Edit** — but there is no
  downstream Edit on `test_inventory.py`.

So the file reconstructs **short by 23 lines / 621 bytes** (1594 vs 2215). This is a genuinely new
failure mode. The complete post-script content exists in file-history at backup
**`df7b79499e8a9377@v3`** (2216 bytes, byte-identical to ground truth). The fix injects that content as
a terminal `overwrite`.

### 1.3 Per-file reader-dependence — MIXED (verified live, §2.5)
| File | Reconstructs correctly | Reader-dependent? | Why |
|---|---|---|---|
| `inventory.py` | yes (`[write,edit,edit,edit,user-edit,edit]`) | **NO** | COMPLETE mid-stream beacon; the `restock` Edit splices cleanly on top |
| `rename_inv.py` | yes (`[write,edit,edit,edit,edit]`) | **NO** | no script touches it; pure write+edits |
| `tests/test_inventory.py` | **only WITH the fix + a reader** | **YES** | terminal beacon TRUNCATED; needs the `@v3` backup overwrite |

### 1.4 How S27 differs from prior scenarios
- **vs S24/S26** (HAS-BEACON, complete → no `src/` change): S27's `test_inventory.py` beacon is
  INCOMPLETE.
- **vs S25** (incomplete beacon, but *rescued* because a downstream `totals` Edit reseeds the base via
  the m6 backup-seed): S27 has **no downstream Edit** on the truncated file, so the S25 path never
  engages. S27 needs a **new trigger** — complete a *terminal* truncated beacon directly.
- S27 is therefore the **first script-rename scenario requiring an engine change**, and the first use
  of the file's *final* backup (highest version) rather than a timestamp-relative one.

---

## 2. Ground truth (VERIFIED LIVE via the planning prototype; suite 371 green with fix, reverted after)

### 2.1 Scenario source & inputs
- Scenario script: `scenarios/s27-script-rename-edited-before-run.txt`.
- Executed transcript (the fixture source):
  `scenarios/executed/s27-script-rename-edited-before-run/d1b02f2f-eda1-49f1-9cc7-075bf02104c2.jsonl`.
- Rendered byte-for-byte ground truth (the §4 capture reads these):
  `scenarios/executed/s27-script-rename-edited-before-run/{inventory.py,tests/test_inventory.py,rename_inv.py}`.
- File-history backups: `~/.claude/file-history/d1b02f2f-eda1-49f1-9cc7-075bf02104c2/`.
  `test_inventory.py` family = `df7b79499e8a9377@v2` (2153B, pre-script terse) and
  **`df7b79499e8a9377@v3` (2216B, post-script complete = ground truth)**.

### 2.2 Event ladder
One surviving branch, no rewound branch (S27 is LINEAR). Files touched: `inventory.py`,
`tests/test_inventory.py`, `rename_inv.py`. The rename surfaces ONLY as `edited_text_file` beacons (the
`python3` Bash command is opaque — never parsed). **Capture the exact DAG node letters / changeIds with
the §2.7 command** and paste them into the CLI tests; the crux changeIds are already pinned in §2.3.

### 2.3 Reconstructed revision ladders (VERIFIED LIVE)
- **`inventory.py`** — kinds `[write, edit, edit, edit, user-edit, edit]`; final **8442** bytes;
  identical with no reader, poison reader, and real reader (reader-INDEPENDENT). The mid-stream beacon
  (the `user-edit`) is COMPLETE, so the `restock` Edit on top is byte-perfect.
- **`rename_inv.py`** — kinds `[write, edit, edit, edit, edit]`; final **1449** bytes; reader-INDEPENDENT.
- **`tests/test_inventory.py` WITH the fix + reader** — kinds `[write, user-edit, overwrite]`:
  - rev0 `write`     changeId `toolu_0174GG2eNkQKxtdPRag576jm`, 73 lines (terse original).
  - rev1 `user-edit` changeId `51c639d6-4417-4525-bb79-95efa2eede1d`, **50 lines** (the TRUNCATED beacon).
  - rev2 `overwrite` changeId **`df7b79499e8a9377@v3`**, **73 lines** (the injected complete backup).
  - final = **2215** bytes (= ground truth `test_inventory.py` minus its trailing newline).
- **`tests/test_inventory.py` WITHOUT a reader** — kinds `[write, user-edit]`; final **1594** bytes
  (TRUNCATED, WRONG). This is the reader-dependence regression guard (§2.5).

### 2.4 The backup-seed: a TERMINAL overwrite from the file's LATEST backup (NEW)
The fix appends a synthetic `write` event built from `test_inventory.py`'s **latest** file-history backup
(`df7b79499e8a9377@v3`). Replay turns a write onto a present file into an `overwrite`
(`reconstruction_replay.ts:43-53`), so the terminal revision becomes the complete file. The synthetic
event's `changeId` is the blob name (`df7b79499e8a9377@v3`) — keeping it out of the conversation graphs,
exactly as `backupSeedWriteFor` does (spec 40). This injected revision is NOT an extracted event, so it
never appears in `extractFileEvents` or the DAGs.

### 2.5 Reader-dependence matrix (VERIFIED LIVE — the regression guard)
| File | no reader | poison reader | real reader |
|---|---|---|---|
| `inventory.py` | 8442 ✓ | 8442 ✓ (poison never read) | 8442 ✓ |
| `rename_inv.py` | 1449 ✓ | 1449 ✓ | 1449 ✓ |
| `tests/test_inventory.py` | 1594 ✗ (2 revs) | 1594 ✗ (guard rejects garbage) | **2215 ✓ (3 revs)** |

Note the guard's robustness: with a *poison* reader the backup content is not a prefix of the beacon, so
`beaconIsTruncated` returns false and the file stays at 2 revisions — the fix never injects garbage.

### 2.6 Branch shape — LINEAR
`reconstructBranches(...).rewound.length === 0`; `surviving.length === 3` (the three files above). The
surviving tip and DAG node letters: capture with §2.7.

### 2.7 Capture command for the remaining literals + CLI output (run once, paste results)
Run from the repo root; it emits the four ground-truth string literals (for the test files) and the
exact CLI output blocks:
```
node --import tsx -e '
import { readFileSync } from "node:fs";
const GT = "scenarios/executed/s27-script-rename-edited-before-run";
const FH = process.env.HOME + "/.claude/file-history/d1b02f2f-eda1-49f1-9cc7-075bf02104c2";
const strip = (s) => (s.endsWith("\n") ? s.slice(0, -1) : s);
const L = (s) => JSON.stringify(s);
console.log("S27_INVENTORY_FINAL =", L(strip(readFileSync(GT + "/inventory.py", "utf8"))));
console.log("S27_RENAME_INV_FINAL =", L(strip(readFileSync(GT + "/rename_inv.py", "utf8"))));
console.log("S27_TEST_INVENTORY_FINAL =", L(strip(readFileSync(GT + "/tests/test_inventory.py", "utf8"))));
console.log("S27_TEST_INVENTORY_BACKUP =", L(readFileSync(FH + "/df7b79499e8a9377@v3", "utf8")));
'
```
For the CLI DAG/verbose literals, run `runCli([S27_JSONL])`, `runCli([S27_JSONL,"--list-branches"])`,
and `runCli([S27_JSONL,"--surviving","--verbose"])` and copy the relevant lines (mirror the
`tests/reconstruction_cli_s25.test.ts` assertions). **`S27_TEST_INVENTORY_BACKUP` keeps its trailing
newline** (the hermetic reader returns raw bytes; `splitLines` drops the trailing newline at replay);
`S27_TEST_INVENTORY_FINAL` has it stripped (it is the newline-joined revision text). Verified lengths:
backup raw = 2216, final stripped = 2215.

---

## 3. THE ENGINE FIX (cite this map in impl-notes)

### 3.1 Behaviour to add
A new reader-only event-list transform `completeTruncatedBeacon(records, events, reader)`: when a file's
**last** event is a `user-edit` beacon whose snippet is a **byte-prefix** of the file's **latest**
file-history backup AND the backup has **strictly more lines** (the truncation signature), append a
synthetic `write` built from that backup. Otherwise return events unchanged.

- `last.kind === userEdit` excludes `inventory.py` and `rename_inv.py` (both end on an Edit) and S25's
  `geo_report` (ends on the `totals` Edit) — so no existing scenario is touched there.
- The **line-count** test (not raw byte length) makes a backup that differs only by a trailing newline
  NOT count as truncated — so every COMPLETE terminal beacon (S25 `test_geo_core`, the S15–S23 / m-series
  terminal beacons) passes through unchanged, preserving their `[…, userEdit]` revision ladders.
- Reader-only: registered behind the existing `reader ?` guard, so reader-free engine tests and all
  pre-S27 reader-free scenarios are byte-for-byte unaffected; `test_inventory.py` becomes
  reader-dependent (like S25's `geo_report`).

### 3.2 Where the code goes — respect the 250-line cap (hook-enforced)
`reconstruction_branches.ts` is **already at 250 lines** and `reconstruction_sidecar.ts` at 198; the
jot `post_tool_use` hook **blocks any edit that leaves a file > 250 lines**. Per the project rule
(*split, never condense*), create a new module and move the cohesive backup-reseed family into it:

**(a) `src/reconstruction_sidecar.ts` — ADD one exported helper** (keeps timeline logic where
`buildBackupTimeline` lives; ~+22 lines → ~220, under cap):
```ts
// A synthetic Write seeding `target`'s FINAL on-disk content from the LATEST file-history backup blob
// (the highest version — a post-script snapshot can land a few ms after the beacon, m6). Used to
// complete a terminal user-edit beacon the harness truncated. Returns undefined when the file has no
// backup blob (version 1 holds none).
export function latestBackupWriteFor(
    records: TranscriptRecord[],
    target: Path,
    reader: BackupReader,
): WriteEvent | undefined {
    const cwd = findCwd(records);
    const timeline = buildBackupTimeline(records, cwd);
    const points = timeline.get(resolveAgainstCwd(cwd, target)) ?? [];
    let latest: BackupPoint | undefined;
    for (const point of points) {
        if (point.backupFileName !== null) {
            latest = point; // points are time-sorted ascending; keep the newest non-null
        }
    }
    if (latest === undefined || latest.backupFileName === null) {
        return undefined;
    }
    return {
        kind: EventKind.write,
        changeId: new Uuid(latest.backupFileName.toString()),
        target,
        content: reader(latest.backupFileName),
        timestamp: latest.backupTime,
    };
}
```

**(b) NEW `src/reconstruction_reseed.ts`** — MOVE the stale-edit cluster out of `reconstruction_branches.ts`
verbatim (`reconstructedBaseText`, `editBaseIsStale`, `staleEditSeedFor`, `seedStaleEditBases`) and ADD
the two new beacon functions. This module then owns the whole "backup-driven event-list transform"
family. Imports: `backupSeedWriteFor`, `latestBackupWriteFor`, `BackupReader` from
`./reconstruction_sidecar.ts`; `replayEvents` from `./reconstruction_replay.ts`; `splitLines`,
`lastLinesOf` from `./reconstruction_replay_edit.ts`; types from `./reconstruction_engine.ts`. The new code:
```ts
// A terminal user-edit beacon is TRUNCATED when its snippet is a byte-prefix of the file's final backup
// AND the backup has strictly more lines. The line-count test (splitLines drops a single trailing
// newline) means a backup that differs only by a trailing newline — the common COMPLETE-beacon case —
// is NOT treated as truncated, so complete beacons pass through untouched.
function beaconIsTruncated(beacon: UserEditEvent, backupContent: string): boolean {
    return (
        backupContent.startsWith(beacon.content) &&
        splitLines(backupContent).length > splitLines(beacon.content).length
    );
}

// When a file's LAST event is a user-edit beacon the harness truncated (s27: a script rewrote the file
// and the post-script `edited_text_file` snippet is only a prefix of the new content, with NO later Edit
// to reseed against), append a synthetic Write from the latest file-history backup so replay's terminal
// revision is the COMPLETE file (an overwrite), not the truncated snippet. Files whose last event is not
// a user-edit, or whose beacon is already complete, are returned unchanged. Reader-only — without a
// backup the file stays truncated (reader-dependent, like s25's geo_report).
export function completeTruncatedBeacon(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const last = events[events.length - 1];
    if (last === undefined || last.kind !== EventKind.userEdit) {
        return events;
    }
    const seed = latestBackupWriteFor(records, last.target, reader);
    if (seed === undefined || !beaconIsTruncated(last, seed.content)) {
        return events;
    }
    return [...events, seed];
}
```

**(c) `src/reconstruction_branches.ts` — wire it in** (drops ~63 moved lines, well under cap):
- Remove the moved cluster; import `{ seedStaleEditBases, completeTruncatedBeacon }` from
  `./reconstruction_reseed.ts` (and drop now-unused imports the cluster needed, e.g. `EditEvent`,
  `lastLinesOf`, `backupSeedWriteFor` — let `tsc`'s unused-symbol errors guide the cleanup).
- In `reconstructFileOver`, append one pipeline stage after `seedStaleEditBases`:
```ts
const restaged = reader ? seedStaleEditBases(records, based, reader) : based;
const completed = reader ? completeTruncatedBeacon(records, restaged, reader) : restaged;
return replayEvents(completed);
```
> Alternative split if preferred: instead of moving the reseed cluster, move the render cluster
> (`collectAcceptedUserEditIds` … `extractRenderableEvents`, ~55 lines) into a new
> `reconstruction_renderable.ts` and keep the beacon code in `branches.ts`. Either way **every `src/`
> file must end ≤ 250 lines** — that is the hard constraint; the split is the means.

### 3.3 Reference map (the exact call chain the fix joins)
- Beacon → event: `reconstruction_user_edit.ts:25-42` (`userEditEventFrom`; changeId = attachment
  `entry.uuid`).
- Per-file pipeline: `reconstruction_branches.ts` `reconstructFileOver` (the `reader ?` transform chain).
- Verbatim terminal adoption (the bug): `reconstruction_replay.ts:99-109,168-173`
  (`userEditRevision`).
- write→overwrite-on-present: `reconstruction_replay.ts:43-53` (`writeRevision`).
- `splitLines` drops one trailing newline: `reconstruction_replay_edit.ts:17-23`.

---

## 4. Task 1 — Baseline & fixture (do first)
1. Confirm baseline: `npm test` = **371 pass / 0 fail**; `npx tsc --noEmit` clean; `git diff src/` empty.
2. Append `S27_JSONL` to `tests/fixtures.ts` after `S26_JSONL`, pointing at the executed transcript
   (mirror the existing absolute-path constant style of `S26_JSONL`).
3. Run the §2.7 capture command; save the four string literals for the tests.

## 5. Task 2 — Engine fix, TDD (RED → GREEN)
Per `~/.claude/guides/tdd.md`: write the failing crux test FIRST, watch it fail, then implement §3.
1. **RED:** add `test_S27_test_inventory_terminal_beacon_backup_overwrite` (the §6 crux test) and run
   only that file — it must FAIL (engine yields `[write,user-edit]`, 1594 bytes) before any `src/` edit.
2. **GREEN:** apply §3 (a)+(b)+(c). Re-run — the crux test passes (`[write,user-edit,overwrite]`, 2215).
3. Confirm `npx tsc --noEmit` clean and every changed `src/` file ≤ 250 lines.

## 6. Task 3 — Engine lock (`tests/reconstruction_engine_s27.test.ts`)
Mirror `tests/reconstruction_engine_s25.test.ts` (hermetic reader; no real file-history touched). A
hermetic reader returns the backup only for the one blob:
```ts
const s27Reader: BackupReader = (name) =>
    name.toString() === "df7b79499e8a9377@v3" ? S27_TEST_INVENTORY_BACKUP : "";
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
```
Tests (assert against the verified ladders/literals in §2.3):
1. `test_S27_linear_one_surviving_branch_three_files_no_rewound` — `rewound.length===0`,
   `surviving.length===3`, the three suffixes present.
2. `test_S27_inventory_reader_independent_bytelock` — kinds `[write,edit,edit,edit,user-edit,edit]`;
   `finalText(without)===finalText(withPoison)`, no `"POISONED"`; length 8442; `=== S27_INVENTORY_FINAL`;
   renamed names present, terse gone (whole-word `def `/call-form checks per the S25 rename-lock comments).
3. `test_S27_rename_inv_reader_independent_bytelock` — kinds `[write,edit,edit,edit,edit]`; poison-equal;
   length 1449; `=== S27_RENAME_INV_FINAL`; the final script contains all three rename pairs
   (`qty_chk`→`check_quantity`, `add_item`→`insert_item`, `rm_item`→`remove_item`).
4. **CRUX** `test_S27_test_inventory_terminal_beacon_backup_overwrite` — with `s27Reader`: kinds
   `[write,user-edit,overwrite]`; rev1 `user-edit` changeId `51c639d6-…`, `lines.length===50`; rev2
   `overwrite` changeId `df7b79499e8a9377@v3`, `lines.length===73`; final length 2215;
   `=== S27_TEST_INVENTORY_FINAL`; includes `check_quantity` and the four restored test functions
   (`test_tot_value_single_item`, `…_multiple_items`, `…_ignores_extra_keys`, `…_missing_price_key_raises`).
5. `test_S27_test_inventory_without_reader_is_wrong_no_overwrite_two_revs` — no reader: kinds
   `[write,user-edit]`, `revisions.length===2`, no `overwrite`, final length 1594,
   `!== S27_TEST_INVENTORY_FINAL`. (Reader-dependence guard — the load-bearing contrast.)
6. `test_S27_poison_reader_does_not_inject_garbage` — with `poison`: `test_inventory.py` stays
   `[write,user-edit]` (the `startsWith` guard rejects the non-prefix poison), final 1594, no `"POISONED"`.
7. `test_S27_extractFileEvents_two_userEdits_no_overwrite` — `extractFileEvents` has exactly the two
   beacons (`inventory.py` + `test_inventory.py`) as `user-edit`, zero `overwrite` (the seed is a
   synthetic REVISION, not an event). Fill exact write/edit counts from the §2.7 capture.

## 7. Task 4 — CLI lock (`tests/reconstruction_cli_s27.test.ts`)
Mirror `tests/reconstruction_cli_s25.test.ts` (real `runCli`, real sidecar reader). Capture exact lines
via §2.7. Cover: `conversationDAG` shows the two `user-edit` beacons + the linear run (no `branch `);
`fileDAG` groups each file's events; `--list-branches` = one surviving tip over three files, no rewound;
`--surviving --verbose` for each file shows the right revision count and the FINAL revision renamed —
for `tests/test_inventory.py` the final block must show the COMPLETE file (the four restored test
functions + `check_quantity`), proving the overwrite rendered.

## 8. Task 5 — Docs (3 edits + the fixture)
- `plans/roadmap.md` — add the S27 line after S26.
- `plans/implementation-notes-api-from-scenarios.md` — prepend the S27 entry (REAL fix: new
  `completeTruncatedBeacon` trigger + `latestBackupWriteFor`; new module `reconstruction_reseed.ts`;
  cite §3.3 map).
- `plans/reconstruction-engine-design.md` — append an S27 note: terminal-truncated-beacon completion,
  reader-dependent, distinct from the S25 downstream-Edit reseed.

## 9. Task 6 — Full verification
```
npm test          # expect 371 + (Task 3+4 count) ; 0 fail
npx tsc --noEmit  # No errors found
wc -l src/reconstruction_branches.ts src/reconstruction_sidecar.ts src/reconstruction_reseed.ts  # each ≤ 250
git diff --stat src/   # branches.ts (shrunk + wired), sidecar.ts (+latestBackupWriteFor), reconstruction_reseed.ts (new)
```
Run a mutation probe on the crux: flip the `overwrite` changeId assertion / the 2215 byte-lock / the
"no reader is wrong" test and confirm each goes RED, then restore (liveness, per the S25 lesson).

## 10. Task 7 — Commit (USER APPROVAL ONLY) then HAND OFF
- **Commit gate:** on explicit approval, `git status` first, then stage EXACTLY the new/changed files
  (the new `src/reconstruction_reseed.ts`, edited `src/reconstruction_branches.ts`,
  `src/reconstruction_sidecar.ts`, `tests/fixtures.ts`, the two new test files, and the three doc
  files). Never `git add -A`; do not stage `src/Plan_template.md` / `src/Impl_template.md`. Message:
  `Implemented S27 handling` (+ standard Co-Authored-By / Claude-Session trailers).
- **`create handoff`** is a required task for the implementing agent: after GREEN + verification, write
  the completion handoff via `/jot:handoff-prompt` (title line `# Handoff: Scenario s27 (...) IMPLEMENTED
  …`, with `MUST READ: plans/script-handling.txt` on line 1), so the downstream S28 planning monitor
  fires.

---

## 11. Acceptance criteria (Definition of Done)
- `tests/test_inventory.py` reconstructs **byte-for-byte** (2215, `[write,user-edit,overwrite]`) WITH a
  reader; `inventory.py` (8442) and `rename_inv.py` (1449) byte-for-byte and reader-INDEPENDENT.
- The new `completeTruncatedBeacon` trigger fires ONLY for `test_inventory.py`; no other scenario's
  revision ladder changes (proven by the full suite staying green).
- `npm test` all green (371 + new), `tsc` clean, every `src/` file ≤ 250 lines.
- Engine lock + CLI lock added; reader-dependence and poison-guard tests present and load-bearing.
- Nothing committed until explicit user approval; completion handoff written.
