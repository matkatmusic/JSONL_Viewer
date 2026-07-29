# Task 312 — Layer 2 engine: snapshot nodes on the Layer 1 wire, ruler and shared axis

Spec S19. Snapshot placements (task 310) become real nodes on `/api/layer1-view`'s payload,
real entries on the shared ruler, and the two source lists become URL params.

Repo: `jfred/` submodule inside the worktree. No git staging, no commits, no task closing.

---

## Design decisions the implementer does NOT need to re-derive

1. **`snapshots` is OMITTED when empty, not `[]`.** The task's VERIFY line requires
   "a snapshot-free pair's wire shape is unchanged from today", and this codebase already
   states the rule (`webapp/layer1-filter.ts:43`): "a `created: undefined` KEY differs from
   an absent one under deep equality". So the field is `snapshots?: …`, spread conditionally,
   exactly the way `created?` already is.
2. **Snapshot instants are APPENDED to the end of each ladder, not interleaved by instant.**
   `layOutNodeLadders` treats a ladder as an unordered multiset for both `countRowsPerInstant`
   and `countNodesPerInstant` — order only decides `assignRowSlots`, i.e. which tied node takes
   the upper row. Appending therefore leaves every existing tick offset and every existing
   commit/created/onDisk offset identical, and gives a snapshot tied with a commit or an mtime
   the row BELOW it. That is the S19 reading: the commit/disk node is the event, the snapshot
   is the copy of it.
3. **`onDisk` stops using `nodeOffsetsPx.at(-1)`.** With snapshots appended, the last entry is
   a snapshot. Its index becomes explicit: `firstCommitIndex + commits.length`.
4. **Disk orphans move from `placeInstantOnAxis` to ladder offsets.** A one-node ladder's slot 0
   offset IS the tick offset, so this changes nothing for a snapshot-free orphan while letting
   its snapshots stack. Git orphans are untouched — a repo-only path has no disk file and
   therefore no file-history snapshot to carry.
