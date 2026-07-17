# Implementation Notes — Script-Execution-as-Authored-Event (Phase 2+)

## 2026-06-20:23:45:00 — Resume at T2.1 (Detection); baseline GREEN; oracle-truncation discovered
Chat title: handoff1: bridge 'external script executed' gap
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/2eae246b-464b-49c3-8a64-d4d59ac7f0f2.jsonl

### References
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/spec-script-execution-replay.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/plan-script-execution-replay.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-script-execution-replay.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260620-2331.md
- Run record transcript: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/540a4546-d761-496b-83f0-4a23d8679d3c.jsonl
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/probes/buckets-110.json

### Design decisions
- **T2.1 detection event shape.** `extractScriptExecutionEvents` emits ONE event per (run × in-scope
  alias). "In-scope" = the alias path is under the run's repo root (the `cd <dir> &&` cwd). The kind
  sub-object carries detection provenance only (`scriptType`, `scriptPath`, `cwd`) at T2.1; the derived
  `{ type, subs }` transform that `apply-script-execution.js` consumes is added at T2.3. Rationale: the
  rename run is repo-wide (global subs touch any .js/.html), so per-alias scoping of which subs actually
  apply belongs at derivation/apply time (`subsForFile`), not detection. An event without `subs` is never
  applied during Phase 2 — engine wiring (T4.1) lands after T2.3.
- **T2.1 execution guard (avoids false positives).** A command is a RUN only if it both `recognizeScript()`s
  (the modeled type) AND contains an interpreter token (`python/node/sh/bash/ruby/perl`). This rejects a
  `cat`/`grep`/Read of the script source and a `Write` of it (which carry the script name but no interpreter
  / no command field). `commandsFromToolUse` only inspects `input.command` / `input.code` /
  `input.commands[].command`, so a Write's `input.content` can't trigger detection.
- **T2.1 signature parity.** `extractScriptExecutionEvents(jsonlPath, jsonlText, parsed, aliasSet)` mirrors
  the sibling `extractBashOpEvents` so the T4.1 aggregation-site wiring is uniform. (As of T2.3 `jsonlText`
  IS used — it feeds the script-recovery recreate-from-JSONL fallback.)
- **T2.3 event shape = spec + provenance.** The `scriptExecution` kind sub-object is the transform spec
  `apply-script-execution.js` consumes (`{ type, subs }`) with `subs` already scoped to the file via
  `subsForFile` — apply iterates subs over all known lines, so per-file scoping MUST happen at emission.
  Provenance fields (`scriptType`, `scriptPath`, `cwd`) ride alongside; apply ignores them.
- **T2.3 memoization.** The full transform (whole CSV) is recovered+derived ONCE per run, keyed by
  `cwd|scriptPath|tExecIso` in a module-level cache, then scoped per alias. Correct in production (one
  rename run → one CSV as of T_exec, reused across all 99 files) and the intended cost saving for T4.2.
- **T2.3 CSV recovery is on-disk-primary.** `recoverScriptAndInput` reads the on-disk
  `function-names-enriched.csv` when present (it is: 299 rows = 292 non-noop = 285 OK + 7 MISMATCH,
  consistent with the run), else recreates from the transcript. Evidence the on-disk CSV == T_exec CSV:
  row counts reconcile with the recorded run outcome.
- **T3.1 edit inversion.** Rewinding an observed edit reuses `edit-replay.applySingleEdit` with the
  edit's old/new swapped (type 'edit'); `applyReplaceOp` itself isn't exported. A window edit whose
  newString is absent from the beacon is non-invertible → the file is flagged (content null), never
  fabricated. Full-content beacons = write/snapshot/readFull/cat (readChunk is partial, not an anchor).
- **T3.2 golden test is hermetic, not the 5-min corpus run.** The plan named a real HAS-BEACON file
  (`bash-op-events.js`) reconstructed via the combined cache. That costs a ~5-min corpus scan — unfit
  for the per-edit Stop-hook sweep. Instead the golden test builds REAL materializable events
  (`extractFileEvents` over a temp transcript with a `cat` beacon) and proves the three-way agreement
  `forward(pre) == expected == engine beacon`, plus the rewind-behind-a-window-edit case and the
  forced-mismatch flag. The real 110-file ground-truth validation is deferred to T4.2 acceptance (which
  legitimately pays for the corpus scan). NOTE: cat/read evidence re-reads the transcript at materialize
  time, so the fixture must be written to a real path (temp dir), not passed as in-memory text.

