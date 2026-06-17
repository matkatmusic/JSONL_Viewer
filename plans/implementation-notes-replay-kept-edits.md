# Implementation Notes: replay-kept-edits

## 2026-06-03T08:55 — Initial Implementation Complete

### Files Created
- `RevEng/replay-edits.js` — main module (CLI + programmatic API)
- `RevEng/replay-edits.test.js` — 24 unit tests, all passing

### Design Decisions

**Edit type detection without `type` field:** The JSONL data uses two shapes for file modifications: (1) `type: 'create'` / `type: 'update'` with a `content` field, and (2) no `type` field but `oldString`/`newString` for Edit tool operations. The spec said `type === undefined` for edits, which is correct — I detect edits by the presence of `oldString` or `old_string` rather than relying on a `type` field.

**Snake_case fallback fields:** The real JSONL data uses camelCase (`oldString`, `newString`, `replaceAll`), but the spec and classify-edits.js also check for snake_case variants (`old_string`, `new_string`, `replace_all`). I handle both, preferring camelCase when both exist.

**1-based vs 0-based line numbering bridge:** `extractEditsFromJSONL` uses 0-based line indices internally, but `analyzeJSONL` from classify-edits.js returns 1-based line numbers. The `replayAndVerify` function bridges this by converting `edit.line + 1` when looking up classification status.

### Deviations from Spec

**`formatResults` added:** The spec didn't mention a formatting function, but the CLI output format described in Section 6 required one. Added `formatResults(results)` to produce the specified output format.

**`jsonlFile` field on results:** Added a `jsonlFile` field to batch results so the CLI can display which JSONL file produced each result.

**`error` field for missing files:** When a target .py file doesn't exist on disk, the result includes an `error: 'file not found'` field in addition to the `diff` containing "not found on disk". This makes programmatic consumers easier to write.

### Verification Results (21 JSONL files)

| Category | Count | Details |
|---|---|---|
| MATCH | 15 | Classification correct, replay reproduces on-disk file |
| Not found on disk | 5 | `target_module.py` (3), `scenario4.py`, `scenario9.py` — files deleted/renamed after session |
| Content mismatch | 1 | `scenario15.py` — on-disk file has additional functions not in the JSONL (user edited manually after session) |

All 15 files that exist on disk and have complete edit history in their JSONL: **MATCH**.

### Open Questions

1. **scenario15.py mismatch:** The on-disk file has `multiply`, `add`, `subtract` functions that aren't in the JSONL's single create operation. This means either another session added those functions, or the user edited manually. Should this be flagged differently from a "file not found" mismatch?

2. **Multiple JSONL files targeting the same .py file:** Two JSONL files both target `scenario11.py` (99a40d06 and df472651). Both independently MATCH. Should `batchVerify` warn about or handle this case — e.g. by checking that the *most recent* session's replay matches?
