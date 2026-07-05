# Handoff: Share jsonl-parse.js library with browser-based JSONL viewer

## Branch
`develop` based on `master`

## Goal
Refactor the JSONL tree viewer HTML file to reuse functions from `jsonl-parse.js` instead of duplicating them inline. The viewer currently has its own copies of rewind detection, edit classification, snapshot search, and prompt filtering — all of which now exist as parameterized free functions in the shared library. Sharing eliminates ~115 lines of duplicated code and ensures algorithm fixes propagate to both CLI tools and the viewer.

## Current State
- `jsonl-parse.js` exports 12+ free functions (imperative style, no closures, all parameterized). Refactored across 3 sessions to this point.
- `classify-edits.js`, `detect-rewinds.js`, `replay-edits.js` all import from `jsonl-parse.js`. All tests pass: 49 replay-edits, 15 detect-rewinds.
- `JSONL-tree-viewer-v2-dev.html` has its own inline copies of the same algorithms in `<script>` blocks. All if-blocks have been converted to braces style.
- A new file `extract-file-state.js` exists (added between sessions) — handles cat/read/snapshot edit extraction.
- The user refactored further between sessions: functions were broken down to ≤10 lines each, `isIgnoredByRewind`, `buildRewindLineMap`, `buildStepEntry`, `convertRewindToOneBased`, `formatFlowStep`, `formatSingleRewind`, `extractTextFromContent`, `isCommandArtifact`, `walkParentChain`, `buildPromptEntry`, `checkPrevWindow`, `checkBeforeAfterWindow`, `checkBackupVersions`, `classifyByWindows`, `checkSiblingSignal`, `checkRewindSignals`, `buildRewindEntry`, `updateRewindTracking` were all extracted.

## What Remains
1. **Add browser/Node dual-mode guard to `jsonl-parse.js`**: Wrap `module.exports` in `if (typeof module !== 'undefined') { ... }` so the file works as both a Node.js module and a browser `<script src>` tag.
2. **Add `<script src="jsonl-parse.js"></script>` to `JSONL-tree-viewer-v2-dev.html`** before the main `<script>` block.
3. **Replace 5 directly-compatible viewer functions** with calls to the library versions (passing globals as arguments):
   - `isPrompt(obj)` → `isUserPrompt(obj)`
   - `lastSnapBefore(lineIdx)` → `findLastSnapBefore(snapshots, lineIdx)`
   - `firstSnapAfter(lineIdx)` → `findFirstSnapAfter(snapshots, lineIdx)`
   - `findBackJump(lineIdx)` → `findBackwardJump(LINES, UUID_TO_LINE, lineIdx)`
   - Inline prompt collection loop → `collectUserPrompts(LINES, UUID_TO_LINE)`
4. **Align `FILE_WRITES` data format**: The viewer stores bare line indices (`[0, 5, 12]`) while the library's `hasWriteBetween` expects objects (`[{line: 0, file: '...'}]`). Either:
   - (a) Change the viewer to store objects (matches library), or
   - (b) Build the objects on the fly when calling library functions
5. **After `FILE_WRITES` alignment, replace remaining viewer functions** with library calls:
   - `hasWriteBetween(a, b)` → `hasWriteBetween(fileWrites, a, b)` (with object-format fileWrites)
   - The entire `detectRewinds()` function (~115 lines) → `parseJSONLLines(text)` + `collectUserPrompts()` + `detectRewinds()` pipeline
   - `classifyEdits()` → use `classifyFileWrites()` pattern or `isIgnoredByRewind()`
6. **Test in browser**: Load a real JSONL transcript, verify conversational view renders correctly, branches display, edit badges show kept/ignored status, diff works.

## Key Files
- `RevEng/jsonl-parse.js` — Shared library with 12+ parameterized free functions (source of truth for algorithms)
- `RevEng/JSONL-tree-viewer-v2-dev.html` — Browser viewer with duplicated inline JS (~1700 lines total, ~500 lines of duplicated logic)
- `RevEng/classify-edits.js` — Example of a consumer that was already refactored to use the library
- `RevEng/detect-rewinds.js` — Example of a consumer that was already refactored to use the library
- `RevEng/extract-file-state.js` — Cat/read/snapshot edit extraction (new, added between sessions)
- `RevEng/replay-edits.js` — Replay engine, also refactored to use library

## Plan File
`/Users/matkatmusicllc/.claude/plans/replay-edits-js-classify-edits-js-detec-curious-galaxy.md` — The imperative refactoring plan (steps 0-9, all complete for the Node.js files)

## Context the Next Agent Won't Have
- **The `typeof module` guard is the simplest approach**: ES modules (`<script type="module">`) would break the viewer's `file://` workflow. Bundlers add complexity. The guard lets the same file work in both environments with zero build step.
- **FILE_WRITES format mismatch is the main blocker**: The viewer stores `FILE_WRITES = [0, 5, 12]` (bare indices) while the library stores `fileWrites = [{line: 0, file: 'foo.py', type: 'edit'}]`. The library's `hasWriteBetween` checks `.line` on each entry. This must be resolved before `hasWriteBetween`, `classifyRewindType`, or `detectRewinds` can be shared.
- **The viewer builds its data differently from `parseJSONLLines`**: The viewer populates `LINES`, `RAW_LINES`, `UUID_TO_LINE`, `TOOL_ID_TO_LINES`, `FIELD_INDEX`, and `FILE_WRITES` all in one pass in `loadJSONL()`. The library's `parseJSONLLines` returns `{ parsed, uuidToIdx, snapshots, fileWrites }`. The viewer needs `TOOL_ID_TO_LINES` and `FIELD_INDEX` which the library doesn't provide, so `loadJSONL` can't be fully replaced — but can call `parseJSONLLines` for the subset it covers.
- **User coding standards**: All if-blocks must use braces (`if (x) { ... }`), never single-line. All function names must contain verbs. Functions must be ≤10-15 lines. Imperative style, no nested functions, no closures.
- **The user refactored heavily between the last two sessions**: Many functions were broken into smaller pieces (≤10 lines each). Read the current file state, not the prior handoff notes — the code has changed significantly.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# Node.js tests must still pass after any changes to jsonl-parse.js
node replay-edits.test.js    # expect 49 passed
node detect-rewinds.test.js  # expect 15 passed

# Browser test: serve and load a transcript
python3 -m http.server 8765 &
open "http://localhost:8765/JSONL-tree-viewer-v2-dev.html?file=test-transcript.jsonl"
# Verify: conversational view renders, branches show, edit badges display kept/ignored
```
