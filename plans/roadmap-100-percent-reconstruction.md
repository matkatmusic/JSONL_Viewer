# Roadmap: close event-coverage gaps toward 100% reconstruction

Progress-tracking version of the 17-item roadmap from
`plans/handoff-develop-20260611-1727.md`, re-pointed onto the post-migration `api/`
layer (`plans/handoff-develop-20260615-1833.md`). Check items off as they land.

- Source roadmap (full per-item detail + gotchas): `plans/handoff-develop-20260611-1727.md`
- Implemented sidecar spec (authoritative schema comments): `plans/per-line-state-sidecar-plan.md`
- Path-translation map (`common/*` → `api/*`): `plans/handoff-develop-20260615-1833.md` § Key Files

## Baseline (post-migration, all GREEN — the starting point)
- [x] Full suite: 35 suites / 437 passed / 0 failed
- [x] detect-rewinds: 15/15
- [x] Sidecar e2e (plate_summary.py): 247/247 matchedObserved, 0 mismatched, 233 conflicts in one cluster @ 2026-05-17T02:02:43.192Z
- [x] Viewers (Playwright headless): all 4 (jfred/unified/diff/viewer) pass, zero page/console errors
- [x] Probe A/B: `develop-baseline` === working tree produce byte-identical `probe-results-v2.json`

---

## §A — Event-extraction coverage gaps
Evidence in the JSONLs the pipeline never reads. Ordered by expected payoff.

- [x] **1. `toolUseResult.originalFile` as a tracker event** — every Edit record carries
  the entire pre-edit file; the sidecar drops it. Emit it as a whole-file observation
  (Tier 2) at the record's timestamp so the tracker gains a near-beacon at every edit
  (likely collapses most "presumed" carry-forward).
  - Capture: `api/edit-stream-extraction.js` / `api/edit-replay.js`
  - Emission: `api/file-events-extractors.js`
  - ✅ DONE 2026-06-15 — Design A: first-class `originalFile` event kind, a whole-file
    OVERLAY (observation, not a beacon). Capture already existed (`buildReplaceEdit`);
    added emission, materialization (`api/line-state-evidence.js`), and consumption +
    overlay-before-splice ordering tiebreaker (`api/track-line-states.js`). Cap-driven new
    modules: `api/file-event-kinds.js`, `api/snapshot-events.js`, `api/evidence-record-access.js`.
    Gates: full suite **39 suites / 458 passed / 0 failed**; detect-rewinds **15/15**; probe
    A/B **byte-identical** vs `develop-baseline`. Sidecar e2e (`plate_summary.py`): final
    verdict unchanged (247/247 matchedObserved, 0 mismatched, 233 conflicts — no regression),
    presumed-line residual across the timeline collapsed **8104 → 4785 (−41%)** from 13
    originalFile overlays — the intended payoff. See
    `plans/implementation-notes-originalFile-event-kind.md`.

- [~] **2. Bash file ops as event kinds** — reuse `api/extract-bash-file-ops.js`.
  - [x] `rm` → absence evidence (like fileAbsent but Tier 2) — `bashRm`
  - [x] `>` redirect → truncate-write (inline content for echo/printf sources) — `bashTruncate`
  - [x] `>>` → append (extends extent) — `bashAppend`
  - [ ] `cp` → dst content = src's believed content at that instant — **DEFERRED** (capability
    already present; precision-only gap — see below)
  - Likely the only recovery path for zero-content-event files (launch.json class).
  - ✅ DONE 2026-06-15 — `rm`/`>`/`>>` shipped as Tier-2 (non-beacon) event kinds.
    New modules `api/bash-op-events.js` (emission), `api/bash-op-evidence.js` (materialize +
    conservative `redirectContentFromCommand`); `applyAbsenceObservation` in `api/line-belief.js`;
    explicit `applyOneEvent` branches + lazy-require dispatch in `api/line-state-evidence.js`.
    `api/extract-bash-file-ops.js` kept byte-identical (probe-reachable). Gates: full suite
    **43 suites / 483 passed / 0 failed**; detect-rewinds **15/15**; **probe A/B byte-identical**
    vs `develop-baseline`; sidecar e2e (`plate_summary.py`) unchanged (247/247 matchedObserved,
    0 mismatched, 233 conflicts — no regression). See
    `plans/implementation-notes-bash-op-event-kinds.md`.
    - **Scope cut:** heredoc (`<<EOF`) redirects are NOT extractable — the frozen
      `extract-bash-file-ops` `REDIRECT_PATTERN` only matches a command ending in `>/>> path`, so
      a heredoc never produces a redirect op. Recovering them needs the probe-reachable parser →
      a precision follow-up, not item 2.
    - **`cp` Phase-4 spike result:** on live data the directed alias edge already recovers
      cp-created files near-completely (`RED_GREEN_TDD.md` 164 obs / 0 neverObserved;
      `SKILL.md` 98 obs / 0 neverObserved). No capability gap → no new `cp` kind. Residual is
      precision: (a) no temporal cut at the copy instant (covered by **item 10** below), and
      (b) discovery seeded by `[target]` only (`tools/track-line-states.js:94`) misses src-only
      transcripts — see item 10a.

