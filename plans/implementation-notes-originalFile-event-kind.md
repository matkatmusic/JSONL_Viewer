# Implementation notes — roadmap item 1: `originalFile` as a first-class event kind

Spec: `~/.claude/plans/make-a-plan-for-mutable-donut.md` (durable copy of the item-1 plan;
also embedded in `plans/handoff-develop-20260615-1925.md`).

This file records design decisions, deviations, tradeoffs, and open questions as the
implementation proceeds. ISO timestamps are local (PDT).

## Baseline (before any change)
- 2026-06-15T19:29-07:00 — Full suite GREEN at start: **35 suites / 437 passed / 0 failed**.
- Locked design context (from spec + handoff, do not re-litigate):
  - **Design A** chosen by user: a discrete `originalFile` event kind, not folded into edit
    processing. Rationale: the discrete event is the provenance breadcrumb across JSONL files
    and keeps item 1 consistent with the one-non-null-kind-per-event model.
  - `originalFile` is an **OVERLAY (observation), not a beacon** — behaves like `readFull`.
  - The one real subtlety: the `originalFile` event and its edit event share a record →
    identical `(unixMs, jsonl, jsonlLine)`; overlay MUST apply before the splice. Solved with a
    `kindRank` tiebreaker in `compareEvents`.
  - `createKindEvent` must live in a shared module to avoid a `file-events-extractors ⇄
    snapshot-events` CommonJS require cycle → three new modules, not two.

## Log

### 2026-06-15T19:35-07:00 — Phase 0.1 + 0.2: extracted file-event-kinds + snapshot-events
- Created `api/file-event-kinds.js` (39L: `KIND_NAMES`, `createKindEvent`, `eventHasAnyKind`)
  + `tests/test-file-event-kinds.js` (3 tests, green).
- Created `api/snapshot-events.js` (77L: the snapshot/fileAbsent cluster, importing
  `createKindEvent` from `file-event-kinds` and `editBelongsToFile` from
  `file-historical-lineage`) + `tests/test-snapshot-events.js` (6 tests, green).
- Repointed `api/file-events-extractors.js`: now imports both; dropped the now-unused `path`
  and `os` requires. **294L → 216L** (under the 250 cap).
- Full suite: **37 suites / 446 passed / 0 failed** (baseline 35/437 → +2 suites, +9 tests,
  zero regressions). Extraction is behavior-preserving.

**Deviation (forced by the 250-line write cap):** the spec sequenced 0.1 and 0.2 as two
separate suite-green checkpoints, each ending with its own edit to `file-events-extractors.js`.
But removing only the `file-event-kinds` block would leave that file at ~275L — over cap — so
the hook would block that intermediate write. Resolution: create BOTH new modules first (each
green via its own unit suite), then make a SINGLE combined edit to `file-events-extractors.js`
that removes both clusters at once, landing it at 216L in one write. `file-event-kinds.js` is
created before `snapshot-events.js` (which imports `createKindEvent` from it) so the require
cycle the spec warns about never forms. Net effect identical to the spec; only the checkpoint
granularity changed.

**Interpretation (snapshot tests):** the spec says "move the snapshot-specific *unit*
assertions" into the new suite. In practice every snapshot test in
`test-file-events-extractors.js` runs end-to-end through `extractFileEvents` (integration), so
there were no isolated unit assertions to relocate. I left those integration tests in place (they
still pass and now exercise the `file-events-extractors → snapshot-events` wiring) and wrote
fresh direct unit tests in `test-snapshot-events.js`. Coverage strictly increased.

### 2026-06-15T19:45-07:00 — Phase 0.3: extracted evidence-record-access + Phase 0 safety gate
- Created `api/evidence-record-access.js` (87L: `loadParsedRecord`+cache, `findToolResultText`
  and its helpers, `findStructuredPatchLine`+`findLineInHunk`) + `tests/test-evidence-record-access.js`
  (5 tests, green).
- Repointed `api/line-state-evidence.js` to import `loadParsedRecord`/`findToolResultText`/
  `findStructuredPatchLine`; **removed `loadParsedRecord` + `findStructuredPatchLine` from its
  exports** (no re-export). **299L → 229L**.
- Only external importer was `tests/test-line-state-evidence.js` (its `findStructuredPatchLine`
  test); moved that test into `test-evidence-record-access.js` (no production code imported these).
- Full suite: **38 suites / 450 passed / 0 failed**.
- **Probe A/B safety gate GREEN.** Ran `tools/probe-projects-v2.js` against the frozen fixture
  `~/Programming/jot-recovery/probe-fixture-20260615/projects` on both the current tree and a
  `develop-baseline` worktree (`/tmp/reveng-baseline`). Outputs **byte-identical** (1,242,467
  chars each ignoring `generatedAt`; list1 283 PASS/32 MISMATCH, list2 265 PASS/106 MISMATCH/64
  NOT_FOUND on both). Confirmed structurally: `probe-projects-v2.js` imports none of the six
  sidecar modules touched in item 1, so reconstruction PASS/MISMATCH cannot move.

