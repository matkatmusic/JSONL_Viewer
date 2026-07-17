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
- [x] Sidecar e2e (plate_summary.py): 247/247 matchedObserved, 0 mismatched, 8 collapsedCascade records (item 12 collapsed 233 per-line conflicts in one cluster @ 2026-05-17T02:02:43.192Z)
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

- [x] **5.5. Apply the File-path-handling convention to the raw-matching kinds.** cat
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
  - ✅ DONE 2026-06-17. Resolved all three RAW-match sites with `resolveAgainstCwd(sessionCwd, rawPath)`
    BEFORE the aliasSet test (the `bash-op-events.js` convention), strict red-green per site (each test
    failed first): (1) `bash-read-events.js` emission (head/sed/tail/`wc`/`grep -n` →
    `bashReadChunk`/`bashExtent`/`bashGrep`); (2) `catEventsForFile` emission (now exported); (3) the cat
    TOUCH in `file-historical-lineage.js:appendEditTouches` — the ONLY probe-affecting site. Bash-reads
    becoming touches DEFERRED to item 5.6 (above). **Probe DIVERGED, as the intentional case** — 4
    `filesInProject` entries enriched, **all `status PASS`**, reconstruction byte-identical (only
    discovery metadata moved): `.claude-plugin/plugin.json` + `marketplace.json` each gained one
    discovered transcript (kept=0); `scripts/fibonacci.py` + `tests/test_fibonacci.py` had
    `earliestTimestamp` pulled earlier. Re-baselined `develop-baseline` `9968536→124dfbc` by MIRRORING
    the current source tree (user-chosen; temp-index commit, `develop` untouched) → A/B `identical:
    true`. Gates: full suite **57 suites / 582 passed / 0 failed** (was 56/579: +3 tests, +1 suite from
    splitting `test-file-events-extractors.js` at the 250-cap → new `tests/test-file-events-extractors-bash.js`);
    detect-rewinds 15/0; sidecar e2e `plate_summary.py` 247/247, conflicts 233; all edited files ≤250.
    See `plans/implementation-notes-item5.5-filepath-resolution.md`.

