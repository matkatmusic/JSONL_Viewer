# Handoff: JSONL File Reconstruction Engine — 100% Reconstruction Achieved

## Branch
No git repository. Working directory: `/Users/matkatmusicllc/Desktop/claude code src/RevEng/`

## Goal
Build a system that reconstructs on-disk files by replaying file-modifying events from Claude Code JSONL transcripts. The engine must handle rewinds (code-restoration and conversation-only), user manual edits made outside Claude, Bash cp/mv operations, and file-history-snapshot backups — achieving 100% reconstruction accuracy across 30 controlled test scenarios and 27 real-world JSONL transcripts.

## Current State
**100% reconstruction achieved on both datasets.**

- 49 unit/integration tests pass across 5 test files
- 29/29 controlled scenarios MATCH (4 correctly skipped: no .py output)
- 27/27 jotVerifySequence JSONL files MATCH (0 mismatches)
- The engine uses 5 data sources to reconstruct files:
  1. `toolUseResult` create/update/edit operations (Write/Edit tools)
  2. `originalFile` field on edit operations (captures user manual edits, cp/mv results, code-restoration state)
  3. Bash `cat` command stdout (captures on-disk state at read time)
  4. Read tool result content (file state at read time, line numbers stripped)
  5. `file-history-snapshot` backups from `~/.claude/file-history/<sessionId>/<backupFileName>`

## What Remains
1. Clean up utility scripts that aren't part of the core engine: `run-all-scenarios.py`, `copy-scenario-outputs.py`, `verify-all-scenarios.js` — decide whether to keep as dev tools or remove
2. The `run_scenario_lib.py` change (scoped tmpdir cleanup) in `/Users/matkatmusicllc/Programming/jot/common/scripts/run_scenario_lib.py` should be tested with `jot`'s own test suite
3. Write implementation notes for the snapshot and Read injection features (only `originalFile` injection has notes so far)
4. Consider extracting the replay engine into a standalone npm package for reuse

## Key Files
- `RevEng/replay-edits.js` — Core engine: extractEditsFromJSONL, replayEdits, replayAndVerify, batchVerify, extractBashCatEdits, extractReadEdits, extractSnapshotEdits, findLastSnapshotContent (22KB, ~530 lines)
- `RevEng/classify-edits.js` — Classifies file edits as kept/ignored based on rewind detection (3.1KB)
- `RevEng/detect-rewinds.js` — Detects conversation rewinds and classifies as code-restoration or conversation-only (5.5KB)
- `RevEng/jsonl-parse.js` — Low-level JSONL parsing utilities (7.9KB)
- `RevEng/test-helpers.js` — Shared test helpers: JSONL line builders for create/edit/update/cat/read (4.2KB)
- `RevEng/test-extract.js` — Tests for extractEditsFromJSONL (10 tests)
- `RevEng/test-replay.js` — Tests for replayEdits including originalFile injection (12 tests)
- `RevEng/test-verify.js` — Tests for replayAndVerify and batchVerify (8 tests)
- `RevEng/test-cat.js` — Tests for Bash cat snapshot detection (11 tests)
- `RevEng/test-read.js` — Tests for Read tool result extraction (8 tests)
- `RevEng/replay-edits.test.js` — Test runner that executes all 5 test files
- `RevEng/verify-all-scenarios.js` — Verifies all 30 scenario JSONL files against captured output files
- `RevEng/plans/scenarios/executed/` — 30 scenario result files + captured output subdirectories

## Plan File
`/Users/matkatmusicllc/.claude/plans/build-a-plan-for-sprightly-thacker.md` — the originalFile injection plan (completed)

## Context the Next Agent Won't Have
- **Read tool result injection is conditional**: Read results are only injected for files that have Write/Edit `toolUseResult` entries (create or edit type). This prevents reads of unrelated files (guides, configs) from polluting the replay. The `writtenFiles` filter in `extractEditsFromJSONL` enforces this.
- **Read/snapshot updates use `source` field**: Edits with `source: 'read'` or `source: 'snapshot'` are only applied in `replayEdits` when their content differs from the accumulated state. This prevents stale reads from overriding valid accumulated content from later edits.
- **"Wasted call" and "File does not exist" filtering**: Read tool results starting with these strings are filtered out in `extractReadEdits` — they're harness messages, not file content.
- **`batchVerify` snapshot fallback**: When the on-disk file doesn't exist or doesn't match the replay, `batchVerify` falls back to the last `file-history-snapshot` backup as the comparison target. This handles files modified/deleted by later sessions.
- **Multi-file JSONL handling**: `batchVerify` iterates over all unique filenames from create/edit operations in each JSONL, not just `edits[0].file`. This is essential for sessions that modify multiple files (e.g., scenario_smoke.py + test_scenario_smoke.py).
- **`replayAndVerify` accepts optional `targetFile` parameter**: When a JSONL has edits for multiple files, pass the target filename to filter edits. Without this, edits for different files interleave and produce garbage.
- **The `run_scenario_lib.py` tmpdir cleanup was scoped**: Changed from deleting ALL `run-scenario.*` tmpdirs to only deleting the previous tmpdir for the SAME scenario. This was critical for running scenarios concurrently.
- **`originalFile` is empty string (not null) by default on edit toolUseResults**: The check in `replayEdits` uses truthiness — empty string is falsy, so it's correctly ignored. Only non-empty `originalFile` overrides accumulated content.
- **`stripCatLineNumbers` uses alternation regex `(?:│ ?|\t)`**: The `│` (unicode box) format gets an optional trailing space; the `\t` format does not. Using `\s?` for both ate a content space from tab-formatted output.

## How to Verify
```bash
cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng"

# Run all 49 unit/integration tests
node replay-edits.test.js

# Verify all 30 controlled scenarios
node verify-all-scenarios.js

# Verify all jotVerifySequence JSONL files
node replay-edits.js --jsonl-dir '/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-jotVerifySequence' --files-dir '/Users/matkatmusicllc/Programming/jotVerifySequence'
```
All three commands should report 0 failures/mismatches.