**Env notes for the next agent:** this shell wraps `diff` and `grep` with custom tools that
print status lines (e.g. `[ok] Files are identical`, `grep: '<pat>' in <file>`) to stdout —
those pollute pipes and hashes. Compare probe outputs with a small `node -e` script (parse,
`delete generatedAt`, compare `JSON.stringify`) instead. The probe writes
`tools/probe-results-v2.json` in place (no `--out`); running the gate overwrites that untracked
artifact with the fixture run — regenerable, left as-is.

### 2026-06-15T19:55-07:00 — Phase 1.4: registered 'originalFile' kind (+ forced test relocation)
- RED: added `test_KIND_NAMES_includesOriginalFile` (indexOf === -1, failed). GREEN: appended
  `'originalFile'` to `KIND_NAMES` in `api/file-event-kinds.js` (+ doc comment). Every event now
  carries `originalFile: null`.
- Audited the test-local kind lists; updated them to the 8-kind set so the
  "exactly one non-null kind" invariant is actually checked for `originalFile` too.
- Full suite: **38 suites / 451 passed / 0 failed**.

**Deviation (forced by the 250-line write cap — surfaced a pre-existing condition):**
`tests/test-file-events-extractors.js` was already **292L** (over cap) from the Phase-4 migration;
the cap only triggers on write, so it sat untouched until now. Editing it (which Phase 1.5
*requires*, to add the `originalFile`-emit tests) is blocked while it is > 250. Resolution: I
**relocated** (not deleted) the 5 snapshot *integration* tests
(`test_extractFileEvents_snapshot*`, `…nullBackupFileName…`, `…resumeCopied…`) from
`test-file-events-extractors.js` into `test-snapshot-events.js`, next to the snapshot unit tests
and the module they exercise (`api/snapshot-events.js`). They still run end-to-end through
`extractFileEvents`. Net coverage unchanged — full-suite count held at 451 across the move; all
5 pass in their new home. File sizes after: `test-file-events-extractors.js` 193L (room for
Phase 1.5), `test-snapshot-events.js` 199L. The spec said these integration cases should "stay"
in the extractor suite; the cap makes that impossible, and the snapshot suite is the correct
canonical home.

### 2026-06-15T20:05-07:00 — Phase 1.5: emit + Phase 2.6: materialize
- **Phase 1.5** (`api/file-events-extractors.js`): RED (one integration + one unit test failed).
  GREEN: added `buildOriginalFileEvent` + `originalFileEventsFromEdits` (mirrors
  `authoredEventsFromKeptEdits`; one-condition-per-`if`, no `&&`/`||`), wired into
  `extractFileEventsFromText` reusing the single `extractEditsFromJSONL(jsonlText)` array, and
  exported `originalFileEventsFromEdits`. Left `originalFile` OUT of `READ_EVENT_KINDS` /
  `AUTHORED_EVENT_KINDS` (so `readsForFile`/`editsForFile` and any probe consumer are
  unperturbed). File now **247L**.
- **Phase 2.6** (`api/line-state-evidence.js`): RED (materializeEvent returned null →
  "Cannot read properties of null"). GREEN: added `materializeOriginalFile` (reuses
  `plainLineEntries` + `pairEntriesWithRefs`, sourcing `loadParsedRecord(...).toolUseResult.originalFile`)
  + one dispatch line `if (event.originalFile) { return materializeOriginalFile(event); }`.
  File now **237L**.
- Full suite: **38 suites / 454 passed / 0 failed**.

### 2026-06-15T20:10-07:00 — Phase 3: consume (new dedicated test suite)
**Deviation (forced by the 250-line write cap):** `tests/test-track-line-states.js` is 271L (over
cap, pre-existing from the migration). Phases 3.7/3.8/4 all add tracker tests. Rather than
relocate unrelated engine tests to make room, I put all the `originalFile` *tracking* tests in a
new focused suite `tests/test-track-line-states-originalfile.js`. Cohesive (one feature), keeps
the over-cap file untouched, matches the codebase's modular-suite pattern.

### 2026-06-15T20:20-07:00 — Phase 3 (consume) + Phase 4 (proof) complete
- **Phase 3.7** (`api/track-line-states.js`): added an explicit `if (m.kind === 'originalFile')`
  branch in `applyOneEvent` (whole-file overlay: `applyOverlayLines` + `finishWholeOverlay`).
  *Nuance worth flagging:* the overlay behavior already worked via the existing `readFull`/`cat`
  fallthrough (those two whole-file-overlay kinds use the unguarded tail of `applyOneEvent`), so
  the Phase 3.7 test was green-via-fallthrough — there was no consume-layer RED (the RED for
  materialization happened in Phase 2.6). I added the explicit branch anyway, per the
  spec/handoff, so `originalFile` dispatch is intentional rather than implicit. Behavior identical.
