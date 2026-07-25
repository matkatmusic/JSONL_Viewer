# Task 224 — a mid-window base-commit seed yields a non-monotonic ladder

## Status of the reported defect

Task 224 reported TWO artifacts from a mid-window `--base-commit` seed on
`common/scripts/plate/plate_cli.py`:

1. a DUPLICATED snapshot revision (`04b5333dde2392bd@v2` at indices 8 and 11), and
2. a NON-MONOTONIC ladder (the `gitBase:` overwrite at index 10 stamped
   `2026-05-14T03:06:21Z`, before an index-11 revision stamped `2026-05-13T21:45:19Z`).

Reproduction on 2026-07-25 (captures in the session scratchpad: `iter1.json`,
`iter2.json`, `iter2b.json`, `control.json`) settled both:

| run | seed | bound | wall | revs | monotonic | duplicates |
| --- | --- | --- | --- | --- | --- | --- |
| iter1 | `793e6524…` (baseline) | `--nth 5` | 11 s | 7 | yes | none |
| iter2 | `1156e75f…` (mid-window) | `--nth 10` | 66 s | 20 | **no** | `@v2` at 8/11, `@v1` at 0/17 |
| iter2b | `1156e75f…` + `--no-pre-baseline` | `--nth 10` | 39 s | 10 | **no** | **none** |
| control | `793e6524…` (baseline) | `--nth 10` | 45 s | 18 | yes | none |

- **Artifact 1 is ALREADY FIXED by task 223.** `--no-pre-baseline` prunes the
  pre-seed records, both duplications disappear, and the ladder drops 20 → 10
  revisions. No further work is needed for the duplication half of task 224.
- **Artifact 2 SURVIVES.** The break simply moves from indices 10→11 to indices
  0→1. That is what this plan fixes.

## The surviving defect, localised

Proven by temporary probe instrumentation (since reverted; probe output recorded
in the task-224 investigation):

```
[PROBE] seedStaleEditBases INSERT changeId=04b5333dde2392bd@v2 ts=2026-05-13T21:45:19.907Z
        rawTs=2026-05-13T21:45:19.907Z beforeEditTs=2026-05-14T03:06:21.658Z stale=true
        prev=write/gitBase:1156e75f…@2026-05-14T03:06:21.000Z
```

`seedEditBaseFromBackup` and `completeElidedBeacons` never fired for this file.

The mechanism, in order:

1. `seedBaseCommitBeacon` places a `gitBase:` write holding the COMMIT's blob
   (237 lines) immediately before the next edit.
2. `editBaseIsStale` (`src/reconstruction_reseed.ts:60-62`) replays the events
   before that edit. The beacon's blob is not the disk the edit was actually
   computed against, so the edit's first hunk no longer splices → `stale = true`.
3. `staleEditSeedFor` (`src/reconstruction_reseed.ts:193`) recovers the at/before
   backup `04b5333dde2392bd@v2` (229 lines) through `backupSeedWriteFor`
   (`src/reconstruction_sidecar.ts:65-71`), which stamps the seed with
   `base.backupTime` — the BACKUP's own instant, `2026-05-13T21:45:19.907Z`.
4. `seedBeforeEdit` (`src/reconstruction_reseed.ts:204-209`) clamps that stamp
   only against the FOLLOWING edit (an upper bound). The backup is already
   earlier than the edit, so it returns the seed untouched.
5. `seedStaleEditBases` pushes it (`src/reconstruction_reseed.ts:239`) directly
   after the beacon, which is stamped LATER. The ladder goes backwards.

**Root cause: the seed's timestamp is clamped at its upper bound (the edit) but
never at its lower bound (the event it is pushed after).**

Why the control run is unaffected: its baseline commit precedes every event for
the file, so the beacon lands at revision 0, the lineage's own writes/edits
rebuild the true pre-edit base, `editBaseIsStale` is false, and no seed is
inserted at all.

## The fix

Give the seed a two-sided placement window `[previousEventTime, editTime)`
instead of the current one-sided `(-inf, editTime)`.