- [x] **3. `structuredPatch` context (' ') lines as observations** — Write/Edit hunks
  witness neighboring lines at edit time. `findStructuredPatchLine` plumbing already in
  `api/line-state-evidence.js`; extraction doesn't emit them yet.
  - ✅ DONE 2026-06-16 — new `patchContext` Tier-2 SPARSE-overlay event kind. Emit one per
    kept Edit whose `structuredPatch` carries ≥1 context (`' '`) line; materialize the
    context lines at their POST-edit absolute positions (numbered from each hunk's
    `newStart`, skipping `'+'`/`'-'`/`'\'` lines), applied AFTER the splice (default
    `kindRank` 2). New modules `api/structured-patch-events.js` (emission),
    `api/structured-patch-evidence.js` (materialize, call-time cycle break); +1 dispatch
    in `api/line-state-evidence.js`, +1 apply branch (`applyOverlayLines`, NO
    `finishWholeOverlay`) in `api/track-line-states.js`. Cap-driven Phase 0 relocated the
    wish-list helpers to `api/file-event-wishlists.js`. Gates: full suite **47 suites /
    493 passed / 0 failed**; detect-rewinds **15/15**; probe A/B **byte-identical** vs
    `develop-baseline`. Sidecar e2e (`plate_summary.py`): verdict unchanged (247/247
    matchedObserved, 0 mismatched), **0 new conflicts**. **Payoff caveat:** marginal
    presumed-residual reduction on top of item 1 is **0** here — all 13 patchContext events
    share coords with an `originalFile` event, which (whole-file) subsumes the sparse
    context lines. Standalone, item 3 still collapses 8104 → 8032. It remains the only
    evidence where `originalFile` is absent (it is NOT populated on every Edit, regardless
    of transcript version), so it ships. See
    `plans/implementation-notes-structuredpatch-context.md`.

