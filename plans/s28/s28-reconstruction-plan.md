# Reconstruction Plan — Scenario **S28** (`s28-script-rename-scope`)

> **MUST READ FIRST:** [`plans/script-handling.txt`](../script-handling.txt) — the HAS-BEACON vs
> NO-BEACON / forward-validation premise for files rewritten by a script. S28 is a script-rewrite
> scenario; this plan extends that premise to the **elided (windowed) beacon** case — the post-script
> `edited_text_file` snippet is only a WINDOW onto the new file (head/tail/interior lines omitted),
> not a clean prefix.

> **STATUS: this is a REAL ENGINE FIX** — the second `src/` change in the script-rename series (after
> S27's terminal-truncated-beacon completion). The fix was **prototyped live during planning** (S28
> byte-perfect, full suite **384 → 386 green** with two probe tests, `tsc` clean, every `src/` file
> ≤ 250 lines) then reverted. Every revision ladder, changeId, byte count, and line count below was
> **VERIFIED LIVE** against the engine at worktree HEAD with the prototype in place.

---

## 1. Goal

### 1.1 What S28 is
A single `python3 scoped_rename.py` Bash run rewrites tracked sources using a **scoped-rename CSV**
(`scoped_renames.csv`). Each CSV row is `old,new,isExported,file`:
- `load_all,load_catalog,Y,` — **exported** rename → applied across ALL files (`catalog.py`,
  `catalog_view.py`, `tests/test_catalog.py`).
- `_norm,normalize_entry,N,catalog.py` — **local** rename → applied ONLY in the named file.

Pre-script (steps 1–2): `catalog.py` is written (~100 lines) then gets a `count_entries` Edit;
`catalog_view.py` (imports `catalog`, `render` calls `catalog.load_all`) and `tests/test_catalog.py`
are written. Post-script (step 5): one more Edit on `catalog_view.py` adds a `preview()` function that
calls the NEW name `load_catalog`. Source: `scenarios/s28-script-rename-scope.txt` steps 1–8.

### 1.2 Why S28 needs an engine fix — the elided-beacon gap
The script run produces, per rewritten file, a harness `edited_text_file` **beacon** (a `cat -n` disk
snapshot attachment). Two of the three beacons are **ELIDED** — the harness showed only a WINDOW of the
file, marking omissions with bare `...` separator lines and/or by starting past line 1:

| File | Beacon | Shape |
|---|---|---|
| `catalog.py` | COMPLETE (lines 1–198, no `...`) | reconstructs byte-perfect, reader-INDEPENDENT |
| `tests/test_catalog.py` | **MID-ELIDED** — lines 1–9, `...`, 17–33, `...`, 39–102 | TERMINAL beacon |
| `catalog_view.py` | **HEAD+TAIL-ELIDED** — only lines 11–41 (missing 1–10 and 42–49) | NON-TERMINAL: 2 Edits follow |

`extractFileEvents` turns each beacon into a `user-edit` whose `content` is the snippet with line-number
prefixes **stripped** (`reconstruction_user_edit.ts:15-20`, `stripLineNumberPrefixes`). The strip
**discards the line numbers**, so the engine adopts the windowed snippet verbatim — `...` lines and all —
as the file's post-script content. Result (reader present, before the fix):
- `tests/test_catalog.py` → 92 lines / 2393 bytes (WRONG; the true file is 102 lines / 2665).
- `catalog_view.py` → 45 lines / 1538 bytes of garbage (WRONG; the two `preview` Edits splice onto the
  partial window; the true final is 64 lines / 2067).

The S27 machinery cannot help:
- `completeTruncatedBeacon` (s27) fires only on a **terminal** beacon that is a **byte-prefix**
  (`startsWith`) of the latest backup. `test_catalog.py`'s beacon is NOT a prefix (it has interior `...`
  lines), and `catalog_view.py`'s beacon is non-terminal — so s27's trigger never engages.
- `seedStaleEditBases` (s19/s23) reseeds the base of a downstream Edit whose hunk context is stale. Here
  `catalog_view.py`'s two Edit anchors (`__all__ = [...]`, `def render(path):`) DO appear inside the
  partial window, so `editBaseIsStale` returns false — the base looks "intact" but is actually
  incomplete. No reseed fires.

The complete post-script content exists in file-history. The fix detects an elided beacon **from its
line numbers**, finds the backup version whose numbered content reproduces every visible beacon line
(forward-validation), and splices a synthetic `overwrite` of that backup immediately AFTER the beacon —
so a terminal beacon ends complete and a non-terminal beacon's later Edits splice onto the real content.

