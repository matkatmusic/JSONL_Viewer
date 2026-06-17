# Implementation Notes: Bash Cat Snapshot Detection in replay-edits.js

## 2026-06-03T09:15 — Implementation Complete

### Files Modified
- `RevEng/replay-edits.js` — added `stripCatLineNumbers`, `extractBashCatEdits`, modified `extractEditsFromJSONL`
- `RevEng/replay-edits.test.js` — added 11 new tests (35 total, all passing)

### Design Decisions

**Line-number regex uses alternation instead of unified character class:** The plan specified `\s?` after `[│\t]` to handle the optional space after the separator. This ate a content space in tab format (`     2\t    pass` → `   pass` instead of `    pass`). Fixed with alternation: `(?:│ ?|\t)` — the `│` format gets an optional trailing space, the `\t` format does not.

**Cat snapshot edits are not classified by classify-edits.js:** The cat snapshots are injected as "update" edits by `extractEditsFromJSONL`, but they won't appear in the classification output from `analyzeJSONL`. In `replayAndVerify`, unclassified edits default to "kept" (only explicitly "ignored" edits are filtered out), so cat snapshots correctly pass through to replay.

**Single-pass for edits, separate pass for cat detection:** Rather than complicating the main edit-extraction loop, `extractBashCatEdits` does its own pass over the parsed lines. The two arrays merge and sort by line number. This keeps the existing logic untouched.

### Deviations from Plan

**`extractBashCatEdits` takes `(lines, parsed)` arrays, not raw text:** The plan said the function takes `lines, parsed`. The implementation follows this — `extractEditsFromJSONL` builds the `parsed` array during its main loop and passes it to `extractBashCatEdits`.

### Verification Results

| Metric | Before | After |
|---|---|---|
| Total JSONL files | 21 | 21 |
| MATCH | 15 | 16 |
| MISMATCH (content) | 1 (scenario15) | 0 |
| MISMATCH (not found) | 5 | 5 |
| scenario15 | MISMATCH | **MATCH** |
| scenario12 | MATCH (2 edits) | MATCH (3 edits — picked up cat snapshot) |

### Open Questions

None — all plan items completed and verified.