### Deviations
- **T2.3 drops the transcript OK/MISMATCH oracle (user-approved 2026-06-21).** The tasks file specified
  T2.3 would use the run's stdout oracle to pick the 285 applied rows. That oracle is not fully preserved
  in the transcript (see Open Questions — context-mode truncated it), and on-disk recovery of the 7
  mismatches is unreliable (repo drift). Per user decision (Option A), T2.3 derives ALL subs from the
  recovered CSV and relies on: (1) `apply-script-execution.js`'s per-file count-assertion to reproduce
  LOCAL mismatches, (2) forward-validation (Phase 3) as the correctness gate where beacons exist, and
  (3) honest classification of NO-BEACON results (script-applied, unvalidated) rather than claimed
  byte-perfect. Residual risk: a GLOBAL row the real run aborted could be applied on a NO-BEACON file;
  this is bounded (≤7 rows total, most/all historically LOCAL) and surfaced, not hidden.

### Tradeoffs
- **T4.1 required extracting record-utils to stay under the 250-line cap.** `file-events-extractors.js`
  was already at 266 lines (over the hook's cap); adding the wiring would worsen it. Rather than trim
  comments, I extracted the 4 internal JSONL record-parsing helpers (`tryParseJson`, `parseRecords`,
  `findSessionId`, `getTimestampAtRecord`) verbatim into a new `api/file-events-record-utils.js` and
  aliased the three still used here. Net: file → 243 lines, the extractor wired in, behavior unchanged
  (full sweep green). Alternative considered: a separate aggregation module — heavier, more churn.

### Open questions
- **[BLOCKS Checkpoint 4 — the core gap] T4.2 acceptance: 0 files cleared by script-replay; the run's
  transcript is never DISCOVERED for the files it rewrote.** First acceptance run (`probes/acceptance-110.json`):
  cleared 7 (unchanged from the T0.2 baseline CLEARS), flagged 103, and **0 files had a scriptExecution
  event fire**. Root cause (verified directly): extraction works — `extractFileEvents(540a4546, [bash-op-events.js])`
  DOES emit the scriptExecution event with 73 file-scoped subs at T_exec. But that file has ONLY that event
  in 540a4546 (a script write leaves no Edit/Write/Read touch), so `transcript-discovery.findReferencingJsonls`
  (which selects transcripts whose `touches` intersect the file's aliases) never returns 540a4546 for that
  file → `gatherEventsForAliases` never scans it → the event never reaches reconstruction. This is exactly
  the "external script executed" gap: T4.1 wired the extractor into the per-file aggregation site, but the
  aggregation only runs over DISCOVERED transcripts, and discovery is touch-based.
  - **Proposed fix (discovery bridge):** at cache build (`transcript-discovery.collectAllJsonls`) detect
    script runs per transcript (cheap, pure `detectScriptRuns`) and store `scriptRuns` on each cache entry;
    in `reconstruct-file.gatherEventsForAliases`, additionally include any transcript whose `scriptRuns`
    cwd (repo root) covers a target alias, deduped. Then the wired extractor fires for affected files.
    Additive cache field (existing consumers ignore it); localized to discovery + reconstruct-file.
  - **Watch next:** `filterEventsByAliasWindows` may still drop the event if the file's alias window does
    not span T_exec (handoff WATCH). Re-run acceptance after the bridge to confirm.
  - **RESOLVED (bridge built, user-approved 2026-06-21).** Implemented:
    (1) extracted PURE detection into `api/script-run-detection.js` (so foundational discovery needn't
    load the recovery/edit IO chain); `script-execution-events.js` now consumes it (re-exports detect for
    back-compat); (2) `transcript-discovery.collectAllJsonls` now stores `scriptRuns` per cache entry
    (additive; `detectRunsInText`); (3) `reconstruct-file.gatherEventsForAliases` unions in any transcript
    whose `scriptRuns` repo-root covers a target alias. Hermetic end-to-end test
    (`tests/test-script-discovery-bridge.js`): a run in a NO-touch transcript now reaches the rewritten
    file and reconstructs POST (verdict PASS); cache entries carry detected runs. Full sweep green.
    Re-running the real 110-file acceptance to measure the effect (alias-window WATCH included).
  - **RESULT (bridged acceptance, `probes/acceptance-110.json`): 105/110 CLEARED, 5 flagged, 0 error**
    (baseline before the feature: 7 cleared). The alias-window WATCH did NOT bite — the events survive.
    The 5 flagged are all honest non-fabrications: `.gitignore` and `tools/probe-mismatches-v2.json`
    (the 2 known non-source residue), plus three files with post-T_exec on-disk drift the engine never
    observed — `api/transcript-discovery.js` (134 mismatched — drift I introduced THIS session by editing
    it for the bridge), `tests/test-file-event-kinds.js` and `tests/test-read-event-scanner.js`
    (`neverObserved` lines added off-transcript). The realistic ceiling was ~108; the 3-file gap below it
    is legitimate later-edit drift, not engine error and not fabrication. NOTE: the first report showed
    `clearedWithScriptEvent: 0` — a harness-metric bug (its local `gatherEvents` copy didn't apply the
    bridge); fixed and re-run for an honest count. The cleared/flagged COUNTS were always valid (they come
    from `reconstructFileWithSeed`, which bridges).
  - **FINAL (honest metric): cleared 105 / flagged 5 / error 0; clearedWithScriptEvent 105,
    flaggedWithScriptEvent 5 — i.e. the transform fired for ALL 110 files.** Every flagged file had the
    script applied yet still diverges from on-disk for a non-engine reason (non-source artifact or
    post-T_exec drift), so each is honestly flagged, never fabricated. Checkpoint 4 (definition of done)
    met: NO-BEACON rename targets reconstruct byte-perfect; residue explicitly classified; full sweep green.
- **[BLOCKS T2.3 — surface at Checkpoint 2] The OK/MISMATCH oracle is NOT fully preserved in the raw transcript.**
  The run record (session 540a4546, JSONL line index 1024, `toolUseResult`) is only 8743 bytes.
  context-mode's `ctx_batch_execute` indexed the script's 21.5KB / 342-line stdout into ITS OWN
  knowledge base and stored only a TRUNCATED preview in the transcript. Measured contents of the
  preserved tool_result: 92 visible per-row results, ALL `OK` (74 `[LOCAL]` + 18 `[GLOBAL]`),
  and ZERO of the 7 `MISMATCH` rows. The summary line ("285 OK, 7 MISMATCH, 0 SKIP") is present,
  but the per-row identities of the 7 MISMATCH rows (and ~193 of the OK rows) are gone.
  - CSV totals (function-names-enriched.csv): 71 global, 221 local, 7 no-op (old==new) = 299 rows;
    285 applied + 7 mismatch = 292 = 299 − 7 no-op. Consistent.
  - Why it matters: the tasks file says T2.3 should "use the run's stdout OK/MISMATCH oracle to pick
    the 285 OK rows" to resolve GLOBAL per-run-sum assertions that can't be checked per-file. That
    oracle is incomplete in the transcript, so the literal plan is not executable as written.
  - LOCAL mismatches are already handled: `apply-script-execution.js#shouldApplySub` re-derives the
    per-file count-assertion at replay, so a LOCAL row the script aborted will also abort in replay
    (given an accurate reconstructed pre-state). The residual risk is GLOBAL rows: they are applied
    unconditionally per-file, so a GLOBAL row the real run ABORTED (sum mismatch) would be wrongly
    applied to NO-BEACON files (no beacon → forward-validation can't catch it → silent fabrication,
    which the spec's Never boundary forbids).
  - Candidate resolutions to weigh at Checkpoint 2 (measure first, per user preference):
    1. Identify the 7 MISMATCH rows + scope by measurement (e.g. re-derive deterministically from the
       recovered CSV + reconstructed pre-states, or detect rows whose oldName still appears whole-token
       on-disk), then exclude any GLOBAL mismatches from replay.
    2. If all 7 mismatches turn out to be LOCAL, the transcript oracle is unnecessary — the existing
       per-file count-assertion fully reproduces the script's decisions; T2.3 drops the oracle dependency.
    3. Retrieve the full stdout from context-mode's KB (rejected: not a transcript-grounded input; the
       engine must reconstruct from JSONL, not from a side-channel index).
  - Action: do NOT block T2.1/T2.2 on this. Resolve before finalizing T2.3.
  - **Measurement (2026-06-20):** tried to identify the 7 MISMATCH rows from on-disk state (mismatched
    rows were NOT applied, so their oldName should still be present). RESULT: unreliable — the on-disk
    repo has DRIFTED since T_exec (later edits reintroduced names: 20 rows' oldName still appears, but
    counts no longer match `expected`, e.g. `main` expected 4 / on-disk 1). So on-disk grep cannot
    cleanly recover the 7 mismatches. The faithful options narrow to: (A) drop the transcript-oracle
    dependency and rely on the per-file count-assertion + forward-validation + honest classification, or
    (B) reproduce the oracle deterministically by reconstructing ALL in-scope files as of T_exec and
    running the script logic. Recommendation: A (see Checkpoint-2 decision). Surfaced to user before T2.3.