- **Phase 3.8** (`api/track-line-states.js`): genuine RED → GREEN. Added `kindRank` + a final
  tiebreaker in `compareEvents` (originalFile=0, edit=1, else=2). The `originalFile` event and its
  edit share a full `(unixMs, jsonl, jsonlLine)` coordinate; before the tiebreaker the edit
  applied first (splice on empty belief → floated, then the overlay overwrote the change → line
  stayed `observed` 'b'). Test confirmed the failure (`'observed'` !== `'authored'`), tiebreaker
  fixed it (overlay-then-splice → changed line `authored`, zero-mismatch verdict).
- **Phase 4** (`tests/test-track-line-states-originalfile.js`): two acceptance tests, both green
  with no further code:
  1. *Pin-whole-file*: Read@T1 then Edit@T3 with originalFile → every line `confirmedAtMs===MS3`
     (no presumed residual), changed line `authored`, `eofConfirmed` true, `lastLine`=3, clean
     verdict vs post-edit content.
  2. *Float rescue (the headline benefit)*: an edit whose `old_string` is absent from stale belief
     FLOATS without originalFile (asserted) but does NOT float once originalFile pins the pre-edit
     file (before/after in one test).
- New tracker suite `tests/test-track-line-states-originalfile.js` = 135L (4 tests).
- Full suite: **39 suites / 458 passed / 0 failed**.

### 2026-06-15T20:15-07:00 — Verification gates (all GREEN) + roadmap marked
- **Full suite:** 39 suites / 458 passed / 0 failed (baseline 35/437 → +4 suites
  [`file-event-kinds`, `snapshot-events`, `evidence-record-access`, `track-line-states-originalfile`],
  +21 tests, zero regressions).
- **detect-rewinds:** 15 passed / 0 failed (unchanged).
- **Probe A/B safety gate:** byte-identical (1,242,467 chars ignoring `generatedAt`) vs
  `develop-baseline` with ALL phases applied. list1 283 PASS/32 MISMATCH, list2 265 PASS/106
  MISMATCH/64 NOT_FOUND on both. Reconstruction PASS/MISMATCH unmoved.
- **Every edited/new file ≤ 250 lines** (largest: `file-events-extractors.js` 247).
- **Sidecar e2e (`plate_summary.py`, live claude-data):** ran current tree vs `develop-baseline`
  worktree on the same data.
  - Final `perLineStats` **unchanged**: `{matchedObserved:247, matchedPresumed:0, mismatched:0,
    neverObserved:0}`, conflicts **233** on both — **no regression**.
  - **13 `originalFile` events applied** (one per edit).
  - **Payoff:** summed presumed-line states across all timeline entries collapsed
    **8104 → 4785 (−41%)**; entries carrying ≥1 presumed line 34 → 21. This is the intended
    effect (pin the whole file at every edit; collapse presumed carry-forward).
  - Why the FINAL verdict didn't move for this file: it ends fully pinned by a terminal beacon
    (no presumed residual AT THE END to collapse), and all 13 overlays AGREED with belief (no
    drift → 0 new conflicts). The benefit is in the intermediate per-instant belief, not the
    headline. The handoff anticipated a final-number shift; for this particular file the shift
    lands in the timeline residual instead. No regression either way.
- **Roadmap:** `plans/roadmap-100-percent-reconstruction.md` item 1 marked `[x]` with outcome.

## Open questions / FYIs for the user
1. **Explicit `originalFile` branch vs fallthrough (cosmetic).** `applyOneEvent`'s `readFull`/`cat`
   whole-file overlays use the unguarded tail of the function; I added an explicit
   `if (m.kind === 'originalFile')` branch (per spec/handoff) that duplicates that 3-line body.
   Behavior is identical. If you'd prefer zero duplication, the alternative is to drop the branch
   and just extend the fallthrough comment to "readFull / cat / originalFile". I went with the
   explicit branch the spec asked for. **Not blocking.**
2. **Pre-existing over-cap test files (migration debt).** `tests/test-file-events-extractors.js`
   was 292L and `tests/test-track-line-states.js` is 271L — both over the 250 cap before item 1,
   because the cap only fires on write. I brought the former under cap (relocated snapshot
   integration tests → `test-snapshot-events.js`) and side-stepped the latter (new dedicated
   suite). **`tests/test-track-line-states.js` is still 271L** — untouched by me, still over cap.
   A future edit to it will be blocked until it's split. Flagging as debt; not addressed here to
   keep item 1's blast radius minimal. **Want me to split it as a follow-up?**
3. **Probe artifacts.** Running the probe gate overwrote the untracked `tools/probe-results-v2.json`
   + `tools/probe-mismatches-v2.json` with the frozen-fixture run (they're regenerable build
   artifacts). Left as-is.
