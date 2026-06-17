# Implementation Notes: Extract nested helpers to free functions

Spec: `replay-edits-js-classify-edits-js-detec-curious-galaxy.md`

## Baseline (2026-06-03T13:00-07:00)

- replay-edits.test.js: 35 passed, 0 failed
- detect-rewinds.test.js: 15 passed, 0 failed, 0 skipped

## Step 1: lastSnapBefore (2026-06-03T13:02-07:00)

- Phase A classify-edits.js: 35/35 pass
- Phase A detect-rewinds.js: 15/15 pass
- Comparison: identical logic, only whitespace and var name (`r` vs `result`) differ
- Phase B: migrated to jsonl-parse.js. 35/35 + 15/15 pass.
- **Bonus applied:** Replaced inline `for` loops that searched for "snapshot before the snapshot-before-landing" with `lastSnapBefore(snapshots, sBefore.line)` in both files.

## Step 2: firstSnapAfter (2026-06-03T13:04-07:00)

- Phase A both files: pass
- Comparison: identical logic
- Phase B: migrated. 35/35 + 15/15 pass.

## Step 3: hasWriteBetween (2026-06-03T13:06-07:00)

- Phase A both files: pass
- **Design decision:** Unified name to `hasWriteBetween` (was `hasFileWriteBetween` in detect-rewinds.js). Chose the shorter name since the `fileWrites` parameter already makes the subject clear.
- Comparison: identical logic after rename
- Phase B: migrated. 35/35 + 15/15 pass.

## Step 4: findBackwardJump (2026-06-03T13:08-07:00)

- Phase A both files: pass
- **Design decision:** Unified name to `findBackwardJump` (was `findBackJump` in classify-edits.js). Chose the more descriptive name.
- Comparison: identical logic after rename (classify-edits used compact `var cur = x, visited = {};` vs separate declarations — same behavior)
- Phase B: migrated. 35/35 + 15/15 pass.

## Cleanup (2026-06-03T13:10-07:00)

- Deleted all commented-out function stubs and "moved to" comments from both files
- Final: 35/35 + 15/15 pass. CLI smoke tests produce identical output.

## Summary

`jsonl-parse.js` now exports 6 free functions:
1. `isUserPrompt(obj)` — pure predicate
2. `userText(obj)` — pure extractor
3. `lastSnapBefore(snapshots, lineIdx)` — parameterized search
4. `firstSnapAfter(snapshots, lineIdx)` — parameterized search
5. `hasWriteBetween(fileWrites, startLine, endLine)` — parameterized predicate
6. `findBackwardJump(parsed, uuidToIdx, lineIdx)` — parameterized chain walker

All are imperative-style free functions with no closures or side effects.

No open questions.
