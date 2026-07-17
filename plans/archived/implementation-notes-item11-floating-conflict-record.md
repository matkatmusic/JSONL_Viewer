# Item 11 — `floatingOverKnownRegion` conflict record (implementation notes)

✅ DONE 2026-06-17 (tracker-only; **dormant on all known data**). Surfaces the
`floatingOverKnownRegion` flag — already produced by `api/edit-splice.js` but discarded
downstream — as a first-class conflict record in the engine's `conflicts[]` array, instead
of silently degrading line numbering.

## What the flag means
`api/edit-splice.js` sets `floatingOverKnownRegion: gapLine === null` at two sites (both
since item 9): the single-edit path (`applyEditToBelief`) and the replaceAll path
(`applyReplaceAllToBelief`, `targets.length === 0`). It is true when an Edit's `old_string`
is located in **no** known run **and** belief is fully known — no unknown gap, EOF proved.
There is nowhere for the change to land, so the edit provably contradicts belief.

## Before
`applyEditEvent` (`api/apply-one-event.js`) read only `result.floating` (set the honest
event-level flag) and returned `[]`, **discarding** `floatingOverKnownRegion`. Numbering
degraded silently; nothing reached `appendConflictRecords` / `conflicts[]`.

## Design — Option B (dedicated builder + discriminated branch)
A floating-over-known contradiction is NOT a per-line displacement: there is no single
displaced line, no presumed text. Reusing `buildConflictRecord` would dishonor its
"observation won this line" semantics. So a dedicated variant was added, discriminated by a
`kind` field:

1. **`api/apply-one-event.js`** — new module-private `buildFloatingConflictInfo(event, materialized)`
   returns an info `{kind:'floatingOverKnownRegion', line:null, presumedText:null,
   presumedEvidence:null, observedText, observedRef}`. `applyEditEvent` returns
   `[buildFloatingConflictInfo(...)]` when `result.floatingOverKnownRegion`, else `[]`
   (unchanged). `result.floating` still sets `event.edit.floating` exactly as before.
   - `observedText` = `materialized.oldString` (the text proven absent — human meaning).
   - `observedRef` = `evidence.refForAuthoredEditLine(event, materialized.newString)` — the
     edit record physically contains `newString` (`toolUseResult.newString`), and
     `''.indexOf('') === 0`, so even an empty `newString` yields a non-null ref. The two are
     deliberately different (oldString for meaning, newString for the locatable proof).

2. **`api/track-line-states.js`** — new module-private
   `buildFloatingConflictRecord(info, unixMs, fromBeaconMs)` mirrors `buildConflictRecord`'s
   schema (carries the mandatory CLI-printer fields `timestampOfContradictingRecord`,
   `excerpt` via `makeExcerpt` which tolerates `null`, and `window`) plus the additive
   `kind`; `line`/`presumed` pass through as `null`. `appendConflictRecords` branches on
   `infos[c].kind === 'floatingOverKnownRegion'` → the variant builder; existing
   per-line infos (from `conflictAgainstExisting`) have no `kind` → `undefined` → the
   unchanged branch.

No change to `api/edit-splice.js`, `api/line-belief.js`, `api/line-state-evidence.js`, or
the CLI `tools/track-line-states.js`. The sole production consumer of `conflicts[]` — the
CLI `printConflicts` — reads `.line` (prints "null" safely), `.timestampOfContradictingRecord`,
`.window.{fromBeaconMs,toBeaconMs}`, `.excerpt.{presumedText,observedText}`; the variant
supplies every one. `api/final-line-verdict.js` does not read `conflicts[]`.

## Indentation note (hook vs. 4-space preference)
New code uses the global 4-space standard (per `~/.claude/guides/coding-standards.md`),
while RevEng's existing files are 2-space. The repo's deep-nesting hook measures indent in
the file's native **2-space units**, so a multi-line 4-space object literal puts properties
at 8 spaces = 4 units (> the 3-unit limit) and is BLOCKED. Resolution that honors both: the
two new functions are 4-space islands written with **flat imperative assignment** (build the
object property-by-property, max 4 leading spaces = 2 units) rather than a nested object
literal. The two existing 2-space functions modified (`applyEditEvent`,
`appendConflictRecords`) were NOT reflowed — the new branches were added at their existing
2-space indent (surgical, ≤3 units).