### Why this shape and not a global sort

`replayEvents` (`src/reconstruction_replay.ts:214`) is a positional fold that
never sorts, and several stages deliberately place events by adjacency rather
than by clock. Sorting the event list before replay would change the output of
every one of the 85+ character-locked ground-truth scenarios, and this work is
explicitly not permitted to run the test suite to measure that blast radius.

The two-sided clamp is safe by construction instead of by measurement: whenever
the seed is already at-or-after the previous event — which is the case in every
ladder that is monotonic today — `Math.max` returns the seed's own timestamp and
the function is a no-op. Only a seed that would move the ladder backwards is
touched.

### Where the code goes

`src/reconstruction_reseed.ts` is at **244 of the 250-line cap**, so the clamp
cannot grow there. `src/reconstruction_sidecar.ts` is at **164 lines** and is
already the home of `backupSeedWriteFor`, the function that applies the stamp
being repaired. The clamp goes there, beside the stamper. `seedBeforeEdit` is
deleted from `reconstruction_reseed.ts` (it has exactly one caller, line 236),
so that file gets SHORTER.

The clamp takes `Date` values rather than `FileEvent`s so that
`reconstruction_sidecar.ts` needs no new type import.

## Steps

### Step 1 — RED: unit-test the clamp

Create `jfred/tests/reconstruction_sidecar.test.ts` (it does not exist today; the
project's Stop hook requires `tests/<module>.test.ts` for every edited module).

Use `node:test` + `node:assert/strict`. Match the conventions of an existing
engine test — read `jfred/tests/reconstruction_base_commit.test.ts` first and
copy its import style, its `test_<behavior>` naming, and its
PLAIN-ENGLISH-step comment style.

Write these four tests against `clampSeedBetweenPreviousAndEdit`, each proving
ONE behavior:

1. `test_clamp_leaves_a_seed_that_already_follows_the_previous_event`
   - Scenario: the ladder is already monotonic, so the clamp must not touch the seed.
   - Steps: build a WriteEvent seed at t=100; previous event time t=50; edit time t=200.
   - Verify: the returned object is the seed with its timestamp still 100.
   - This is the no-op case that guarantees zero blast radius on existing scenarios.

2. `test_clamp_pulls_a_seed_stamped_at_or_after_its_edit_to_just_before_it`
   - Scenario: today's upper-bound behavior must be preserved exactly.
   - Steps: seed at t=300; previous time t=50; edit time t=200.
   - Verify: the returned timestamp is 199 (`editTime - 1`), matching the
     behavior `seedBeforeEdit` has today for s64/s19/s23/m6.

3. `test_clamp_pushes_a_seed_stamped_before_the_previous_event_up_to_it`
   - Scenario: the task-224 defect — a backup-sourced seed older than the
     `gitBase:` beacon it is pushed after must not move the ladder backwards.
   - Steps: seed at t=50; previous time t=100; edit time t=200.
   - Verify: the returned timestamp is 100, equal to the previous event's, so the
     ladder is non-decreasing.

4. `test_clamp_keeps_the_seed_before_its_edit_when_no_slot_exists`
   - Scenario: the previous event is already at/after the edit, so the array was
     non-monotonic BEFORE this seed and the clamp cannot repair it. The
     "seed sorts before its edit" invariant is the load-bearing one and wins.
   - Steps: seed at t=50; previous time t=500; edit time t=200.
   - Verify: the returned timestamp is 199 (`editTime - 1`).

Also add, in the same file, one test proving the absent-previous case:

5. `test_clamp_leaves_the_first_seed_alone_when_nothing_precedes_it`
   - Scenario: the seed is the first event in the result, so there is no lower bound.
   - Steps: seed at t=50; previous time `undefined`; edit time t=200.
   - Verify: the timestamp is still 50.

Run ONLY this file and confirm every test FAILS for the right reason (the
function does not exist yet).

### Step 2 — GREEN: add the clamp

In `jfred/src/reconstruction_sidecar.ts`, beside `backupSeedWriteFor`, add:

```ts
// A seed spliced before an EDIT must sort into the window between the event it is pushed after and
// that edit. `backupSeedWriteFor` stamps the seed with the BACKUP's own instant, which answers to
// neither bound: it can land at/after the edit (a post-/clear edit whose only base backup was taken
// later — s64; an includeAfter backup — s19/s23/m6), and, once a mid-window `--base-commit` beacon
// precedes it, BEFORE that beacon (task 224). Clamping both ends keeps the ladder non-decreasing.
// A seed already inside its window is returned untouched, so every ladder that is monotonic today is
// byte-for-byte unaffected. When `previousTime` is already at/after the edit no valid slot exists —
// the array was non-monotonic before this seed — and the "seed precedes its edit" invariant wins.
export function clampSeedBetweenPreviousAndEdit(
    seed: WriteEvent,
    editTime: Date,
    previousTime: Date | undefined,
): WriteEvent {
    const latestAllowed = editTime.getTime() - 1;
    const earliestAllowed = previousTime === undefined ? seed.timestamp.getTime() : previousTime.getTime();
    const placed = Math.min(Math.max(seed.timestamp.getTime(), earliestAllowed), latestAllowed);
    if (placed === seed.timestamp.getTime()) {
        return seed;
    }
    return { ...seed, timestamp: new Date(placed) };
}
```

Run only `tests/reconstruction_sidecar.test.ts` and confirm all five tests pass.

### Step 3 — RED: pin the stage-level behavior

Create `jfred/tests/reconstruction_reseed.test.ts` (it does not exist today).

Write ONE test proving the stage now emits a non-decreasing sequence:

`test_stale_edit_seed_never_lands_before_the_event_it_follows`
- Scenario (task 224): when a `gitBase:` write stamped LATER than the recovered
  backup precedes a stale edit, `seedStaleEditBases` must not insert the seed
  with the backup's older stamp.
- Steps:
  - Build a lineage of exactly two events: a `write` (standing in for the
    `gitBase:` beacon) stamped `2026-05-14T03:06:21.000Z` carrying content that
    does NOT match the edit's hunk context, followed by an `edit` stamped
    `2026-05-14T03:06:21.658Z` whose hunk context matches the BACKUP's content.
  - Supply a `BackupReader` stub returning a backup whose `backupTime` is
    `2026-05-13T21:45:19.907Z` — earlier than the write.
  - Run `seedStaleEditBases`.
- Verify:
  - a seed WAS inserted (the stale path fired — otherwise the test proves nothing),
  - and every returned event's timestamp is >= its predecessor's.

Read how `staleEditSeedFor` and `editBaseIsStale` obtain their backup before
writing the stub — construct the reader the same way the existing engine tests
that exercise backup-sourced stages do (find them with
`grep -rln "BackupReader" jfred/tests/`). If a faithful stub proves impractical
within this file's scope, say so explicitly in the implementation notes rather
than weakening the assertion — do NOT replace it with a test that cannot fail.

Confirm it FAILS before step 4.

### Step 4 — GREEN: route the stage through the clamp

In `jfred/src/reconstruction_reseed.ts`:

- Delete `seedBeforeEdit` (lines 204-209) and its comment block (lines 198-203).
- Import `clampSeedBetweenPreviousAndEdit` from `./reconstruction_sidecar.ts`
  (that module is already imported here — extend the existing import, do not add
  a second one, and do not create any re-export).
- In `seedStaleEditBases`, replace line 236 so the clamp receives the event the
  seed is being pushed after:

```ts
        const rawSeed = staleEditSeedFor(records, event, result, reader);
        if (rawSeed) {
            const seed = clampSeedBetweenPreviousAndEdit(rawSeed, event.timestamp, result[result.length - 1]?.timestamp);
            noteStaleSeed(event, seed);
            result.push(seed);
        }
```

`result[result.length - 1]` is the previously pushed event and is `undefined` for
the first one — exactly the absent-previous case covered by step 1's test 5.

Run only `tests/reconstruction_reseed.test.ts` and
`tests/reconstruction_sidecar.test.ts`.

### Step 5 — verify the line caps

Report `wc -l` for `src/reconstruction_reseed.ts` and
`src/reconstruction_sidecar.ts`. Both MUST be <= 250.
`reconstruction_reseed.ts` should be around 238 (it loses more than it gains);
`reconstruction_sidecar.ts` should be around 180.

### Step 6 — verify on real data

Re-run the exact task-224 reproduction and confirm the ladder is now monotonic:

```
npx tsx src/reconstruction_cli.ts ~/Programming/jot-recovery/claude-data/projects/-Users-matkatmusicllc-Programming-jot/*.jsonl \
  --file-history-loc ~/Programming/jot-recovery/claude-data/file-history \
  --repo <t224 scratch clone> --base-commit 1156e75f98ccfb7123516f6900ec6ed2ae04c78c \
  --branch surviving --file /Users/matkatmusicllc/Programming/jot/common/scripts/plate/plate_cli.py \
  --until-revision /Users/matkatmusicllc/Programming/jot/common/scripts/plate/plate_cli.py \
  --nth 10 --no-pre-baseline --json
```

The scratch clone and the seed commit already exist at
`<scratchpad>/t224/clone` (branch `loop-proof`, seed
`1156e75f98ccfb7123516f6900ec6ed2ae04c78c`). NEVER commit into
`~/Programming/jot` — it is read-only.

Takes about 40 seconds. Compare against the recorded `iter2b.json`:

- revision count must still be **10** (the clamp re-stamps one revision; it must
  not add or drop any),
- the ladder must now be **monotonic**,
- the final content must remain byte-identical to `control.json`'s final content,
- the only changed field should be that one revision's timestamp, moving from
  `2026-05-13T21:45:19.907Z` to `2026-05-14T03:06:21.000Z`.

If the revision COUNT changes, stop and report — that means the re-stamp altered
replay semantics, which this fix must not do.

Also re-run WITHOUT `--no-pre-baseline` (the `iter2` configuration) and record
whether that ladder is monotonic too. It has the same defect at indices 10→11
and should be repaired by the same clamp; if it is not, report it as a finding
rather than widening the fix.

## Out of scope — file as a follow-up task, do not implement here

Two sibling stampers apply the identical `timestamp: <backupTime>` pattern and
therefore share this defect CLASS, but neither has a reproducer today:

- `backupAfterWriteFor` (`src/reconstruction_sidecar.ts:90-96`), used at
  `src/reconstruction_reseed.ts:157` (`reversedEditBaseSeed`)
- `backupWritesFor` (`src/reconstruction_sidecar.ts:116-122`), used at
  `src/reconstruction_beacons.ts:158` and via `latestBackupWriteFor` at
  `src/reconstruction_beacons.ts:56`

`completeElidedBeacons` and `completeTruncatedBeacon` are load-bearing for many
character-locked scenarios (S27, S28, S30 and others) and already carry their own
retiming logic — `completeElidedBeacons` re-times the BEACON backward when its
seed precedes it. Extending the clamp to them without a reproducer, and without
being able to run the suite, risks breaking locked ground truths to fix a defect
nobody has observed. The follow-up task should require a reproducing scenario
first, then reuse `clampSeedBetweenPreviousAndEdit`.

## Success criteria

- All five `tests/reconstruction_sidecar.test.ts` tests pass.
- The `tests/reconstruction_reseed.test.ts` monotonicity test passes.
- Both touched source files are <= 250 lines.
- The real-data re-run emits 10 revisions, monotonic, with byte-identical final
  content and exactly one re-stamped timestamp.
- No file outside `src/reconstruction_reseed.ts`,
  `src/reconstruction_sidecar.ts`, `tests/reconstruction_reseed.test.ts` and
  `tests/reconstruction_sidecar.test.ts` is modified.
