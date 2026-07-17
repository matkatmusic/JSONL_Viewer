# Implementation notes — Roadmap Item 12: Collapse conflict cascades

**Status:** code SHIPPED + all four gates GREEN. Roadmap flip to `[x]` and the
`233 → 8` re-baseline are PENDING user sign-off on N=8 (the plan gates the flip on it).

**Plan:** `~/.claude/plans/giggly-roaming-adleman.md` (handoff
`plans/handoff-develop-20260617-1515.md`). Executed via strict red-green TDD.

---

## What shipped

A report-only post-process of the tracker's diagnostic `conflicts` array. When one
untracked insertion/deletion of K lines shifts every downstream line, a later
overlay on the pre-shift numbering disagrees with belief on every line at/below the
shift — N per-line conflict records for ONE logical event. Item 12 replaces each
such constant-offset SHIFT cascade with ONE synthetic `collapsedCascade` record.

**Cosmetic on the diagnostics list only** — belief and the per-line verdict
(`finalVerdict.perLineStats`) are NOT touched (item 15 consumes those raw). Confirmed
by the gates: `perLineStats` stayed `247/247 matchedObserved, 0 mismatched`; only the
`conflicts` array changed.

## New module — `api/conflict-cascade-collapse.js` (225 L, 4-space, pure, no IO)

Reuses the LCS engine `api/line-diff.js` (`lineDiff`); no other deps. Exports:

- `collapseConflictCascades(conflicts)` — public entry. Returns a NEW array
  (input never mutated): qualifying shift cascades replaced by one record each;
  every other record (un-collapsed per-line AND item-11 floating) passed through
  unchanged; ordered by `(timestampOfContradictingRecord, firstLine|line)`.
- `isPerLineConflict(record)` — the Item-11 skip-guard (`typeof record.line ===
  'number'`). Floating records (`line: null`) and any future non-per-line variant
  pass through untouched.