### 1.3 Per-file reader-dependence — MIXED (verified live, §2.5)
| File | Reconstructs correctly | Reader-dependent? | Why |
|---|---|---|---|
| `catalog.py` | yes (`[write,edit,edit,edit,user-edit]`) | **NO** | COMPLETE beacon adopted verbatim |
| `scoped_rename.py` | yes (`[write]`) | **NO** | the rename script itself; pure write |
| `scoped_renames.csv` | yes (`[write]`) | **NO** | the CSV; pure write |
| `tests/test_catalog.py` | **only WITH the fix + a reader** | **YES** | terminal MID-elided beacon; needs the `@v3` overwrite |
| `catalog_view.py` | **only WITH the fix + a reader** | **YES** | non-terminal head-elided beacon; needs the `@v3` overwrite as the Edits' base |

### 1.4 How S28 differs from prior scenarios
- **vs S24/S26** (HAS-BEACON, complete → no `src/` change): two of S28's beacons are INCOMPLETE.
- **vs S25** (incomplete beacon *rescued* by a downstream Edit reseed): S25's rescue works because the
  downstream Edit's hunk context falls in the missing region, tripping `editBaseIsStale`. S28's
  `catalog_view.py` Edit anchors fall INSIDE the visible window, so that path never engages — the base
  must be corrected at the beacon itself.
- **vs S27** (terminal **prefix** truncation, `startsWith` + append-overwrite): S28's beacons are
  **non-prefix** windows (interior `...`, head omission) and one is **non-terminal**. The S28 trigger is
  kept **disjoint** from S27 (see §3.1): S28 fires on head/interior elision; pure terminal
  tail-truncation is still S27's. S28 is also the **first time a backup version OTHER than the latest**
  is selected — `catalog_view.py`'s correct base is `@v3`, not the final `@v4`.

---

## 2. Ground truth (VERIFIED LIVE via the planning prototype; suite 384→386 with fix + 2 probes, reverted after)

### 2.1 Scenario source & inputs
- Scenario script: `scenarios/s28-script-rename-scope.txt`.
- Executed transcript (the fixture source):
  `scenarios/executed/s28-script-rename-scope/08e627ff-de50-4de7-aa03-5133366d9f25.jsonl` (189 lines).
- Rendered byte-for-byte ground truth (the §4 capture reads these):
  `scenarios/executed/s28-script-rename-scope/{catalog.py,catalog_view.py,tests/test_catalog.py,scoped_rename.py,scoped_renames.csv}`.
- File-history backups: `~/.claude/file-history/08e627ff-de50-4de7-aa03-5133366d9f25/`. Blob hash is
  per-file (path-derived); versions are `@vN`:
  - `catalog.py` = `e736cafd0e8dcd15` (`@v2` 6210 pre-everything, `@v3` 6676 after `count_entries`, `@v4`
    6750 post-script = final).
  - `catalog_view.py` = `a8b61336832f339e` (`@v2` 1513 pre-script, **`@v3` 1521 post-script = the Edits'
    base**, `@v4` 2068 post-`preview` = final).
  - `tests/test_catalog.py` = `b50d0152214d341d` (`@v2` 2626 pre-script, **`@v3` 2666 post-script = final,
    byte-identical to the rendered file**).
  - `scoped_rename.py` = `5d087307977265c2` (`@v2` 1899). `scoped_renames.csv` = `ec16e4a1c9aae11a`
    (`@v2` 84).

### 2.2 The three beacons (JSONL lines 114/115/116, all timestamp `2026-06-24T20:04:21.909Z`)
The rename surfaces ONLY as `edited_text_file` beacons (the `python3` Bash command is opaque — never
parsed). Beacon attachment uuids (= the `user-edit` changeIds): `catalog.py` =
`9d5b50af-3cdd-4e06-9b4b-a05162fd7c44`; `tests/test_catalog.py` = `888a7d75-bed5-46ed-b706-6f0b77add2cd`;
`catalog_view.py` = `c264b1e3-63bc-4399-8e95-1eba3737e69b`. The `catalog.py` snippet is contiguous
1–198; the other two carry interior `...` lines and/or start past line 1.

### 2.3 Reconstructed revision ladders (VERIFIED LIVE, with the real sidecar reader)
- **`catalog.py`** — kinds `[write, edit, edit, edit, user-edit]`; final **6749** bytes; identical with
  no reader, poison reader, and real reader (reader-INDEPENDENT). COMPLETE beacon → adopted verbatim.
- **`scoped_rename.py`** — kinds `[write]`; final **1898** bytes; reader-INDEPENDENT.
- **`scoped_renames.csv`** — kinds `[write]`; final **83** bytes; reader-INDEPENDENT.
- **`tests/test_catalog.py` WITH the fix + reader** — kinds `[write, user-edit, overwrite]`:
  - rev0 `write`     changeId `toolu_0199WaHAwktutwN6kisfWzfx`, 102 lines (pre-script, terse `load_all`).
  - rev1 `user-edit` changeId `888a7d75-bed5-46ed-b706-6f0b77add2cd`, **92 lines** (the MID-ELIDED beacon).
  - rev2 `overwrite` changeId **`b50d0152214d341d@v3`**, **102 lines** (the injected complete backup).
  - final = **2665** bytes (= rendered `tests/test_catalog.py` minus its trailing newline).
