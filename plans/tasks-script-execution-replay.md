# Tasks: Script-Execution-as-Authored-Event

Status: DRAFT — awaiting human review (Phase 3 of spec-driven-development)
Derives from: `plan-script-execution-replay.md` (APPROVED) ← `spec-script-execution-replay.md` (APPROVED)
Date: 2026-06-20 · Branch `develop` · CWD `/Users/matkatmusicllc/Desktop/claude code src/RevEng`

**Rules:** one task at a time, dependency-ordered, ≤5 files each. Tests are **written first (red), then made green**. Run the full sweep before declaring a task done:
`for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" >/dev/null 2>&1 || echo "FAIL: $f"; done; echo "sweep done"`
New files = 4-space indent; edits to existing 2-space files stay 2-space.

---

## Phase 0 — Measure (no feature code) · gates everything

- [x] **T0.1 — Locate the per-file event-gathering aggregation site** ✔ DONE
  - **Finding:** `api/file-events-extractors.js#extractFileEventsFromText` (lines 228–251). The `Array.prototype.push.apply(events, <extractor>(...))` block at **lines 234–248** merges all 9 sub-extractors. Add `extractScriptExecutionEvents` here, beside `extractBashOpEvents` (line 237).
  - **Inputs already in scope at the site:** `parsed` (line 230), `aliasSet` (231), `jsonlText`. Mirror sibling signature `extractBashOpEvents(jsonlPath, jsonlText, parsed, aliasSet)`.
  - **Flow up:** `extractFileEvents` → `reconstruct-file.js#gatherEventsForAliases` (line 91) → `reconstructFileWithSeed` → `filterEventsByAliasWindows` (160) → `trackLineStates`. Timeline `unixMs` sort happens in track-line-states, so the event only needs a correct `T_exec`.
  - **Wiring notes for T4.1/T2.3:** (1) event `aliasPath`+`T_exec` must fall inside the alias window or `filterEventsByAliasWindows` drops it; (2) memoize detect+recover+derive ONCE (one run → one transform spec), not per (transcript×file).

