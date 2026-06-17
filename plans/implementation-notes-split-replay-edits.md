# Implementation Notes: Split replay-edits.js

Spec: `replay-edits-js-classify-edits-js-detec-curious-galaxy.md`

## Baseline (2026-06-03T11:45-07:00)

- replay-edits.test.js: 35 passed, 0 failed
- detect-rewinds.test.js: 15 passed, 0 failed, 0 skipped

## Part A: CLI args for replay-edits.js (2026-06-03T12:03-07:00)

Added `--jsonl`, `--verify`, `--output`, `--json` flags to the CLI entry point.
Tests: 35/35 pass. New CLI modes verified manually against test-transcript.jsonl.

- **Design decision:** When `--verify` is omitted and `--output` is omitted and `--json` is omitted, raw replayed content goes to stdout via `process.stdout.write()` (not `console.log()`) to avoid trailing newline corruption.
- **Design decision:** `--json` outputs pretty-printed JSON (2-space indent) for readability.
- **Design decision:** Exit code 1 on mismatch in verify mode, 0 on match. Replay-only mode always exits 0.

## Part B Step 1: isUserPrompt → jsonl-parse.js (2026-06-03T12:06-07:00)

Created `jsonl-parse.js` with `isUserPrompt`. Commented out the original in both `classify-edits.js` (inner function in `analyzeJSONL`) and `detect-rewinds.js` (top-level).
Tests: 35/35 replay-edits, 15/15 detect-rewinds.

- **Design decision:** Used the `detect-rewinds.js` version as the canonical copy (4-space indent, loop var `i`). Both versions were functionally identical — only whitespace/indent style differed. The `classify-edits.js` version used 2-space indent and loop var `j`.

## Part B Step 2: userText → jsonl-parse.js (2026-06-03T12:07-07:00)

Added `userText` to `jsonl-parse.js`. Commented out original in `detect-rewinds.js`.
Tests: 15/15 detect-rewinds.

## Part B Step 3: Wrap detect-rewinds.js in function (2026-06-03T12:10-07:00)

Wrapped lines 27-299 in `analyzeRewinds(text)`. Added `require.main === module` guard. Added `module.exports = { analyzeRewinds }`.
Tests: 15/15 detect-rewinds, 35/35 replay-edits.

- **Deviation:** This step goes beyond pure "move" — it adds a function wrapper. The plan explicitly acknowledged this. The function body is verbatim; only the wrapper and return statement are new.
- **Design decision:** The closure-dependent helpers (`hasFileWriteBetween`, `lastSnapBefore`, `firstSnapAfter`, `findBackwardJump`) remain inside `analyzeRewinds()` as inner functions. They close over its locals the same way they previously closed over module-level variables.

## Remaining Duplications

The following code is duplicated between `classify-edits.js` (`analyzeJSONL`) and `detect-rewinds.js` (`analyzeRewinds`):

| Function | classify-edits.js | detect-rewinds.js | Why duplicated |
|---|---|---|---|
| `lastSnapBefore(lineIdx)` | Inner function, closes over `snapshots` | Inner function, closes over `snapshots` | Both close over local arrays; can't extract without adding a parameter |
| `firstSnapAfter(lineIdx)` | Inner function, closes over `snapshots` | Inner function, closes over `snapshots` | Same reason |
| `hasWriteBetween(a,b)` / `hasFileWriteBetween(start,end)` | Inner, closes over `fileWrites` | Inner, closes over `fileWrites` | Same reason; also different names |
| `findBackJump(lineIdx)` / `findBackwardJump(lineIdx)` | Inner, closes over `parsed`, `uuidToIdx` | Inner, closes over `parsed`, `uuidToIdx` | Same reason; also different names |
| JSONL parsing loop | `snapshots.push({ line, files })` | `snapshots.push({ line, msgId, files })` | Output shapes differ — detect-rewinds includes `msgId` |
| Rewind detection loop | Returns 0-based `{ landingLine, parentLine, classification }` | Returns 1-based with `text`, `snapBefore`, `snapAfter` | Output shapes differ; detect-rewinds also builds `conversationSteps` |

### Solution to eliminate these duplications

Parameterize the closure-dependent helpers to accept their data as arguments:

```
lastSnapBefore(snapshots, lineIdx)
firstSnapAfter(snapshots, lineIdx)
hasWriteBetween(fileWrites, startLine, endLine)
findBackwardJump(parsed, uuidToIdx, lineIdx)
```

Then move them to `jsonl-parse.js`. Both consumers would import and call them, passing their local arrays. This changes each function's signature (adding one or two parameters) but not its logic.

The parsing loop and rewind detection loop have genuine behavioral differences and should remain separate.