- **`catalog_view.py` WITH the fix + reader** — kinds `[write, user-edit, overwrite, edit, edit, edit]`:
  - rev0 `write`     changeId `toolu_016XemvW2wFB6MLCvQdmeaR4`, 49 lines (pre-script, `load_all`).
  - rev1 `user-edit` changeId `c264b1e3-63bc-4399-8e95-1eba3737e69b`, **30 lines** (the HEAD+TAIL-elided window).
  - rev2 `overwrite` changeId **`a8b61336832f339e@v3`**, **49 lines** (the injected post-script base).
  - rev3 `edit` changeId `toolu_016EBfpcvMWGv5rLiqBFpCUX`, 48 lines │ rev4 `edit` (same changeId), 49 lines
    (the `__all__ += "preview"` Edit; the engine renders this single Edit as two revisions — pre-existing,
    unrelated to the fix).
  - rev5 `edit` changeId `toolu_01KBLPXdHqqJfUhNfFnd19VJ`, **64 lines** (insert `preview()` → final).
  - final = **2067** bytes (= rendered `catalog_view.py` minus its trailing newline).
- **`tests/test_catalog.py` WITHOUT a reader** — kinds `[write, user-edit]`; final **2393** bytes (WRONG).
- **`catalog_view.py` WITHOUT a reader** — kinds `[write, user-edit, edit, edit, edit]`; final **1538**
  bytes (WRONG). These two are the reader-dependence regression guards (§2.5).

### 2.4 The fix-injected revision: an `overwrite` from a CONTENT-VALIDATED backup version (NEW)
For each elided beacon the fix inserts a synthetic `write` event (replay turns a write onto a present
file into an `overwrite`, `reconstruction_replay.ts:43-53`) **immediately after the beacon**:
- `tests/test_catalog.py`: backup `b50d0152214d341d@v3` (2666 raw = the complete terminal content).
- `catalog_view.py`: backup `a8b61336832f339e@v3` (1521 raw = the post-script, **pre-`preview`** content).
  This is the LOAD-BEARING version choice: the file's LATEST backup is `@v4` (the final, post-`preview`),
  but `@v4`'s lines at 11–41 differ from the beacon (the inserted `preview()` shifts them), so `@v4`
  FAILS validation and `@v3` is chosen. The two `preview` Edits then splice onto `@v3` → `@v4`.
The synthetic event's `changeId` is the blob name, keeping it out of the conversation graphs (spec 40);
it is NOT an extracted event, so it never appears in `extractFileEvents` or the DAGs.

### 2.5 Reader-dependence matrix (VERIFIED LIVE — the regression guard)
| File | no reader | poison reader | real reader |
|---|---|---|---|
| `catalog.py` | 6749 ✓ | 6749 ✓ | 6749 ✓ |
| `scoped_rename.py` | 1898 ✓ | 1898 ✓ | 1898 ✓ |
| `scoped_renames.csv` | 83 ✓ | 83 ✓ | 83 ✓ |
| `tests/test_catalog.py` | 2393 ✗ (2 revs) | 2393 ✗ (no backup validates) | **2665 ✓ (3 revs)** |
| `catalog_view.py` | 1538 ✗ (5 revs) | 1538 ✗ (no backup validates) | **2067 ✓ (6 revs)** |

With a *poison* reader every candidate fails `backupMatchesBeacon`, so no overwrite is injected — the fix
never fabricates content.

