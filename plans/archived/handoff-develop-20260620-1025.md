# Handoff: built --trace/--only probe diagnostics; root-caused 110 RevEng reconstruction "failures" as a rename-script coverage gap (not engine bugs); identified that the probe redundantly re-implements the engine's JSONL gathering (main-only) and should be consolidated onto the engine path
Conversation name: Investigate why RevEng/.gitignore (and 110 RevEng files) fail Engine B reconstruction → trace instrumentation → rename-coverage-gap root cause → probe-vs-engine divergence
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/f8baf3f0-8940-4bf5-a744-21def91681b3.jsonl
Plan file: None — investigation + diagnostics session (no plan file produced). Related prior work: `plans/implementation-notes-make-engine-b-the-main-engine.md` (toward making Engine B the primary engine — aligned with the consolidation conclusion below).

## Branch
`develop` based on `develop` (single commit `1a9f098 Initial commit`; ALL RevEng source is untracked/modified — nothing is committed). CWD for all work: `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.

## Goal
The Engine B mismatch report listed 136 in-project RevEng files (e.g. `.gitignore` = 143/0/6/0) that "fail to reconstruct" despite the user's belief that every RevEng file has full JSONL coverage. Build a dense, opt-in single-file trace of the Engine B reconstruction pipeline to root-cause the failures, then determine whether they are engine bugs or data-coverage gaps — and fix the right thing.

## Current State
Investigation COMPLETE; root cause confirmed; an architectural fix is identified but NOT yet implemented (pending user go-ahead).

- **Trace instrumentation built (works).** New shared logger `api/trace-log.js` (`enableTrace`/`isTraceEnabled`/`logTrace`). `tools/probe-v2-shared.js` parses new `--trace` and `--only <substring>` flags. `tools/probe-engine-b.js` gained: `filterIdentitiesByPath` (the `--only` filter, applied AFTER enumeration), per-step `logTrace`, a `dumpMismatches` flag (set by `--only`) that persists `finalVerdict.mismatchedLines` into `tools/probe-results-engine-b-only.json`, and a (currently UNUSED) `sj = require('../api/subagent-transcript-discovery')`. `tools/probe-projects-v2.js` traces `enumerateFileIdentities` (alias groupings/skips/merges), gated by `shouldTracePath(only,…)` so `--only` runs stay scoped. `api/file-events-extractors.js` `buildAuthoredEvent` logs per-target `KEPT`/`EXCLUDED` (with the `statusByLine==='ignored'` rewind reason). NOTE: file-agnostic per-edit firehose logs were added then **reverted** in `api/edit-stream-extraction.js` and `api/file-event-observations.js` (net-zero there); a recursion change to `api/transcript-discovery.js` `enumerateJsonlFiles` was added then **reverted** (net-zero).
- **Root cause (CONFIRMED, not an engine bug):** the 110 residual failures are a transcript COVERAGE gap. The function-rename pass was applied by `plans/naming/rename-functions.py` — a Python script that reads `function-names-enriched.csv` and rewrites files directly via `open()/regex-sub/write()`. A script write produces **no Edit/Write tool_use records**, so the only way the new content can enter belief is a later Read/cat/snapshot. For the failing files that follow-up read never happened in a captured session, so the engine faithfully reconstructs the last OBSERVED (pre-rename) state → mismatch on the renamed tokens. Confirmed for `api/bash-op-events.js`: the post-rename name `extractEventsFromBashFileOp` appears in ZERO reads of that file (only in callers) and ZERO file-history snapshots; the rename ran 25× in session `2cfe77ab` (June 16–19). `.gitignore`'s 6 lines are ordinary post-read edits (added `__pycache__`, reordered `.plate/`) — same mechanism, not a rename.
- **Probe-vs-engine divergence (the real structural problem):** the PROBE (`tools/probe-engine-b.js`) gathers transcripts via the **main-only** cache (`scanProjectsFolderOnce`→`enumerateJsonlFiles`), while the ENGINE (`tools/track-line-states.js#runMain`→`api/reconstruct-file.js#reconstructFileWithSeed`) gathers via the **combined main+subagent** cache (`loadCombinedCache`). So subagent reads/edits are invisible to the probe. Proven MECHANICALLY by `probes/gen-callgraph.js` (call graph extracted from source): the engine entry reaches `subagent-transcript-discovery`; the probe entry does not.
- **Sync result:** user synced JSONLs mid-session. Re-running the probe cleared **28 of 138** failures (rename-drift files that had since been re-read), leaving **110** (`109 mismatch`, `1 both`), all via `on-disk`.
- **Artifacts produced (in `probes/`):** `engine-vs-probe-design.html` (hand-drawn comparison), `callgraph.html` + `gen-callgraph.js` (mechanical, source-derived call graph; user explicitly wanted the non-interpreted version), `gitignore_probe_result.txt`, `all-reveng_postsync.txt`. Diagnostic dumps: `tools/probe-results-engine-b-only.json` (post-sync, with `mismatchedLines`) and `tools/probe-results-engine-b-only.PRESYNC.json`.