- [x] **5.6. Bash-reads as discovery touches.** head/tail/sed/`grep -n`/`wc -l` reads are NOT
  yet file touches, so a transcript that only bash-reads a file never discovers it (cat and
  native Grep already are touches — `collectGrepTouches`). Mirror `collectGrepTouches`: add a
  `collectBashReadTouches(parsed, cwd)` and wire it into `collectTouches`. Discovery change →
  probe re-baseline. Related: item 17 (read-scanner unification).
  - ✅ DONE 2026-06-17. Added `collectBashReadTouches(parsed, cwd)` in NEW `api/bash-read-touches.js`
    (mirror of `collectGrepTouches`, incl. the lazy `resolver()` cycle-break; reuses
    `parseBashReadCommand`) and wired it into `collectTouches` (`file-historical-lineage.js`, 243→245:
    var-decl + require + one `push.apply` beside the grep call). One coarse touch kind `'bashread'`
    (user choice; distinct from the event kinds `bashReadChunk`/`bashExtent`/`bashGrep`) for all three
    bash-read flavors; `touch.line` anchors at the **tool_result** record index so
    `stampTouchTimestamps` stamps it (anchoring at the tool_use index would yield `timestamp:null`).
    Strict red-green: new split test `tests/test-file-historical-lineage-bash.js` (4 cases —
    `head -n 5`/`wc -l`/`grep -n` each discover one resolved touch; `head -5` no-`-n` negative control →
    zero) failed RED (3× `0 !== 1`) then GREEN. **Probe DIVERGED, as the intentional case** — 23
    `filesInProject` entries enriched, **0 status flips, reconstruction byte-identical, summary block
    unchanged** (only discovery metadata moved): 11 entries each gained one transcript (every added
    transcript kept=0 → no edits), 12 entries only pulled `earliestTimestamp` earlier (21 shifts, all
    earlier); 0 transcripts removed. Re-baselined `develop-baseline` `124dfbc→880b69d` by MIRRORING the
    current source tree (temp-index commit, `develop`'s all-untracked tree untouched) → A/B `identical:
    true`. Gates: full suite **58 suites / 586 passed / 0 failed** (was 57/582: +4 tests, +1 suite from
    the split); detect-rewinds 15/0; sidecar e2e `plate_summary.py` 247/247, conflicts 233; all
    edited/new files ≤250 (`bash-read-touches.js` 75, `file-historical-lineage.js` 245, test 67).
    Rollback: `git update-ref refs/heads/develop-baseline 124dfbc`. See
    `plans/implementation-notes-item5.6-bashread-touches.md`.

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

- [x] **7. Dropped-record count for timestampless records** — records without timestamps
  are silently dropped; emit a dropped-count (no-silent-caps).
  - ✅ SURVEYED — DEFERRED 2026-06-17. The premise is empty: the records that lack a usable
    timestamp carry **no file-content evidence**, so the drop sites are eligibility FILTERS, not
    silent CAPS. On the frozen fixture (`probe-fixture-20260615`: 786 transcripts / 194,425
    records) **39,090 (20.1%) are timestampless, and 100% are non-evidence** — 34,457 session/UI
    metadata (`last-prompt`/`permission-mode`/`custom-title`/`agent-name`/`bridge-session`/
    `ai-title`/`mode`; no file bytes) + 4,633 `file-history-snapshot` (NOT truly timestampless —
    time nested at `.snapshot.timestamp`, 0 missing it, already consumed by `snapshot-events.js:25`).
    **Content records carry a timestamp 100% of the time** (assistant 46,117 incl. 27,631 `tool_use`;
    user 32,615 incl. 27,553 `tool_result`; 0 missing). The 10 emission `if (!iso) return null` sites
    therefore fire **0** times on content; a scoped honest counter reads a constant 0, and a naive
    one reports a misleading 20%. No production code added; all four gates GREEN by construction,
    `develop-baseline` unchanged at `880b69d`. **Reopen** only if a transcript appears with a
    content-bearing `tool_use`/`tool_result` (or snapshot) lacking a usable timestamp (e.g. a future
    transcript-format change relocating it). The recovery tool for THEN — carry-forward inference
    (nearest preceding line's timestamp as a **Tier-2-only, windowed lower bound**, never a beacon) —
    is a separate correctness-bearing item, not item 7. See
    `plans/implementation-notes-item7-timestampless-survey.md`.

- [x] **8. MultiEdit-style records** (array-shaped `toolUseResult`) — verify any exist in
  the recovery set, then handle in `extractEditsFromJSONL`.
  - ✅ DONE 2026-06-17 (defensive; **dormant on all known data**). Existence survey first
    (read-only): **0** MultiEdit / `toolUseResult.edits` / edits-array records across 3 corpora —
    frozen fixture + `jot-recovery/claude-data` + live `~/.claude/projects` (3,716 transcripts /
    746,227 records; the literal `"edits"` substring appears **0×**). Implemented defensively anyway
    to close the dormant drop. **Design:** when `toolUseResult` is an **array** (the MCP content-block
    shape), iterate its elements and extract each usable element via a null-safe type gate —
    `getNonReadType` → `isUsableNonReadReconstructionType` (whitelist: create/update/edit) →
    `extractNonReadEditsFromArrayToolUseResult` → `buildEditFromToolUseResult` per kept element
    (`api/edit-stream-extraction.js`, 197→244 L, under the 250 cap). **Reads are excluded by design**
    (the `NonRead` qualifier): a read needs cross-record `tool_use`/`tool_result` pairing
    (`file-event-observations.js`), which a lone array element cannot supply; reads already run via
    `mergeExternalEdits → appendFilteredReadEdits`. **Scope reconciliation:** this handles the
    **array-shaped** `toolUseResult`; the roadmap's original "`toolUseResult.edits` array" phrase
    described a different OBJECT-with-`edits`-field shape (historical MultiEdit Output) that occurs
    **0×** and is NOT covered (a symmetric `Array.isArray(tr.edits)` branch could be added later).
    **Probe-safe:** every existing array element is `{type:"text"|"image"}` → gate false → nothing
    extracted → `extractEditsFromJSONL` byte-identical → **probe A/B `identical: true` → NO
    re-baseline**, `develop-baseline` unchanged at `880b69d`. **Gates GREEN:** full suite 59 suites /
    601 passed / 0 failed (+14 unit +1 integration; the unit tests live in the sibling
    `tests/test-array-tool-use-result.js` to keep both test files under the 250-line cap),
    detect-rewinds 15/0, plate_summary.py 247/247 matchedObserved 0 mismatched conflicts 233. The
    +15 tests (14 unit + 1 integration) are grouped together in the new `tests/test-array-tool-use-result.js`
    (123 L) so each test file stays well under the 250-line cap (`test-edit-stream-extraction.js` 204 L).
    **Reopen/validate** only when the first real edit-bearing array element appears: confirm
    `getNonReadType`'s mapping against it (and add `'read'` to the whitelist ONLY if a future
    *self-contained* read element carrying its own `filePath`+`content` ever appears). See
    `plans/implementation-notes-item8-multiedit.md`.

- [x] **18. First-class user-edit tracking via `userModified`**
  - **Intent:** Claude Code stamps `toolUseResult.userModified: true` on an Edit/Write
    when an external actor (user in the IDE, a formatter, a hook) changed the file around
    the edit — a DIRECT signal that belief may have diverged from disk, and the upstream
    cause of item 11's `floatingOverKnownRegion` symptom. Consuming it lets the sidecar
    mark out-of-band edits as a first-class signal instead of only inferring them from the
    `originalFile` gap.
  - **Now:** `userModified` is DROPPED at extraction — `buildReplaceEdit` /
    `buildCreateOrUpdateEdit` (`api/edit-stream-extraction.js:45-57`) do not carry it; 0
    consumers in `api/`/`tools/`. The sidecar re-syncs belief only via the item-1
    `originalFile` overlay. A PARALLEL (non-sidecar) pipeline already infers user edits
    heuristically — `api/file-state-history.js` `isUserEditGap`/`buildUserEditStep`
    (`originalFile !== previousContents` → synthetic `isUserEdit` step) — vocabulary to
    align with, NOT code to reuse (the sidecar is independent by design; no forwarding).
  - **Gap:** the same record's `originalFile` is PRE-edit, so it cannot capture a
    POST-edit external change; that case leaves post-edit belief stale with no signal.
    `userModified` is the only explicit marker of it.
  - **DORMANT — defensive build (item-8 class):** `userModified:true` occurs **0× across
    6,065 records** (frozen fixture + live `~/.claude/projects` + plate data). Build
    defensively with synthetic tests only; e2e stays 247/247 conflicts=233; probe
    byte-identical.
  - **Semantics UNCONFIRMED — validate on first real occurrence.** Docs unreachable; no
    positive examples. Open question: does `true` mean a PRE-edit change (already recovered
    by `originalFile`) or a POST-edit change (recorded `newString`/patch no longer matches
    disk)? **Reopen trigger:** when the first `userModified:true` record appears, check
    whether its `newString` matches the NEXT observation's `originalFile`/read to settle
    pre- vs post-edit timing BEFORE finalizing tracker behavior.
  - **Home/approach:** (1) surface `userModified` on the edit object
    (`api/edit-stream-extraction.js`, one field, mirror `originalFile`); (2) emit it in the
    sidecar by mirroring `buildOriginalFileEvent` (`api/file-events-extractors.js`) with a
    new `buildUserModifiedEvent` gated on `edit.userModified === true`; (3) tracker
    behavior — pick at item-18 planning, informed by the THEN-confirmed semantics: (a)
    diagnostic record into `conflicts[]` only, no belief mutation — symmetric with item
    11's floating record, the conservative default; (b) + conservative drift (un-prove EOF
    / numbering uncertain from that point); or (c) surface + annotate only. 250-cap: new
    sibling modules as needed.
  - **Deps/gate:** related to item 1 (`originalFile`) and item 11 (the floating conflict is
    the downstream symptom). **Tracker-only** → probe byte-identical; e2e conflicts=233
    unchanged (dormant).
  - ✅ DONE 2026-06-17 (sidecar-only; **dormant on all known data** — built defensively, item-8/11
    class). New CONTENTLESS `userModified` event kind: one diagnostic conflict record + conservative
    EOF drift when `toolUseResult.userModified === true`. **Two forks decided WITH THE USER at
    planning (NOT re-litigated):** tracker behavior = **option (b) record + un-prove EOF** (not (a)
    record-only); emission scope = **ALL edit kinds** gated on the FLAG (not `type==='edit'` like
    originalFile). **Capture:** net-zero `userModified: tr.userModified || false` on `buildReplaceEdit`
    + `buildCreateOrUpdateEdit` (`api/edit-stream-extraction.js`, held at 250). **Register:**
    `'userModified'` in `KIND_NAMES` (`api/file-event-kinds.js`) — **zero golden ripple** (no test
    deep-equals a full event). **Emit:** NEW `api/user-modified-events.js` (`buildUserModifiedEvent`
    + `userModifiedEventsFromEdits` + local `timestampAt`, 52 L), wired net-zero via `.concat(...)` on
    the originalFile push (`file-events-extractors.js`, held at 250). **Materialize:**
    `materializeUserModified` (contentless — `{kind, observedText, ref}`, NO `byLine`; ref anchors at
    `newString` for edits, `content` for create/update) + 1 dispatch line (`line-state-evidence.js`,
    243). **Apply:** `unproveEof` added+exported (`line-belief.js`, 246); `buildUserModifiedConflictInfo`
    + a dispatch branch BEFORE the whole-file fallthrough (`apply-one-event.js`, 166) — the fallthrough
    would crash on a contentless event. **Record:** `appendConflictRecords` generalized to a truthy-`kind`
    check (`track-line-states.js`, 185), reusing `buildFloatingConflictRecord` (item-11 floating still
    routes identically). **Ordering (load-bearing):** `userModified` stays the rank-2 `kindRank`
    fallthrough (NO case) so the drift applies to POST-edit belief (originalFile 0 → edit 1 →
    userModified 2). **Semantics still UNCONFIRMED** (pre- vs post-edit) — reopen trigger recorded in
    notes: on the first real `userModified:true`, check whether its `newString` matches the NEXT
    observation's `originalFile`/read. **Gates GREEN:** full suite **71 suites / 705 passed / 0 failed**
    (+2 suites, +15 tests); detect-rewinds 15/15; `plate_summary.py` **247/247 matchedObserved, 0
    mismatched, conflicts=8** (UNCHANGED — the dormancy proof; the brief's "233" is stale pre-item-12);
    **probe A/B `identical: true` → NO re-baseline**, `develop-baseline` unchanged at `a8947fc`. All
    touched files ≤250; T6 tracker tests live in NEW sibling `tests/test-track-line-states-usermodified.js`
    (verdict file would breach cap + trip the 2-space deep-nesting hook). See
    `plans/implementation-notes-item18-usermodified.md`. **§A is now fully closed (items 1–18 + 10a).**

---

## §B — Tracker gaps
Implemented conservatively; may matter at scale. Each item below is a planning brief —
**Intent** (what it buys toward correct change-history reconstruction), **Now** (current
behavior with `api/` file:line refs), **Gap**, **Home/approach** (where the fix lives + the
250-cap note), **Deps/gate**. Re-baseline test for every item: the probe NEVER calls the
event-emission pipeline, so ONLY a `collectTouches`/discovery change can move probe output —
everything else stays byte-identical. **Suggested order: 13 → 10a → 9 → 11 → 12 → 10**
(unblocking value, then cost, then the heavy temporal-window rework last).

- [x] **9. replaceAll splice across ALL runs** — an Edit with `replaceAll:true` mutates EVERY
  occurrence of `old_string`; splice every known run, float below an unknown gap.
  - ✅ DONE 2026-06-17 (tracker-only; **dormant on plate_summary.py**). The `replaceAll:true` path now
    splices **every** known run containing `old_string` (was: the first run only) and floats below an
    unknown gap that could still hide an occurrence; `replaceAll:false` is byte-identical. **Design:** new
    internal `locateAllRunsContaining` + `applyReplaceAllToBelief` in `api/edit-splice.js` (135→173 L,
    under the 250 cap); `applyEditToBelief` branches on `splice.replaceAll`. Reuses `applyLocatedSplice` /
    `rebuildEntriesForSplice` / `firstGapLine` / `applyFloating` unchanged. **Descending-`startLine` splice
    is mandatory** (adversarially validated): capture all targets from one `knownRuns` call, splice bottom
    run first so each splice only shifts lines below it — higher runs keep their captured coordinates
    without re-deriving runs. `gapLine` is read AFTER the loop (splices above a gap shift its line);
    `targets.length===0` reproduces the legacy unlocatable return exactly. **Behavioral change:** a located
    `replaceAll` over a belief WITH an open gap now returns `floating:true` (was `false`) — strictly more
    conservative. **Documented limitation (no code):** two runs split by a *missing* interior key (not an
    `unknown` entry) with `eofConfirmed===true` would make `firstGapLine` return null and wrongly report
    non-floating — unreachable for real inputs. **Probe-safe:** `edit-splice.js`'s sole caller is
    `api/apply-one-event.js` (sidecar); the probe replays via `api/edit-replay.js` and never calls splice →
    **probe A/B `identical: true` → NO re-baseline**, `develop-baseline` unchanged at `880b69d`. **Gates
    GREEN:** full suite 59 suites / 607 passed / 0 failed (+6 unit), detect-rewinds 15/0, plate_summary.py
    247/247 matchedObserved 0 mismatched conflicts 233 (**UNCHANGED** — the change is dormant on this
    fixture, so no delta needed sign-off). Both `edit-splice.js` (173 L) and `test-edit-splice.js` (220 L)
    under the 250-line cap. See `plans/implementation-notes-item9-replaceall.md`.

- [x] **10. Time-aware alias windows for mid-timeline renames**
  - **Intent:** `cp src dst` makes `dst` a copy of `src` at ONE instant; afterward they diverge.
    The tracker aliases them to one identity, so without a time bound `src` edits AFTER the copy
    bleed into `dst`'s belief (and vice-versa), corrupting both. Windows make alias membership
    valid only over the interval the two paths genuinely share content.
  - **Now:** alias set is STATIC for the whole timeline. `api/file-historical-lineage.js`
    `buildLineageGraph` (:166) adds a directed `dst→src` edge for cp (:170), undirected for
    mv/git-mv; `resolveAliases` (:191) BFS-closes to a timestamp-free `Set`; `editBelongsToFile`
    (:227) is pure set-membership, no time. CLI `tools/track-line-states.js` `resolveAliasPaths`
    (:31) feeds one `aliasPaths` array into the entire run. cp edge from
    `api/extract-bash-file-ops.js` (:33). Item-2's cp spike confirmed the capability already works
    (`RED_GREEN_TDD.md` 164 obs / 0 neverObserved); the ONLY residuals are this temporal cut + 10a.
  - **Gap:** once `dst→src` is in the closure, every `src` event matches `dst` for ALL time (the
    item-2 spike's 1/3 mismatches + 11/35 conflicts).
  - **Home/approach:** ops/touches already carry timestamps (`stampTouchTimestamps`,
    `file-historical-lineage.js:114`; `buildLineageOp` carries `line`). Make edges carry the op
    time and membership time-parameterized (cp: `src` aliases `dst` only at/before the copy
    instant). `file-historical-lineage.js` is AT the 245-line cap → **new sibling
    `api/alias-windows.js`** for the time-aware closure + membership; flat helpers stay for callers
    wanting the union.
  - **Deps/gate:** land 10a first. Largest/riskiest §B item. **Temporal cut = tracker-only**
    (changes attribution, not which transcripts are scanned).
  - ✅ DONE 2026-06-17 (sidecar-only). NEW `api/alias-windows.js` — windowed-BFS closure
    `resolveAliasWindows([target], stampedOps)` → `Map<absPath, latestValidMs>`, plus
    `aliasPathValidAt` + pure `filterEventsByAliasWindows`. cp ops now carry the copy instant
    (`stampTouchTimestamps(ops, parsed)` in `collectTouches`, +1 line). **Annotate-then-filter**
    (NOT per-emitter gates, which would breach the cap): every event gets an additive `aliasPath`
    at its emitter's existing membership site (10 sites — authored/originalFile/cat/read in
    `file-events-extractors.js` 239→247, + patchContext/bashOp[rm+redirect]/bashRead/grep/snapshot),
    and ONE filter runs in the CLI → `editBelongsToFile` + all emitter control flow stay
    byte-identical. Upper-bound only (`Infinity`=never cut); cp→directed `dst→src` cut at the copy
    instant; mv/git-mv→undirected no cut; tightest(min) wins on rediscovery; seed never relaxed;
    null/unparseable copy-instant → `Infinity` (A1: never NaN-drop the destination); snapshot
    annotates the FULL alias path that suffix-matched (not the repo-relative key). CLI wiring
    (`tools/track-line-states.js` 117→127): build windows from `gatherAllOps`, apply the filter
    before `trackLineStates`. **Probe never calls any of this → probe A/B `identical: true`, NO
    re-baseline**, `develop-baseline` unchanged at `880b69d`. **Gates GREEN:** full suite 61 suites
    / 619 passed / 0 failed (+12 tests, +2 suites); detect-rewinds 15/0; plate_summary.py 247/247
    matchedObserved 0 mismatched conflicts 233 (UNCHANGED — no cp alias → seed-only windows). **Payoff**
    (baseline `880b69d` vs windowed on IDENTICAL current data, not the stale 2026-06-15 spike):
    `jot/RED_GREEN_TDD.md` conflicts **11→0** (3 post-copy `python-migration` src edits cut; 1 residual
    mismatch = documented lower-bound limit); `handoff-prompt/SKILL.md` byte-identical to baseline
    (single pre-copy src event → nothing to cut; the spike's `mismatched:3` was on-disk reference
    drift, NOT a regression — confirmed by running `develop-baseline` on current data). All files
    ≤250. See `plans/implementation-notes-item10-alias-windows.md`.
  - [x] **10a. Precise-cp: seed transcript discovery from the alias closure, not just `[target]`.**
    - **Intent/Now:** `tools/track-line-states.js` discovery is seeded by the DESTINATION only —
      `discoverJsonls` (:42) → `findReferencingJsonlsIncludingSubagents([target], …)`; the resolved
      closure (`resolveAliasPaths`, :95) is computed but used ONLY for event matching, not as the
      discovery seed. A transcript touching ONLY the cp `src` is reachable in the graph yet not
      guaranteed found if the two closures ever diverge (e.g. once item 10 makes `resolveAliasPaths`
      time-aware while `findReferencingJsonls`'s internal closure is not).
    - **Approach:** compute aliases before discovery and pass the resolved closure as the
      `discoverJsonls` seed (reorder `tools/track-line-states.js:94-95`). Trivial; no new module.
    - **Gate:** **changes CLI discovery** → verify probe A/B on the frozen fixture. The probe
      (`tools/probe-projects-v2.js:178`) already seeds from `aliasPaths`, so its baseline may be
      unaffected — re-baseline only if a target's `transcriptsUsed` shifts.
    - ✅ DONE 2026-06-17 (folded into item 10, user-chosen). `tools/track-line-states.js` resolves
      the alias windows BEFORE discovery and seeds `discoverJsonls` from the closure key-set
      (`findReferencingJsonlsIncludingSubagents(aliasPaths, …)`, was `[target]`), so a src-only
      transcript is scanned. CLI-discovery change only; the probe already seeds from `aliasPaths`
      → probe A/B `identical: true`, no `transcriptsUsed` shift, no re-baseline.

- [x] **11. `floatingOverKnownRegion` conflict record**
  - **Intent:** when an Edit's `old_string` is in NO known run AND there is no gap to hide in
    (belief fully known, EOF proved), the edit provably contradicts belief — surface it as a
    conflict instead of silently degrading numbering.
  - **Now:** flag set at `api/edit-splice.js:130` (`floatingOverKnownRegion: gapLine === null`),
    unit-tested (`tests/test-edit-splice.js:77-88`), but `applyEditEvent`
    (`api/apply-one-event.js:26`) reads only `result.floating` and returns `[]` — the flag is
    discarded; nothing reaches `appendConflictRecords` (`api/track-line-states.js:105`).
  - **Gap/home:** have `applyEditEvent` return a conflict-info when `floatingOverKnownRegion` is
    true. Semantics differ from a per-line conflict (the whole region is suspect, no single
    displaced line) → the `{line,presumedText,…}` info shape (`api/line-belief.js:53`) or
    `buildConflictRecord` (`track-line-states.js:67`) may need a variant. Both files have room.
  - **Deps/gate:** shares the floating flag with item 9 (which can newly reach this branch).
    **Tracker-only.** **STILL DEFER:** never fires on real data — the synthetic unit test is the
    only trigger; e2e holds 233 conflicts with this branch returning `[]`. Build only when real
    data triggers it.
  - ✅ DONE 2026-06-17 (tracker-only; **dormant on all known data** — built defensively, item-8
    class). `applyEditEvent` (`api/apply-one-event.js`) no longer discards
    `floatingOverKnownRegion`: a new module-private `buildFloatingConflictInfo` returns a
    `kind:'floatingOverKnownRegion'` info (`line`/`presumed` null — no single displaced line;
    `observedText`=`oldString` proven-absent; `observedRef`=`refForAuthoredEditLine(event, newString)`
    — newString is the locatable authored proof, never null). **Record shape = Option B**: a
    dedicated `buildFloatingConflictRecord` in `api/track-line-states.js` + a discriminated branch
    in `appendConflictRecords` (existing per-line infos carry no `kind` → unchanged branch), so
    `buildConflictRecord`'s per-line-displacement semantics stay honest. The variant carries every
    field the CLI `printConflicts` reads (`timestampOfContradictingRecord`, `excerpt` via
    `makeExcerpt` which tolerates null, `window`). NO change to `edit-splice.js` (already sets the
    flag at `:147`/`:168` since item 9), `line-belief.js`, `line-state-evidence.js`, or the CLI.
    Strict red-green: 2 new tests in `tests/test-track-line-states-verdict.js` (RED `0 ≠ 1` first) —
    a full-belief float emits one record; a float into an unknown GAP emits none. **Probe never
    reads `conflicts[]` → probe A/B `identical: true`, NO re-baseline**, `develop-baseline`
    unchanged at `880b69d`. **Gates GREEN:** full suite 61 suites / 621 passed / 0 failed (+2);
    detect-rewinds 15/0; plate_summary.py 247/247 matchedObserved 0 mismatched conflicts 233
    (**UNCHANGED — the dormancy proof**). All edited files ≤250 (apply-one-event 143,
    track-line-states 178, verdict test 136). New code = global 4-space written as flat-assignment
    islands (multi-line 4-space object literals trip the 2-space-unit deep-nesting hook). See
    `plans/implementation-notes-item11-floating-conflict-record.md`.

- [x] **12. Collapse conflict cascades**
  - **Intent:** one real insertion IS tracked correctly, but a later snapshot/overlay still on the
    pre-insertion numbering disagrees on every line at/below the insert — N conflict records for
    one logical event. Collapse into "insertion of K lines at line L" so reports are legible
    (belief stays correct; this is cosmetic on the diagnostic conflicts list).
  - **Now:** `api/line-belief.js` `conflictAgainstExisting` (:53) emits one info per disagreeing
    line (via `overlayLine`/`applyOverlayLines`, `applySnapshotVerify`, `applyAbsenceObservation`);
    `api/track-line-states.js` `appendConflictRecords` (:105) → `buildConflictRecord` (:67) wraps
    EACH into its own windowed record. Item-4 named this: `plate_cli.py` 0→34 from one untracked
    insertion (`plans/implementation-notes-item4-bash-reads.md:36-37`).
  - **Home/approach:** a REPORTING-time post-process of the `conflicts` array (detect a run of
    consecutive lines whose text shifts by a constant offset — an LCS/diff alignment — and replace
    the cluster with one synthetic record). **New sibling `api/conflict-cascade-collapse.js`**,
    called from `trackLineStates` before it returns (or the CLI `printConflicts`,
    `tools/track-line-states.js:65`). MUST NOT mutate belief or the per-line verdict (item 15 needs
    raw per-line stats).
  - **Deps/gate:** pure reporting; independent of 9/10/11/13. **Report-only** → probe
    byte-identical, but the e2e `conflicts:233` number changes BY DESIGN → re-baseline that one
    assertion as an intentional report change.
  - ✅ DONE 2026-06-17 (report-only; sidecar-only). NEW `api/conflict-cascade-collapse.js` (225 L,
    4-space, pure) — `collapseConflictCascades(conflicts)` partitions per-line vs pass-through
    (item-11 floating `line:null`, via `isPerLineConflict`), groups per-line by
    `(timestampOfContradictingRecord, window.fromBeaconMs, window.toBeaconMs)`, splits into
    consecutive-line runs, and replaces each constant-offset SHIFT run (criterion `2*ctxCount >=
    run.length`, run≥2, via REUSED `api/line-diff.js` `lineDiff`) with ONE `kind:'collapsedCascade'`
    record (span, count, signed `shiftOffset`, `memberLines` — no data lost). Wired in 3 in-place
    edits (2-space): require + `conflicts: cascadeCollapse.collapseConflictCascades(conflicts)` in
    `api/track-line-states.js`; one `collapsedCascade` branch in `tools/track-line-states.js`
    `printConflicts` (`describeCollapsedConflict`). Belief + per-line verdict UNTOUCHED (item 15
    safe — `perLineStats` is independent of the conflicts array). `rm` total-deletion cascades (all
    `observedText:null` → `ctxCount 0`) stay per-line BY DESIGN (out of scope). **Probe-safe**
    (probe never calls `trackLineStates`) → probe A/B `identical: true`, NO probe re-baseline,
    `develop-baseline` unchanged at `880b69d`. **Gates GREEN:** full suite **62 suites / 635 passed
    / 0 failed** (+13 unit in NEW `tests/test-conflict-cascade-collapse.js` + 1 integration in
    `tests/test-track-line-states-verdict.js`); detect-rewinds 15/0; **`plate_summary.py` 247/247
    matchedObserved, 0 mismatched (UNCHANGED), conflicts 233 → 8** (all 8 collapsedCascade; member
    lineCounts sum to 233 — lossless; user-signed-off re-baseline). All files ≤250. See
    `plans/implementation-notes-item12-collapse-conflict-cascades.md`.

- [x] **13. Git rung on the reference ladder**
  - **Intent:** the final verdict scores end-state belief against the best available reference.
    Files deleted/moved since the session (list2's NOT_FOUND class) have neither an on-disk copy
    nor a snapshot, but the content may live in git. The git rung lets them be scored at all —
    **this unblocks item 16.**
  - **Now:** `tools/track-line-states.js` `chooseReference` (:58-63) is on-disk → snapshot → none;
    its header (:56-57) explicitly states the git rung is unbuilt. The verdict side ALREADY accepts
    it — `api/final-line-verdict.js:44-45` documents `via: 'on-disk'|'snapshot'|'git'|'none'`.
  - **Home/approach:** insert a git rung after snapshot in `chooseReference` (the rung lives in the
    CLI by design). `resolveGitContent` is ready at `api/git-file-state.js:41`; mirror the proven
    `api/replay-verification.js` `tryGitFallback` (:186) / `verifyMissingFile` (:197) pattern (build
    `gitOpts`: `resolveRepoRootWalkingUp` (`git-file-state.js:88`) + branch from session metadata +
    `buildFilePathMap`); consider `resolveGitContentMultiRef`
    (`api/reconstruction-reference-sources.js:157`) for ref robustness. **The probe already has this
    ladder** (`gatherGitSource`, `reconstruction-reference-sources.js:183`) — item 13 PORTS it into
    the sidecar CLI. CLI is 117L (room); a tiny `api/reference-ladder.js` sibling if it overflows.
  - **Deps/gate:** **item 16 depends on this.** Independent of 9/11/12. **Tracker/reference-only** →
    probe byte-identical (only `chooseReference`'s `via`/`content` for previously-`none` files
    changes; the probe has its own git fallback already).
  - ✅ DONE 2026-06-17 (sidecar CLI reference-only; **payoff confirmed on list2**). NEW pure module
    `api/reference-ladder.js` (60 L, 4-space) — `resolveGitReference(target, aliasPaths, transcriptTexts)`
    ports the probe's `gatherGitSource` (`reconstruction-reference-sources.js:165`) but builds its
    `filePathMap` from the alias closure (`[target].concat(aliasPaths)`) rather than per-transcript edits;
    reuses `resolveRepoRootWalkingUp`/`buildMultiRefs`/`resolveGitContentMultiRef` (`git-file-state.js`),
    scanning transcripts most-recent-LAST. The CLI `tools/track-line-states.js` (127→147 L, in-place
    2-space) inserts the git rung **between snapshot and none** in `chooseReference`, guarded `gitContent
    !== null` (NOT truthiness — a git-tracked EMPTY file `''` is a valid reference, never collapsed to
    `via:'none'`); `main()` reads each transcript to text in the existing `jsonls` loop (no extra read
    pass) and passes them down; `chooseReference` is exported for unit testing (CLI behavior unchanged —
    `main()` stays behind `require.main === module`). Strict red-green: 8 unit tests in NEW
    `tests/test-reference-ladder.js` (RED `MODULE_NOT_FOUND` → stub `'COMMITTED\n' !== null` → GREEN, then
    each behavior locked: guards, alias-basename loop, transcript fallback direction, empty-string
    contract, HEAD fallback, no-repo guard) + 5 CLI ordering tests in NEW
    `tests/test-track-line-states-reference.js` (on-disk > snapshot > git > none; empty-string accepted as
    `via:'git'`). **Probe never calls the CLI's `chooseReference` (it has its own `gatherGitSource` in a
    different module) → probe A/B `identical: true`, NO re-baseline**, `develop-baseline` unchanged at
    `880b69d`. **Gates GREEN:** full suite **64 suites / 648 passed / 0 failed** (+13 tests, +2 suites);
    detect-rewinds 15/0; `plate_summary.py` **247/247 matchedObserved, 0 mismatched, conflicts=8**
    (UNCHANGED — reference-only; plate is on-disk so the git rung is dormant there). **Payoff
    (before/after on the frozen fixture, list2 off-disk file
    `jot/skills/debate/scripts/debate-orchestrator.sh`):** `develop-baseline` CLI → `comparedVia=none`,
    empty verdict (scored against nothing); item-13 CLI → `comparedVia=git`, `{matchedObserved:23,
    mismatched:1}` — the file is now SCORED. **This unblocks item 16.** Test-only robustness:
    `makeRepo` canonicalizes the temp path with `fs.realpathSync` (macOS `/var`→`/private/var`; real
    sessions already share a canonical prefix, so the module needs no change). All files ≤250. See
    `plans/implementation-notes-item13-git-rung-reference-ladder.md`.

---

## §C — Residual investigation + promotion
**Load-bearing chain: 13 → 16 → 15.** Item 13 (git rung) gives list2's NOT_FOUND files a
reference; item 16 runs the sidecar over list2 to produce per-line verdicts; item 15 consumes
them to upgrade statuses. **Bypass:** the 160 on-disk MISMATCH files (54 list1 + 106 list2)
already have a reference, so 16 and 15 can run on THOSE without item 13. Item 14 is the most
independent of the group.

- [x] **14. Trailing-extent mismatch class** (belief claims one final blank line beyond ref EOF, recon='')
  - **Intent:** two MISMATCH files differ from their reference by exactly one phantom trailing `''`
    line. Decide per file: a REAL historical blank line (belief right, reference lost it) vs a
    SYSTEMATIC extractor artifact; if artifact, fix the extractor and both go end-state perfect.
  - **Now:** the verdict loop runs to `Math.max(referenceLines.length, belief.lastLine)`
    (`api/final-line-verdict.js:buildFinalVerdict:55`); a claim one past the reference buckets
    `mismatched` (`compareLine:33-34`). Two materialization paths differ on trailing-newline:
    **whole-file overlays** (`splitContentLines`, `api/line-state-evidence.js:23`) POP a single
    terminating `\n` → no phantom unless the source genuinely ends in a blank line.
    **Numbered/sparse overlays** (`numberedLineEntries`, :57-72; cat/grep/bash-read materializers)
    take the line number from a `N\t`/`N:`/hunk prefix — a numbered-empty trailing line (`"N\t"`)
    pins line N=`''`: **the artifact vector.** `bashExtent` (`wc -l`) CANNOT cause it (its implied
    lines are `text:null` → bucketed `neverObserved`, not `mismatched`).
  - **Decide/home:** dereference `verdict.mismatchedLines[].evidence`
    (`final-line-verdict.js:buildMismatchRecord:14-24`) via `loadParsedRecord` + the locator's
    property path (`api/evidence-record-access.js`) to see whether the JSONL truly carried a
    numbered-empty trailing line (real) or the extractor fabricated it (artifact). If artifact, fix
    the named materializer — `numberedEntries`/`numberedLineEntries` (`line-state-evidence.js`, AT
    cap → sibling) or `bash-read-evidence.js` / `grep-tool-evidence.js` (room).
  - **Deps/gate:** **most independent of 14–17;** no dep on 13/15/16/17. **Tracker-only** → probe
    byte-identical; gate is plate_summary.py + the two files going per-line-perfect.
  - ✅ DONE 2026-06-17 (sidecar materializer-only; **payoff confirmed on both target files**).
    Root cause SETTLED as a SYSTEMATIC EXTRACTOR ARTIFACT (proven by dereferencing each file's
    `mismatchedLines[0].evidence` → the raw JSONL literally ends in `"85\t"`/`"498\t"`, empty content,
    zero-length span at `endIndex === rawText.length`; a control found the phantom on 32/65 numbered
    Read results — universal for any file ending in a single `\n`). NEW pure module
    `api/numbered-entries.js` (59 L, 4-space, flat single-condition early-returns) — `buildNumberedEntry`
    + `numberedEntries` MOVED verbatim from `line-state-evidence.js:46-67` (freeing the at-cap host file
    249→227 L), plus the fix `dropTrailingReadPhantom(entries, rawText)`: drops ONLY the terminal Read
    phantom under four single-condition guards (predecessor exists; last entry empty; `endIndex ===
    rawText.length` i.e. NO trailing newline after it; line number = predecessor + 1). **Read-path-only**
    by design — `numberedLineEntries` applies the drop; `catLineEntries` calls the sibling generic
    WITHOUT it (cat -n emits a trailing numbered-empty line only for a GENUINE blank line; dedicated
    asymmetry test `test_catLineEntries_keepsGenuineTrailingEmptyNumberedLine`). `final-line-verdict.js`
    + `line-belief.js` UNTOUCHED — once `numberedLineEntries` returns one fewer entry, `finishWholeOverlay`
    re-pins `belief.lastLine` to the real EOF and the verdict's `Math.max` loop bound stops emitting the
    extra line; the fix propagates automatically. Strict red-green: NEW `tests/test-numbered-entries.js`
    (driver + guards a–f drove the precise guards: a first-cut "drop any last empty" went RED on the
    `endIndex`/`length<2`/contiguity guard tests; +2 wrapper-integration tests). **Probe-safe** (the
    probe's reconstruction path never references `numberedLineEntries`/`line-state-evidence`) → probe A/B
    `identical: true`, NO re-baseline, `develop-baseline` unchanged at `880b69d`. **Payoff:** File A
    (`…handoff-recovery-20260519-1250.md`) `mismatched` **1 → 0** (matchedObserved 84 unchanged); File B
    (`…diff_sequence_codex.py`) `mismatched` **1 → 0** (matchedObserved 80 / matchedPresumed 417
    unchanged; its genuine interior blanks lines 494/495 survive). **Gates GREEN:** full suite **65
    suites / 657 passed / 0 failed** (+9 tests, +1 suite); detect-rewinds 15/15; `plate_summary.py`
    247/247 matchedObserved, 0 mismatched, conflicts = 8 (UNCHANGED — plate's last event is a snapshot
    beacon, not a raw Read, so the phantom never reached its verdict). All files ≤250
    (`line-state-evidence.js` 227, `numbered-entries.js` 59, `test-numbered-entries.js` 84). See
    `plans/implementation-notes-item14-trailing-extent.md`.

- [x] **15. Promote per-line verdict into probe verdict logic** (new PASS-PER-LINE status)
  - **Intent:** a file the probe calls MISMATCH (byte-inequality) but whose sidecar
    `finalVerdict.perLineStats.mismatched === 0` is per-line-perfect — upgrade MISMATCH → a NEW
    status. **Discuss the name with the user FIRST** (proposal `PASS-PER-LINE`); MUST NOT be
    silently merged with PASS.
  - **Now:** status is set in `api/reconstruction-reference-sources.js:chooseReferenceSource:75`
    (`match ? 'PASS' : usedSource ? 'MISMATCH' : 'NOT_FOUND'`; PASS = byte-equality), threaded via
    `probeOneFileIdentity` (`tools/probe-projects-v2.js:187`) → `buildFileRecord`
    (`tools/probe-v2-report.js:21,30`); counts in `countByStatus` (`tools/probe-v2-shared.js:77-84`).
    **The probe does NOT invoke the sidecar** (0 references). The engine `api/track-line-states.js`
    `trackLineStates(events, options)` is a pure, importable lib (the `tools/` CLI is just a driver).
  - **Home/approach:** after a MISMATCH in `probeOneFileIdentity`, `extractFileEvents`
    (`api/file-events-extractors.js`) for the record's `transcriptsUsed` × `aliasPaths`, call
    `trackLineStates(events, {reference:{via, content}})` reusing the SAME reference the probe
    compared, and upgrade when `perLineStats.mismatched === 0`. `tools/probe-projects-v2.js` is AT
    289L (cap) → put the promotion in a **new sibling** (`api/promote-per-line-status.js` pure fn);
    add the new status literal to `countByStatus` + `summary` so it is not folded into PASS.
  - **Deps/gate:** **consumer of items 13 + 16.** The 160 on-disk MISMATCH files (54 list1 + 106
    list2, all comparing via on-disk) already have a reference → item 15 runs on those WITHOUT item
    13. **Probe-side but ADDITIVE** (only upgrades a status; reconstruction bytes unchanged) → a
    characterizable status/summary diff, not a reconstruction re-baseline.
  - ✅ DONE 2026-06-17 (probe-side, ADDITIVE; **payoff confirmed — 98 files promoted**). After the probe
    assigns MISMATCH, it re-scores the file per-line via the real sidecar engine against the SAME
    reference and upgrades to **`PASS_PER_LINE`** when the verdict is per-line-perfect. NEW pure module
    `api/promote-per-line-status.js` (55 L, 4-space): `promotePerLineStatus` (guard `=== 'MISMATCH'`;
    `reference = {via: decision.comparedVia, content: decision.usedSource.content}`; `extractFileEvents`
    per `transcriptsUsed[].jsonl` × `aliasPaths` → `trackLineStates` → verdict), `verdictIsPerLinePerfect`
    (criterion **`mismatched === 0` AND `neverObserved === 0`** — stricter than the literal, rejects the
    empty/partial-belief vacuous pass), `gatherFileEventsAcrossTranscripts`. Counting/reporting:
    `countByStatus` +`PASS_PER_LINE:0` bucket, `computeActionablePassRate` counts it as a pass (Option A —
    numerator + denominator), `summarizeList` +1 field (`tools/probe-v2-shared.js`, `tools/probe-v2-report.js`).
    Wired live via a thin `maybePromotePerLine` adapter in `tools/probe-v2-assembly.js` + a **net-zero**
    wrap of `decision` in the `probe-projects-v2.js:206` return (289 L, AT cap — no growth, no new import;
    `assembly` already required at `:21`). `buildFileRecord`/`buildMismatchesSkeleton` UNCHANGED
    (`PASS_PER_LINE` files stay in findings, user choice). **Probe A/B diverges BY DESIGN, characterized
    record-by-record:** every change is exactly `MISMATCH → PASS_PER_LINE` (list1 **54→12**, +42;
    list2 **106→50**, +56 — **98 of 160 on-disk MISMATCH promoted**), **0 added/removed records, 0
    provenance diffs** (reconstruction bytes byte-identical, only `status` moved); `actionablePassRate`
    rises list1 **82.9→96.2**, list2 **60.9→73.8**; PASS/NOT_FOUND unchanged. User-signed-off re-baseline
    `develop-baseline` **`880b69d → a8947fc`** (temp-index source mirror; `develop` untracked tree
    untouched) → A/B `identical: true`. Rollback: `git update-ref refs/heads/develop-baseline 880b69d`.
    **Gates GREEN:** full suite **66 suites / 673 passed / 0 failed** (+1 suite `test-promote-per-line-status.js`,
    +16 tests across 4 files); detect-rewinds 15/15; `plate_summary.py` 247/247 matchedObserved, 0
    mismatched, conflicts=8 (UNCHANGED — item 15 touches no belief/conflict/verdict code). All
    new/edited files ≤250 (`probe-projects-v2.js` stays 289 via net-zero edit). See
    `plans/implementation-notes-item15-pass-per-line.md`.

- [x] **16. Run the sidecar over list2**
  - **Intent:** drive the sidecar across list2's MISMATCH + NOT_FOUND targets so item 15 can
    promote the per-line-perfect ones.
  - **Now (numbers drifted — re-read the frozen file):** `tools/probe-results-v2.json`
    `summary.list2` = 435 (PASS 265 / **MISMATCH 106 / NOT_FOUND 64**). list2 lives in
    `filesNotInProject`; each entry carries `aliasPaths`/`transcriptsUsed`/`referencePath`/
    `comparedVia`/`snapshotBlob`/`gitRef`. (The roadmap's original "103 + 68" is stale.) Drive via
    the `tools/track-line-states.js` flow reusing those fields → `extractFileEvents` →
    `trackLineStates(events, {reference})`.
  - **Gap:** the 64 NOT_FOUND files have NO on-disk and NO snapshot reference, so the sidecar CLI
    `chooseReference` (on-disk→snapshot→none, `tools/track-line-states.js:58`) returns `via:'none'`
    and the verdict early-returns empty (`final-line-verdict.js:53`). Blocked until the **item-13
    git rung.** The 106 MISMATCH files already have a reference → run immediately.
  - **Deps/gate:** **needs item 13** (NOT_FOUND set); **item 15** consumes the verdicts.
    **Tracker-only** (reads transcripts/references; no probe reconstruction change) → byte-identical.
  - ✅ DONE 2026-06-17 — **SURVEY → DEFER + reopen-gate tool** (mirrors items 6/7). The work split in two:
    (1) **MISMATCH half already shipped by item 15** — in-probe promotion drove the sidecar over list2's
    MISMATCH files (**106 → 50** `PASS_PER_LINE`, +56); nothing more to build. (2) **NOT_FOUND half is
    NOT buildable now** — the 64 NOT_FOUND files have no on-disk copy, no snapshot, and **0 of 64 are
    git-recoverable** (the item-15 handoff's "item 13's git rung scores them" claim is **false**: item
    13's rung is in the CLI, but the failure is upstream — no repo on this machine / never-committed —
    which no rung fixes). Live spike over all 64: `{noRepo:30, repoButNoRef:34, RECOVERABLE:0}`,
    `viable:false` → **NON-VIABLE**. Census: 14 foreign `/home/user/repo/*`, 11
    `~/.claude/plans`+`/root/.claude/plans` (not a repo), 6 `jot-worktrees/*`, 1 `jot-recovery/*`, 31
    `~/Programming/jot/*` gitignored (`.plate`/`Debates`/`Todos`), 1 other. NEW read-only reopen-gate
    `tools/spike-item16-list2-notfound-yield.js` (115 L, 4-space; `selectNotFoundList2` /
    `classifyNotFoundTarget` / `summarizeYield`; IO behind `require.main===module`; reuses
    `api/reference-ladder.js resolveGitReference` so it measures EXACTLY what the CLI rung recovers) +
    suite `tests/test-spike-item16-list2-notfound-yield.js` (6 tests — the RECOVERABLE test proves the
    gate CAN flip). **No production reconstruction/probe code added.** **Reopen trigger:** spike's
    `RECOVERABLE >= 1` (data fix — commit the gitignored `~/Programming/jot/*` artifacts, or re-collect
    the foreign `/home/user`+`/root` data on its source machine); then build the standalone batch driver.
    **Gates GREEN:** full suite **67 suites / 679 passed / 0 failed** (+1 suite, +6 tests vs going-in
    66/673 by the awk gate method); detect-rewinds 15/15; `plate_summary.py` 247/247 matchedObserved, 0
    mismatched, conflicts=8 (UNCHANGED); **probe A/B `identical: true`** vs `develop-baseline` `a8947fc` →
    **NO re-baseline**. All new files ≤250 (spike 115, test 148). See
    `plans/implementation-notes-item16-list2-notfound-survey.md`.

---

## §D — Consolidation (deferred from the migration)

- [x] **17. Unify the two read-event scanners**
  - **Intent:** one scan of Read `tool_use`/`tool_result` deriving BOTH output shapes, so the two
    scanners stop reading the same records twice into incompatible shapes (the "two
    representations" decision; the restructuring precondition is now met).
  - **Now:** **A — `extractReadEdits`** (`api/file-event-observations.js:217`) → whole-content
    `{line, filePath, file, type:'update', content, source:'read'}` records (prefixes stripped; NO
    chunk geometry). Two callers, DIFFERENT filtering: `api/edit-stream-extraction.js:146`
    (`appendFilteredReadEdits`, written-files-only → replay) and `api/file-historical-lineage.js:45`
    (`appendReadTouches`, unfiltered → DISCOVERY touches). **B — `extractReadEvents`**
    (`api/split-read-assembly.js:79`) → per-chunk
    `{filePath, firstLineNumber, contentLines, requestedLimit, timestamp, jsonlLine}`. One caller:
    `api/file-events-extractors.js:166` (`readEventsForFile` → readFull/readChunk kinds via
    `buildReadKindEvent`). `assembleSplitReads` (`split-read-assembly.js:151`) already stitches
    chunks→whole content but has NO production caller (only the `tools/assemble-split-reads.js` CLI
    + tests).
  - **Gap:** A lacks geometry (can't feed `buildReadKindEvent`); B lacks the `{type,content}`
    record (can't feed replay/touches); they also filter differently.
  - **Home/approach:** make B's richer chunk event the canonical output + a pure
    `chunkEventToEditRecord` derivation for A's shape (a one-event `assembleSplitReads` minus the
    multi-chunk stitching — absorb/repurpose it, don't keep a parallel path). **Repoint all three
    production callers** (no forwarding), the CLI, and the test suites; keep the two filter policies
    (written-files-only vs unfiltered) AT the call sites. Likely a **new sibling
    `api/read-event-scanner.js`** so neither host file overflows; the cat/snapshot extractors stay
    in `file-event-observations.js`. Item-5.6's notes pre-designate item 17 as ALSO the place to
    unify bash-read/grep timestampless-result handling
    (`plans/implementation-notes-item5.6-bashread-touches.md:26,105`).
  - **Deps/gate:** independent in intent (a parity refactor). **Mixed gate:** repointing
    `readEventsForFile` + `appendFilteredReadEdits` is tracker/replay-internal (byte-parity →
    byte-identical); but `appendReadTouches` feeds DISCOVERY → must hold touch output identical or
    re-baseline (same class as items 5/5.5/5.6). **Strict requirement: byte-identical scanner
    output across all three repointed callers.**
  - ✅ DONE 2026-06-17 (parity refactor; **byte-identical across all callers**). NEW canonical
    `api/read-event-scanner.js` (146 L, 4-space): `scanReadEvents(lines, parsed)` emits ONE superset
    record per Read pair (always, valid or not), and two pure derivations apply each legacy scanner's
    drop rule — `chunkEventToEditRecord` (A's whole-`strippedContent` edit shape, null when invalid)
    and `chunkEventToReadEvent` (B's chunk geometry, null when no tab-numbered line). Reuses the spine
    `scanToolUseResults` + `buildEditRecord` + `stripCatLineNumbers` (EXPORTED from
    `file-event-observations.js`, single home); MOVED `isValidReadContent`/`toolResultText`/
    `parseNumberedContent` into the scanner. **`isValidRead` gates on the RAW string** (`isValidStringRead`:
    non-string→false, else `isValidReadContent(item.content)`) — a deviation from the plan's
    `isValidReadContent(strippedContent)`, required to match legacy byte-for-byte (a `"1\tError…"`
    numbered file is valid under A's raw-string gate). Repointed all three production callers + the CLI
    (no forwarding): `appendFilteredReadEdits` (`edit-stream-extraction.js`, written-files filter kept),
    **`appendReadTouches`** (`file-historical-lineage.js`, unfiltered DISCOVERY, null gate kept),
    `readEventsForFile` (`file-events-extractors.js`, signature → `(jsonlPath, lines, parsed, aliasSet)`,
    call site passes the already-computed `lines`+`parsed`); `split-read-assembly.js`'s `extractReadEvents`
    became a 3-line scanner-backed adapter (CLI + its tests now route through the canonical scan).
    Strict red-green: NEW `tests/test-read-event-scanner.js` (14 — pairing/strip/numbering/limit/timestamp/
    validity/array-blocks + both derivations + **Tasks 8–9 characterization goldens** vs legacy
    extractReadEdits/extractReadEvents on a tab/box/trailing-reminder/unnumbered/error transcript); NEW
    `tests/test-file-historical-lineage-read.js` (discovery-critical read-touch golden incl. box + unnumbered
    A-only cases); +1 case each in the edit-stream + file-events extractor suites. Retired legacy bodies →
    `archive/read-scanner-legacy-bodies.js`; retired extractReadEdits unit tests →
    `tests/archive/test-file-event-observations-readedits.js` (non-recursive glob, won't run) — this repo has
    a single commit / all-untracked tree, so deletions are otherwise unrecoverable. **Empirical divergence
    handled** (both scanners run over the 786-transcript fixture): A captures 6336, B 6076; 260 A-only
    (unnumbered), 0 B-only, 128 shared with differing content (44 box, 84 trailing-reminder) — the superset
    captures A's union and each derivation reproduces its caller's output. **Probe-safe:** the
    `appendReadTouches` repoint is the only discovery-affecting change, and its capture set + `.path`/`.line`
    are reproduced 1:1 → **probe A/B `identical: true` vs `develop-baseline` `a8947fc` → NO re-baseline**,
    baseline unchanged. **Gates GREEN:** full suite **69 suites / 690 passed / 0 failed** (+2 suites, +11
    tests net); detect-rewinds 15/15; `plate_summary.py` 247/247 matchedObserved, 0 mismatched, conflicts=8
    (UNCHANGED). All touched files ≤250 (`file-event-observations.js` 278→234, `split-read-assembly.js`
    169→107, the three repointed hosts at exactly 250). Out of scope (deferred): item-5.6's bash-read/grep
    timestampless-result unification. See `plans/implementation-notes-item17-unify-read-scanners.md`.

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
