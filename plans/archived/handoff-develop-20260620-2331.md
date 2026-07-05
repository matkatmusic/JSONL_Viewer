# Handoff: Engine B → 100% reconstruction via script-execution-as-authored-event (spec-driven; Phase 1 of 4 implemented, GREEN; resume at Phase 2 / T2.1)
Conversation name: Get Engine B achieving 100% reconstruction (spec-driven-development)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/ (this session's latest *.jsonl)
Plan file: plans/spec-script-execution-replay.md (APPROVED) → plans/plan-script-execution-replay.md (APPROVED) → plans/tasks-script-execution-replay.md (live task tracker, status inline)

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; ALL RevEng source is untracked/modified — 2967 status lines, nothing committed). CWD for all work: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

## Goal
Make Engine B reconstruct the 110 currently-"failing" RevEng files. Root cause (confirmed prior + this session): they are NOT engine bugs — a script (`plans/naming/rename-functions.py`) rewrote ~285 function names in one run, and a script write leaves NO Edit/Write tool_use record, so the post-rename content never entered the engine's belief. Fix: model the recorded script run as a first-class **`scriptExecution` transform event** that, at replay time, applies the script's transform forward against the live per-line belief at the run's timestamp. Generic mechanism, proven on the rename. Validate forward (not reverse): run the reconstructed pre-state through the script and compare to the expected post-script state (first beacon after T_exec, rewound by observed edits; else on-disk). Flag — never fabricate — anything that doesn't validate.

## Current State
Spec-driven workflow complete through SPECIFY + PLAN + TASKS (all human-approved). **Phase 0 (measure) and Phase 1 (transform-event mechanism) DONE and GREEN.** Full `tests/test-*.js` sweep passes after every task (strict TDD red→green).

Done:
- **T0.1** Aggregation/wiring site found: `api/file-events-extractors.js#extractFileEventsFromText`, the `Array.prototype.push.apply(events, …)` block at **lines 234–248** (mirror `extractBashOpEvents(jsonlPath, jsonlText, parsed, aliasSet)`).
- **T0.2** `tools/measure-110-buckets.js` ran over the real engine (combined cache). Result in `probes/buckets-110.json`: **7 CLEARS-VIA-ENGINE, 2 HAS-BEACON, 101 NO-BEACON** (0 error). Of the 101: 98 `.js` + 1 `.html` = 99 renameable targets; 2 residue (`.gitignore` ordinary edits; `tools/probe-mismatches-v2.json` generated artifact, 2145 noise lines). **Realistic ceiling ≈ 108/110.**
- **T0.3** Script semantics confirmed (`rename-functions.py`): reads `function-names-enriched.csv` (hardcoded); whole-token `\bold\b→new`; LOCAL (isExported≠Y) = single `row['file']`, assertion per-file; GLOBAL (isExported=Y) = all `.js`+`.html` under REPO_ROOT excluding `archive,node_modules,common,.git`, assertion = run-wide SUM; aborts a row on count≠expected (no partial write). Run outcome: **285 OK / 7 MISMATCH / 0 SKIP** of 299 rows (7 no-op old==new skipped by load_rows).
- **T1.1** `'scriptExecution'` added to `KIND_NAMES` (`api/file-event-kinds.js`).
- **T1.2** `api/script-transforms.js` (`recognizeScript`, `requiredDataInput`, `deriveTransform`, `deriveRenameTransform`, `subsForFile`, `applyWholeToken`). Reconciled with the REAL enriched CSV: 292 subs (71 global / 221 local), 7 no-ops skipped. `eventsForOp→extractEventsFromBashFileOp` is LOCAL in `api/bash-op-events.js`.
- **T1.3** `api/apply-script-execution.js` + dispatch in `api/apply-one-event.js` (branch at TOP of `applyOneEvent`, before `materializeEventEvidence`). Applies subs sequentially (compounding), authors changed known lines via `lb.makeClaimEntry('authored', …)`, LOCAL-fully-known count≠expected → SKIP+flag, leaves unknown lines untouched.

New tests (all green): `tests/test-script-transforms.js`, `tests/test-apply-script-execution.js`, plus a `scriptExecution` case in `tests/test-file-event-kinds.js`.

