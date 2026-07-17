# Implementation notes — Roadmap item 3: `structuredPatch` context lines

Spec: `~/.claude/plans/make-a-plan-for-sparkling-pancake.md`
Maintained per the `jot:implement` pattern. ISO-timestamped entries record
design decisions, deviations, tradeoffs, and open questions as work proceeds.

## Goal recap

Emit the unchanged context (`' '`) lines inside every Write/Edit
`structuredPatch` hunk as per-line Tier-2 **sparse-overlay** observations
(`patchContext` kind), numbered from `newStart` (post-edit positions), applied
AFTER the edit splice. Upgrades edit-neighbor lines from *presumed*
(carried-forward) to *observed* at the edit's instant. Hard constraint: the
sidecar runs beside the reconstruction pipeline and must never change probe
PASS/MISMATCH (A/B byte-identity).

## Baseline (before any change) — 2026-06-16T17:03Z

- Full suite: **43 suites / 483 passed / 0 failed**.
- Tree green, nothing mid-flight; item 1 + item 2 done.

---

## Phase log

### Phase 0 — Relocate wish-list helpers (GATING) — 2026-06-16T17:05Z — DONE

- New `api/file-event-wishlists.js` (33L): `readsForFile`, `editsForFile`,
  `READ_EVENT_KINDS`, `AUTHORED_EVENT_KINDS` moved **verbatim** out of
  `api/file-events-extractors.js`. Imports `extractFileEvents` from
  `./file-events-extractors` and `eventHasAnyKind` from `./file-event-kinds`.
  No re-export shim on the old module (one canonical home; importers point here).