### 2.6 Branch shape — LINEAR
`reconstructBranches(...).rewound.length === 0`; `surviving.length === 6` — the five tracked files above
PLUS `/tmp/cat.txt` (a stray `cat`-redirect side file in the transcript; reader-independent, not part of
the scenario's renamed set). Assert the five relevant suffixes are present; treat `/tmp/cat.txt` as an
expected sixth.

### 2.7 Capture command for the test literals (run once, paste results)
Run from the repo root; it emits the rendered-file ground-truth literals (stripped of trailing newline)
AND the single backup literal the engine test inlines (`catalog_view@v3`, the post-script pre-`preview`
content that is NOT a rendered file):
```
node --import tsx -e '
import { readFileSync } from "node:fs";
const GT = "scenarios/executed/s28-script-rename-scope";
const FH = process.env.HOME + "/.claude/file-history/08e627ff-de50-4de7-aa03-5133366d9f25";
const strip = (s) => (s.endsWith("\n") ? s.slice(0, -1) : s);
const L = (s) => JSON.stringify(s);
console.log("S28_CATALOG_FINAL =", L(strip(readFileSync(GT + "/catalog.py", "utf8"))));
console.log("S28_CATALOG_VIEW_FINAL =", L(strip(readFileSync(GT + "/catalog_view.py", "utf8"))));
console.log("S28_TEST_CATALOG_FINAL =", L(strip(readFileSync(GT + "/tests/test_catalog.py", "utf8"))));
console.log("S28_SCOPED_RENAME_FINAL =", L(strip(readFileSync(GT + "/scoped_rename.py", "utf8"))));
console.log("S28_SCOPED_RENAMES_CSV_FINAL =", L(strip(readFileSync(GT + "/scoped_renames.csv", "utf8"))));
console.log("S28_CATALOG_VIEW_V3 =", L(readFileSync(FH + "/a8b61336832f339e@v3", "utf8")));
'
```
**`S28_CATALOG_VIEW_V3` keeps its trailing newline** (the reader returns raw bytes; `splitLines` drops it
at replay). Verified lengths: `catalog_view@v3` raw = **1521**; rendered finals stripped = 6749 / 2067 /
2665 / 1898 / 83. For the CLI DAG/verbose literals, run `runCli([S28_JSONL])`,
`runCli([S28_JSONL,"--list-branches"])`, and `runCli([S28_JSONL,"--surviving","--verbose"])` and copy the
relevant lines (mirror `tests/reconstruction_cli_s27.test.ts`).

---

## 3. THE ENGINE FIX (cite this map in impl-notes)

The fix is four edits across three existing files plus the pipeline wiring — all reader-only. It was
prototyped exactly as below; line counts after the change: `reconstruction_user_edit.ts` 85,
`reconstruction_sidecar.ts` 241, `reconstruction_reseed.ts` 211, `reconstruction_branches.ts` 186 (all
≤ 250). Apply via TDD per §5.

### 3.1 Behaviour to add — disjoint from S27
A new reader-only event-list transform `completeElidedBeacons(records, events, reader)`: for EACH
`user-edit` beacon whose raw `cat -n` snippet is **elided** — it starts past line 1 (head omitted), has a
gap between consecutive line numbers (interior omitted), OR carries a literal `...` separator — find the
file-history backup version whose numbered content reproduces EVERY visible beacon line, and splice a
synthetic `write` of that backup **immediately after the beacon**.

- **Disjointness from S27 (load-bearing):** the elision test deliberately EXCLUDES a snippet that starts
  at line 1 with contiguous numbers and no `...` — i.e. a pure terminal tail-truncation, which remains
  `completeTruncatedBeacon`'s job (s27). S27's `test_inventory.py` prefix beacon (lines 1–50, contiguous)
  is therefore NOT elided here and is untouched by S28. Conversely, after S28 inserts the overwrite, a
  terminal beacon's LAST event becomes the `write`/overwrite, so `completeTruncatedBeacon` (which guards
  on `last.kind === userEdit`) skips it — the two never double-fire.
- **Forward-validation, never fabricate:** a backup is accepted only if every visible `(lineNo, text)`
  pair matches `splitLines(backup)[lineNo-1]` AND the backup has more lines than the beacon showed. A
  poison/wrong backup fails and is skipped (no injection).
- **Version selection by content, not recency:** scan ALL backup versions (`backupWritesFor`) and keep
  the latest one that validates. This picks `catalog_view@v3` over the newer `@v4` (which fails because
  the `preview` insertion shifted lines).
- **Reader-only:** registered behind the existing `reader ?` guard, so reader-free reconstruction and all
  pre-S28 reader-free scenarios are byte-for-byte unaffected.

### 3.2 The four code changes

**(a) `src/reconstruction_user_edit.ts` — expose the raw numbered snippet** (the line numbers
`stripLineNumberPrefixes` discards are what detect elision). Add types + an exported parser, and import
`Uuid`:
```ts
// One numbered line of an `edited_text_file` snippet (`lineNo` is the file line the harness showed).
export type BeaconLine = { lineNo: number; text: string };
// The PARSED `cat -n` snippet of a beacon: every numbered line plus whether a literal `...` elision
// separator is present. Unlike the UserEditEvent's `content`, the line NUMBERS are preserved here so
// the reseed stage can detect a windowed (elided) snippet. See plans/s28/s28-reconstruction-plan.md.
export type BeaconSnippet = { lines: BeaconLine[]; hasEllipsis: boolean };

// Parse the raw `edited_text_file` snippet of the attachment whose record uuid === `changeId` into its
// numbered lines (preserving line numbers) plus an ellipsis flag. A snippet line carries an `N\t`
// prefix; an elision separator is a bare `...` line with NO prefix, so the two are unambiguous.
// Returns undefined when no such attachment exists.
export function beaconSnippetFor(
    records: TranscriptRecord[],
    changeId: Uuid,
): BeaconSnippet | undefined {
    for (const record of records) {
        const entry = getAttachmentEntry(record);
        if (entry === undefined || entry.attachment.type !== AttachmentPayloadType.edited_text_file) {
            continue;
        }
        if (entry.uuid.toString() !== changeId.toString()) {
            continue;
        }
        return parseNumberedSnippet(entry.attachment.snippet as string);
    }
    return undefined;
}

// Split a `cat -n` snippet into numbered lines + ellipsis flag (see beaconSnippetFor).
function parseNumberedSnippet(snippet: string): BeaconSnippet {
    const lines: BeaconLine[] = [];
    let hasEllipsis = false;
    for (const raw of snippet.split("\n")) {
        const match = raw.match(/^(\d+)\t(.*)$/);
        if (match) {
            lines.push({ lineNo: Number(match[1]), text: match[2]! });
        } else if (raw === "...") {
            hasEllipsis = true;
        }
    }
    return { lines, hasEllipsis };
}
```
> Change the existing import to `import { Path, Uuid } from "./structures/domain.ts";`. Keep
> `stripLineNumberPrefixes`/`userEditEventFrom` exactly as they are — the new parser is additive.