## What Remains (execution order)
1. **T2.1 — Detect the run.** Build `api/script-execution-events.js#extractScriptExecutionEvents(jsonlPath, jsonlText, parsed, aliasSet)`. Detect the ONE run captured as an **MCP `ctx_batch_execute`** tool_use (`name==='mcp__plugin_context-mode_context-mode__ctx_batch_execute'`, `input.commands[].command` contains `rename-functions.py`) — and a plain `Bash` tool_use for generality. `extract-bash-file-ops.js#extractBashCommand` only matches `name==='Bash'`, so write a broader matcher (`input.command` | `input.commands[].command` | `input.code`). Capture `T_exec`, cwd (from the `cd …` in the command), scriptPath. Emit ONE `scriptExecution` event per alias path. Test-first against a `540a4546` fixture; expect `T_exec=2026-06-19T08:10:43.539Z`.
2. **T2.2 — Recover script + CSV as of `T_exec`.** `api/script-recovery.js`: read on-disk when present; else recreate from JSONL via `reconstructFileWithSeed` time-bounded to `ts ≤ T_exec`. Test the hide-on-disk (recreate) path.
3. **T2.3 — Wire detect→recover→derive + the OK/MISMATCH oracle.** Make the emitted event's spec carry only the subs the run APPLIED. Use the run's stdout oracle (the 21.3KB "Run rename engine (2)" section in `540a4546` line 1025 tool_result — every per-row `OK`/`MISMATCH`/`SKIP`) to pick the 285 OK rows; this resolves the GLOBAL per-run-sum assertion that can't be checked per-file. Scope subs per file via `subsForFile`. Memoize detect+recover+derive ONCE per run (not per transcript×file).
4. **T3.1 — Beacon + edit-rewind.** `api/script-replay-validation.js`: first content-establishing observation after T (snapshot/write/readFull/readChunk/cat), rewind observed Edits in `(T, beacon]` newest-first to the expected-post-script state; flag non-invertible windows.
5. **T3.2 — Golden forward-validation.** On a HAS-BEACON file (`api/replay-verification.js` or `tools/probe-v2-assembly.js`): assert `forward(engine_pre@T) == expected == engine_reconstruction`. (The 7 CLEARS give extra full-content ground truth.)
6. **T4.1 — Wire into the engine.** Add `extractScriptExecutionEvents(...)` at `file-events-extractors.js#extractFileEventsFromText` (line ~237, beside `extractBashOpEvents`). Event sorts into the timeline by `unixMs` (track-line-states). WATCH: the event's `aliasPath`+`T_exec` must fall inside the alias window or `reconstruct-file.js#filterEventsByAliasWindows` (line 160) drops it.
7. **T4.2 — Acceptance over the 110.** Re-run measurement; report cleared (byte-perfect + forward-validated) vs flagged (with reason); write `probes/acceptance-110.json`. Expect ~99 renameable cleared; 2 residue explicitly classified.
8. **T5.1 (OPTIONAL) — Probe consolidation.** Only affects 7 files; off the critical path; skip unless desired.
9. Before any commit: run the JS sweep; branch off `develop` first (nothing is committed).

## Task List (session task tracker — mirrors plans/tasks-script-execution-replay.md)
```
[x] #1  T0.1 Locate event-aggregation site
[x] #2  T0.2 Bucket the 110 via the real Engine
[x] #3  T0.3 Confirm script data input + scope
[x] #4  Checkpoint 0 review
[x] #5  T1.1 Add scriptExecution event kind
[x] #6  T1.2 Rename transform derivation + registry
[x] #7  T1.3 applyOneEvent handles scriptExecution      ← Checkpoint 1 DONE (Phase 1 complete)
[ ] #8  T2.1 Detect script invocation (Bash + MCP)      ← RESUME HERE
[ ] #9  T2.2 Recover script + CSV as of T_exec
[ ] #10 T2.3 Wire detect -> recover -> derive (use OK/MISMATCH oracle)
[ ] #11 T3.1 Beacon location + edit rewind
[ ] #12 T3.2 Golden forward-validation
[ ] #13 T4.1 Wire extractor into aggregation site
[ ] #14 T4.2 Acceptance run over the 110
[ ] #15 T5.1 (optional) Probe consolidation
```