- [x] **4. Partial-content bash reads** — `head`, `tail`, `sed -n A,Bp`, `grep -n`
  (line-addressed content); `wc -l` (extent only — lastLine, NO eofConfirmed, no content).
  Three sparse-overlay kinds: `bashReadChunk` (head/sed/tail), `bashGrep` (single-file
  `grep -n`), `bashExtent` (`wc -l`). NONE claim EOF — Bash strips stdout's trailing
  newline, so line counts are a lower bound (deviation from the plan's "copy readChunk's
  finishChunk"; see `plans/implementation-notes-item4-bash-reads.md`). New modules:
  `api/bash-read-commands.js`, `bash-read-events.js`, `bash-read-evidence.js`, and
  `api/apply-one-event.js` (extracted from track-line-states for the cap). Gates: full
  suite 52/556/0, detect-rewinds 15/0, probe A/B byte-identical, plate_summary.py
  247/247 with 0 new conflicts. (Conflict cascades on heavily-edited files are item 12.)

- [x] **5. Native Grep tool results** (mode: content, -n true) — `file:line:text` rows,
  line-addressed observations across many files at once.
  - ✅ DONE 2026-06-16 — new `grepMatches` Tier-2 SPARSE-overlay event kind from the native
    Grep tool (`output_mode:"content"`, `-n:true`). New modules `api/grep-tool-results.js`
    (pure parser: `parseGrepRows` + `extractGrepToolResults` + `collectGrepTouches`),
    `api/grep-tool-events.js` (emission — resolves each row's relpath→absolute, one event per
    matched file), `api/grep-tool-evidence.js` (materialize — re-selects THIS file's rows). +1
    kind in `KIND_NAMES`, +1 dispatch in `api/line-state-evidence.js`, +1 apply branch
    (`applyOverlayLines`, NO `finishWholeOverlay`/`finishChunk` — grep never witnesses extent;
    not a beacon) in `api/apply-one-event.js`, +1 emitter push in `api/file-events-extractors.js`.
    Grep also counts as a resolved file **touch** (`collectGrepTouches` wired into
    `collectTouches`) so a grepped-only transcript is discoverable. The File-path-handling
    convention (§ Constraints) and the Item 5.5 stub were added first. Gates: full suite
    **55 suites / 575 passed / 0 failed**; detect-rewinds **15/15**; **probe A/B byte-identical**
    vs `develop-baseline`. The grep-inclusive touch collection IS active (80 grep touches
    produced on the frozen fixture), but the grepped paths there are not probe targets, so the
    anticipated baseline shift did NOT materialize — **no re-baseline needed**;
    `probe-fixture-20260615` remains the valid baseline for item 6+. Sidecar e2e
    (`plate_summary.py`): verdict unchanged (247/247 matchedObserved, 0 mismatched, 233
    conflicts — no regression). See `plans/implementation-notes-grep-tool-results.md`.

- [ ] **5.5. Apply the File-path-handling convention to the raw-matching kinds.** cat
  (`buildCatPending` → `catEventsForFile`) and the item-4 bash reads
  (`bash-read-events.js:85`, `aliasSet.has(parsedCmd.path)`) still match RAW paths
  (relative misses). Resolve each captured path with `resolveAgainstCwd(sessionCwd, rawPath)`
  before the aliasSet test — the `bash-op-events.js` template (compute cwd via
  `extractSessionMetadata`, resolve, then match). Scope: (a) `bash-read-events.js` already
  receives `jsonlText` reserved for this; (b) `cat` emission; (c) cat TOUCH collection
  (discovery — this half re-baselines the probe; the emission halves are tracker-only and do
  not). Open sub-question for 5.5's own planning: whether item-4 `bashGrep`/reads should also
  become touches (separate from resolution). Re-run all gates; probe re-baseline for any
  discovery change.

- [ ] **5.6. Bash-reads as discovery touches.** head/tail/sed/`grep -n`/`wc -l` reads are NOT
  yet file touches, so a transcript that only bash-reads a file never discovers it (cat and
  native Grep already are touches — `collectGrepTouches`). Mirror `collectGrepTouches`: add a
  `collectBashReadTouches(parsed, cwd)` and wire it into `collectTouches`. Discovery change →
  probe re-baseline. Related: item 17 (read-scanner unification).

- [x] **6. MCP-tool file reads in subagent transcripts** (e.g. context-mode
  `ctx_execute_file` content summaries). Hard / possibly partial — **survey before building.**
  - ✅ SURVEYED — NOT VIABLE 2026-06-16. Redirected from transcript MCP reads (summaries only —
    the JSONL `tool_result` carries context-mode's summary string, never file bytes or a path;
    0 of the fixture's subagent transcripts use context-mode at all) to context-mode's own
    on-disk store. That store is a **≤14-day per-machine purgeable cache** (`README.md:1021`),
    NOT an archive (24h fetch TTL `:971`; session data deleted without `--continue` `:41`;
    `ctx_purge` `:93,975`): on the frozen fixture all **11/11** unique cwds (and every jot cwd)
    have **no content DB**; the one extant content DB on the machine is a non-fixture bezier
    project with **0 file-backed sources**; the session store survives longer but records file
    **paths only**, never content. Retrieval mechanism documented; **data absent by design**.
    Re-run gate: `tools/spike-item6-context-mode-yield.js` (read-only;
    **`UNIQUE_TARGET_COVERAGE=0`** on the frozen fixture; content store byte-identical
    before/after). Reopen only at `≥5` with ≥1 `file_path`-backed (`ctx_index`) source. New
    files (≤250 lines): `tools/spike-item6-context-mode-yield.js`,
    `tests/test-spike-item6-context-mode-yield.js` (helper test 4/4). No production
    reconstruction code added — the four standing gates stay green by construction. See
    `plans/implementation-notes-item6-context-mode-survey.md`.

- [ ] **7. Dropped-record count for timestampless records** — records without timestamps
  are silently dropped; emit a dropped-count (no-silent-caps).

- [ ] **8. MultiEdit-style records** (`toolUseResult.edits` array) — verify any exist in
  the recovery set, then handle in `extractEditsFromJSONL`.

---

## §B — Tracker gaps
Implemented conservatively; may matter at scale.

- [ ] **9. replaceAll splice across ALL runs** — currently splices only the first known
  run containing old_string; should splice all runs and float when a gap could hide an
  occurrence. (`api/edit-splice.js`)

- [ ] **10. Time-aware alias windows for mid-timeline renames** — aliasPaths is a static
  set for the whole timeline; a cp that later diverges matches the same alias set.
  - [ ] **10a. Precise-cp: seed transcript discovery from the alias closure, not just
    `[target]`.** From the item-2 Phase-4 cp spike: `tools/track-line-states.js:94`
    discovers transcripts by `[target]` (dst) only, so a transcript touching ONLY the cp
    `src` is missed even though the lineage closure knows the edge. Seed `discoverJsonls`
    from the resolved alias set. (The temporal-cut half of precise-cp is item 10 itself.)

- [ ] **11. `floatingOverKnownRegion` conflict record** — flagged + test-covered but
  emits no conflict record. Never triggered on real data — **leave until it does.**

- [ ] **12. Collapse conflict cascades** — a one-line insertion emits N per-line
  conflicts; collapse a cluster into "insertion of K lines at line L" during reporting.

- [ ] **13. Git rung on the reference ladder** — add on-disk → snapshot → **git** to the
  track-line-states CLI using `api/git-file-state.js` resolveGitContent. Needed for
  list2's NOT_FOUND files.
  - Lib: `api/track-line-states.js`; rung lives in CLI `tools/track-line-states.js`

---

## §C — Residual investigation + promotion

- [ ] **14. Trailing-extent mismatch class** — belief claims one final blank line beyond
  the reference EOF (recon=''). Dereference the evidence refs to decide real historical
  trailing blank line vs. systematic newline artifact in an observation kind; if
  artifact, fix the extractor (both affected files then go end-state perfect).

- [ ] **15. Promote per-line verdict into probe verdict logic** — probe emits per-line
  stats per file; a file whose final belief matches the reference per-line (0 mismatched)
  upgrades MISMATCH → new status. **Discuss status naming with the user first** (proposal:
  `PASS-PER-LINE`; do not silently merge with PASS).

- [ ] **16. Run the sidecar over list2** — 103 MISMATCH + 68 NOT_FOUND in
  `probe-results-v2.json` (`filesInProject[].status === 'MISMATCH'`, plus
  `filesNotInProject`). Expect the git rung (item 13) to be required first.

---

## §D — Consolidation (deferred from the migration)

- [ ] **17. Unify the two read-event scanners** — `extractReadEdits` (whole-content, in
  `api/file-event-observations.js`) and `extractReadEvents` (per-chunk offset/limit
  metadata, in `api/split-read-assembly.js`) scan the same Read results but produce
  different shapes and neither serves the other's callers. Unify into one scanner that
  derives both shapes (the "two representations" decision; precondition — restructuring
  complete — is now met).

---

## Constraints (apply to every item)
- **250-line WRITE cap** (hook blocks the write). Files already in the 250–300 band
  (`api/line-state-evidence.js` 299, `api/replay-verification.js` 300,
  `api/file-events-extractors.js` 294, `tools/probe-projects-v2.js` 289) cannot grow —
  **split into a new sibling `api/` module, do not grow the file.**
- **Strict red-green TDD** — watch the test fail first; hook runs `tests/test-<basename>.js`.
- **One condition per `if`** (nest; never `&&`/`||`; ternaries only for value selection);
  >3-deep nesting rejected.
- **Archive = preserve, not delete** — move the real file body to an `archive/` subfolder;
  obsolete tests → `tests/archive/` (non-recursive glob, won't run).
- **No forwarding layers** — one canonical `api/` home per function; callers import directly.
- **Vocabulary** — never "corpus" (say "all JSONL files in the projects folder"); "create",
  never "mint". The non-null sub-object IS the kind (no kind strings, no example values).
- **File-path handling.** Every captured file path MUST be resolved to its absolute
  on-disk path BEFORE it is used for any "which file is this" decision (aliasSet
  membership, touch collection, event emission). Read/Edit/Write tool paths are already
  absolute. Paths recovered from Bash command text (cat, head/sed/tail, `grep -n`,
  `wc -l`, rm, `>`/`>>`) and from native Grep tool output are cwd-relative and MUST be
  resolved with `resolveAgainstCwd(sessionCwd, rawPath)` (`api/file-historical-lineage.js`);
  the session cwd comes from `extractSessionMetadata(jsonlText)` (`api/transcript-parsers.js`).
  EXCEPTION: snapshot-sourced paths are repo-relative (not cwd-relative) and are matched by
  full path-suffix against the alias paths (`anyAliasPathEndsWith`) — they are not
  cwd-resolved. Compliant today: Read/Edit/Write, originalFile (1), patchContext (3), bash
  ops rm/`>`/`>>` (2), snapshot. NOT yet compliant: cat, and the item-4 bash reads
  (head/sed/tail/`grep -n`/`wc -l`) — retrofitted in Item 5.5.
- **Probe gate (through Item 4 — pre-grep touch collection) = A/B byte-identity** vs
  `develop-baseline` against the frozen fixture
  (`~/Programming/jot-recovery/probe-fixture-20260615/`), NOT literal list numbers. This gate
  held for Items 1–4 because none of them changed how file touches are collected: discovery
  (`collectTouches` → `findReferencingJsonls`) saw the same transcripts per file, so probe
  output stayed byte-for-byte identical. Never run the probe against live claude-data
  (self-contaminates).
- **Probe gate (Item 5 onward — grep-inclusive touch collection).** Item 5 intentionally
  changes discovery: native Grep tool results count as file touches, so a transcript that
  grepped a file (without editing it) is now discovered for that file. This **breaks
  byte-identity against the pre-grep baseline BY DESIGN** — it adds grep-touched transcripts
  to records' `transcriptsUsed` and may reorder edit assembly. Item 5 therefore RE-BASELINES
  the gate: (1) run the probe against the pre-grep `develop-baseline` and characterize the
  diff — every change must be explained by grep-touch inclusion (added grep-only transcripts;
  any verdict change traceable to grep-driven discovery/reordering), nothing unexplained;
  (2) regenerate a new grep-inclusive frozen baseline (`probe-fixture-<date>`) and record it
  here as the new `develop-baseline`; (3) Item 6+ gate against the NEW baseline. The pre-grep
  fixture is retained as the historical record of pre-grep behavior. Still never run the probe
  against live claude-data (self-contaminates).
  - **OUTCOME (Item 5, 2026-06-16):** on `probe-fixture-20260615` the gate held **byte-identical**.
    Grep touch collection IS active (80 grep touches produced across the fixture), but every
    grepped path is a `jot-ultraplan` file that is NOT a probe target (0 of 750 targets), so no
    target's discovery/reconstruction changed and the anticipated shift did not materialize.
    **No new baseline was frozen** — `probe-fixture-20260615` stays the `develop-baseline` for
    Item 6+. A re-baseline becomes necessary only if/when a future fixture greps a file that is
    also a reconstructed target.

## How to verify
See `plans/handoff-develop-20260615-1833.md` § How to Verify for the exact commands
(full suite, detect-rewinds, sidecar e2e, probe A/B against the frozen fixture).