**(b) `src/reconstruction_sidecar.ts` — enumerate all backup versions.** Add `backupWritesFor` and make
`latestBackupWriteFor` reuse it (the reuse keeps the file ≤ 250):
```ts
// Every non-null file-history backup of `target` as a synthetic Write, time-ascending. Used to find
// the backup version whose numbered content matches an ELIDED beacon (s28): the correct post-script
// version is NOT necessarily the latest (a later Edit produces a newer blob), so the caller must scan
// versions and validate by content. changeId = the blob name (out of the graphs, spec 40).
export function backupWritesFor(
    records: TranscriptRecord[],
    target: Path,
    reader: BackupReader,
): WriteEvent[] {
    const cwd = findCwd(records);
    const timeline = buildBackupTimeline(records, cwd);
    const points = timeline.get(resolveAgainstCwd(cwd, target)) ?? [];
    const writes: WriteEvent[] = [];
    for (const point of points) {
        if (point.backupFileName === null) {
            continue;
        }
        writes.push({
            kind: EventKind.write,
            changeId: new Uuid(point.backupFileName.toString()),
            target,
            content: reader(point.backupFileName),
            timestamp: point.backupTime,
        });
    }
    return writes;
}
```
and replace the body of `latestBackupWriteFor` with:
```ts
export function latestBackupWriteFor(
    records: TranscriptRecord[],
    target: Path,
    reader: BackupReader,
): WriteEvent | undefined {
    const writes = backupWritesFor(records, target, reader); // time-ascending; newest is last
    return writes[writes.length - 1];
}
```
> This reuse is REQUIRED: adding `backupWritesFor` without shrinking `latestBackupWriteFor` pushes the
> file to 258 lines and the 250-cap hook blocks the edit. The behaviour is identical (newest non-null
> backup) — the S27 engine tests stay green.

