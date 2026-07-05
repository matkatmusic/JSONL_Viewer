# Handoff: Implement Unified Reconstruction Algorithm for RevEng JSONL Replay Engine

## Branch
`develop` based on `main` (single commit: `1a9f098 Initial commit`)

## Goal
Build a new file reconstruction algorithm (`unified-reconstruct.js`) that replaces the current flat replay approach in `replay-edits.js`. The unified algorithm uses a confidence-ranked source cascade (snapshot > originalFile > Read > cat > structuredPatch) at each step, detects user edits by diffing computed state against ground-truth sources, and produces a definitive patch log — the complete chain of diffs (both user and agent edits) that transforms an empty file into its final state.

## Current State
- **JFReD debugger (Phases 1-5 complete):** A working browser-based tool at `jfred.html` that visualizes step-by-step file reconstruction. Uses ES modules for JFReD files, regular scripts for shared/engine modules. Layout: top half (step list + Actual State / JSON Inspector side by side), bottom half (Previous / Computed / Next panes with MATCH/MISMATCH badges, synchronized scrolling, Diff Only toggle).
- **Reusable components extracted:** `json-inspector.js` (69 lines, 17 tests), `diff-engine.js` (88 lines, 14 tests) — shared by JFReD and the tree viewer.
- **Browser guards added:** All 6 engine modules have `typeof module !== 'undefined'` guards. Function collision fixed (`parseJSONLLines` renamed to `replayParseLines` in replay-edits.js). Unguarded `require.main` and `require('os')` calls fixed.
- **Snapshot-reconstruction prototype:** `snapshot-reconstruction.js` proves the snapshot-based approach works — 28/28 MATCH on scenario files with reconstruction steps.
- **Turn analyzer tool:** `turn-analyzer.js` splits JSONL into agentic turns, classifies file-modifying turns, checks snapshot presence. Confirmed: snapshots are ~82% available (not 100%) due to `selectableUserMessagesFilter` gating.
- **All tests green:** 103 unit tests pass (9 test files), 29/29 scenarios match, 0 mismatches.
- **Algorithm spec complete:** `plans/unified-reconstruction-algorithm.md` — the pseudocode spec with the `applyAndAccountForDrift` / `diff` / `applySourceToState` / `record` functions and the `if/else if` source cascade.
- **Implementation plan complete:** `plans/unified-reconstruction-plan.md` — 14 functions with code snippets, step object shape, rewind integration, testing strategy.

## What Remains
1. Implement `unified-reconstruct.js` following `plans/unified-reconstruction-plan.md` — all 14 functions, ≤500 lines, ES5 var style, functions ≤15 lines.
2. Write `test-unified-reconstruct.js` using TDD (red-green) following the project's `run`/`assert` pattern from `test-helpers.js`.
3. Run against all 30 scenarios — must match or exceed 29/29 from the current engine.
4. Run against the probe-projects real-world JSONL files — measure improvement over current 52% pass rate.
5. Test divergence/patch recording: scenarios s18-s23 have known user edits — verify patch log captures them as UserEdit entries.
6. Integrate `unified-reconstruct.js` into JFReD as an alternative reconstruction mode (wire `reconstructFile` into `jfred-load.js` alongside the current `buildFileStateHistory`).
7. Phase 6 polish for JFReD: rewind overlay (dimmed ignored steps), step filtering, URL deep-linking.

## Key Files
- `RevEng/plans/unified-reconstruction-algorithm.md` — the algorithm spec (pseudocode, source cascade, patch log design)
- `RevEng/plans/unified-reconstruction-plan.md` — the implementation plan (14 functions with code snippets)
- `RevEng/plans/implementation-notes-jfred.md` — design decisions, deviations, open questions from JFReD build
- `RevEng/snapshot-reconstruction.js` — working prototype of snapshot-only reconstruction (28/28 MATCH)
- `RevEng/turn-analyzer.js` — agentic turn analysis tool
- `RevEng/replay-edits.js` — current replay engine (the thing being replaced/augmented)
- `RevEng/file-state-history.js` — current step-through data model (used by JFReD)
- `RevEng/extract-file-state.js` — extracts cat/read/snapshot edits from JSONL
- `RevEng/jfred-load.js` — JFReD entry point (needs unified-reconstruct integration)
- `RevEng/jfred-steps.js` — step rendering (needs to display patch log entries)
- `RevEng/jfred-panes.js` — three-pane rendering (needs to show UserEdit vs AgentEdit patches)
- `RevEng/verify-all-scenarios.js` — scenario test runner (29/29 baseline)
- `RevEng/test-helpers.js` — shared test infrastructure (run/summary/JSONL builders)

## Plan File
`RevEng/plans/unified-reconstruction-plan.md`

## Context the Next Agent Won't Have
- **Function collision trap:** `replay-edits.js` originally had a `parseJSONLLines` function that shadowed `jsonl-parse.js`'s version in the browser. It was renamed to `replayParseLines`. If you add new top-level functions to engine modules, check `grep -oh "^function [a-zA-Z_]*" *.js | sort | uniq -d` for collisions.
- **Browser guard pattern:** Engine modules use `if (typeof module !== 'undefined' && typeof require === 'function')` to wrap require() calls. Also needed: `if (typeof require !== 'undefined' && require.main === module)` for CLI entry points, and `if (typeof require === 'undefined' || !fs || !path)` early returns in functions that call `require('os')` (see `resolveHistoryDir` and `findLastSnapshotContent` in extract-file-state.js).
- **Snapshot content field:** `file-history-snapshot` records store file content in `snapshot.trackedFileBackups[filePath].content` — but NOT all snapshots have a `content` field. Some only have `backupFileName` pointing to a file in `~/.claude/file-history/<sessionId>/`. The `snapshot-reconstruction.js` prototype only checks `content`, which is why it works on scenarios (they have content) but may miss real-world cases.
- **structuredPatch format:** The `structuredPatch` field on toolUseResult is an array of hunk objects from Node's `diff` library. Each hunk has `oldStart`, `oldLines`, `newStart`, `newLines`, and `lines` (array of strings prefixed with ` `, `+`, or `-`). See `tools/FileEditTool/utils.ts:366` for where it's generated.
- **User preferences:** No arrow functions — imperative style only. Modern JS (const/let, template literals, ES modules) for browser-only files. ES5 var style for Node modules. Functions ≤15 lines. Files ≤500 lines. No npm dependencies.
- **Pre-existing hook warnings:** replay-edits.js (505 lines), extract-file-state.js (374 lines), jsonl-parse.js (333 lines) all exceed the 300-line hook limit. These are pre-existing — the hook fires but doesn't block.
- **HTTP server for browser testing:** `python3 -m http.server 8765` is running in the RevEng directory. JFReD is at `http://localhost:8765/jfred.html`. The `projects` symlink points to `~/.claude/projects/` for path rewriting.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# Unit tests (103 total across 9 files)
for f in test-*.js; do node "$f" 2>&1 | grep -E "passed|failed"; done
# Scenario verification (29/29 baseline)
node verify-all-scenarios.js 2>&1 | grep -E "^MATCH|^MISMATCH"
# Snapshot reconstruction baseline (28/28)
node snapshot-reconstruction.js --scenarios 2>&1 | grep -v "(0 steps)" | grep -E "^MATCH|^MISMATCH|^---"
# Browser test
open http://localhost:8765/jfred.html
```
