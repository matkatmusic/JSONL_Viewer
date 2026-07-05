# Handoff: RevEng function-name audit & rename — IMPLEMENTED (252 renames applied, all tests pass)
Conversation name: implement 'use proper function names'
JSONL: n/a (transcript path intentionally omitted per skill rules)

## Branch
`develop` based on `develop` (root). Only one commit exists — `1a9f098 Initial commit`; all RevEng source is currently untracked/uncommitted. CWD is `RevEng/`, which is its own git repo.

## Goal
Rename every function in `RevEng/` whose name violates the guideline "name functions based on what they do, and include a verb in the name" so the code is self-documenting. This was a function-names-only pass — variable renaming is deferred. All renames were user-reviewed via a staged CSV handshake.

## Current State
**All 3 stages complete. 252 functions renamed across 176 in-scope `.js` files. 75/75 tests pass.**

- **Stage 1 (Inventory):** extracted 937 unique function names via regex + LSP spot-check. User marked 252 as Y (needs rename), 670 as N (already compliant). 15 false positives (variables caught by regex) removed.
- **Stage 2 (Suggestions):** verb-first `newName` proposed for all 252. User reviewed and refined through multiple rounds: grammar audit (90 fixes), precision audit (54 fixes), verb-first enforcement (25 N→Y flips), and manual corrections (LCS names, index→addToX convention, DRY unification).
- **Stage 3 (Execute):** enriched CSV with file/line/isExported/numReferences. Python rename script applied 285/292 rows. 7 mismatches fixed manually (4 exported cross-file residuals, 3 `ref` property-key corruptions). All cross-file `require()` namespace references patched.
- **Tests:** 75/75 pass. `test-output-data.js` is a browser data fixture (`window.JSONL_RAW`), not a Node test — always fails under `node`, pre-existing.
- **0 co-loaded global collisions** across all 6 HTML pages (verified before and after rename).

## What Remains
1. **Commit the work.** All source is untracked. The user needs to decide commit strategy (one big commit vs per-stage).
2. **DRY follow-up: `stampJsonlRecordTimestamp` dedup.** Identical 4-line function copy-pasted in 5 test files + exported from `tests/track-line-states-fixtures.js`. Extract to `tests/test-helpers.js`, delete the 5+ local copies.
3. **Variable-name audit (deferred pass).** The plan explicitly deferred variable renaming. 15 variables were identified during this pass as false positives. The `fieldIndex` variable in `web-shared/jfred-filter.js` should become `jsonFieldToJsonlLineNumberMap` per user's naming principle.
4. **UI smoke check.** Tests pass but the HTML viewer pages (`jfred/jfred.html`, `diff/jfred-diff.html`, `viewer/jsonl-tree-viewer.html`) should be opened in a browser to confirm renamed `<script>` globals still load correctly. The rename engine covered `*.html` files but a visual check is prudent.
5. **Residual false-positive audit (optional).** 36 old names still appear in the codebase as different identifiers (local variables, `require.main`, object properties). These are NOT broken references — they're common short words (`main`, `ref`, `fail`, `q`, `pair`, `patch`, `rc`) that happen to match renamed function names but are unrelated identifiers. A grep for each confirms no actual function references remain.

## Key Files
- `plans/naming/function-names.csv` — the master CSV: `oldName,needsRename,newName` for all 922 functions (252 Y, 670 N)
- `plans/naming/function-names-enriched.csv` — Stage 3 enriched CSV: `oldName,newName,file,line,isExported,numReferences` (299 rows after multi-file expansion)
- `plans/naming/rename-functions.py` — the rename engine (whole-token replacement with count assertions)
- `plans/naming/extract-names.js` — Stage 1 extraction script (regex + method shorthand scan)
- `plans/naming/enrich-csv.js` — Stage 3 enrichment script (file/line/export/reference discovery)
- `plans/implementation-notes-implement-use-proper-function-names.md` — implementation notes with design decisions, deviations, tradeoffs
- `/Users/matkatmusicllc/.claude/plans/the-entire-codebase-needs-lovely-pixel.md` — the original plan
- `plans/handoff-develop-20260618-2033.md` — handoff from the planning session (pre-implementation)

## Plan File
`/Users/matkatmusicllc/.claude/plans/the-entire-codebase-needs-lovely-pixel.md`

## Context the Next Agent Won't Have
- **LSP `rename` doesn't exist and `findReferences` misses CommonJS namespace access.** Verified: on exported `numberedLineEntries`, LSP returned only intra-file refs and missed `ev.numberedLineEntries(raw)` via `var ev = require('...')`. All renames reconciled LSP + repo-wide `\bname\b` grep across `*.js` + `*.html`.
- **Short names like `ref`, `pair`, `fail`, `main`, `q` are also used as local variables in other files.** The rename engine correctly scoped these as LOCAL (file-only replacement). The residual grep showing these names in other files is expected — they're different identifiers. DO NOT globally replace them.
- **`ref` as a function name vs `ref` as an object property key.** The whole-token rename of `ref → buildRef` corrupted object literals `{ ref: ref('seed') }` → `{ buildRef: buildRef('seed') }` in 3 test files. The property key `ref` is an API contract (consumed by `line.ref.textProperty`). Fixed by restoring property keys while keeping function calls as `buildRef`. Any future rename of short names that double as property keys must handle this.
- **`withTimestamp` is shared via `tests/track-line-states-fixtures.js` module.exports**, not just local per-file helpers. The enrichment script missed this export because it only checked the 5 individual test-file definitions. The global rename pass caught all 96 cross-file references.
- **`linesAndParsed` was renamed TO `parseJsonlLines`** (an existing function name in `api/unified-reconstruct-step-extractors.js`). This created a naming collision. The enriched CSV had `parseJsonlLines → parseUnifiedJsonlLines` which was applied only to the api/ files, not to `test-read-event-scanner.js` where `parseJsonlLines` is a legitimately different function (the renamed `linesAndParsed`).
- **User's naming principle (established during review):** "The name IS the documentation. `buildFieldIndex` forces the reader to open the file. `buildJsonFieldToJsonlLineNumberMap` doesn't — the inputs, structure, and purpose are all in the name." Apply this standard to all future naming work.
- **`test-output-data.js` is NOT a test.** It's a browser data fixture (`window.JSONL_RAW = {...}`) that always fails under `node`. Exclude it from `for f in tests/test-*.js` test runs, or rename it to not match the glob.

## How to Verify
```bash
# All tests pass (exclude browser fixture):
for f in tests/test-*.js; do [ "$f" = "tests/test-output-data.js" ] && continue; node "$f" || { echo "FAIL: $f"; exit 1; }; done

# No residual old names for EXPORTED functions:
grep -rnE '\b(editBelongsToFile|lineDiff|withTimestamp|parseJsonlLines)\b' --include='*.js' --include='*.html' --exclude-dir=archive --exclude-dir=plans .
# Should return nothing (or only plans/naming/ tooling files).

# Zero co-loaded global collisions (run node plans/naming/extract-names.js collision check):
# See the collision-check script in the implementation notes.
```