**(c) `src/reconstruction_reseed.ts` — the elided-beacon completion.** Add to the imports:
```ts
import {
    backupSeedWriteFor,
    backupWritesFor,
    latestBackupWriteFor,
} from "./reconstruction_sidecar.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import { beaconSnippetFor } from "./reconstruction_user_edit.ts";
import type { BeaconSnippet } from "./reconstruction_user_edit.ts";
```
and append the new family after `completeTruncatedBeacon`:
```ts
// --- elided beacons (s28) --------------------------------------------------------------------------

// A user-edit beacon is ELIDED (a WINDOWED `edited_text_file` view — s28's scoped script rename) when
// its `cat -n` snippet omits lines: it starts past line 1 (head elided), has a gap between consecutive
// line numbers (interior elided), or carries a literal `...` separator. A snippet that starts at line 1
// with contiguous numbers and no `...` is NOT elided here — a pure terminal tail-truncation is left to
// completeTruncatedBeacon (s27), keeping the two triggers disjoint.
function beaconIsElided(snippet: BeaconSnippet): boolean {
    const first = snippet.lines[0];
    if (first === undefined) {
        return false;
    }
    if (snippet.hasEllipsis || first.lineNo > 1) {
        return true;
    }
    for (let index = 1; index < snippet.lines.length; index += 1) {
        if (snippet.lines[index]!.lineNo !== snippet.lines[index - 1]!.lineNo + 1) {
            return true;
        }
    }
    return false;
}

// Forward-validation: whether `backupContent` reproduces EVERY visible line of an elided beacon at its
// own line number, and holds more lines than the beacon showed. A backup that fails any visible line is
// rejected (never fabricate) — this is how the right post-script version is picked among all backups
// and how a poison/wrong backup is made a no-op.
function backupMatchesBeacon(snippet: BeaconSnippet, backupContent: string): boolean {
    const lines = splitLines(backupContent);
    if (lines.length <= snippet.lines.length) {
        return false;
    }
    for (const { lineNo, text } of snippet.lines) {
        if (lineNo - 1 >= lines.length || lines[lineNo - 1] !== text) {
            return false;
        }
    }
    return true;
}

// The synthetic Write completing an ELIDED beacon: the latest file-history backup whose numbered
// content matches every visible beacon line. undefined when the beacon is not elided or no backup
// matches (reader-only; never fabricated).
function elidedBeaconSeed(
    records: TranscriptRecord[],
    beacon: UserEditEvent,
    reader: BackupReader,
): WriteEvent | undefined {
    const snippet = beaconSnippetFor(records, beacon.changeId);
    if (snippet === undefined || !beaconIsElided(snippet)) {
        return undefined;
    }
    let match: WriteEvent | undefined;
    for (const candidate of backupWritesFor(records, beacon.target, reader)) {
        if (backupMatchesBeacon(snippet, candidate.content)) {
            match = candidate; // time-ascending; keep the latest version consistent with the window
        }
    }
    return match;
}

// For each ELIDED user-edit beacon (s28: a script rewrote the file and the post-script
// `edited_text_file` snippet is only a WINDOW onto the new content — omitting head/tail/interior
// lines), splice a synthetic Write of the matching file-history backup immediately AFTER the beacon, so
// replay's revision there is the COMPLETE post-script file and any later Edits splice onto the real
// content rather than the window. Reader-only; a beacon with no matching backup is left unchanged.
export function completeElidedBeacons(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const result: FileEvent[] = [];
    for (const event of events) {
        result.push(event);
        if (event.kind !== EventKind.userEdit) {
            continue;
        }
        const seed = elidedBeaconSeed(records, event, reader);
        if (seed) {
            result.push(seed);
        }
    }
    return result;
}
```
> `splitLines`, `EventKind`, `UserEditEvent`, `WriteEvent`, `FileEvent`, `TranscriptRecord` are already
> imported in this module (s19/s27). The module's header comment should gain a third bullet describing
> `completeElidedBeacons`.

**(d) `src/reconstruction_branches.ts` — wire it as a stage BEFORE `seedStaleEditBases`.** Update the
import and the pipeline:
```ts
import {
    completeElidedBeacons,
    completeTruncatedBeacon,
    seedStaleEditBases,
} from "./reconstruction_reseed.ts";
```
```ts
const based = reader ? seedEditBaseFromBackup(records, filled, reader) : filled;
const unelided = reader ? completeElidedBeacons(records, based, reader) : based;
const restaged = reader ? seedStaleEditBases(records, unelided, reader) : unelided;
const completed = reader ? completeTruncatedBeacon(records, restaged, reader) : restaged;
return replayEvents(completed);
```
> **Order matters:** `completeElidedBeacons` runs BEFORE `seedStaleEditBases` so that
> `catalog_view.py`'s injected `@v3` overwrite makes the two `preview` Edits' bases correct — leaving
> `seedStaleEditBases` inert for them (no double-seed). It runs before `completeTruncatedBeacon` so the
> two terminal-beacon triggers stay mutually exclusive (§3.1).

### 3.3 Reference map (the exact call chain the fix joins)
- Beacon → event (line numbers stripped): `reconstruction_user_edit.ts:15-20,25-42`.
- Per-file pipeline: `reconstruction_branches.ts:35-53` (`reconstructFileOver`, the `reader ?` chain).
- Verbatim adoption of a user-edit revision (the bug): `reconstruction_replay.ts` `userEditRevision`.
- write→overwrite-on-present: `reconstruction_replay.ts:43-53`.
- `splitLines` drops one trailing newline: `reconstruction_replay_edit.ts`.
- S27 sibling trigger (disjoint): `reconstruction_reseed.ts:106-120` (`completeTruncatedBeacon`).

---

## 4. Task 1 — Baseline & fixture (do first)
1. Confirm baseline: `npm test` = **384 pass / 0 fail**; `npx tsc --noEmit` clean; `git diff src/` empty.
2. Append `S28_JSONL` to `tests/fixtures.ts` after `S27_JSONL`, pointing at the executed transcript
   `scenarios/executed/s28-script-rename-scope/08e627ff-de50-4de7-aa03-5133366d9f25.jsonl` (mirror the
   absolute-path constant style of `S27_JSONL`).
3. Run the §2.7 capture command; save the five rendered-file literals + `S28_CATALOG_VIEW_V3`.

## 5. Task 2 — Engine fix, TDD (RED → GREEN)
Per `~/.claude/guides/tdd.md`: write a failing crux test FIRST, watch it fail, then implement §3.
1. **RED:** add `test_S28_catalog_view_elided_beacon_overwrite_then_edits` (the §6 crux) and run only
   that file — it must FAIL (engine yields `[write,user-edit,edit,edit,edit]`, 1538 bytes) before any
   `src/` edit.
