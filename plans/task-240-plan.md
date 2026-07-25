# Task 240 — Layer 1 axisPx vertical-placement test (spec S18)

## Scope

ONE file is edited: `jfred/tests/viewer_api_layer1.test.ts`.

Do NOT touch `jfred/webapp/` (a sibling agent owns it for task 237). Do NOT
create a second test file. Do NOT run any test or test suite. Do NOT `git add`
and do NOT write a commit message — the parent session does both once, later.

`jfred/src/viewer_api_layer1.ts` may only be edited if the new assertions expose
a genuine defect in it. Expectation: they will not.

## What is already covered — do not re-test it

- `jfred/tests/layer1_ruler_axis.test.ts` (task 234) unit-tests
  `resolveInstantOffsets` in ISOLATION: 5-hour gap = 12.5 px, 6-week gap = 24 px,
  ascending order from unsorted input, a pre-first-commit instant at position 0,
  duplicate instants collapsing. Do not restate any of that against the resolver.
- The wire shape is FROZEN (user-confirmed 2026-07-25): the endpoint emits an
  ABSOLUTE `axisPx` per node and NO per-pair widget offset. Therefore "a pair
  widget's axisPx equals its FIRST commit's position" is `pair.commits[0].axisPx`
  *by construction* and needs no assertion, and the widget-relative subtraction
  lives in the PAGE (task 237's DOM test). Never add a field to
  `viewer_api_layer1.ts` to make an assertion easier.

## What this task actually adds

The WIRING from real fixture data through `GET /api/layer1-view`. The current
fixture cannot express three cases:

- (a) no disk orphan whose mtime PREDATES the first commit, so nothing proves
  that case moves the ruler start and lands at `axisPx` 0 with every commit
  shifted downstream;
- (b) no MULTI-member orphan bucket, so nothing proves bucket rows come back
  ascending by instant (the page places a bucket at `rows[0].axisPx` with no
  `Math.min` of its own);
- (c) the fixture's gaps are not the S18-locked cap cases.

All three are fixed by adding ONE file to the existing disk fixture and moving
ONE existing instant. No new fixture harness.

## Step 1 — retime the fixture instants

In `jfred/tests/viewer_api_layer1.test.ts`, replace the instant constant block
(currently `FIRST_COMMIT_INSTANT` … `DISK_ONLY_FILE_MTIME`) with the five
constants below, keeping the existing "every instant is STATED, never read from
the clock" comment above them.

```ts
// A disk orphan six weeks BEFORE the first commit: S18's "ruler bounds" case —
// it pulls the ruler's start earlier, so IT is position 0 and every commit
// shifts downstream of it.
const EARLY_DISK_ORPHAN_MTIME = "2026-05-20T10:00:00Z";
const FIRST_COMMIT_INSTANT = "2026-07-01T10:00:00Z";
const SECOND_COMMIT_INSTANT = "2026-07-01T15:00:00Z";
const SHARED_FILE_MTIME = "2026-07-01T18:00:00Z";
const DISK_ONLY_FILE_MTIME = "2026-07-02T14:00:00Z";
```

Rationale for each value (so the arithmetic below is checkable by hand):

- `2026-05-20T10:00:00Z` → `2026-07-01T10:00:00Z` is exactly 42 days = 6 weeks,
  the value task 234 locked as the over-cap case.
- `SECOND_COMMIT_INSTANT` moves from 14:00 to **15:00** so the first→second gap
  is exactly **5 hours**, the value task 234 locked as the sub-cap case. This is
  the only existing instant that changes.
- `SHARED_FILE_MTIME` stays 18:00, now a 3-hour gap.
- `DISK_ONLY_FILE_MTIME` stays, now a 20-hour gap — still over the cap.

## Step 2 — restate the pixel constants

Replace the pixel constant block with the five below. Every value is exact in
binary floating point, so `assert.deepEqual` on them is safe.

```ts
// The ruler at 2.5 px/hr with a 24 px per-gap cap (task 234), resolved over the
// WHOLE view. Two gaps are over the cap and the cap ACCUMULATES, so the last
// tick reads 68 and not 24.
const EARLY_DISK_ORPHAN_PX = 0;
const FIRST_COMMIT_PX = 24;       // +6 weeks = 2520 px linear, capped to 24
const SECOND_COMMIT_PX = 36.5;    // +5 h = 12.5 px, under the cap
const SHARED_FILE_PX = 44;        // +3 h = 7.5 px, under the cap
const DISK_ONLY_FILE_PX = 68;     // +20 h = 50 px linear, capped to 24
```

Arithmetic check: `0`, `0+24=24`, `24+12.5=36.5`, `36.5+7.5=44`, `44+24=68`.

## Step 3 — add the pre-commit disk orphan to the disk fixture

In `makeFixtureDiskFolder()`, add a third file after `disk-only.txt`, following
the two existing `writeFileSync` + `utimesSync` pairs exactly:

```ts
    writeFileSync(join(diskDir, "early.txt"), "predates the repo\n");
    utimesSync(join(diskDir, "early.txt"), new Date(EARLY_DISK_ORPHAN_MTIME), new Date(EARLY_DISK_ORPHAN_MTIME));
```

The name `early.txt` is deliberate: `walkCurrentFileState` sorts by relative
path, so the disk walk yields `disk-only.txt` BEFORE `early.txt`, while the
instant order is the reverse. A `diskOrphans` bucket that came back in walk
order instead of instant order would therefore fail Step 6 — which is the whole
point of (b).

Update the `makeFixtureDiskFolder` doc comment to name the third file and say
that its mtime predates the repo's first commit.

Do NOT add a second git orphan. Both buckets are sorted by the same
`orderRowsByInstant` helper in `viewer_api_layer1.ts`, so one multi-member
bucket proves the ordering for both. Mark this with a `// ponytail:` comment at
the assertion in Step 6.

## Step 4 — update the bucket-content test

`test_layer1_view_endpoint_pairs_disk_files_against_the_repo_tree` keeps
asserting bucket CONTENT (never counts alone — `gitOrphans` and `diskOrphans`
are mirror images, so a swap or rename is invisible to a size check). Only the
`diskOrphans` expectation changes, and it now carries two members in
INSTANT-ascending order:

```ts
    assert.deepEqual(view.diskOrphans.map((orphan) => orphan.path), ["early.txt", "disk-only.txt"]);
```

Extend that line's comment to note that the order is instant-ascending, not the
disk walk's path order.

`pairs` (`["shared.txt"]`) and `gitOrphans` (`["repo-only.txt"]`) are unchanged —
`early.txt` is in neither commit, so it can only be a disk orphan.

## Step 5 — assert the commits shifted downstream

In `test_layer1_view_endpoint_places_every_pair_node_on_the_shared_ruler`, the
existing `assert.deepEqual` over `pair.commits` axisPx values already reads the
renamed constants, so it needs no structural change — but add a comment line
directly above it recording WHY the first commit is no longer at 0:

> the first commit sits at 24, not 0 — `early.txt`'s mtime predates it, so the
> ruler's start moved earlier and every commit shifted downstream (S18 "Ruler
> bounds"). A run that anchored the ruler at the first commit would read 0 here.

Update the commit-instant `deepEqual` only if the constant rename requires it
(it does not — it already references `SECOND_COMMIT_INSTANT`).

## Step 6 — extend the ruler and orphan-row tests

`test_layer1_view_endpoint_returns_the_ruler_ticks_ascending_with_the_gap_cap_applied`:
prepend the early orphan to BOTH `deepEqual` arrays so the ruler is five ticks:

```ts
    assert.deepEqual(view.ruler.map((position) => position.instant), [
        new Date(EARLY_DISK_ORPHAN_MTIME).toISOString(),
        new Date(FIRST_COMMIT_INSTANT).toISOString(),
        new Date(SECOND_COMMIT_INSTANT).toISOString(),
        new Date(SHARED_FILE_MTIME).toISOString(),
        new Date(DISK_ONLY_FILE_MTIME).toISOString(),
    ]);
    assert.deepEqual(view.ruler.map((position) => position.axisPx), [
        EARLY_DISK_ORPHAN_PX, FIRST_COMMIT_PX, SECOND_COMMIT_PX, SHARED_FILE_PX, DISK_ONLY_FILE_PX,
    ]);
```

Rewrite the trailing comment so it names both locked cap cases and the
accumulation: the 6-week opening gap renders exactly 24 px (not 2520), the
5-hour gap renders exactly 12.5 px, and the closing 20-hour gap lands the last
tick at 68 because the cap accumulates rather than clamping the whole axis.

`test_layer1_view_endpoint_places_each_orphan_row_at_its_own_instant`: keep the
`gitOrphans[0]` pair of assertions as-is (they now read `FIRST_COMMIT_PX` = 24),
and replace the single `diskOrphans[0]` pair with assertions over BOTH rows:

```ts
    // the disk-only bucket has two members, and rows come back ascending by instant — the page
    // places the bucket at rows[0] with no Math.min of its own, so rows[0] must be the EARLIEST
    // member even though the disk walk yields it second (path order: disk-only.txt < early.txt).
    // ponytail: gitOrphans is sorted by the same orderRowsByInstant helper, so one multi-member
    // bucket proves the ordering for both.
    assert.deepEqual(view.diskOrphans.map((orphan) => orphan.instant), [
        new Date(EARLY_DISK_ORPHAN_MTIME).toISOString(),
        new Date(DISK_ONLY_FILE_MTIME).toISOString(),
    ]);
    assert.deepEqual(view.diskOrphans.map((orphan) => orphan.axisPx), [
        EARLY_DISK_ORPHAN_PX, DISK_ONLY_FILE_PX,
    ]);
```

## Step 7 — refresh the file header comment

The header block at the top of `jfred/tests/viewer_api_layer1.test.ts` describes
the fixture. Extend it to say the disk folder also carries a file whose mtime
predates the repo's first commit, and that the fixture's gaps are deliberately
one sub-cap (5 h) and two over-cap (6 weeks, 20 h) so the capped-gap ruler is
exercised end to end. Attribute the file to tasks 235 AND 240.

## Explicitly out of scope

- No new `test(...)` function. Every case in (a), (b) and (c) is an assertion on
  data the four existing endpoint tests already fetch; a fifth test would
  re-request the same view to restate the same numbers.
- No second git orphan (see Step 3).
- No change to `jfred/src/viewer_api_layer1.ts`, `jfred/src/layer1_ruler_axis.ts`
  or anything under `jfred/webapp/`.
- No test execution, no staging, no commit message.

## Definition of done

`jfred/tests/viewer_api_layer1.test.ts` is the only modified file; it contains
five stated instants and five stated pixel offsets; `early.txt` exists in the
disk fixture with a pinned pre-first-commit mtime; the ruler assertion covers
five ticks including a 0-position pre-commit orphan, a 24 px capped opening gap,
a 12.5 px sub-cap gap and a 68 px accumulated end; and `diskOrphans` is asserted
as a two-row, instant-ascending bucket with its content named, never counted.
