# Implementation Notes: Imperative refactor — denest + verb names

Spec: `replay-edits-js-classify-edits-js-detec-curious-galaxy.md`

## Baseline (2026-06-03T13:30-07:00)

- replay-edits.test.js: 35 passed, 0 failed
- detect-rewinds.test.js: 15 passed, 0 failed, 0 skipped

## Step 0: Rename functions to include verbs (2026-06-03T13:47-07:00)

- `userText` → `extractUserText`
- `lastSnapBefore` → `findLastSnapBefore`
- `firstSnapAfter` → `findFirstSnapAfter`
- `simpleDiff` → `computeDiff`
- All 50 tests pass after each rename.

## Step 1: Extract `parseJSONLLines` (2026-06-03T14:01-07:00)

- **Design decision:** Unified to superset — snapshots always include `msgId`, fileWrites always default `type` to `'edit'`. classify-edits previously omitted `msgId`; detect-rewinds previously didn't default `type`. Neither difference affects behavior.
- **Dead code removed:** `parentToUsers` was declared in both files. In detect-rewinds it was populated but never read (sibling detection uses `seenParentUuids`). Removed from both.
- 35/35 + 15/15 pass.

## Step 2: Extract `collectUserPrompts` (2026-06-03T14:03-07:00)

- **Design decision:** Returns superset fields `{ line, parentLine, text, uuid, parentUuid }`. classify-edits previously only collected `{ line, parentLine, parentUuid }`. Extra fields are unused but harmless.
- 35/35 + 15/15 pass.

## Step 3: Extract `classifyRewindType` (2026-06-03T14:04-07:00)

- 3-window classification algorithm was identical in both files.
- Returns `{ classification, snapBefore, snapAfter }`.
- 35/35 + 15/15 pass.

## Step 4+5: Extract `detectRewinds` + `buildConversationSteps` (2026-06-03T14:06-07:00)

- **Design decision:** `detectRewinds` returns 0-based line numbers in a superset format. detect-rewinds.js converts to 1-based in its output layer.
- **Design decision:** `buildConversationSteps` is detect-rewinds-specific — builds from prompts + rewinds via a lookup on `landingLine`. Previously this was interleaved in the detection loop; now it's a separate pass.
- 35/35 + 15/15 pass.

## Step 6: Extract `classifyFileWrites` (2026-06-03T14:07-07:00)

- classify-edits-specific. `analyzeJSONL` is now a 6-line thin wrapper.
- 35/35 pass.

## Step 7: Extract `filterKeptEdits` (2026-06-03T14:08-07:00)

- Deduplicates kept-edit filtering between `replayAndVerify` and CLI entry point.
- `replayAndVerify` reduced from 30+ lines to 10 lines.
- 35/35 pass.

## Step 8: Wrap CLI in `main()` functions (2026-06-03T14:10-07:00)

- All three files now have `function main()` + `if (require.main === module) { main(); }`.
- detect-rewinds.js: extracted `formatConversationFlow` and `formatRewindSummary` from inline console.log calls (> 10 lines each).
- replay-edits.js: extracted `parseCliArgs`, `runSingleFileMode`, `runBatchMode`.
- 35/35 + 15/15 pass.

## Step 9: Cleanup (2026-06-03T14:11-07:00)

- Removed unused imports in classify-edits.js (`isUserPrompt`, `findLastSnapBefore`, `findFirstSnapAfter`, `hasWriteBetween`, `findBackwardJump`, `classifyRewindType` — all now used transitively via `detectRewinds`/`parseJSONLLines`).
- Same cleanup in detect-rewinds.js.
- 35/35 + 15/15 pass. CLI smoke test confirms identical output.

## Final state

**jsonl-parse.js** — 10 exported free functions:
`isUserPrompt`, `extractUserText`, `findLastSnapBefore`, `findFirstSnapAfter`, `hasWriteBetween`, `findBackwardJump`, `collectUserPrompts`, `classifyRewindType`, `detectRewinds`, `parseJSONLLines`

**classify-edits.js** — 4 module-level functions, no nesting:
`classifyFileWrites`, `analyzeJSONL` (thin wrapper), `classifyEdits`, `main`

**detect-rewinds.js** — 5 module-level functions, no nesting:
`buildConversationSteps`, `analyzeRewinds` (thin wrapper), `formatConversationFlow`, `formatRewindSummary`, `main`

**replay-edits.js** — 13 module-level functions, no nesting:
`stripCatLineNumbers`, `extractBashCatEdits`, `extractEditsFromJSONL`, `replayEdits`, `computeDiff`, `filterKeptEdits`, `replayAndVerify`, `batchVerify`, `formatResults`, `parseCliArgs`, `runSingleFileMode`, `runBatchMode`, `main`

No open questions.