2. **GREEN:** apply §3 (a)+(b)+(c)+(d). Re-run — the crux passes (`[write,user-edit,overwrite,edit,edit,edit]`,
   2067).
3. Confirm `npx tsc --noEmit` clean and every changed `src/` file ≤ 250 lines (expect 85 / 241 / 211 / 186).

## 6. Task 3 — Engine lock (`tests/reconstruction_engine_s28.test.ts`)
Mirror `tests/reconstruction_engine_s27.test.ts` (hermetic reader; real file-history tree NOT touched).
The hermetic reader returns the one inline backup (`catalog_view@v3`) and derives the rest from rendered
files; it returns `""` for any other blob (so `@v2` candidates are rejected by `backupMatchesBeacon`):
```ts
const GT = "scenarios/executed/s28-script-rename-scope";
const s28Reader: BackupReader = (name) => {
    const blob = name.toString();
    if (blob === "a8b61336832f339e@v3") return S28_CATALOG_VIEW_V3;                          // inline literal
    if (blob === "a8b61336832f339e@v4") return readFileSync(`${GT}/catalog_view.py`, "utf8"); // rendered final
    if (blob === "b50d0152214d341d@v3") return readFileSync(`${GT}/tests/test_catalog.py`, "utf8");
    return "";
};
const poison: BackupReader = () => "POISONED-BACKUP-SHOULD-NOT-BE-USED";
```
Tests (assert against the verified ladders/literals in §2.3):
1. `test_S28_linear_six_surviving_no_rewound` — `rewound.length===0`, `surviving.length===6`, the five
   suffixes present (`/catalog.py`, `/catalog_view.py`, `/test_catalog.py`, `/scoped_rename.py`,
   `/scoped_renames.csv`).
2. `test_S28_catalog_reader_independent_bytelock` — kinds `[write,edit,edit,edit,user-edit]`;
   `finalText(without)===finalText(withPoison)`, no `"POISONED"`; length 6749; `=== S28_CATALOG_FINAL`;
   contains `def load_catalog` and `def normalize_entry`, and NOT the terse `def load_all(`/`def _norm(`
   (the COMPLETE beacon already carries the rename, so this file is reader-independent).
3. `test_S28_scoped_rename_and_csv_reader_independent` — `scoped_rename.py` kinds `[write]`, length 1898,
   `=== S28_SCOPED_RENAME_FINAL`, poison-equal; `scoped_renames.csv` kinds `[write]`, length 83,
   `=== S28_SCOPED_RENAMES_CSV_FINAL`. (The CSV body proves the scope columns: a `load_all,load_catalog,Y`
   row and a `_norm,normalize_entry,N,catalog.py` row.)
4. **CRUX** `test_S28_test_catalog_terminal_elided_beacon_overwrite` — with `s28Reader`: kinds
   `[write,user-edit,overwrite]`; rev1 `user-edit` changeId `888a7d75-…`, `lines.length===92`; rev2
   `overwrite` changeId `b50d0152214d341d@v3`, `lines.length===102`; final length 2665;
   `=== S28_TEST_CATALOG_FINAL`; includes `catalog.load_catalog` and contains NO bare `...` line.
5. **CRUX** `test_S28_catalog_view_elided_beacon_overwrite_then_edits` — with `s28Reader`: kinds
   `[write,user-edit,overwrite,edit,edit,edit]`; rev1 `user-edit` changeId `c264b1e3-…`, `lines.length===30`;
   rev2 `overwrite` changeId **`a8b61336832f339e@v3`**, `lines.length===49`; final length 2067;
   `=== S28_CATALOG_VIEW_FINAL`; includes `def preview(` and `load_catalog`, excludes `load_all`. This is
   the version-selection lock: `@v3` (not the latest `@v4`) is the overwrite source.
6. `test_S28_two_files_without_reader_are_wrong_no_overwrite` — no reader: `tests/test_catalog.py` kinds
   `[write,user-edit]`, length 2393, `!== S28_TEST_CATALOG_FINAL`; `catalog_view.py` kinds
   `[write,user-edit,edit,edit,edit]`, length 1538, `!== S28_CATALOG_VIEW_FINAL`. (Reader-dependence guard.)
7. `test_S28_poison_reader_does_not_inject_garbage` — with `poison`: both files keep their no-reader
   ladders (no `overwrite`), no `"POISONED"` in any final (the `backupMatchesBeacon` validation rejects
   the poison content).
8. `test_S28_catalog_view_latest_backup_is_rejected` — a reader that ALSO returns real content for
   `a8b61336832f339e@v4`: assert the chosen overwrite changeId is `…@v3`, not `…@v4`, and final is 2067
   (proves version selection validates by content, not recency). *(s28Reader already returns `@v4`, so
   this can be folded into test 5 by asserting `rev2.changeId.toString() === "a8b61336832f339e@v3"`.)*