## Tests (strict red-green TDD)
Two tests in `tests/test-track-line-states-verdict.js` (imports widened to add `TS3`/`MS3`):
- `test_trackLineStates_floatingOverFullyKnownBeliefProducesConflictRecord` — RED→GREEN
  driver. Write beacon (`a\nb\n`) → fully-known belief; then an edit with `old_string:'zzz'`
  (in no run, 3-arg `makeEditLine` so `originalFile` defaults to `''` → no originalFile event
  re-syncs belief). Asserts exactly ONE conflict carrying `kind:'floatingOverKnownRegion'`,
  `line:null`, `presumed:null`, `excerpt.presumedText:null`, `excerpt.observedText:'zzz'`,
  `observed.textProperty.property:'toolUseResult.newString'`,
  `timestampOfContradictingRecord:MS2`, `window:{fromBeaconMs:MS1,toBeaconMs:MS2}`, and the
  event-level `edit.floating:true`. RED confirmed first (`conflicts.length` 0 ≠ 1).
- `test_trackLineStates_floatingOverGapProducesNoFloatingConflictRecord` — regression guard
  (green before and after). Two disjoint Read chunks leave an unknown gap (lines 3-4); the
  same unlocatable edit floats INTO the gap (`floatingOverKnownRegion` false) → no floating
  conflict, only the event-level flag.

Step 5 (optional strengthening of the originalfile rescue test) was OMITTED: the rescue
test's `floated` variant exercises the identical emission path (gap-less belief →
`floatingOverKnownRegion`), so it adds no distinct coverage beyond the dedicated tests; the
plan sanctioned omitting it to keep that file's diff at zero.

## Dormancy + reopen
`floatingOverKnownRegion` never fires on real data — the two synthetic tests are the only
triggers. **Why dormant:** item 1's `originalFile` overlay re-syncs belief to the actual
pre-edit file at each edit, absorbing unobserved (incl. user/IDE/formatter) edits, so the
float-over-known case is rescued in practice. A float-over-known is the signature of an
out-of-band edit (the upstream cause carved out as roadmap **item 18**, `userModified`).
**Reopen/validate** when the e2e `conflicts` count moves off 233 — that means the branch is
no longer dormant; inspect the new record before trusting it.

## Gates (all GREEN, from `RevEng/`)
1. **Full suite** — 61 suites / **621 passed** / 0 failed (was 619; +2 new tests).
2. **detect-rewinds** — 15 passed / 0 failed.
3. **Probe A/B vs `develop-baseline`** (frozen fixture `probe-fixture-20260615`) —
   **`identical: true`** (probe never reads `conflicts[]`). No re-baseline;
   `develop-baseline` unchanged at `880b69d`.
4. **Sidecar e2e `plate_summary.py`** — 247/247 matchedObserved, 0 mismatched,
   **conflicts=233 (UNCHANGED — the dormancy proof).**

## Files changed
- `api/apply-one-event.js` (119 → 143 L) — `buildFloatingConflictInfo` + the
  `floatingOverKnownRegion` branch in `applyEditEvent`.
- `api/track-line-states.js` (153 → 178 L) — `buildFloatingConflictRecord` + the
  discriminated branch in `appendConflictRecords`.
- `tests/test-track-line-states-verdict.js` (74 → 136 L) — `TS3`/`MS3` import + two tests.
- `plans/roadmap-100-percent-reconstruction.md` — item 11 flipped `[ ]`→`[x]`; new item 18
  (`userModified`) appended to §A.

All edited files ≤250 lines. Plan: `~/.claude/plans/calm-jingling-cookie.md`.
