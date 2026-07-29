# Plan — Task 310: Layer 2 snapshot discovery per owning session (`jfred/src/layer1_snapshots.ts`)

Spec S19. Produce, per absolute file path, an instant-ordered list of file-history
snapshot PLACEMENTS. No blob bytes are read here — task 313 fetches those on demand.

## Behavior in plain English

Given a list of JSONL session file paths, for each session: parse the transcript,
walk its file-history snapshot records, and record one placement for every distinct
backup blob a file received. A placement says *where and when* a snapshot exists —
which file, which version, at which instant, in which session, at which transcript
line, under which blob name. Snapshots whose `backupFileName` is null hold no blob and
produce no placement. The same blob name recurs across sessions with different bytes,
so every placement carries its OWNING session's id and file.

## Findings that shape the plan (verified against real data, 2026-07-29)

1. `file-history-snapshot` records are CUMULATIVE. In one real transcript
   (`b3a6d7e6-…jsonl`, 149 snapshot records) 1,845 backup entries collapse to 230
   distinct `(path, backupFileName, backupTime)` triples — up to 101 repeats of a
   single entry. `buildBackupTimeline` does not dedupe (harmless for beacons, fatal
   for placements: it would draw 101 identical snapshot nodes). **Deduping is
   mandatory in this module.**
2. The recorded `version` field and the `@vN` suffix of `backupFileName` AGREE on
   5,366 of 5,366 real non-null entries. So carry the recorded `version` through
   rather than regex-parsing the name — same answer, no parser to get wrong.
3. `backupFileName === null` does NOT imply `version === 1` (72 real counter-examples).
   The skip rule is therefore keyed on the NULL BLOB, exactly as
   `collectSnapshotBeaconNodes` already does — never on `version === 1`.
4. `BackupPoint` currently drops both `version` and the transcript line. It is
   constructed at exactly ONE site (`computeBackupTimeline`), so widening it is safe.

## Step 1 — widen `BackupPoint` (RED first)

File: `jfred/src/reconstruction_backup_timeline.ts`

Add to the `BackupPoint` type:

```ts
export type BackupPoint = {
    backupTime: Date;
    backupFileName: Path | null;
    sessionId?: Uuid;
    version: number;
    line?: number;      // transcript line the point was recorded at; absent for fabricated records
};
```

In `computeBackupTimeline`, inside the `for (const [path, backup] of …entries())`
loop, populate them:

```ts
const recordLine = getRecordSource(record)?.lineNumber;
points.push({
    backupTime: backup.backupTime,
    backupFileName: backup.backupFileName,
    sessionId: session,
    version: backup.version,
    line: recordLine,
});
```

`getRecordSource` comes from `./parse/loadTranscript.ts`. `line` stays optional
because only records loaded through `loadTranscript` carry a source — fabricated
in-memory records (existing tests, script-injected records) legitimately have none,
and inventing a line number for them would be a lie.

No other file constructs a `BackupPoint`, so nothing else changes.

## Step 2 — write the failing tests (RED)

File: `jfred/tests/layer1_snapshots.test.ts` (the Stop hook enforces
`tests/<module>.test.ts` naming).

TRAP the task calls out: the sidecar reader falls back to the LIVE
`~/.claude/file-history` when a test does not go through `loadTranscript`. Every
fixture here is written to a temp tree and loaded with `loadTranscript`, so root
derivation resolves to the temp tree's own `file-history` sibling.

Fixture helper (module-private to the test file):

```ts
// A copied-out-of-~/.claude tree: <root>/projects/<project>/<session>.jsonl next to <root>/file-history/<sessionId>/<blob>, which is what deriveSiblingFileHistoryRoot needs.
function writeSessionTranscript(
    treeRoot: string,
    sessionId: string,
    fileName: string,
    records: object[],
): string
```

It creates `join(treeRoot, "projects", "-demo")` and `join(treeRoot, "file-history")`,
writes one JSON object per line, and returns the jsonl path.
Use `makeTempDir` from `tests/overrides-test-helpers.ts` for `treeRoot`.

Record builders mirror `tests/layered_snapshot_beacons.test.ts`:
- `buildSessionCwdRecord(cwd, sessionId)` — a `RecordType.user` record carrying `cwd`
  and `sessionId`, so the snapshot records that follow belong to that session and
  relative paths resolve.
- `buildSnapshotRecord(path, backupFileName, version, backupTime)` — a
  `RecordType.fileHistorySnapshot` record whose `trackedFileBackups` holds one entry.

### test_collectSnapshotPlacements_keeps_each_session_as_the_owner_of_its_own_version