## 7. Task 4 — CLI lock (`tests/reconstruction_cli_s28.test.ts`)
Mirror `tests/reconstruction_cli_s27.test.ts` (real `runCli`, real sidecar reader against the real
file-history tree). Capture exact lines via §2.7. Cover: `conversationDAG` shows the three `user-edit`
beacons + the linear run (no `branch `); `fileDAG` groups each file's events; `--list-branches` = one
surviving tip over the files, no rewound; `--surviving --verbose` for each file shows the right revision
count and the FINAL revision — for `tests/test_catalog.py` and `catalog_view.py` the final block must
show the COMPLETE file (no `...` line; `catalog_view.py` shows `def preview(` and `load_catalog`),
proving the overwrite rendered.

## 8. Task 5 — Docs (3 edits + the fixture)
- `plans/roadmap.md` — add the S28 line after S27.
- `plans/implementation-notes-api-from-scenarios.md` — prepend the S28 entry (REAL fix: new
  `completeElidedBeacons` trigger + `backupWritesFor` + `beaconSnippetFor`; reuse of `latestBackupWriteFor`;
  cite §3.3; note the version-selection-by-content deviation and that it is disjoint from S27).
- `plans/reconstruction-engine-design.md` — append an S28 note: elided (windowed) beacon completion via
  line-number detection + content-validated backup version, reader-dependent, distinct from both the S25
  downstream-Edit reseed and the S27 terminal-prefix completion.

## 9. Task 6 — Full verification
```
npm test          # expect 384 + (Task 3+4 count) ; 0 fail
npx tsc --noEmit  # No errors found
wc -l src/reconstruction_user_edit.ts src/reconstruction_sidecar.ts src/reconstruction_reseed.ts src/reconstruction_branches.ts  # 85 / 241 / 211 / 186, each ≤ 250
git diff --stat src/   # four files: user_edit (+parser), sidecar (+backupWritesFor, latest reuses it), reseed (+elided family), branches (+wiring)
```
Run a mutation probe on the crux (per the S25/S27 liveness lesson): independently flip each of — the
`a8b61336832f339e@v3` changeId assertion, the 2067 / 2665 byte-locks, the "no reader is wrong" test, and
neutralize `beaconIsElided` (force `return false`) — and confirm EACH turns the coupled test RED, then
restore. Neutralizing `beaconIsElided` must turn EXACTLY the two crux tests (4 + 5) red and leave S27's
tests green (proves disjointness).

## 10. Task 7 — Commit (USER APPROVAL ONLY) then HAND OFF
- **Commit gate:** on explicit approval, `git status` first, then stage EXACTLY the changed/new files:
  `src/reconstruction_user_edit.ts`, `src/reconstruction_sidecar.ts`, `src/reconstruction_reseed.ts`,
  `src/reconstruction_branches.ts`, `tests/fixtures.ts`, the two new test files
  (`tests/reconstruction_engine_s28.test.ts`, `tests/reconstruction_cli_s28.test.ts`), and the three doc
  files (`plans/roadmap.md`, `plans/implementation-notes-api-from-scenarios.md`,
  `plans/reconstruction-engine-design.md`), plus `plans/s28/` (this plan + the handoff). Never
  `git add -A`; do NOT stage `src/Plan_template.md`, `src/Impl_template.md`, `monitor-handoff.sh`, or
  `plans/monitor-handoff-spec.md`. Message: `Implemented S28 handling` (+ standard Co-Authored-By /
  Claude-Session trailers).
- **`create handoff`** is a required task for the implementing agent: after GREEN + verification, write
  the completion handoff via `/jot:handoff-prompt` (title line `# Handoff: Scenario s28 (...) IMPLEMENTED
  …`, with `MUST READ: plans/script-handling.txt` on line 1), so any downstream S29 monitor fires.

---

## 11. Acceptance criteria (Definition of Done)
- `tests/test_catalog.py` reconstructs **byte-for-byte** (2665, `[write,user-edit,overwrite]`) and
  `catalog_view.py` (2067, `[write,user-edit,overwrite,edit,edit,edit]`) WITH a reader; `catalog.py`
  (6749), `scoped_rename.py` (1898), `scoped_renames.csv` (83) byte-for-byte and reader-INDEPENDENT.
- The new `completeElidedBeacons` trigger fires ONLY for the two elided beacons; no other scenario's
  revision ladder changes (proven by the full suite staying green and the disjointness mutation probe).
- The overwrite source for `catalog_view.py` is the content-validated `@v3`, NOT the latest `@v4`.
- `npm test` all green (384 + new), `tsc` clean, every `src/` file ≤ 250 lines.
- Engine lock + CLI lock added; reader-dependence, poison-guard, and version-selection tests present and
  load-bearing.
- Nothing committed until explicit user approval; completion handoff written.
