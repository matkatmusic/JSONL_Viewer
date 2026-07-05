# Handoff: JSONL Tree Viewer v2 + Rewind Detection Algorithm

## Branch
No git repository. Working directory: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/`

## Goal
Build a ground-up JSONL transcript viewer (v2) and a rewind detection algorithm that classifies Claude Code rewinds as "code-restoration" or "conversation-only." The viewer shows conversational flow with branch detection, file edit badges (kept/ignored), and per-line type classification. The detection algorithm has been validated against 15 test scenarios (17 rewinds, 0 failures).

## Current State

### JSONL Tree Viewer v2
- **Stable file** (`JSONL-tree-viewer-v2.html`, 34KB): flat line list with all features through step 7 (diff). No conversational view or branches.
- **Dev file** (`JSONL-tree-viewer-v2-dev.html`, 66KB): full feature set including conversational view, branch detection, rewind classification, file edit kept/ignored badges, friendly labels for all 17 subtypes.
- Both served via Python HTTP server on port 8765: `http://localhost:8765/JSONL-tree-viewer-v2-dev.html?file=test-transcript.jsonl`

### Viewer features (dev file)
- 17 distinct color-coded subtypes (user prompts bright green, agent text bright orange, everything else in blue/purple/cyan/pink range)
- `{ }` expands raw JSON inline with syntax highlighting (keys bold, values normal weight)
- `[+]` shows/hides child nodes in conversational view
- Checkbox selects lines for JSON inspector; two selections trigger diff view
- Diff view with per-pane `◀ Line N ▶` navigation, each pane independently walks same-type lines skipping the other pane's line
- Jump links: clicking parentUuid, tool_use IDs, or any UUID in inspector/diff jumps to that line
- Filter bar with preset field chips (originalFile, structuredPatch, tool_use, etc.)
- "Prev/Next (same type)" buttons + "Diff with next same-type line" button
- Draggable resize handle on inspector panel
- Non-overlapping layout: line list and inspector are separate flexbox sections
- Conversational view: user prompts + agent text as top-level nodes, intermediates nested under [+]
- Branch detection: rewind fork points labeled with type (code restored / conversation only)
- Inactive branches collapsed by default
- File edit badges on conversational rows: `△ filename` with **kept**/**ignored** status
- Friendly labels for all child lines (tool_use: Edit, Hook_Success: PreToolUse:Read, Tool Result: Edit, etc.)
- Line range shown on unexpanded nodes: `[L15–27]`
- tool_use subtypes include tool name (tool-use-edit, tool-use-bash) for diff type-gating

### Rewind Detection Algorithm
- `detect-rewinds.js` (6KB): standalone CLI tool, 15/15 test scenarios passing
- `classify-edits.js` (3.3KB): classifies file writes as kept/ignored, refactored to use `jsonl-parse.js`
- `detect-rewinds.test.js` (7.8KB): test suite with 15 scenarios, 17 rewinds
- `jsonl-parse.js` (9.7KB): shared parsing utilities extracted from detect-rewinds.js

### Replay Engine (from prior session)
- `replay-edits.js` (18KB): 100% file reconstruction from JSONL transcripts
- 49 unit/integration tests, 29/29 controlled scenarios, 27/27 real-world files match
- See `plans/handoff-reveng-20260604-2145.md` for full details

## What Remains
1. **Merge dev into stable**: The `-dev.html` file has all features. Decide whether to replace `v2.html` with it or keep both.
2. **v1 viewer**: The original `jsonl-tree-viewer.html` + `viewer-*.js` files are still present. Decide whether to deprecate.
3. **Branch detection refinement**: Current branch rendering uses simple linear scan. Nested rewinds (scenario 8: 3 levels deep) render correctly but the indentation could be improved.
4. **`/exit` false positives in viewer**: The `detectRewinds()` function in the dev HTML filters `/exit` commands, but the conversational view's segment builder doesn't — `/exit` lines may appear as conversational turns.
5. **Scenario 7 edge case**: The `backup=null` heuristic (Window 3) catches it, but a theoretical scenario with the same pattern AND non-null backup would fail. No real-world case has triggered this.
6. **File count**: The HTML files are large (66KB for dev). Consider splitting JS into separate files if maintenance becomes difficult.

## Key Files
- `RevEng/JSONL-tree-viewer-v2-dev.html` — Full-featured viewer with conversational view, branches, edit badges (66KB, single file)
- `RevEng/JSONL-tree-viewer-v2.html` — Stable viewer, flat list only (34KB)
- `RevEng/detect-rewinds.js` — Rewind detection + classification CLI (6KB)
- `RevEng/detect-rewinds.test.js` — 15 test scenarios (7.8KB)
- `RevEng/classify-edits.js` — File edit kept/ignored classification (3.3KB)
- `RevEng/jsonl-parse.js` — Shared JSONL parsing utilities (9.7KB)
- `RevEng/replay-edits.js` — File reconstruction engine (18KB)
- `RevEng/plans/implementation-notes-bugs-expanding-a-witty-rainbow.md` — Comprehensive implementation notes including algorithm details, subtype table, all test scenarios
- `RevEng/plans/replay-kept-edits.md` — Plan for replay-verify functionality
- `/Users/matkatmusicllc/Programming/jot-recovery/plans/rewind-signal-test-scenarios.md` — Test scenario scripts (scenarios 3–17)

## Plan File
`/Users/matkatmusicllc/.claude/plans/bugs-expanding-a-witty-rainbow.md` — Original v2 viewer build plan (9 steps, all complete)

## Context the Next Agent Won't Have
- **Rewind detection has 3 layered signals**: (1) direct backward parentUuid jump, (2) indirect jump via parent chain walk (catches `system.away_summary` intermediaries), (3) sibling detection — two user prompts sharing same parentUuid. All three are needed; no single signal catches all cases.
- **Classification has 3 windows**: (1) unexplained version bump between two pre-landing snapshots, (2) unexplained version bump across the landing, (3) `backup=null` with version > 1 as tiebreaker. "Unexplained" = no `toolUseResult` file write between the snapshots to account for the version change.
- **`backup=null` is the critical discovery**: Code restoration consumes the backup file in `~/.claude/file-history/<sessionId>/`, leaving `backupFileName: null` in the snapshot. Conversation-only rewinds leave it intact. This is the only signal that works when file writes mask both comparison windows (scenario 7).
- **User edits outside Claude don't bump the version**: Verified in scenario 15. The file-history version only increments on Claude's writes and code restorations.
- **`classify-edits.js` was refactored**: It now imports from `jsonl-parse.js` instead of containing its own parsing logic. The user made this change between sessions.
- **The v2 viewer uses `subtype()` for everything**: color coding, diff type-gating, conversational view grouping, and friendly labels all derive from the same subtype classification function. Changing it affects all features.
- **tool_use subtypes include tool name**: `tool-use-edit`, `tool-use-bash`, etc. This was done so diff type-gating treats different tools as separate types (can't diff a Bash result with an Edit result).
- **The Python HTTP server serves from RevEng/**: Absolute paths in `?file=` don't work. Files outside RevEng need symlinks. The viewer strips quotes from the param and shows symlink instructions on failure.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# Run rewind detection tests (15 scenarios)
node detect-rewinds.test.js

# Run replay engine tests (49 tests)
node replay-edits.test.js

# Verify all controlled scenarios (29 match)
node verify-all-scenarios.js

# Test viewer in browser
open "http://localhost:8765/JSONL-tree-viewer-v2-dev.html?file=test-transcript.jsonl"
```
All CLI commands should report 0 failures.