```
// Scenario: sessions b21d84c5 and d4a06b8f BOTH name their src/util.ts blob "abc123@v2" with different bytes — the mockup fixture models exactly this. A placement that lost its owning session would let one session's bytes be read for the other's snapshot.  Steps: Write session ONE's transcript: cwd /work, one snapshot of util.ts -> abc123@v2 at T1.  Write its blob under <tree>/file-history/<session one id>/abc123@v2 containing "bytes A\n".  Write session TWO's transcript in the SAME tree: same path, same blob name, at T2 > T1.  Write its blob under <tree>/file-history/<session two id>/abc123@v2 containing "bytes B\n".  Collect placements over BOTH jsonl paths.  Assert /work/src/util.ts has exactly two placements, ordered T1 then T2.  Assert placement[0].sessionId is session one and placement[1].sessionId is session two.  Assert both carry version 2 and backupFileName "abc123@v2" — proving @vN is per session.  Assert each placement's sessionFile is its own jsonl path.  Assert each placement's line is the transcript line its snapshot record sat on.  Finally, read each placement through buildSidecarReader over ITS session's records and assert session one yields "bytes A\n" and session two yields "bytes B\n".
```

The final read is the test's own proof that the placement is sufficient to fetch the
right bytes later; the module under test still reads nothing.

### test_collectSnapshotPlacements_skips_a_snapshot_with_no_blob

```
// Scenario: a null backupFileName holds no blob, so it can never be shown or fetched.  Steps: Write one session whose ONLY snapshot of notes.txt has backupFileName null.  Collect placements.  Assert the map has no entry at all for /work/notes.txt — not an empty array.
```

### test_collectSnapshotPlacements_records_a_repeated_snapshot_entry_once

```
// Scenario: file-history-snapshot records are cumulative — one real transcript repeats a single backup entry 101 times. Without deduping, one snapshot would draw 101 nodes.  Steps: Write one session with THREE snapshot records that all carry the identical (path, backupFileName, backupTime) entry for src/index.ts.  Collect placements.  Assert /work/src/index.ts has exactly ONE placement.  Assert its line is the FIRST record's line — the line where the snapshot was taken, which is what task 311 needs to pick the customTitle in effect.
```

Run these three and confirm they fail before Step 3.

## Step 3 — implement `jfred/src/layer1_snapshots.ts` (GREEN)

```ts
export type SnapshotPlacement = {
    path: Path;
    version: number;
    instant: Date;
    sessionId: Uuid;
    sessionFile: Path;
    line?: number;
    backupFileName: Path;
};

export function collectSnapshotPlacements(sessionFilePaths: Path[]): Map<string, SnapshotPlacement[]>
```

Imperative body, three private helpers:

1. `buildPlacementsForSession(sessionFilePath: Path): Map<string, SnapshotPlacement[]>`
   - `const records = loadTranscript(sessionFilePath.toString(), undefined, true).records;`
     Tolerant mode, matching the viewer's own loader — the Layer 1 View route must open
     real sessions carrying unmodeled fields rather than throwing on them.
   - `const timeline = buildBackupTimeline(records, findCwd(records));`
   - `const fallbackSessionId = findSessionId(records);`
   - For each `[fileKey, points]`, call `buildPlacementsFromBackupPoints` and set the
     entry only when the result is non-empty (the null-blob rule, same as
     `collectSnapshotBeaconNodes`).

2. `buildPlacementsFromBackupPoints(points, sessionFilePath, fallbackSessionId)`
   - Walk points in order. `if (point.backupFileName === null) { continue; }`
   - `const owner = point.sessionId ?? fallbackSessionId; if (owner === undefined) { continue; }`
     A snapshot with no resolvable owning session cannot be read back, so it is not a
     placement.
   - Dedupe with a `Set<string>` of
     `` `${owner}|${point.backupFileName}|${point.backupTime.getTime()}` ``; skip a key
     already seen. Keeping the FIRST occurrence keeps the earliest record's `line`,
     which is where the snapshot was actually taken. `computeBackupTimeline` sorts by
     `backupTime` and V8's sort is stable, so equal-time duplicates retain record order.
   - Push `{ path: new Path(fileKey), version: point.version, instant: point.backupTime,
     sessionId: owner, sessionFile: sessionFilePath, line: point.line,
     backupFileName: point.backupFileName }`.

3. `collectSnapshotPlacements` merges the per-session maps by concatenating arrays under
   the same file key, then sorts each file's array by
   `instant.getTime()` ascending — per-session timelines are each sorted, but the merge
   across sessions is not.

Do not import `BackupReader`, `buildSidecarReader`, `createSidecarReader`, or `readFileSync`
in this module. The absence of those imports IS the "no blob reads" guarantee.

## Deliberate omission — no `fileHistoryRoot` parameter

The task text describes the function as taking "the JSONL session file paths and the
file-history root(s)". Placements do not need a root: nothing here opens a blob. The
root only matters to task 313, which already gets everything it needs from the placement
— `sessionFile` yields the projects dir, and the existing chain
`getPathOverrides().fileHistoryRoot` → `deriveSiblingFileHistoryRoot` →
`getDefaultFileHistoryRoot` (all in `reconstruction_sidecar_reader.ts`) resolves the
root from there, override-wins, which is the S1 rule already implemented. Adding a
parameter this module cannot use would be dead weight the next reader has to disprove.
If task 312 wants the root threaded explicitly, add it there with a real consumer.

## Constraints

- 250-line cap: `layer1_snapshots.ts` lands around 60 lines, the test file around 120.
- Comments: one line, ≤20 words, only where the code cannot say it.
- 4-space indent, imperative style.
- Do NOT run the suite (the user runs tests). Do NOT stage, commit, or close the task.