- `groupConflictsByMoment(perLineConflicts)` — group by shared
  `(timestampOfContradictingRecord, window.fromBeaconMs, window.toBeaconMs)` (one
  overlay event's infos), first-encounter order, members sorted by line.
- `splitIntoConsecutiveLineRuns(sortedMembers)` — maximal runs of consecutive
  line numbers (mirror of `line-belief` `knownRuns` arithmetic); a gap starts a run.
- `computeShiftOffset(run)` → `{collapsible, shiftOffset}`. Criterion =
  **LCS-overlap-dominates**: `run.length >= 2` AND `2 * ctxCount >= run.length`,
  where `ctxCount` is the count of `ctx` ops in `lineDiff(presumedTexts,
  observedTexts)`. `shiftOffset` = signed length of the leading non-ctx op block
  after skipping leading ctx (`+N` add = insertion, `−N` del = deletion).
- `buildCollapsedConflictRecord(run, shiftOffset)` — the synthetic record (below).
- `describeCollapsedConflict(record)` — human one-liner for the CLI printer.

### The `collapsedCascade` record shape
```js
{ kind: 'collapsedCascade', timestampOfContradictingRecord, firstLine, lastLine,
  lineCount, shiftOffset, window, memberLines:[...],
  excerpt:{ firstPresumedText, firstObservedText } }
```
`memberLines` keeps every raw line number → **no diagnostic data lost**.

## Wiring (3 in-place edits, 2-space to match local style)

1. `api/track-line-states.js` — `var cascadeCollapse = require('./conflict-cascade-collapse');`
   beside the other requires; the return's `conflicts: conflicts,` →
   `conflicts: cascadeCollapse.collapseConflictCascades(conflicts),`. (179 L.)
2. `tools/track-line-states.js` `printConflicts` — require + ONE branch:
   `if (c.kind === 'collapsedCascade') { console.log('  ' +
   cascadeCollapse.describeCollapsedConflict(c)); continue; }`. The fall-through
   still renders per-line AND item-11 floating records (`line: null` → `"line
   null"`). (132 L.)

## Item-11 coexistence

Item 11 (`floatingOverKnownRegion`) landed in a concurrent session BEFORE this work
(the working tree carried `buildFloatingConflictRecord` + the discriminated
`appendConflictRecords` branch; the two item-11 tests were already in
`test-track-line-states-verdict.js`; full suite was 621, not the handoff's stale
619). Item 12 skips floating records via `isPerLineConflict` and passes them through
untouched — verified by `test_collapseConflictCascades_passesThroughFloatingRecordWithNullLine`.
Item-11 floating is dormant on `plate_summary.py` (conflicts stays free of floating
records), so the `233 → 8` drop is ENTIRELY per-line cascades.

## Scope limit (documented, intentional)

Total-deletion cascades (Bash `rm`, every `observedText === null`) yield
`ctxCount === 0` → not collapsible → those per-line records stay. Out of Item 12's
stated scope ("insertion of K lines at L"). This is why
`tests/test-track-line-states-bashops.js` (a 2-line `rm` → 2 conflicts) is
UNAFFECTED. The excerpt-based criterion (texts here are ≤80-char excerpts) is
conservative: a false negative leaves a cascade un-collapsed (safe); a false
positive is cosmetic.

## TDD

- **Phase 0 audit:** swept every `.conflicts` assertion in `tests/`. The only ≥2-conflict
  case is the `rm` total-deletion above (non-collapsible). Every other assertion is
  ≤1 conflict or `[]`. **No existing test needed updating.**
- **Phase 1 (RED→GREEN):** 13 single-behavior unit tests in NEW
  `tests/test-conflict-cascade-collapse.js` (195 L) — failed RED (module absent),
  GREEN after Phase 2.
- **Phase 3 (RED→GREEN):** `test_trackLineStates_collapsesStaleBeliefSnapshotVerifyCascade`
  in `tests/test-track-line-states-verdict.js` (177 L). A Write pins belief to a..e
  (lines 1-5); a snapshot blob of the POST-insertion file (`X` prepended) makes
  `applySnapshotVerify` disagree on all 5 shifted lines → a 5-record cascade. Watched
  RED (`5 !== 1`) against un-wired code, GREEN after wiring. Asserts the snapshot still
  anchors truth (timeline entry `isBeacon`, `lines: 'ALL'`) — collapse did not touch belief.

## Gates (from `RevEng/`)

| Gate | Baseline | After |
|---|---|---|
| Full suite | 61 / 621 / 0 | **62 suites / 635 passed / 0 failed** (+1 suite, +13 unit +1 integration) |
| detect-rewinds | 15 / 0 | 15 / 0 |
| Probe A/B vs `develop-baseline` (`880b69d`) | identical | **identical: true** (probe never calls `trackLineStates`) |
| Sidecar `perLineStats` | 247/247/0/0 | **247/247/0/0 (UNCHANGED)** |
| Sidecar `conflicts` | 233 | **8 (CHANGED BY DESIGN)** |

All edited/new files ≤ 250 lines.

## The `233 → 8` re-baseline (N = 8) — spot-check

Every one of the 233 per-line conflicts on `plate_summary.py` collapsed into one of 8
`collapsedCascade` records (0 per-line/floating remaining). Member-line counts sum to
exactly **233** — lossless. All 8 are constant `shift = -1` cascades, split at
agreement-gaps (lines where belief and the observation coincided):

| # | lines | count | shift |
|---|---|---|---|
| 1 | 7-8 | 2 | -1 |
| 2 | 9-22 | 14 | -1 |
| 3 | 25-87 | 63 | -1 |
| 4 | 89-141 | 53 | -1 |
| 5 | 144-196 | 53 | -1 |
| 6 | 198-216 | 19 | -1 |
| 7 | 218-233 | 16 | -1 |
| 8 | 235-247 | 13 | -1 |

Cascade 1 is a distinct earlier overlay moment (smaller `toBeaconMs`); cascades 2–8
share one snapshot-verify moment, broken into 7 runs by 7 agreement-gaps. This is the
canonical "untracked shift by 1, downstream lines all disagree" pattern — 233
illegible per-line records → 8 legible records.

## Re-baseline targets (pending sign-off)

On user sign-off on N=8, update the `233` constant in:
- `plans/roadmap-100-percent-reconstruction.md` — Baseline line 14 + the Item-12 gate text + flip `[ ]`→`[x]`.
- `plans/handoff-develop-20260615-1833.md` § How to Verify (the sidecar e2e expected line).

## Reopen / follow-ups

- If a future fixture produces a cascade the excerpt-based LCS criterion mis-judges,
  tune `MIN_SHIFT_OVERLAP_HALVES` or feed full text (not excerpts) into
  `computeShiftOffset`. Currently conservative by design.
- `rm` total-deletion cascades remain per-line (out of scope) — a separate item if
  legibility there is ever wanted.