## What Remains
1. **DECIDE + EXECUTE the consolidation (the open question the session ended on).** Gut `probeOneFileIdentityEngineB`'s reconstruction internals (`findReferencingJsonls(main-only)` + `orderTranscriptsByFirstTouch` + `gatherReferenceSources` + `gatherFileEventsAcrossTranscripts`) and have it delegate to the engine: `api/reconstruct-file.js#reconstructFileWithSeed` (seedless) over `loadCombinedCache(projectsDir)`. This fixes the subagent-cache divergence as a side effect.
2. **Reuse the existing engine-backed reporter** `api/reconstruction-coverage.js` (`classifyVerdict` → PASS/FAIL/INDETERMINATE, `diagnoseFailure` → where/why it broke + contributing paths, `buildRerunCommand`) for the per-file failure docs + summary table, instead of the probe's bespoke verdict. (`tools/reconstruction-coverage-report.js` already drives this over the real engine.)
3. **Remove the now-dangling `sj` require** at `tools/probe-engine-b.js` (~line 13) if the refactor doesn't use it directly.
4. **Re-run** `node --max-old-space-size=8192 tools/probe-engine-b.js --projects-dir /Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects --only "Desktop/claude code src/RevEng/"` and confirm how many of the 110 clear once subagent transcripts are included via the engine path.
5. **Accept/annotate the residue.** Files renamed-by-script-and-never-reread are legitimately unreconstructable from the transcripts — classify them (INDETERMINATE/coverage-gap), don't "fix" them.
6. Run the JS regression sweep + the touched-file tests (below) before committing anything. Nothing is committed; branch off `develop` first if committing.

## Key Files
- `tools/probe-engine-b.js` — the probe (`runProbeEngineB`/`probeOneFileIdentityEngineB`); the divergent reconstruction to retire/delegate. Holds new `--trace`/`--only`/`dumpMismatches` + dangling `sj` require.
- `api/reconstruct-file.js` — THE ENGINE. `reconstructFileWithSeed(opts)` (single reconstruction path) + `loadCombinedCache(projectsDir)` (main ∪ subagent). Delegate to this.
- `api/reconstruction-coverage.js` — engine-backed batch reporter (`classifyVerdict`/`diagnoseFailure`/`buildRerunCommand`). Reuse for failure docs.
- `tools/reconstruction-coverage-report.js` — its CLI driver (git-seed/repo-scoped).
- `api/subagent-transcript-discovery.js` — existing subagent-inclusive discovery (`findReferencingJsonlsIncludingSubagents`, `enumerateSubagentJsonls`). The intended subagent path — do NOT recurse `enumerateJsonlFiles`.
- `api/trace-log.js` — NEW shared trace logger.
- `api/file-events-extractors.js` — `buildAuthoredEvent` KEPT/EXCLUDED target-scoped trace; the `statusByLine[line+1]==='ignored'` rewind gate.
- `tools/probe-v2-shared.js` — `--trace`/`--only` parsing.
- `plans/naming/rename-functions.py` + `plans/naming/function-names.csv` — the script + source CSV (oldName/newName) that caused the coverage gap.
- `probes/gen-callgraph.js` → `probes/callgraph.html` — mechanical source-derived call graph (rerun: `node probes/gen-callgraph.js [depth]`).

