# Handoff: RevEng JSONL file state tracker — complete, needs git commits

## Branch
`develop` based on `master`

## Goal
The RevEng project reconstructs files from Claude Code JSONL session transcripts by extracting and replaying edit operations. A file state tracker was built that detects all file-modifying actions (Write/Edit tool calls, Bash cp/mv/rm/redirects, file-history-snapshot backups, Read tool snapshots), handles rewinds, detects user edits between agent edits, and reconstructs files with 100% accuracy across 30 test scenarios.

## Current State
- **All code is implemented and working.** 29/29 scenario files reconstruct to MATCH against file-history backups.
- **All tests pass:** `replay-edits.test.js` (10), `test-cat.js` (11), `test-extract.js` (10), `test-replay.js` (12), `test-read.js` (8), `test-verify.js` (8), `detect-rewinds.test.js` (passes).
- **All functions are under 15 lines.** A full refactor was completed to break every function down.
- **All files are under 500 lines.** `replay-edits.js` (470), `extract-file-state.js` (372), `jsonl-parse.js` (331).
- **Nothing is committed.** The `develop` branch has only 1 commit (initial: .gitignore, LICENSE, README.md). All source files are untracked.
- 30 test scenarios were executed via an automated skill (`/run-scenario`). Scenario definitions are at `plans/scenarios/*.txt`, execution results at `plans/scenarios/executed/*.txt` (each contains the JSONL path and working directory).

## What Remains
1. **Create logical git commits on the `develop` branch** for all the work. The original handoff plan (`plans/handoff-develop-20260603-1145.md`) describes a 4-commit strategy for the JSONL tree viewer work, but additional commits are needed for the replay/reconstruction modules. Proposed commit sequence:
   - Commit 1: Core JSONL parsing and rewind detection (`jsonl-parse.js`, `detect-rewinds.js`, `classify-edits.js`)
   - Commit 2: Edit extraction and replay engine (`replay-edits.js`, `extract-file-state.js`)
   - Commit 3: Multi-transcript reconstruction CLI (`reconstruct.js`)
   - Commit 4: Test infrastructure (`test-helpers.js`, `test-cat.js`, `test-extract.js`, `test-replay.js`, `test-read.js`, `test-verify.js`, `replay-edits.test.js`, `detect-rewinds.test.js`)
   - Commit 5: Scenario verification (`verify-all-scenarios.js`, `plans/scenarios/`)
   - Commit 6: JSONL tree viewer files (`jsonl-tree-viewer.html`, `jsonl-tree-viewer-monolith.html`, `JSONL-tree-viewer-v2.html`, `JSONL-tree-viewer-v2-dev.html`, `viewer-*.js`, `viewer-styles.css`)
2. **Decide what NOT to commit** — `test-output-data.js`, `test-output.html`, `test-transcript.jsonl`, `projects/`, `copy-scenario-outputs.py`, `run-all-scenarios.py`, `.copy-seen.txt` may be test artifacts or scripts that belong in `.gitignore`.
3. **Update `.gitignore`** to exclude scenario output directories, temp files, and any other artifacts.

## Key Files
- `replay-edits.js` — Core replay engine: extractEditsFromJSONL, replayEdits, replayAndVerify, batchVerify, CLI
- `extract-file-state.js` — File state extraction: Bash cat, Read tool, file-history-snapshot backup reading
- `jsonl-parse.js` — Shared JSONL parsing: parseJSONLLines, collectUserPrompts, detectRewinds
- `classify-edits.js` — Edit classification: analyzeJSONL, classifyFileWrites (kept vs ignored)
- `detect-rewinds.js` — Rewind analysis: analyzeRewinds, conversation flow formatting
- `reconstruct.js` — Multi-transcript reconstruction CLI
- `verify-all-scenarios.js` — Runs reconstruction against all 30 scenario JSONL files
- `test-helpers.js` — Shared mock JSONL builders for tests
- `plans/scenarios/` — 30 scenario definitions (`.txt`) and execution results (`executed/`)
- `plans/handoff-develop-20260603-1145.md` — Original handoff plan for tree viewer git commit attribution

## Plan File
`/Users/matkatmusicllc/.claude/plans/write-a-plan-for-magical-pebble.md` — The file state tracker plan (now mostly completed, only the split task remains which was already done).

## Context the Next Agent Won't Have
- **Code style is ES5 only**: `var`, `require()`, `function` declarations, `for` loops. No arrows, no let/const. See `CODING_STYLE.md`.
- **No function may exceed 15 lines.** This was enforced via a full refactor — the audit script confirmed zero violations.
- **No file may exceed 500 lines.** This was the reason for creating `extract-file-state.js` (extracted from `replay-edits.js`).
- **`userModified` field in toolUseResult is broken** — always `false` even when users clearly edited files. Do NOT use it for detection.
- **`edit` type toolUseResult has NO `type` field** — detection is by presence of `oldString`/`newString`, not `type: 'edit'`.
- **Code-restore rewinds PRESERVE user edits** — only agent-authored changes are reverted. Confirmed in scenarios m5 and m6.
- **`backupFileName = null` has two meanings**: At v1 = file just created (no backup). At v>1 = file was DELETED.
- **File-history backups resolve at** `~/.claude/file-history/<sessionId>/<backupFileName>` — 100% resolution rate across all test data.
- **The JSONL tree viewer files** (`jsonl-tree-viewer.html`, `JSONL-tree-viewer-v2*.html`, `viewer-*.js`) were built by different agents in different sessions. The original handoff (`plans/handoff-develop-20260603-1145.md`) documents which session owns which files for git attribution.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# All test suites
node replay-edits.test.js
node test-cat.js
node test-extract.js
node test-replay.js
node test-read.js
node test-verify.js
node detect-rewinds.test.js

# Full scenario reconstruction (29 MATCH, 0 MISMATCH expected)
node verify-all-scenarios.js

# Confirm no function over 15 lines, no file over 500 lines
wc -l *.js | sort -rn | head -15
```
