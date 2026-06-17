# Handoff: Implement Unified JFReD Debugger View

## Branch
`develop` (no git repository — working directory only)

## Goal
Unify two existing HTML tools — a JSONL tree viewer with branch detection (`JSONL-tree-viewer-v2-dev.html`) and a file reconstruction debugger (`jfred.html`) — into a single `jfred-unified.html` that shows the branch-based JSONL browser alongside reconstruction state panes. Also integrate the new `unified-reconstruct.js` engine as an alternative to the old `buildFileStateHistory` engine via a toggle.

## Current State
- **unified-reconstruct.js** (500 lines): Fully implemented and tested. Confidence-ranked source cascade (snapshot > originalFile > Read > cat > structuredPatch > edit-only). Includes backup file reading from `~/.claude/file-history/`, snapshot timestamp extraction, and rewind filtering. 33/33 scenarios match (29 file-content + 4 empty-expected).
- **test-unified-reconstruct.js** (576 lines): 67 tests, all passing. Covers every exported function plus integration scenarios.
- **jfred-alllines.js** (280 lines): All-lines branch view module for JFReD. Conversational grouping, branch detection, step highlighting with STEP badges, expand/collapse segments. Already wired into jfred.html with a toggle button.
- **verify-unified-scenarios.js** (130 lines): Standalone scenario verification for the unified engine.
- **Full test suite**: 170 tests across 10 test files, all passing. 29/29 original scenarios match. 33/33 unified scenarios match.
- **HTTP server**: `python3 -m http.server 8765` running in the RevEng directory. JFReD at `http://localhost:8765/jfred.html`.
- **Plan file written**: `~/.claude/plans/gentle-launching-tide.md` contains the full implementation plan for `jfred-unified.html` with detailed pipeline traces of both tools.

## Task List

| # | Status | Task | Blocked By |
|---|--------|------|------------|
| 6 | completed | Run unified-reconstruct against all 30 scenarios | — |
| 7 | pending | Run unified-reconstruct against real-world JSONL files | — |
| 8 | pending | Validate UserEdit patch recording on scenarios s18-s23 | — |
| 9 | pending | Integrate unified-reconstruct.js into JFReD | #7, #8 |
| 10 | pending | Phase 6 polish for JFReD (rewind overlay, step filtering, URL deep-linking) | #9 |
| 11 | completed | Add all-lines toggle view with branch detection to JFReD | — |