5. **`?snapshots=` is round-tripped but NOT read by the server in this task.** Snapshot
   PLACEMENTS come from the transcripts (`buildBackupTimeline` over records), not from the
   file-history store; only task 313's blob READ needs the root. The client writes it into the
   URL so the link is complete and 313 can pick it up. The S1 rule ("an explicitly-supplied
   file-history root wins over discovery") is therefore task 313's to enforce.
6. **`buildLayer1View` gains a 6th optional positional param**, not an options object — an
   options object would churn `tests/layer1_view_progress.test.ts` and both route call sites
   for no behaviour.
7. **Progress is reported per session file.** `collectSnapshotPlacements` takes a `Path[]` and
   offers no callback, so the new module calls it ONE FILE AT A TIME and merges. That is calling
   it, not rewriting it, and it is the only way to satisfy the standing "anything slow shows
   progress" rule for a stage that parses every transcript in the project.

---

## Step 1 — Export the transcript lister so it is not written twice

**File:** `jfred/src/viewer_api_layer1_sessions.ts`

Change `function listTranscriptFiles(...)` (line ~71) to `export function listTranscriptFiles(...)`.
Nothing else in that file changes.

---

## Step 2 — Tests first: the new server module

**New file:** `jfred/tests/layer1_snapshot_wire.test.ts`

Copy the fixture builders from `jfred/tests/layer1_snapshots.test.ts` — `buildSessionCwdRecord`,
`buildSnapshotRecord`, `writeSessionTranscript`, plus `makeTempDir` from
`./overrides-test-helpers.ts`. Everything loads through `loadTranscript` by an explicit temp
path, so the live `~/.claude/file-history` is never reached.

Set each fixture transcript's `cwd` to the temp PROJECT FOLDER, because
`collectSnapshotPlacements` keys by ABSOLUTE path (`cwd` + the recorded relative path) and the
Layer 1 wire keys by path RELATIVE to the project folder.

Tests to write against `collectViewSnapshotsByRelativePath` (Step 3):

- `test_collectViewSnapshotsByRelativePath_keys_placements_relative_to_the_project_folder` —
  a snapshot recorded for `src/util.ts` under `cwd = <projectFolder>` comes back under the key
  `"src/util.ts"`.
- `test_collectViewSnapshotsByRelativePath_drops_a_path_outside_the_project_folder` —
  a session whose `cwd` is a sibling temp folder contributes no keys. Assert the prefix check
  requires the separator: a project folder `/tmp/a` must NOT absorb a path under `/tmp/ab`.
- `test_collectViewSnapshotsByRelativePath_reports_one_progress_event_per_session_file` —
  a two-file input emits `{ label: LAYER1_PROGRESS_LABEL_READING_SNAPSHOTS, current: 1, total: 2 }`
  then `current: 2`.
- `test_collectViewSnapshotsByRelativePath_orders_a_paths_placements_by_instant_across_sessions` —
  two sessions writing the same path, the later-instant one passed FIRST, come back ascending.

---

## Step 3 — The new server module

**New file:** `jfred/src/layer1_snapshot_wire.ts`

```ts
// Task 312 (spec S19): snapshot placements as Layer 1 wire nodes, keyed the way the view keys files.

import { collectSnapshotPlacements, type SnapshotPlacement } from "./layer1_snapshots.ts";
import type { Layer1WireInstant } from "./viewer_api_layer1.ts";
import type { ProgressSink } from "./parse/loadTranscript.ts";
import { Path, Uuid } from "./structures/domain.ts";
import { DocumentResponseKind } from "./structures/vocabulary.ts";
```

The `Layer1WireInstant` import is `import type`, so it is erased and the two modules do not form
a runtime cycle.

Exports:

```ts
export const LAYER1_PROGRESS_LABEL_READING_SNAPSHOTS = "reading file-history snapshots";

// `version` is the @vN the OWNING session assigned, so sessionId is what makes it identify anything.
export interface Layer1WireSnapshot extends Layer1WireInstant {
    version: number;
    sessionId: Uuid;
    sessionFile: Path;
    line?: number;
}
```

Four functions:

- `relativizeToProjectFolder(projectFolder: Path, absolutePath: string): string | undefined`
  — returns the remainder when `absolutePath` starts with `projectFolder + "/"`, otherwise
  `undefined`. The separator is load-bearing: a bare `startsWith` lets `/tmp/ab` pass against
  `/tmp/a`.
- `collectViewSnapshotsByRelativePath(projectFolder: Path, sessionFiles: readonly Path[], reportProgress: ProgressSink): Map<string, SnapshotPlacement[]>`
  — loops the session files; for each, emits
  `{ kind: DocumentResponseKind.progress, label: LAYER1_PROGRESS_LABEL_READING_SNAPSHOTS, current: index + 1, total: sessionFiles.length }`,
  calls `collectSnapshotPlacements([sessionFile])`, relativizes each key, and concatenates into
  the merged map. After the loop, sort each list by `instant.getTime()` — the per-call sort is
  only within one session.
- `listSnapshotInstants(placements: SnapshotPlacement[] | undefined): Date[]`
  — `placements?.map((placement) => placement.instant) ?? []`. One helper so the pair path, the
  disk-orphan path and the client mirror cannot drift on what a ladder tail contains.
- `placeSnapshotsOnAxis(placements: SnapshotPlacement[] | undefined, tailOffsetsPx: number[]): Layer1WireSnapshot[]`
  — parallel to `listSnapshotInstants`' output; returns `[]` for `undefined`. `line` is spread
  conditionally so an absent line stays absent.

Keep the file under 250 lines (it will be ~70).

---

## Step 4 — Wire the snapshots into `buildLayer1View`

**File:** `jfred/src/viewer_api_layer1.ts` (182 lines today; this adds ~25 — stays under the cap).

Type changes:

```ts
export interface Layer1WirePair {
    …
    // Task 312: absent when the file has none, so a snapshot-free pair's shape is unchanged.
    snapshots?: Layer1WireSnapshot[];
}

export interface Layer1WireOrphan extends Layer1WireInstant {
    path: Path;
    snapshots?: Layer1WireSnapshot[];
}
```

Signature:

```ts
export function buildLayer1View(
    projectFolder: Path,
    repoDir: Path,
    ref: string,
    reportProgress: ProgressSink = () => {},
    timeSource: CommitTimeSource = CommitTimeSource.committer,
    sessionFiles: readonly Path[] = [],
): Layer1WireView
```

Body changes, in order:

1. After `gitOrphanPlacements` is built and BEFORE `LAYER1_PROGRESS_LABEL_RESOLVING_RULER`:
   `const snapshotsByPath = collectViewSnapshotsByRelativePath(projectFolder, sessionFiles, reportProgress);`
   With an empty `sessionFiles` this loops zero times and emits no progress event — which is what
   keeps `tests/layer1_view_progress.test.ts`'s "every countless stage in execution order" test
   passing unchanged.
2. `listPairNodeLadder(pair, snapshots)` gains a second argument and appends
   `...listSnapshotInstants(snapshots)` after `pair.file.mtime`.
3. `placePairNodesOnAxis(pair, nodeOffsetsPx, snapshots)`:
   - `const onDiskIndex = firstCommit + pair.commits.length;`
   - `onDisk: { instant: pair.file.mtime, axisPx: nodeOffsetsPx[onDiskIndex]! }`
   - `...(placed.length === 0 ? {} : { snapshots: placed })` where
     `placed = placeSnapshotsOnAxis(snapshots, nodeOffsetsPx.slice(onDiskIndex + 1))`
4. The `layOutNodeLadders` call's third ladder group becomes
   `pairing.diskOrphans.map((file) => [file.mtime, ...listSnapshotInstants(snapshotsByPath.get(file.relativePath.toString()))])`.
   Pair ladders use `snapshotsByPath.get(pair.file.relativePath.toString())`.
   Git-orphan ladders are unchanged.
5. Disk orphans are placed from `layout.ladderOffsetsPx` instead of `placeInstantOnAxis`. Their
   ladder index base is `pairHistories.length + gitOrphanPlacements.length`. Each row is
   `{ path, instant: file.mtime, axisPx: offsets[0]!, ...snapshots from offsets.slice(1) }`,
   then `orderRowsByInstant` as today.
   `placeInstantOnAxis` stays — git orphans still use it.

If the file crosses 250 lines, move `listPairNodeLadder` + `placePairNodesOnAxis` into
`layer1_snapshot_wire.ts` rather than trimming comments.

---

## Step 5 — The route passes the JSONL roots

**File:** `jfred/src/viewer_api_layer1_route.ts`

In `handleLayer1ViewRequest`, after the existing param reads:

```ts
// Task 312: the same repeatable ?jsonl= /api/layer1-sessions takes; absent means a Layer 1 build with no snapshots.
const sessionFiles = listTranscriptFiles(query.getAll("jsonl"));
```

Pass `sessionFiles` as the 6th argument to both `buildLayer1View` calls.
`listTranscriptFiles` already skips a folder that does not exist, so a stale link is an empty
list rather than a 400 — deliberately unlike `dir`/`repo`, which are the view itself.

Do NOT read `?snapshots=` here (see decision 5).

Import `listTranscriptFiles` from `./viewer_api_layer1_sessions.ts`. That file already imports
`streamNdjsonBuild` from this one; the new import closes a runtime cycle between the two
modules. **Avoid it**: move `listTranscriptFiles` into `jfred/src/viewer_api_layer1_sources.ts`
instead (which already owns `listSourceFilesUnder` and is imported by the sessions route),
export it there, and have `viewer_api_layer1_sessions.ts` import it from there. Step 1's export
therefore becomes a MOVE, not an export in place.

---

## Step 6 — Route test

**New file:** `jfred/tests/viewer_api_layer1_snapshots.test.ts`

Follow `tests/viewer_api_layer1_placement.test.ts`'s harness shape (its own scratch port —
17400/17900/18400/18900/19400 are taken, use `20400 + (process.pid % 500)`).