## Key Files
- `plans/spec-script-execution-replay.md` / `plan-…` / `tasks-…` — the approved spec, plan, and live task tracker (read tasks file first; checkpoint results inline).
- `api/script-transforms.js` — transform seam: recognize/derive/applyWholeToken/subsForFile (DONE).
- `api/apply-script-execution.js` — applies the transform to belief; count-assertion + flags (DONE).
- `api/apply-one-event.js` — dispatch added at top of `applyOneEvent` (DONE).
- `api/file-event-kinds.js` — `scriptExecution` registered (DONE).
- `api/file-events-extractors.js` — `extractFileEventsFromText` (lines 234–248) = T4.1 wiring site.
- `api/reconstruct-file.js` — THE ENGINE: `reconstructFileWithSeed`, `loadCombinedCache`; `gatherEventsForAliases` is NOT exported (the measure harness replicates it via `transcript-discovery.findReferencingJsonls` + `file-events-extractors.extractFileEvents`).
- `api/reconstruction-coverage.js` — `summarizeVerdict`/`classifyVerdict` (PASS/FAIL/INDETERMINATE) — reuse for acceptance.
- `tools/measure-110-buckets.js` — bucketing harness (reuse/extend for T4.2 acceptance).
- `probes/buckets-110.json` — the 7/2/101 split with file lists.
- `plans/naming/rename-functions.py` + `function-names-enriched.csv` — the modeled script + its data input.
- The run record: session `/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/540a4546-d761-496b-83f0-4a23d8679d3c.jsonl` — L1015 Write (script), **L1023 the `ctx_batch_execute` run @ 2026-06-19T08:10:43.539Z**, L1025 the stdout oracle.

## Context the Next Agent Won't Have
- **VERIFIED: the rename ran ONCE**, `T_exec = 2026-06-19T08:10:43.539Z`, in session `540a4546`, via **MCP `ctx_batch_execute` "Run rename engine"** (`cd RevEng && python3 plans/naming/rename-functions.py 2>&1`) — **NOT a `Bash` tool_use, and NOT session `2cfe77ab`.** Prior memory claiming "ran 25× in 2cfe77ab" was an unverified miscount (script-name mentions / per-row status lines) and is WRONG. Detection MUST cover MCP execute tools, not just Bash.
- **The run's stdout is the OK/MISMATCH oracle** (which 285 rows actually applied) — captured in `540a4546` line 1025's tool_result. Use it in T2.3 instead of re-deriving the per-row decision from a possibly-partial reconstructed pre-state.
- **Spec refinement (folded into tasks):** the count-assertion is per-row AT ITS SCOPE — per-file for LOCAL, per-run-SUM for GLOBAL. A GLOBAL row can't be gated by one file's count; that's why T2.3 uses the oracle. `apply-script-execution.js` currently gates only LOCAL-fully-known (correct for now).
- **Validate FORWARD, never invert the script** (script transforms aren't generally invertible). Only the intervening OBSERVED edits are inverted (they carry before+after). Beacon = first content-establishing observation after T; rewind edits off it to the immediate post-script state.
- **Probe-vs-engine divergence is a near-red-herring** — only 7 of 110 clear from the combined cache. So T5.1 (probe consolidation) is genuinely optional. Measure/accept via the ENGINE (`reconstruction-coverage.js`), not the probe.
- **`line-belief.js` is at the 250-line hook cap** — cannot add helpers there; authored-line set is done via the exported `makeClaimEntry`.
- **Script-authored lines use a synthetic `scriptExecution.derivedContent` evidence ref** (the new content is computed, not a verbatim transcript span). Provenance-only; the verdict compares in-memory text, so reconstruction correctness is unaffected. Don't try to deref these refs in the verdict path.
- **User working preferences (strong):** (1) "only build for what we know" — do NOT spec for impossible cases (e.g. same-ms tiebreaks: event timestamps are unique); (2) treat claude-mem observations as LEADS, not facts — verify against the transcript/source before using a number in a design; (3) measure before scoping (residue was deferred to forward-validation, not pre-classified); (4) strict TDD red→green per task; (5) gated spec-driven workflow — pause at each ✔ checkpoint for review.
- **Env/hook gotchas:** Stop hook runs `tests/test-<basename>.js` after each edit (trips on intentional RED — expected); blocks deep nesting (>3× indent unit) and files >250 lines; new files 4-space indent, edits to existing 2-space files stay 2-space; the sweep excludes `tests/test-output-data.js`; probe corpus = `/Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects`, snapshots = `…/jot-recovery/claude-data/file-history`; run node with `--max-old-space-size=8192` (combined-cache scan ~5 min); a harmless `Debugger listening…` preamble prints on stderr.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# Phase-1 unit tests (all green):
node tests/test-file-event-kinds.js          # 11 passed
node tests/test-script-transforms.js         # 5 passed
node tests/test-apply-script-execution.js    # 5 passed
# Full JS regression sweep (must print only "sweep done"):
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" >/dev/null 2>&1 || echo "FAIL: $f"; done; echo "sweep done"
# Reproduce the Phase-0 buckets (7 CLEARS / 2 HAS-BEACON / 101 NO-BEACON):
node --max-old-space-size=8192 tools/measure-110-buckets.js
```