**New work (from this session's plan):**
- Build `jfred-unified.html` — the unified view combining both tools
- Create `jfred-adapter.js` — bridges unified-reconstruct steps into the pane-compatible shape
- Create `jfred-unified-panes.js` — handles Current State pane and non-step-line logic
- Create `jfred-unified-load.js` — loading, file selection, engine toggle, event wiring

## What Remains

1. **Fix `unified-reconstruct.js` var shadowing** — Line 4 declares `var analyzeJSONL, stripCatLineNumbers, applySingleEdit` which shadows browser globals. Remove from `var` declaration; assign bare inside the `if (typeof module)` block (matching classify-edits.js pattern). Verify 67 tests + 33 scenarios still pass.

2. **Run unified-reconstruct against real-world JSONL files** (Task #7) — Test against probe-projects real-world JSONL files. Measure improvement over current 52% pass rate.

3. **Validate UserEdit patch recording on s18-s23** (Task #8) — These scenarios have known user edits. Verify patch log captures them as UserEdit entries with correct before/after diffs.

4. **Extend `jfred-state.js`** — Add 5 fields: `engine`, `branchViewId`, `selectedLineIdx`, `nearestPrevStep`, `nearestNextStep`.

5. **Parameterize `jfred-alllines.js` container** — Change hardcoded `document.getElementById('step-list')` to use `state.branchViewId || 'step-list'`. Add edit badges to segments (scan for toolUseResult, show kept/ignored status). Export `bindBranchViewEvents(containerId)`.

6. **Create `jfred-adapter.js`** (~120 lines) — Main function `adaptUnifiedSteps(jsonlText, targetFile)` walks unified steps maintaining running state, detects drift as UserEdit, emits steps in the `{type, filename, contents, expectedState, actualState, isUserEdit, edit, jsonl}` shape that `updatePanes()` consumes.

7. **Create `jfred-unified-panes.js`** (~100 lines) — Handles Current State pane (top-middle), non-step-line selection (find nearest prev/next step), and JSON inspector for both step and non-step lines.

8. **Create `jfred-unified-load.js`** (~160 lines) — Loading, file selection dispatching to old or unified engine, engine toggle handler, branch view click wiring, keyboard nav.

9. **Create `jfred-unified.html`** (~350 lines) — Three-column top half (branch-view 300px | current-state flex:1 | json-inspector 400px), three-column bottom half (previous | computed | next). Script load order: shared engines as regular scripts (json-inspector → diff-engine → jsonl-parse → extract-file-state → git-file-state → classify-edits → replay-edits → file-state-history → unified-reconstruct), then ES modules.

10. **Phase 6 polish** (Task #10) — Rewind overlay (dimmed ignored steps), step filtering by type, URL deep-linking to specific steps/files.

## Plan File
`~/.claude/plans/gentle-launching-tide.md` — Contains the full implementation plan with:
- Detailed trace of how the tree viewer creates the branch view (parsing → subtype classification → rewind detection → segment building → fork point detection → branch rendering → HTML structure)
- Detailed trace of how the debugger creates the steps view (edit extraction → buildFileStateHistory with user-edit gap detection → step rendering → showStep → updatePanes with divergence checking)
- Table of overlapping functionality between both tools
- Step-by-step implementation with exact file changes, function signatures, and adapter algorithm pseudocode
- DOM structure, CSS layout, and script load order for the unified HTML

## Key Files
- `RevEng/unified-reconstruct.js` — new reconstruction engine (500 lines, needs var shadowing fix for browser)
- `RevEng/test-unified-reconstruct.js` — 67 tests for the new engine
- `RevEng/jfred-alllines.js` — branch view module (needs container parameterization)
- `RevEng/jfred-state.js` — shared state (needs 5 new fields)
- `RevEng/jfred-panes.js` — bottom three panes rendering (reused unchanged)
- `RevEng/jfred-layout.js` — resize handle + scroll sync (reused unchanged)
- `RevEng/file-state-history.js` — old engine step builder (reused unchanged)
- `RevEng/replay-edits.js` — edit extraction + applySingleEdit (reused unchanged)
- `RevEng/classify-edits.js` — rewind detection via analyzeJSONL (reused unchanged)
- `RevEng/jfred.html` — current debugger (keep working, don't modify)
- `RevEng/JSONL-tree-viewer-v2-dev.html` — current tree viewer (keep working, don't modify)
- `RevEng/verify-unified-scenarios.js` — scenario verification for unified engine
- `RevEng/verify-all-scenarios.js` — scenario verification for old engine
- `RevEng/plans/unified-reconstruction-algorithm.md` — pseudocode spec
- `RevEng/plans/unified-reconstruction-plan.md` — implementation plan for the engine
- `RevEng/plans/implementation-notes-unified-reconstruction-plan.md` — design decisions and deviations

## Context the Next Agent Won't Have

- **var shadowing trap**: `unified-reconstruct.js` line 4 declares `var analyzeJSONL, stripCatLineNumbers, applySingleEdit`. In the browser, this shadows globals from earlier script tags. The `if (typeof module)` guard prevents the `require()` assignment, so these are `undefined` in browser scope. Fix: remove from `var`, assign bare inside the `if` block (see `classify-edits.js` lines 19-21 for the correct pattern: `parseJSONLLines = jsonlParse.parseJSONLLines;` without `var`).

- **Function collision checking**: Run `grep -oh "^function [a-zA-Z_]*" *.js | sort | uniq -d` before and after adding new files. Engine modules loaded as regular `<script>` tags share browser global scope. ES modules (`type="module"`) are scoped and safe.

- **File size limits**: 500-line hard limit per file, 300-line soft limit (hook warns but doesn't block). Functions ≤15 lines. ES5 `var` style for Node modules, modern JS (`const/let`) for browser-only ES modules.

- **Snapshot content field**: `file-history-snapshot` records may have inline `content` OR only `backupFileName` pointing to `~/.claude/file-history/<sessionId>/`. The unified engine handles both; the old engine's `extractSnapshotEdits` only handles `backupFileName`.

- **Snapshot timestamps**: `file-history-snapshot` records have their timestamp at `snapshot.timestamp` (nested), NOT at the top level. The `getSnapshotTimestamp()` function handles this. Without it, snapshots sort before edits and reconstruction breaks.

- **Rewind observation processing**: The plan's algorithm spec said "process observations within rewind ranges." This was WRONG — processing snapshot observations within code-restoration rewind ranges restores content that should be undone (s9 scenario failure). The fix: skip ALL steps within rewind ranges. Don't process observations.

- **Browser guard pattern**: Engine modules use `if (typeof module !== 'undefined' && typeof require === 'function')` for require(). CLI entry points use `if (typeof require !== 'undefined' && require.main === module)`. Functions calling `require('os')` need `if (!fs || !path) { return null; }` guards.

- **The `parseJSONLLines` rename trap**: `replay-edits.js` originally had `parseJSONLLines` which shadowed `jsonl-parse.js`. It was renamed to `replayParseLines`. If adding new top-level functions, check for collisions.

- **User preferences**: No arrow functions in Node modules. Functions ≤15 lines. No npm dependencies. TDD required per `~/.claude/guides/tdd.md`. Single-condition branching per `~/.claude/guides/single-condition-branching.md`.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"
# Unit tests (170 total across 10 files)
for f in test-*.js; do node "$f" 2>&1 | grep -E "passed|failed"; done
# Old engine scenario verification (29/29 baseline)
node verify-all-scenarios.js 2>&1 | grep -E "MATCH|MISMATCH"
# Unified engine full scenario verification (33/33)
node verify-unified-scenarios.js 2>&1 | head -5
# Function collision check
grep -oh "^function [a-zA-Z_]*" *.js | sort | uniq -d
# Browser test (start server if not running)
# python3 -m http.server 8765 &
open http://localhost:8765/jfred-unified.html
```