Build a temp project folder holding one file with a PINNED mtime, a git repo committing it with
a PINNED committer date, and a temp JSONL tree whose transcript records a snapshot of that file
at an instant BETWEEN the commit and the mtime, with `cwd` set to the project folder.

Assertions (these are the task's VERIFY list):

- `test_layer1_view_places_a_snapshot_only_instant_on_the_ruler` — the snapshot's instant appears
  in `view.ruler` even though no commit and no mtime sit there.
- `test_layer1_view_counts_a_snapshot_alongside_the_node_it_shares_an_instant_with` — a second
  fixture snapshot recorded exactly ON the file's mtime makes that tick's `eventCount` 2, and the
  snapshot's `axisPx` is the tick's offset + 22 (`RULER_NODE_ROW_PIXELS`) while `onDisk.axisPx`
  is the tick offset itself.
- `test_layer1_view_omits_snapshots_from_a_pair_that_has_none` — request the SAME fixture with no
  `?jsonl=` at all and assert the pair object deep-equals the one the existing placement fixture
  returns today, i.e. it carries no `snapshots` key.
- `test_layer1_view_carries_snapshots_on_a_disk_orphan` — a disk-only file (not in the repo) with
  a recorded snapshot comes back with `snapshots` on its `diskOrphans` row.

---

## Step 7 — The client mirror's types

**File:** `jfred/webapp/layer1-wire.ts`

```ts
// Task 312: a snapshot node off the wire; @vN is per session, so sessionId identifies it.
export interface WireSnapshot extends WireInstant {
    version: number;
    sessionId: string;
    sessionFile: string;
    line?: number;
}
```

Add `snapshots?: WireSnapshot[];` to `WirePair` and to `WireOrphan`.

---

## Step 8 — Tests first: the client mirror agrees with the server

**File:** `jfred/tests/layer1-filter.test.ts` (add to it; do not create a second file)

- `test_relayOutLayer1View_appends_snapshot_instants_to_a_pairs_ladder` — a hand-built
  `WireLayer1View` with a pair carrying one snapshot between its commit and its mtime re-lays out
  to the SAME offsets the server produced for the same shape.
- `test_relayOutLayer1View_reproduces_the_servers_offsets_for_a_snapshot_bearing_view` — the
  strongest check: feed the SERVER's own response (captured as a literal in the test from the
  Step 6 fixture's numbers) through `relayOutLayer1View` with no filter, and deep-equal the
  result against the input. This is the task's "the same fixture through the client mirror
  produces the same offsets as the server".
- `test_filterLayer1ViewByTargets_keeps_a_kept_pairs_snapshots` — filtering to one path keeps its
  `snapshots` array and drops the other bubble's.

---

## Step 9 — The client mirror's layout

**File:** `jfred/webapp/layer1-filter.ts`

- `listWirePairLadder(pair)` appends `...(pair.snapshots ?? []).map((snapshot) => readWireInstant(snapshot.instant))`
  after `pair.onDisk.instant`.
- `placePairNodesOnAxis` computes `onDiskIndex = firstCommit + pair.commits.length`, places
  `onDisk` at that index, and re-places each snapshot from `nodeOffsetsPx.slice(onDiskIndex + 1)`
  via the existing `placeNodeAtPixels`.
- New `listWireOrphanLadder(orphan)` returning
  `[readWireInstant(orphan.instant), ...(orphan.snapshots ?? []).map(…)]`, used for the
  `diskOrphans` ladder group ONLY.
- `relayOutLayer1View`'s `ladders` array keeps its order — pairs, gitOrphans, diskOrphans — so
  disk-orphan ladder indices are `view.pairs.length + view.gitOrphans.length + index`.
- Disk orphans are placed from `layout.ladderOffsetsPx` (orphan itself at index 0, snapshots from
  `slice(1)`); git orphans keep `placeOrphanOnAxis`.
- If the file crosses 250 lines, split the orphan placement into `webapp/layer1-filter-orphans.ts`.

---

## Step 10 — The two source lists round-trip through the URL

**File:** `jfred/webapp/layer1-sources.ts`

Import `readSourcePaths, SourceKind, writeSourcePaths` from `./layer1-source-paths.ts`
(that module imports only `./app-dom.ts`, so there is no cycle).

Add above `readSourceParams`:

```ts
// Task 312: both source lists travel as repeated params, keeping a Layer 2 view one shareable link.
const LIST_PARAM_BY_KIND = {
    [SourceKind.jsonl]: "jsonl",
    [SourceKind.fileHistory]: "snapshots",
} as const;
```

In `readSourceParams`, after the `time` block, append each list's paths with `params.append`
(never `set` — both lists are repeatable).

In `fillSourceBoxesFromUrl`, after the `time` block, for each kind read `params.getAll(name)` and
call `writeSourcePaths(kind, values)` when the array is non-empty. An empty array must NOT be
written: `writeSourcePaths` sets `touched`, which would permanently suppress the derived default.

**File:** `jfred/webapp/layer1-settings.ts`

Change the guard on line 87 from `url.has("filehistory")` to `url.has("snapshots")` so the
restore precedence matches the name `readSourceParams` now writes. Update the neighbouring
comment's claim accordingly.

---

## Step 11 — Repair the tests the extra nodes move

Run ONLY the files touched here plus the ones the task names as at risk:

```
cd jfred && node --test --import tsx \
  tests/layer1_snapshot_wire.test.ts \
  tests/viewer_api_layer1_snapshots.test.ts \
  tests/layer1-filter.test.ts \
  tests/layer1-ruler-axis.test.ts \
  tests/viewer_api_layer1_placement.test.ts \
  tests/layer1_view_progress.test.ts \
  tests/layer1-tie-groups.test.ts \
  tests/layer1-sources.test.ts \
  tests/layer1-settings.test.ts
```

Every one of these fixtures is snapshot-FREE, so decisions 1–4 predict they all still pass
unchanged. If one fails, the failure is a real regression in this change — do not re-derive the
expected pixels to match. The exception is `tests/layer1-sources.test.ts`, whose
`readSourceParams` assertions may now see the two new params; that one is a legitimate update.

Leave the full suite to the parent session.

---

## Out of scope (named so it is not smuggled in)

- Drawing 📸 nodes — task 315.
- The layer switcher — task 314.
- Serving snapshot BYTES / `createSidecarReader` / the `?snapshots=` root's S1 precedence — task 313.
- Session titles / `titleInEffectAtLine` on the wire — task 317 needs it; 312 carries only
  `sessionId`, `sessionFile` and `line`, which is what resolving a title later requires.
