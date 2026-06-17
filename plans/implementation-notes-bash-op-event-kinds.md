# Implementation notes — roadmap item 2: Bash file ops as event kinds

Spec: `~/.claude/plans/plan-item-2-on-agile-crystal.md` (authoritative, phase-by-phase).
Handoff: `plans/handoff-develop-20260615-2125.md`.

This file records design decisions, deviations, tradeoffs, and open questions as the
implementation proceeds. ISO timestamps are local (PDT). Mirrors the item-1 record
`plans/implementation-notes-originalFile-event-kind.md`.

## Baseline (before any change)
- 2026-06-15T21:38-07:00 — Full suite GREEN at start: **39 suites / 458 passed / 0 failed**.
- detect-rewinds: 15 passed / 0 failed.
- `tests/test-track-line-states.js` is **271L** (over the 250 cap — migration debt flagged by
  item 1's open question #2; Phase 0 fixes it).

## Locked design context (resolved with user; do not re-litigate)
- Ship **rm / `>` / `>>`** (single-file engine fits). **Defer `cp`** to a verify-first
  measurement spike (Phase 4) — its content already flows `src→dst` via the directed lineage
  alias edge; the gap is precision, not capability.
- Keep **explicit per-kind branches** in `applyOneEvent` (`bashTruncate` gets its own named
  branch like `originalFile`).
- **Split `tests/test-track-line-states.js` NOW** (Phase 0, gating).
- New kinds are **non-beacons** (Tier-2); `isBeaconEvent` stays `snapshot/fileAbsent/write`.
- `api/extract-bash-file-ops.js` stays **byte-identical** (probe-reachable); the new
  redirect-content parser lives in `api/bash-op-evidence.js`, not the parser.

## Log

### 2026-06-15T21:42-07:00 — Phase 0: split the over-cap tracker suite (GATING)
- `tests/test-track-line-states.js` was **271L** (over cap). Extracted the shared helpers
  (TS/MS constants, `withTimestamp`, `makeReadUseWithGeometry`, `makeEditLineWithPatch`,
  `makeSnapshotLine`, `trackFixture`) into a new **`tests/track-line-states-fixtures.js`**
  (74L, no `test-` prefix so the suite runner ignores it; one canonical home, imported
  directly — no re-export shim).
- Kept the 8 belief-mechanics tests in `test-track-line-states.js` (**271L → 169L**); moved
  the 3 conflict/verdict/report tests **verbatim** into a new
  `tests/test-track-line-states-verdict.js` (74L).
- Gate: main 8/0, verdict 3/0; full suite **40 suites / 458 passed / 0 failed** (+1 suite,
  SAME test total — 11 tracker tests = 8 + 3). No production code touched, so probe A/B is
  trivially unaffected (deferred to the first production phase).
- **Interpretation:** the plan said "relocate the conflict/verdict tests." I read tests 6
  (conflict record), 10 (final verdict), 11 (report self-contained) as that set; the other 8
  are belief-state mechanics and stayed. `tests/test-track-line-states-originalfile.js` keeps
  its own local `trackFixture` (untouched — minimal blast radius; it predates the shared module).

### 2026-06-15T21:55-07:00 — Phase 1: `rm` → `bashRm` (Tier-2 absence)
- Registered `bashRm` in `KIND_NAMES` (RED name-test first). **Deviation:** registered all
  three new names (`bashRm`/`bashTruncate`/`bashAppend`) in ONE edit — they are inert `null`
  slots until emission/materialize wire them, so per-kind RED lives in the emission/materialize/
  tracker tests, not the registry. Saves re-editing `file-event-kinds.js` (and re-triggering the
  cap hook) three times.
- `api/line-belief.js`: added `applyAbsenceObservation(belief, unixMs, ref)` — the Tier-2 analog
  of the `applyFileAbsent` BEACON. It RETURNS one conflict per known line (`observedText:null`,
  `observedRef:ref`), skips lines we only know EXIST (`text===null`), then clears belief
  (`entries={}`, `lastLine=0`, `eofConfirmed=true`). `unixMs` is unused (kept for signature
  parity with `applyFileAbsent`). RED→GREEN in `test-line-belief.js`.
- `api/bash-op-events.js` (NEW, 63L): `bashOpEventsForFile(jsonlPath, jsonlText, parsed, aliasSet)`.
  **Deviation from the plan signature** `(jsonlPath, parsed, aliasSet, cwd)`: the module owns its
  session-cwd lookup (`extractSessionMetadata(jsonlText)`) so the orchestrator wiring stays at
  exactly +2 lines and doesn't need to import the metadata parser. Resolves each `rm` path via
  `resolveAgainstCwd` and emits one `bashRm` per removed path that is an alias of this file.
  **Interpretation of "keep those in aliasSet":** emit ONLY for resolved paths already IN the
  alias set (do NOT mutate the set — an `rm` of an unrelated file must not be associated).
  Local `timestampAt` copy (importing `recordTimestampAt` from file-events-extractors would cycle).
- `api/bash-op-evidence.js` (NEW, 48L): `materializeBashRm` (ref = whole-command textProperty span)
  + `findBashCommandItem`. **Cycle handling:** this module and `line-state-evidence` form a
  require cycle (its `materializeEvent` dispatches here; the later truncate/append materializers
  reuse its builders). Both reassign `module.exports`, so a load-time binding can capture a stale
  `{}`. Resolved by requiring at CALL time on both edges — `lse()` getter here, and
  `require('./bash-op-evidence')` inline in `materializeEvent`. Standard CommonJS cycle break;
  chosen over extracting a shared lower module (much larger blast radius across line-state-evidence
  call sites) and over the plan's "export plainLineEntries" top-level import (stale-binding risk).
- `api/line-state-evidence.js`: +1 dispatch line (`bashRm`, lazy require). `api/track-line-states.js`:
  +1 explicit `applyOneEvent` branch next to `fileAbsent` (`applyAbsenceObservation`); NOT added to
  `isBeaconEvent`. `api/file-events-extractors.js`: +2 wiring lines (import + push) → **247→249L**
  (under cap; no need to relocate `readsForFile`/`editsForFile`).
- Gates: full suite **43 suites / 468 passed / 0 failed** (+3 suites, +10 tests vs Phase 0);
  detect-rewinds **15/0**; **probe A/B byte-identical** vs `develop-baseline` (frozen fixture).

### 2026-06-15T22:05-07:00 — Phase 2: `>` → `bashTruncate` (whole-file overlay)
- `api/bash-op-evidence.js`: added `redirectContentFromCommand(command)` →
  `{content, startIndex, endIndex}` | null. **Conservative subset:** single-quoted `echo`
  (bash leaves single quotes literal, so command bytes == file bytes; backslashes kept as-is)
  and **literal** `printf` (rejected when the format holds `%` or `\` — printf interprets those).
  Skips double-quoted producers, `echo -e/-n` flags, and empty content (`echo ''` writes a
  newline an empty span can't represent). Spans index the command string so refs slice back exactly.
- **Clarification / scope cut (not a user decision — forced by the frozen parser):** the plan
  listed **heredocs** (`<<EOF`/`<<'EOF'`) as a target. They CANNOT reach here: the (byte-frozen)
  `extract-bash-file-ops` `REDIRECT_PATTERN` only matches a command ENDING in `>/>> path`, and a
  heredoc command ends with the body + delimiter, not the path — so no redirect op is ever
  produced for a heredoc. Implementing heredoc parsing would be dead code. Dropped it; noted as a
  precision follow-up (would require touching the probe-reachable parser → out of scope for item 2).
- `materializeBashTruncate`: splits the extracted content (`plainLineEntries`), offsets each span
  into the command, and pairs with textProperty refs (`pairEntriesWithRefs`). Both helpers newly
  **exported** from `line-state-evidence.js` (were internal).
- `bash-op-events.js`: `redirectEventForOp` emits `bashTruncate` for a `>` op of an alias path
  with extractable content (skips `>>` for now — Phase 3 — and skips when content is null).
- Dispatch line in `materializeEvent` (lazy require) + explicit `applyOneEvent` branch
  (`applyOverlayLines` + `finishWholeOverlay` — same shape as `originalFile`; truncate-replace
  falls out: overlay pins new content, the tail is dropped). NOT a beacon.
- Gates: full suite **43 suites / 479 passed / 0 failed** (+11 tests); detect-rewinds **15/0**;
  **probe A/B byte-identical**. Largest touched file `line-state-evidence.js` **243L** (under cap).
  New payoff covered by a test: a zero-content-event file created only by `echo '...' > f`
  (launch.json class) gains belief from the redirect with a clean final verdict.

### 2026-06-15T22:18-07:00 — Phase 3: `>>` → `bashAppend` (extends extent)
- `materializeBashAppend` reuses the truncate construction (`redirectByLine`) — byLine numbered
  from 1 RELATIVE; the offset is applied at apply time, not materialize.
- `bash-op-events.js`: generalized `redirectEventForOp` — dropped the `op.mode !== '>'` guard,
  added `redirectKindForMode` (`>>` → bashAppend, else bashTruncate). One emission path for both.
- `api/track-line-states.js`: added `shiftByLine` helper + an explicit **apply-time stateful**
  `bashAppend` branch — `offset = belief.lastLine`; shift each line by offset; `applyOverlayLines`
  (appended lines land beyond the extent → never conflict); `finishWholeOverlay(offset + count)`.
  Empty belief (offset 0) degrades to truncate-from-line-1 (tested). NOT a beacon. Tracker **224L**.
- **Open question for the user (append extent trust):** the branch uses `finishWholeOverlay`,
  which sets `eofConfirmed = true` after the append. This assumes `belief.lastLine` equals the
  REAL pre-append file length. If belief had only seen a PREFIX (e.g. a single read chunk, extent
  not yet eof-confirmed), the appended lines are numbered from an underestimated offset, so their
  absolute line numbers (and the new EOF) can be wrong until a later beacon corrects. This follows
  the plan exactly (`offset = belief.lastLine`, `finishWholeOverlay`); flagging because append is a
  non-beacon and a wrong offset is a wrong observation. Options if you want it more conservative:
  (a) only set eofConfirmed when the prior extent was already eof-confirmed, else extend without
  claiming EOF; (b) skip append when `!belief.eofConfirmed`. I left the plan's behavior; happy to
  tighten. **Not blocking** — real `>>` recoveries almost always follow a known-extent write/read.
- Gates: full suite **43 suites / 483 passed / 0 failed** (+4 tests); detect-rewinds **15/0**;
  **probe A/B byte-identical** vs `develop-baseline` (frozen fixture).

### 2026-06-15T22:30-07:00 — Phase 4: `cp` verify-first spike (measure only, NO production code)
Ran the sidecar (`tools/track-line-states.js`) on real cp-created `dst` files in live
claude-data — files created by `cp` with no direct write/edit touch of their own (found via a
throwaway `/tmp/find-cp.js`: 25 cp ops, 21 unique dst, 5 copy-only & on-disk). Three measured:

| dst (cp target) | aliases | perLineStats | conflicts |
|---|---|---|---|
| `jot/RED_GREEN_TDD.md` ← `python-migration/RED_GREEN_TDD.md` | 2 | `{obs:164, presumed:0, mismatched:1, never:0}` | 11 |
| `handoff-prompt/SKILL.md` ← `jot-backup/.../SKILL.md` | 2 | `{obs:98, presumed:0, mismatched:3, never:0}` | 35 |
| `tools/probe-baseline.json` ← `tools/probe-results.json` | 2 | `{obs:5, mismatched:45, never:14717}` | 0 |

**Finding — capability is ALREADY present (confirms the deferral):** for the two cp-created
files whose `src` has content events, the directed alias edge (`buildLineageGraph`
`cp: dst→src`) + the `resolveAliases` closure route the `src`'s content into `dst`'s belief —
**near-complete recovery, `neverObserved: 0`** — with NO cp-specific machinery. The
`probe-baseline.json` case fails only because BOTH dst and its src are tool-GENERATED JSON with
no Claude content events anywhere (not a cp problem, and not an rm/`>`/`>>` case either — out of
item-2 scope). So there is **no capability gap** → no new `cp` kind in item 2, as planned.

**The residual IS precision, exactly the two predicted imprecisions:**
1. **No temporal cut.** `src` edits AFTER the copy bleed into `dst`'s belief (the alias is
   static for the whole timeline) — this is what the 1 / 3 mismatches + 11 / 35 conflicts are.
2. **Discovery seeded by `[target]` only** (`tools/track-line-states.js:94`,
   `discoverJsonls([target])`): a transcript that touches ONLY `src` (never `dst`) is never
   scanned, even though the closure knows the edge. (Recovery still worked here because the cp +
   src authoring were in dst-referencing transcripts; a src-only transcript would be missed.)

**Outcome:** measurement shows a real (precision-only) residual, so per the plan I filed a
**precise-cp follow-up sub-item** under roadmap §B (time-aware alias windows already covers the
temporal cut as item 10; added a discovery-seeding note 10a). Left the `cp` checkbox under item 2
**unchecked** with a pointer to this spike. NO production code written in Phase 4.

### 2026-06-15T22:40-07:00 — Verification gates (all GREEN) + roadmap marked
- **Full suite:** **43 suites / 483 passed / 0 failed** (baseline 39/458 → +4 suites
  [`test-track-line-states-verdict`, `test-bash-op-events`, `test-bash-op-evidence`,
  `test-track-line-states-bashops`], +25 tests, zero regressions).
- **detect-rewinds:** 15 passed / 0 failed (unchanged).
- **Probe A/B byte-identical** vs `develop-baseline` (frozen fixture) — confirmed after every
  production phase (0, 1, 2, 3); no code changed in Phase 4. `api/extract-bash-file-ops.js` diff
  vs baseline is **empty** (byte-identical, as required).
- **Every new/edited source + test file ≤ 250 lines** (largest: `file-events-extractors.js` 249,
  `line-state-evidence.js` 244, `line-belief.js` 238, `track-line-states.js` 224).
- **Sidecar e2e (live claude-data):**
  - `plate_summary.py` final verdict **unchanged**: `{matchedObserved:247, matchedPresumed:0,
    mismatched:0, neverObserved:0}`, **233 conflicts** — no regression.
  - **`bashRm` payoff demonstrated on real data:** `debate_lib_main.py` → **1 bashRm event /
    355 rm-sourced absence conflicts** (the deletion moment recorded, evidence pointing into the
    `rm` command), final verdict `{obs:454, mismatched:1, never:0}`; `test_post_tool_use_hook.py`
    → 1 bashRm / 79 conflicts, `{obs:185, mismatched:0, never:0}`. (Across live data: rm fires on
    **315 distinct paths**.)
  - **`bashTruncate`/`bashAppend`: 0 extractable hits in this dataset.** Real redirects here are
    command-output (`node … > f`) or double-quoted — the conservative parser correctly skips them
    (a wrong observation corrupts belief). The echo/printf-literal payoff is correct + unit/tracker
    tested but LATENT on this corpus; it will fire on datasets that author config files via
    `echo '...' > f`. Reported here rather than silently — no-silent-caps.
- **Roadmap:** `plans/roadmap-100-percent-reconstruction.md` item 2 marked `[~]` — `rm`/`>`/`>>`
  `[x]`, `cp` left `[ ]` (DEFERRED) with the spike pointer; added item **10a** (precise-cp
  discovery seeding).

## Open questions / FYIs for the user
1. **Append extent trust (Phase 3) — the one worth a look.** The `bashAppend` apply branch uses
   `offset = belief.lastLine` + `finishWholeOverlay` (sets `eofConfirmed = true`), per the plan.
   This is correct WHEN `belief.lastLine` is the real pre-append length. If belief had only seen a
   PREFIX (extent not yet eof-confirmed), the appended lines are numbered from an underestimate and
   the new EOF can be wrong until a later beacon corrects. Real `>>` almost always follows a
   known-extent write/read, so this is rare. Options if you want it tighter: (a) only set
   `eofConfirmed` when the prior extent was already eof-confirmed; (b) skip append when
   `!belief.eofConfirmed`. I shipped the plan's behavior. **Not blocking.**
2. **Cycle break via lazy require (Phase 1).** `line-state-evidence` ⇄ `bash-op-evidence` is a real
   require cycle (dispatch ↔ shared builders). I broke it with call-time `require` on both edges
   (`lse()` getter + inline `require('./bash-op-evidence')` in `materializeEvent`) rather than
   extracting a shared lower module (large blast radius across line-state-evidence call sites) or a
   top-level import (stale-binding risk — both modules reassign `module.exports`). Standard CommonJS
   pattern, but it IS the first lazy-require in this codebase. If you'd prefer the extraction, say so.
3. **Registered all three kind names in one edit (Phase 1).** `bashRm`/`bashTruncate`/`bashAppend`
   went into `KIND_NAMES` together (inert null slots); per-kind RED lives in the emission/
   materialize/tracker tests, not the registry. Saves three cap-hook round-trips. Cosmetic.
4. **Heredoc redirects out of scope (forced).** The byte-frozen `extract-bash-file-ops` parser
   never produces a redirect op for a heredoc (its `REDIRECT_PATTERN` anchors on a command ending
   in `>/>> path`). Recovering `cat > f <<'EOF'`-class writes needs the probe-reachable parser →
   precision follow-up, not item 2. Flagged in the roadmap.
5. **Probe artifacts.** Running the probe gate overwrote the untracked
   `tools/probe-results-v2.json` with the frozen-fixture run (regenerable build artifact). Left as-is.
