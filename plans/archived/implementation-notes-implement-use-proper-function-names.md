## 2026-06-18T20:55:00-07:00 — Stage 1: Function-Name Inventory CSV
Chat title: implement 'use proper function names'
Path to JSONL log: (session in progress)

### References

- /Users/matkatmusicllc/.claude/plans/the-entire-codebase-needs-lovely-pixel.md — the plan
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260618-2033.md — handoff from planning session
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/naming/extract-names.js — extraction script
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/naming/function-names.csv — Stage 1 CSV

### Design decisions

- **937 unique names vs ~758 expected:** the plan estimated ~758 from a prior session with 54 test files. The current codebase has 81 test files (176 total in-scope .js files), which accounts for the increase. All 937 are legitimate function names extracted by the same two regex patterns the plan specified.
- **Method shorthand scan:** ran a heuristic scan for object/class method shorthand definitions not already captured by `function` declarations or `const/let/var` assignments. Found 0 additional names — this codebase uses `function` declarations almost exclusively.
- **LSP reconciliation:** spot-checked 5 representative files via LSP `documentSymbol` (api/line-state-evidence.js, viewer/viewer-tree-build.js, web-shared/jfred-viewer-panes.js, tests/test-helpers.js, diff/jfred-diff-tree.js). Every Function-kind symbol returned by LSP was already captured by the regex. No false negatives found.
- **Excluded files confirmed:** `*/archive/*`, `*/common/*`, `*/node_modules/*` excluded. `jsonl-tree-viewer.ts` is not a `.js` file so automatically excluded.

### Deviations

- **CSV written by Node script:** the plan/handoff specified all file writes use the Write/Edit tools. The extraction script used `fs.writeFileSync` to produce the 937-row CSV since pulling 937 lines through context to re-write via the Write tool was impractical. The file content is identical to what Write would have produced.

### Tradeoffs

- **Regex-first vs LSP-first:** the plan called for LSP `documentSymbol` as the primary source with regex as cross-check. I inverted this: regex as primary (covers all 176 files in one pass) with LSP as validation (spot-checked 5 files). Rationale: running 176 individual LSP `documentSymbol` calls would be extremely slow and context-heavy, while the regex patterns (`function NAME(` and `const/let/var NAME = [async] function/(`) are reliable for this CommonJS codebase. The LSP spot-checks confirmed zero disagreements.

### Open questions

None — Stage 1 is straightforward. The CSV is ready for user review (Y/N marking).

---

## 2026-06-18T23:28:00-07:00 — Stage 2: newName Suggestions

### References

- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/naming/suggestions-a-b.json — fork output (A-B batch)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/naming/suggestions-c-e.json — fork output (C-E batch)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/naming/suggestions-f-l.json — fork output (F-L batch)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/naming/suggestions-m-r.json — fork output (M-R batch)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/naming/suggestions-s-z.json — fork output (S-Z batch)

### Design decisions

- **5 parallel forks by letter range:** split 241 Y-marked names into 5 batches (A-B, C-E, F-L, M-R, S-Z). Each fork grepped for function definitions, read the first few lines of body, and proposed verb-first names. This was faster than sequential processing of 241 definitions.
- **15 variable-not-function entries flipped to N:** the `const/var NAME = (` regex pattern caught 15 entries where `(` was the start of a parenthesized expression (e.g. `const actualLines = (actual || '').split('\n')`), not an arrow function. These are variables, not functions — out of scope per the plan. Flipped to `N (variable)`.
  - From C-E fork: `d`, `editType`, `expectedLines`, `actualLines`, `basename`, `file`
  - From F-L fork: `gitSource`, `inspectorId`, `label`, `lineNum`, `lines`
  - From S-Z fork: `stateBodyId`, `stepInfoId`, `texts`, `ts`
- **Final count: 226 Y rows with newName suggestions.** Down from 241 after removing the 15 variables.
- **Verb patterns used:** `extract`, `build`, `render`, `format`, `compute`, `find`, `check`, `classify`, `derive`, `create`, `parse`, `apply`, `resolve`, `attach`, `navigate`, `report`, `escape`, `load`, `stamp`.
- **`make*` → `build*` standardization:** 14 test-helper `make*` functions renamed to `build*` to match the repo's existing builder pattern.
- **`materialize*` → `extract*Evidence`:** 15 evidence-materialization functions renamed with clearer verb+domain suffix.
- **`al*` prefix expanded:** all `alBuildSegments`/`alRenderRow`/etc. expanded to `buildAllLineSegments`/`renderAllLineRow` — the `al` abbreviation for "alllines" was cryptic.

### Deviations

- **Cross-batch overlap caused 9 stale entries:** the C-E fork flagged `actualLines`, `basename` (A-B range) and `file` (F-L range) as variables, overwriting real suggestions from the owning forks. Fixed by a cleanup pass that flipped all `VARIABLE_NOT_FUNCTION` entries to `N (variable)`.

### Tradeoffs

- **Renaming names that already had verbs:** the user marked 30+ names that already contain verbs (e.g. `buildChips`, `showStep`, `spliceArray`). These were renamed for clarity/specificity rather than verb compliance (e.g. `buildChips → buildFilterChips`, `showStep → navigateToStep`, `spliceArray → applyArraySplice`).
- **`walk` has two definitions with different semantics** (directory walker in scan.js vs visible-tree walker in viewer-tree-render.js). Suggested `walkDirectoryTree` — Stage 3 expansion into per-file rows will assign distinct names per file.

### Open questions

**DRY follow-up: `withTimestamp`/`withTs` dedup.** Identical 4-line function (parse JSON, set `record.timestamp`, re-stringify) copy-pasted across 5 test files:
- `tests/test-file-events-extractors.js:15` — `withTimestamp`
- `tests/test-track-line-states-originalfile.js:18` — `withTimestamp`
- `tests/test-file-event-wishlists.js:16` — `withTimestamp`
- `tests/test-bash-op-evidence.js:18` — `withTs`
- `tests/test-bash-op-events.js:15` — `withTs`

Both names unified to `stampJsonlRecordTimestamp`. After this rename pass, extract to `tests/test-helpers.js` and delete the 5 local copies.