- `api/file-events-extractors.js`: dropped the two helpers, their two
  `*_EVENT_KINDS` arrays, the now-unused `eventHasAnyKind` import, and the two
  exports → **249L → 227L** (headroom for Phase 1's +2 wiring).
- New `tests/test-file-event-wishlists.js` (61L): the 2 wish-list tests moved
  verbatim (pointing at the new module). The old suite's section comment +
  `writeWriteAndReadFixture` fixture went with them.
- **No require cycle:** the extractor no longer imports the wishlists module, so
  the new module's top-level `require('./file-events-extractors')` is one-way.
- **Gate:** wishlists suite 2/0; extractors suite 11/0 (13 split to 11+2 — same
  test total); full suite **44 suites / 483 passed / 0 failed** (+1 suite, same
  483 total). Probe A/B: no probe-reachable module touched — deferred to the
  end-of-Phase-1 safety checkpoint (see cadence note above).

**Decision (cadence):** the probe A/B byte-identity gate is the hard safety
constraint, but every item-3 module is sidecar-only and none is probe-reachable.
Running the worktree-based probe after each of Phase 1's ~8 micro-steps would
re-confirm the same null result repeatedly. I run it once after all Phase-1
sidecar wiring lands, and once in Phase 2 — each a meaningful checkpoint.

### Phase 1 steps 1–4 — 2026-06-16T17:10Z — DONE

- **Step 1 (kind):** `'patchContext'` added to `KIND_NAMES`
  (`api/file-event-kinds.js`). RED `test_KIND_NAMES_includesPatchContext`
  watched fail (hook auto-ran), then GREEN — kinds suite 6/0.
- **Step 2 (emission):** new `api/structured-patch-events.js` (71L) —
  `patchContextEventsFromEdits(...)` + `hunksHaveContextLine(hunks)`. Mirrors
  `originalFileEventsFromEdits`; local `timestampAt` (no cycle back into
  file-events-extractors). RED watched (module-not-found), then GREEN 3/0.
- **Step 3 (wiring):** `api/file-events-extractors.js` +import +`push.apply`
  next to the `originalFile` push → **227L → 229L** (under cap). Extractor
  suite 11/0. No cycle: the emission module never imports back.
- **Step 4 (materialize):** new `api/structured-patch-evidence.js` (58L) —
  `materializePatchContext(event)`: skip hunks with no numeric `newStart`;
  per hunk, cursor = `newStart`; `'\'` + `'-'` skip without advancing; `'+'`
  advances but isn't emitted; `' '` emits `{lineNum, text, ref}` then advances.
  `buildStructuredPatchRef` via call-time `lse()` (cycle break, mirrors
  bash-op-evidence). RED watched, GREEN 3/0.

**Decision (no dispatch unit test in test-line-state-evidence.js):** item 2's
bash kinds (separate materializer module) are NOT dispatch-tested there either —
they're covered by their own materializer suite + the tracker e2e. patchContext
follows that precedent; the +1 `materializeEvent` dispatch line (step 5) and the
+1 `applyOneEvent` apply branch (step 6) are gated together by the new
end-to-end tracker suite (step 8), written RED-first.

### Phase 1 steps 5,6,8 — 2026-06-16T17:18Z — DONE

- **Step 8 fixture:** `makeEditLineWithHunks(filePath, oldString, newString,
  hunks, iso)` added to `tests/track-line-states-fixtures.js` (full hunk objects
  with `newStart`, unlike `makeEditLineWithPatch` which sets only `lines`).
- **Step 8 e2e suite** `tests/test-track-line-states-patchcontext.js` (3 tests),
  written RED-first — all 3 failed with `Cannot read properties of null
  (reading 'kind')` (materializeEvent returned null for patchContext). Covers:
  sparse overlay observes context without flipping `eofConfirmed` or truncating
  the tail and is not a beacon; a disagreeing context line emits exactly one
  conflict; patchContext lands on the POST-splice state (edit rank 1 before
  patchContext rank 2 within one record), leaving the changed line authored.
- **Step 5 (dispatch):** +1 line in `materializeEvent`
  (`api/line-state-evidence.js`, call-time `require` — cycle break) → 245L.
- **Step 6 (apply):** explicit `patchContext` branch in `applyOneEvent`
  (`api/track-line-states.js`) → `applyOverlayLines` only, NO
  `finishWholeOverlay`; not added to `isBeaconEvent`; no `kindRank` change
  (default 2) → 232L. Turned the RED suite GREEN (3/0).

### Phase 2 — gates + payoff — 2026-06-16T17:22Z

- **Full suite:** 43 → **47 suites / 493 passed / 0 failed** (+4 suites: the
  wishlists relocation from Phase 0 plus the 3 new item-3 suites; +10 tests).
- **detect-rewinds:** 15 passed / 0 failed.
- **Probe A/B byte-identity vs `develop-baseline`** (frozen fixture, `node -e`
  JSON compare ignoring `generatedAt`): **identical: true**. The hard safety
  constraint holds — no probe-reachable module changed.
- **Caps:** every new/edited source + test file ≤ 250 (largest:
  line-state-evidence 245, track-line-states 232, file-events-extractors 229).

#### Payoff measurement (plate_summary.py, real claude-data) — KEY FINDING

Isolated patchContext's contribution by running the tracker on the SAME real
event stream (5 transcripts, 89 events, 13 patchContext events) with kinds
filtered in/out. Metric = total `presumed` per-line states summed across all
timeline entries (the same metric item 1 reported: 8104 → 4785, −41%).

| scenario | timeline-presumed |
| --- | --- |
| neither item 1 nor item 3 | 8104 |
| originalFile only (item 1) | 4785  (−41%) |
| patchContext only (item 3, no originalFile) | 8032  (−72, −0.9%) |
| both (current) | **4785** |

**patchContext is correct and works** (standalone it collapses 8104 → 8032),
but its **marginal payoff on top of item 1 is exactly 0** on this file. Cause:
**all 13 patchContext events land at the identical (jsonl, jsonlLine) coords as
an originalFile event** (13/13). Item 1's `originalFile` overlay pins the WHOLE
pre-edit file at the same instant (rank 0, before the splice); patchContext
(rank 2, after the splice) only re-confirms a sparse SUBSET of those same lines
at that same millisecond — so it removes no additional presumed state. Verdict
unchanged (247/247 matchedObserved, 0 mismatched, 0 neverObserved); **0 new
conflicts** (233 with and without) — context lines corroborate the post-splice
state, as designed.

**Why patchContext would still matter:** its value appears only where an edit
carries a `structuredPatch` with context lines but NO `originalFile` — e.g.
older Claude Code transcripts predating the `originalFile` field, or Write/update
records that ship a patch without the whole pre-edit file. On modern transcripts
(every Edit carries `originalFile`), item 1 fully subsumes it.

**No-silent-caps note:** the plan expected "a further collapse"; on this file the
collapse-on-top-of-item-1 is 0. Reported here rather than buried. See Open
Question 4 below — this is a value/direction call for the user.

---

## Open questions / FYIs

1. **`eofConfirmed` persistence across a growing extent** (plan FYI 1). A context
   line beyond a prior `eofConfirmed` extent bumps `lastLine` but leaves the
   stale `eofConfirmed = true` (bare `applyOverlayLines` never touches the flag).
   On plate_summary.py this never fired (verdict + extent unchanged). Not
   observed as a problem; left as-is per plan.
2. **Floated-edit interaction** (plan FYI 2). A `newStart`-based context overlay
   on a mis-positioned (floated) edit could conflict — correctly surfacing a real
   discrepancy. Observed conflict delta on plate_summary.py is **0**, so this did
   not occur here.
3. **Kind name `patchContext`** (plan FYI 3) chosen for brevity. Trivial to
   rename to `structuredPatchContext` if preferred. NOT renamed.
4. **RESOLVED 2026-06-16 — ship as-is (option A); item 3 complete.** patchContext
   is fully subsumed by item 1 (`originalFile`) on plate_summary.py — all 13
   events share coords with an originalFile event, so zero marginal
   presumed-residual reduction there (see the Payoff measurement). It is
   nonetheless correct, regression-free, and **retains real standing value**:
   the user confirmed **`originalFile` is NOT populated on every Edit, regardless
   of transcript version** — so wherever it is absent, patchContext is the only
   evidence for those neighbor lines. Not a legacy-only fallback. Kept; emission
   left UNcoupled from originalFile (option B rejected — it would force the two
   extractors to know about each other, against no-forwarding-layers). Roadmap
   item 3 checked `[x]` with the subsumption caveat recorded.
