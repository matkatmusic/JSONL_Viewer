# api-from-scenarios

Clean-room TypeScript that reconstructs the file-change history of a Claude Code
session from its JSONL transcript, one scenario at a time.

## When writing or editing code (source or tests)

Read and follow [`plans/coding-requirements.md`](plans/coding-requirements.md) —
the project's mandatory coding-style requirements (domain types over primitives,
single-source wire vocabulary, DRY/generic helpers, enum-member comparisons,
verb-named functions).

## Task Bookkeeping
When closing tasks in completedTasks.json, always populate commitHashes with real hashes — if the user hasn't committed yet, leave the task open or ask, rather than closing with empty hashes and backfilling later.

## Verification Before Reporting Done
A task is not complete until: (1) typecheck passes, (2) the full relevant test suite passes (not just the file you touched), (3) for UI/renderer work, the change is verified in a real browser via headless CDP smoke test with real data. If a fix is visual, do not report it as fixed based on DOM assertions alone; use jfred's `scripts/visual/` tools to verify, which includes the CDP script for taking screenshots.