## Context the Next Agent Won't Have
- **The 110 failures are NOT engine bugs — they are a rename-script coverage gap.** Reconstruction needs a post-rename Read/cat/snapshot to capture the new content; the script wrote files directly (no Edit records) and the files weren't re-read, so no observation exists. Do not "fix the engine" to make these pass.
- **Do NOT fix the subagent gap by recursing `enumerateJsonlFiles`.** It was tried and reverted: it double-counts subagents and breaks `test_findReferencingJsonlsIncludingSubagents_sortsParentMainAndItsSubagentsAdjacently`. `api/subagent-transcript-discovery.js` is the deliberate subagent path; the engine already uses it via `loadCombinedCache`.
- **The probe is redundant with the engine.** `api/reconstruction-coverage.js` already does PASS/FAIL/INDETERMINATE + failure diagnosis + rerun command over the real engine. The probe re-implements (worse) gathering and drifted to main-only. The session ended agreeing the right move is to make the probe a thin batch harness over `reconstructFileWithSeed` + reuse the coverage reporter. The next instruction is most likely "do that refactor."
- **The engine's combining happens in the CLI, not inside `reconstructFileWithSeed`.** `reconstructFileWithSeed` receives `opts.cache`; `tools/track-line-states.js#runMain` builds it via `loadCombinedCache`. (The mechanical call graph corrected an earlier hand-drawn chart on this point.)
- **User strongly prefers source-derived artifacts over hand-interpreted ones** — they rejected a hand-drawn flowchart and asked for the mechanical call graph (`gen-callgraph.js`). Prefer generated/verifiable over narrated.
- **Probe corpus + drift:** the probe compares reconstruction (from `jot-recovery/claude-data/projects` transcripts) against LIVE on-disk RevEng files, so anything edited since the last sync drifts. `--only` filters AFTER a full ~5-min corpus scan; always run node with `--max-old-space-size=8192`. `node` prints a harmless `Debugger listening…` preamble on stderr.
- **Not this session's work** (present in `git diff` against the single Initial commit but from prior sessions): the `isMeta` guard in `transcript-parsers.js`, the `require.main` fixes across tools, and the bulk of `track-line-states.js`/`git-file-state.js` changes.
- **Env gotchas (still true):** Stop hook runs `tests/test-<basename>.js` after each edit and trips on intentional RED phases; new files use 4-space indent, edits to existing 2-space files stay 2-space; `git status` floods with `.plate/captures/*`; the standard sweep globs `tests/test-*.js` (misses `*.test.js`).

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# Touched-file tests (transcript-discovery was reverted to original — should be GREEN again):
node tests/test-subagent-transcript-discovery.js     # expect 6 passed (was 5/1 while the bad recursion was in)
node tests/test-transcript-discovery.js              # 8 passed
node tests/test-transcript-parsers.js                # 13 passed
node tests/test-file-events-extractors.js            # passes
# Full JS regression sweep (excludes test-output-data.js):
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" >/dev/null 2>&1 || echo "FAIL: $f"; done; echo "sweep done"
# Reproduce the diagnostic dump (all RevEng files, with per-line mismatch detail):
node --max-old-space-size=8192 tools/probe-engine-b.js --projects-dir /Users/matkatmusicllc/Programming/jot-recovery/claude-data/projects --only "Desktop/claude code src/RevEng/"
# Mechanically prove the probe-vs-engine divergence:
node probes/gen-callgraph.js 3   # prints "Engine reaches subagent discovery: true | Probe ...: false"
```