- [ ] **T0.2 — Bucket the 110 via the real Engine (combined cache)**
  - **VERIFIED `T_exec` = `2026-06-19T08:10:43.539Z`** (session `540a4546`, `mcp__…ctx_batch_execute` "Run rename engine"). Beacon = content event (`snapshot|write|readFull|readChunk|cat`) with `unixMs > T_exec`.
  - Recipe: 110 = `probeData.filesInProject.filter(f => f.status==='MISMATCH').map(f => f.identityKey)` (absolute paths). `repoRoot = …/RevEng`; `repoRelPath = identityKey.replace(repoRoot+'/','')`; `projectsDir = …/jot-recovery/claude-data/projects`; `snapshotsDir = …/jot-recovery/claude-data/file-history`. Build `cache = reconstructFile.loadCombinedCache(projectsDir)` once. Verdict via `coverage.summarizeVerdict(result.finalVerdict)` → `coverage.classifyVerdict(...)`. Events for beacon check via `gatherEventsForAliases(aliasPaths, projectsDir, cache, snapshotsDir)` (NOT on result — it isn't returned).
  - Acceptance: classifies each of the 110 into CLEARS-VIA-ENGINE / HAS-BEACON / NO-BEACON; writes lists + counts to `probes/buckets-110.json`.
  - Verify: `node --max-old-space-size=8192 tools/measure-110-buckets.js` produces the json; counts sum to 110.
  - Files: `tools/measure-110-buckets.js` (new), `probes/buckets-110.json` (output).

- [x] **T0.3 — Confirm the script's real data input + scope semantics** ✔ DONE (on-disk version; confirm == `T_exec` version in T2.2)
  - **Data input:** `function-names-enriched.csv` (hardcoded `rename-functions.py:14`), columns `oldName,newName,file,isExported,numReferences`.
  - **REPO_ROOT = RevEng dir** (`:15`, three dirs up) → `repoRoot` for reconstruction.
  - **Transform:** whole-token `\bold\b→new` (`:38-41`), content-agnostic (comments included). Rows with `old==new` skipped (`:22-23`).
  - **Scope (wrinkle):** `isExported=='Y'` → GLOBAL across all `.js`+`.html` under repo excluding `archive,node_modules,common,.git` (`:28-35,64-91`), assertion = **sum across files**; else LOCAL single `row['file']` (`:44-61`), assertion per-file `count==numReferences`.
  - **Safety:** `count!=expected` aborts the row, no partial write (`:55-56,84-85`).
  - **Run outcome (recorded, obs 15924):** 285 OK, 7 MISMATCH (not applied) — replay must reproduce 285 applied / 7 unapplied.
  - **Oracle:** the run's stdout `OK/MISMATCH/SKIP` lines (in the Bash `toolUseResult`) list exactly which rows applied — recover alongside the script in T2.2.
  - **SPEC REFINEMENT (fold into T1.2/T1.3):** count-assertion is **per-row at its scope** (per-file LOCAL, per-run-sum GLOBAL), not "per-file" as the spec simplified. Per file, apply the rows the run reported OK.

> **✔ Checkpoint 0 — RESULT (measured):** 110 = **7 CLEARS-VIA-ENGINE** + **2 HAS-BEACON** + **101 NO-BEACON** (0 error).
> NO-BEACON breakdown: 98 `.js` + 1 `.html` = **99 renameable targets**; 2 residue (`.gitignore` ordinary edits, `tools/probe-mismatches-v2.json` generated artifact w/ 2145 noise lines).
> **Feature justified:** ~101 files depend on script-replay. **Probe divergence minor (7) → T5.1 optional, confirmed.** Realistic ceiling ≈ **108/110**; the 2 residue are different-cause / non-source-artifact.
> Golden tests (T3.2): HAS-BEACON `api/replay-verification.js` (3 mismatched), `tools/probe-v2-assembly.js` (11); plus 7 CLEARS as full-content ground truth.
> Output: `probes/buckets-110.json`. T_exec verified `2026-06-19T08:10:43.539Z`; ran via MCP ctx_batch_execute (not Bash).

---

## Phase 1 — Transform-event semantics on one file (walking skeleton)

- [ ] **T1.1 — Add `scriptExecution` event kind**
  - Acceptance: `KIND_NAMES` includes `'scriptExecution'`; `createKindEvent` carries an arbitrary `spec` object for it; ordering unchanged (by `unixMs`/`jsonl`/`jsonlLine`).
  - Verify: existing kind test green; full sweep green.
  - Files: `api/file-event-kinds.js`, `tests/test-file-event-kinds.js` (if present; else add a focused test).

- [ ] **T1.2 — Rename transform derivation (minimal) + registry**
  - Acceptance: `deriveRenameTransform(csvContent)` → `[{ old, new, scope, expectedCount }]`; forward sub = `\bold\b→new`; registry `index.js` maps a recognized `rename-functions.py` invocation to this deriver. Inverse (new→old) provided **only** for the edit-rewind helper, not the script.
  - Verify (test-first): `node tests/test-script-transforms-rename-functions.js` green — forward sub, scope handling, expectedCount.
  - Files: `api/script-transforms/rename-functions.js`, `api/script-transforms/index.js`, `tests/test-script-transforms-rename-functions.js`.

- [ ] **T1.3 — `applyOneEvent` handles `scriptExecution` (transform vs content)**
  - Acceptance: applying a `scriptExecution` event iterates the alias's current belief lines and applies each sub; enforces the count-assertion — when actual whole-token count ≠ `expectedCount`, the file is **flagged/skipped** (no partial write), mirroring the script. Later events still override.
  - Verify (test-first): `node tests/test-apply-one-event-scriptexecution.js` green incl. a deliberate count-mismatch → flag; existing apply-one-event tests green.
  - Files: `api/apply-one-event.js`, `tests/test-apply-one-event-scriptexecution.js`.

> **✔ Checkpoint 1 — DONE.** `scriptExecution` kind registered (T1.1); transform derivation reconciled with the real CSV — 292 subs, 71 global/221 local (T1.2); `applyOneEvent` applies the transform to the live belief, sequential/compounding, LOCAL-fully-known count-assertion → skip+flag, unknown lines untouched (T1.3). New: `api/script-transforms.js`, `api/apply-script-execution.js`; edited `api/file-event-kinds.js`, `api/apply-one-event.js`. Full sweep green. NOTE: line-belief.js is at the 250-line cap — authored-line set done via exported `makeClaimEntry` rather than a new lb helper. Script-authored lines use a synthetic `scriptExecution.derivedContent` evidence ref (provenance-only; verdict compares in-memory text).

---

## Phase 2 — Detection + recovery (as of `T_exec`)

- [x] **T2.1 — Detect the single script invocation (Bash AND MCP execute)** ✔ DONE — `api/script-execution-events.js` (`detectScriptRuns`, `detectScriptInvocation`, `extractScriptExecutionEvents`); 7 tests green incl. real 540a4546 fixture (one run at T_exec). Detection-only event (provenance); subs wired at T2.3.
  - Acceptance: `extractScriptExecutionEvents(jsonlPath, parsed, aliasSet)` detects the one `rename-functions.py` run, captured as an **MCP `ctx_batch_execute` tool_use** (`name === 'mcp__plugin_context-mode_context-mode__ctx_batch_execute'`, `input.commands[].command` contains the script) — and ALSO handles a plain `Bash` tool_use for generality. Captures `T_exec`, `cwd` (from the `cd …` in the command), `scriptPath`, `args`; emits one event for paths in `aliasSet`.
  - Note: `extract-bash-file-ops.js#extractBashCommand` only matches `name==='Bash'` — detection needs a broader matcher covering `ctx_execute`/`ctx_batch_execute` `input.command`/`input.commands[].command`/`input.code`.
  - Verify (test-first): `node tests/test-script-execution-events.js` green; against a `540a4546` fixture it finds exactly one run at `T_exec=2026-06-19T08:10:43.539Z`.
  - Files: `api/script-execution-events.js`, `tests/test-script-execution-events.js`.

- [x] **T2.2 — Recover script + CSV as of `T_exec`** ✔ DONE — `api/script-recovery.js` (`recoverFileAsOf`, `reconstructAsOf`, `recoverScriptAndInput`); on-disk primary + transcript-replay fallback time-bounded by record timestamp (reuses `edit-stream-extraction`+`edit-replay`). 5 tests green (on-disk, hide-on-disk recreate, picks-T_exec-version, no-bound, orchestrator).
  - Acceptance: `script-recovery` returns script source + data-input content as of `T_exec`; on-disk when present; else `reconstructFileWithSeed` time-bounded to `ts ≤ T_exec`. Correctly selects the pre-execution edited version (the script was edited multiple times before its single run), not an earlier one.
  - Verify (test-first): `node tests/test-script-recovery.js` green incl. (a) hide-on-disk → recreate-from-JSONL, (b) multiple-edits-before-run → picks `T_exec` version.
  - Files: `api/script-recovery.js`, `tests/test-script-recovery.js`.

- [x] **T2.3 — Wire detect → recover → derive (event carries full spec)** ✔ DONE — `extractScriptExecutionEvents` now recovers the CSV (script-recovery, memoized ONCE per run) + derives the full transform, emitting per-file events whose `scriptExecution` carries `{ type, subs }` scoped via `subsForFile` (+ provenance). 9 tests green. **Oracle dropped** (user-approved Option A): not transcript-grounded; rely on per-file count-assertion + forward-validation + honest classification.
  - Acceptance: `extractScriptExecutionEvents` uses `script-recovery` + `script-transforms` so the emitted event's spec reflects the real recovered CSV (full, scoped sub set).
  - Verify: integration test — event built over real `2cfe77ab` data carries the expected subs for a known target file.
  - Files: `api/script-execution-events.js`, `tests/test-script-execution-events.js` (extend).

> **✔ Checkpoint 2 — DONE.** From real transcripts we detect the one run (T_exec verified) and emit a scriptExecution event whose spec carries the file-scoped subs derived from the recovered CSV. New: `api/script-execution-events.js` (T2.1 detect, T2.3 recover+derive), `api/script-recovery.js` (T2.2). Tests: `tests/test-script-execution-events.js` (9), `tests/test-script-recovery.js` (5). Full sweep green. **Decision:** oracle dropped (Option A, user-approved) — see implementation-notes Deviations.

---

## Phase 3 — Forward-validation harness

- [x] **T3.1 — Beacon location + observed-edit rewind** ✔ DONE — `api/script-replay-validation.js` (`selectBeacon`, `editsInWindow`, `rewindEditsNewestFirst`, `beaconContent`, `buildExpectedPostScriptState`). Inverts edits via `edit-replay.applySingleEdit` (applyReplaceOp not exported); non-invertible window → flag. 6 unit tests green.
  - Acceptance: `script-replay-validation` finds the first content-establishing observation after `T` (read/cat/snapshot/write), collects observed Edits in `(T, beacon]`, and rewinds them newest-first onto the beacon → expected-post-script state. Non-invertible content in the window → flag.
  - Verify (test-first): `node tests/test-script-replay-validation.js` green — rewind unit cases + the flag path.
  - Files: `api/script-replay-validation.js`, `tests/test-script-replay-validation.js`.

- [x] **T3.2 — Golden forward-validation on a HAS-BEACON file** ✔ DONE — added `compareForward` to the module + 3 golden tests in `tests/test-script-replay-validation.js`: (1) `forward(pre) == expected == engine beacon` (POST); (2) a post-script window edit moves the beacon (POST2) yet the rewind recovers the script instant that forward(pre) matches; (3) a forced mismatch is reported, never a silent pass. Hermetic — real materializable events via `extractFileEvents` over a temp transcript (cat/read evidence re-reads the transcript at materialize, so a real path is required). NOTE: scoped as a fast hermetic golden rather than the ~5-min combined-cache run; the REAL 110 ground-truth check is T4.2 acceptance.

> **✔ Checkpoint 3 — DONE.** Forward-validation proven: `forward(pre)` reproduces the post-script state, the beacon-rewind isolates the script instant behind later edits, and divergence is flagged. New: `api/script-replay-validation.js`; tests `tests/test-script-replay-validation.js` (9). Full sweep green.

---

## Phase 4 — Engine wiring + acceptance (definition of done)

- [x] **T4.1 — Wire `extractScriptExecutionEvents` into the aggregation site** ✔ DONE — added beside `extractBashOpEvents` in `extractFileEventsFromText` (now line 237). The site was over the 250-line cap, so the 4 record-parsing helpers were extracted to new `api/file-events-record-utils.js` (verbatim) → file now 243 lines. Wiring tests in `tests/test-file-events-extractors-scriptexec.js` (2) green; existing extractors test (13) + full sweep green.
  - Acceptance: at the T0.1 site, the new extractor's event joins the per-file timeline and sorts by `unixMs`; later observations override; no regressions.
  - Verify: full sweep green; a NO-BEACON rename target now reconstructs byte-perfect.
  - Files: the aggregation-site file (from T0.1, e.g. `api/file-events-extractors.js` or `api/reconstruct-file.js`) + its test.

- [ ] **T4.2 — Acceptance run + classification over the 110**
  - Acceptance: Engine coverage over the 110 reports **cleared** (byte-perfect + forward-validated) vs **flagged** (with reason); NO-BEACON rename targets are cleared; every remaining file is explicitly classified (no silent drop). Report written to `probes/acceptance-110.json` + a short summary table.
  - Verify: `node --max-old-space-size=8192 tools/measure-110-buckets.js --acceptance` (or a dedicated harness) regenerates the report; numbers reconcile with T0.2.
  - Files: `tools/acceptance-110.js` (new harness), `probes/acceptance-110.json` (output).
  - **✔ DONE.** `tools/acceptance-110.js` over the real combined cache: **105/110 cleared, 5 flagged, 0 error**
    (baseline 7). The transform fired for ALL 110 (clearedWithScriptEvent 105 / flaggedWithScriptEvent 5).
    The 5 flags are honest non-fabrications: `.gitignore` + `tools/probe-mismatches-v2.json` (the 2 known
    non-source residue), and 3 files with post-T_exec on-disk drift the engine never observed
    (`api/transcript-discovery.js` — drift from THIS session's bridge edit — `tests/test-file-event-kinds.js`,
    `tests/test-read-event-scanner.js`).
  - **DISCOVERY BRIDGE (added — the core gap).** Acceptance first showed 0 improvement: a script write
    leaves no touch, so the run's transcript (540a4546) was never DISCOVERED for the files it rewrote.
    Fix: `api/script-run-detection.js` (pure detection, split out); `transcript-discovery.collectAllJsonls`
    stores `scriptRuns` per cache entry; `reconstruct-file.gatherEventsForAliases` unions in any transcript
    whose run covers a target alias. Hermetic test `tests/test-script-discovery-bridge.js` (2) green.

> **✔ Checkpoint 4 = DONE:** rename targets reconstruct byte-perfect (105/110); residue explicitly classified (5, all with reasons), never fabricated; full sweep green. T5.1 remains optional/skipped (off critical path).

---

## Phase 5 — (optional) Probe consolidation

- [ ] **T5.1 — Retire probe main-only gathering**
  - Acceptance: `probe-engine-b.js` delegates to `reconstructFileWithSeed` + `loadCombinedCache`; the dangling `sj` require is removed if unused; probe and Engine agree.
  - Verify: `node tests/test-subagent-transcript-discovery.js` green; `node probes/gen-callgraph.js 3` shows convergence.
  - Files: `tools/probe-engine-b.js` (+ affected tests).

---

## Dependency order (flatten for execution)
`T0.1 → T0.2 → T0.3 → T1.1 → T1.2 → T1.3 → T2.1 → T2.2 → T2.3 → T3.1 → T3.2 → T4.1 → T4.2 → (T5.1 optional)`
Parallelizable once started: **T1.2** (pure) alongside **T1.1**; **T3.1** can begin once **T1.3** lands.

## What I need from you
Approve these tasks (or adjust granularity/order). On approval I begin **Phase 4 — Implement**, starting at **T0.1**, one task at a time, test-first, pausing at each ✔ checkpoint for your review.
