# Implementation Notes — impl-scenario 42 (`s42-git-baseline-from-s38`)

- Timestamp: 2026-06-24T23:15:00-07:00
- Conversation: impl-scenario 42
- JSONL log (this conversation): /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/af6f945c-9e6a-481c-ad17-3c50dad455e0.jsonl

## References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s42/s42-reconstruction-plan.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s42/handoff-api-from-scenarios-20260624-2305.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/script-handling.txt
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/tests/reconstruction_cli_s41.test.ts (cloned structure)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s42-git-baseline-from-s38/58525cea-c958-449a-894a-1c562a18a2bd.jsonl

## Summary
CHAR-LOCK: engine already reconstructs s42 correctly, NO `src/` change. Added `S42_JSONL` fixture and
`tests/reconstruction_cli_s42.test.ts` (5 tests). Full suite 536 → 541 green; `tsc --noEmit` clean.

## Design decisions
- Captured live `runCli` output before writing any assertion (s33/s38 lesson) via a throwaway `probe_s42.ts`
  at the repo root, then deleted it. Recorded node IDs/hashes from the real reader path: prompt #09c1efd9,
  B `edit` #01HyE14A (reorder), C `user-edit` #6a022912 (`# reviewed by ops`), D `edit` #01SNebUt (shrink),
  surviving tip #a017b766.
- Verbose ladder is 4 revisions (0..3), line counts `145, 173, 174, 191`; monotonic (no partial-echo snapshot
  here — both user-edit and Claude edits land as full-state revisions). Tip rev 3 (191 L) byte-matches on-disk
  `inventory.py` minus the trailing newline the engine drops at replay. All count assertions come from the
  live capture, none hand-written.
- Asserted absence of `low_stock`/`restock` (the s42-specific trap: scenario asks for them at steps 2/7 but
  they never executed and appear nowhere) and of `test_inventory.py`/`rename_inv.py` (written in the excluded
  baseline session → no event), mirroring how s41 asserts `subtotal`'s absence. Used word-boundary regex for
  identifier presence/absence so a substring can't false-match.

## Deviations
- None of substance. Test count matches the s41 file's 5; suite went 536 → 541 exactly as the plan predicted.

## Tradeoffs
- Cloned `reconstruction_cli_s41.test.ts` verbatim and swapped s41→s42 + the three-node ladder rather than
  factoring shared helpers into a common module — consistent with every prior scenario test (each file is
  self-contained), keeps the byte-compare cross-source, and avoids touching reviewed test infrastructure.

## Open questions
- None. Nothing committed (the series leaves committing to the user). Pre-existing uncommitted s40/s41 work
  remains in the tree alongside this change.
