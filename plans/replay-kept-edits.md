# Plan: Replay Kept Edits and Verify Against On-Disk Files

## Goal

Validate the kept/ignored classification by replaying only the "kept" file edits from each JSONL transcript and comparing the result against the actual file on disk. If the replay matches, the classification is correct.

## Input

- JSONL files: `/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-jotVerifySequence/*.jsonl`
- On-disk files: `/Users/matkatmusicllc/Programming/jotVerifySequence/*.py`
- Classification tool: `RevEng/classify-edits.js`

## Steps

### 1. Discover file mappings

For each JSONL file in the project folder:
- Parse the JSONL and find all `toolUseResult` entries with `filePath`
- Extract the target filename (e.g. `scenario8.py`)
- Map: JSONL session ID → target .py filename

### 2. Run classify-edits

For each JSONL file:
- Call `analyzeJSONL(text)` to get the list of file writes with kept/ignored status
- Filter to only "kept" edits
- Preserve their order (by line number)

### 3. Extract edit content from JSONL

For each kept edit, read the `toolUseResult` from the parsed JSONL line:
- `type === 'create'`: use `content` field as the full file content (replaces everything)
- `type === undefined` (Edit tool): use `oldString`/`newString` to do a string replacement on the current in-memory content
- `type === 'update'`: use `content` field as the full file content (replaces everything)

Edge cases to handle:
- Multiple edits to the same file in sequence
- `replaceAll` flag on edit operations
- Files that don't exist on disk (deleted or renamed after the session)

### 4. Replay edits in memory

Start with an empty string. For each kept edit in order:
- **create/update**: set the in-memory content to `toolUseResult.content`
- **edit (oldString→newString)**: find `oldString` in the in-memory content and replace with `newString`. If `replaceAll` is true, replace all occurrences.

### 5. Compare with on-disk file

- Read the actual file from `/Users/matkatmusicllc/Programming/jotVerifySequence/<filename>`
- Compare the replayed in-memory content with the on-disk content
- Report: match or mismatch, with diff if mismatched

### 6. Output

For each JSONL file, print:
```
<session-id>.jsonl → <filename>
  Edits: N total, K kept, I ignored
  Replay: MATCH | MISMATCH
  [diff if mismatched]
```

## Implementation

Single Node.js script: `RevEng/replay-edits.js`
- Requires `classify-edits.js` for `analyzeJSONL()`
- Reads JSONL files, extracts edit content, replays, compares
- Returns results as a string from a function (same pattern as classify-edits.js)

### CLI interface

```
node replay-edits.js --jsonl-dir <path> --files-dir <path>
```

| Flag | Description | Example |
|---|---|---|
| `--jsonl-dir` | Directory containing JSONL transcript files | `/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-jotVerifySequence` |
| `--files-dir` | Directory containing the on-disk files that were produced | `/Users/matkatmusicllc/Programming/jotVerifySequence` |

The script:
1. Scans `--jsonl-dir` for all `*.jsonl` files
2. For each, discovers the target filename from `toolUseResult.filePath`
3. Replays kept edits in memory
4. Reads the matching file from `--files-dir`
5. Compares and reports

### Programmatic interface

```js
var replay = require('./replay-edits');

// Replay a single JSONL file and compare against on-disk content
var result = replay.replayAndVerify(jsonlText, onDiskContent);
// Returns: { filename, totalEdits, kept, ignored, match, replayedContent, diff }

// Batch-verify a directory pair
var results = replay.batchVerify(jsonlDir, filesDir);
// Returns: array of result objects
```

## Verification

- All scenarios with no rewinds should trivially match (all edits are kept)
- Scenarios with rewinds: the replayed content should match because ignored edits were reverted by code restoration
- Any mismatch indicates either a classification bug or a missing edit type
