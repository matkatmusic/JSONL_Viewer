# Implementation Notes — impl-scenario 41 (`s41-git-baseline-mid-commit`)

- Timestamp: 2026-06-24T22:58:00-07:00
- Conversation: impl-scenario 41
- JSONL log (this conversation): /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/05b1943a-bf1e-4fff-9fa7-d674a6c1476a.jsonl

## References
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s41/s41-reconstruction-plan.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s41/handoff-api-from-scenarios-20260624-2250.md
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/script-handling.txt
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/tests/reconstruction_cli_s40.test.ts (cloned structure)
- /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s41-git-baseline-mid-commit/6d01aabb-79c5-4ca9-88b9-7834a050bf6d.jsonl

## Summary
CHAR-LOCK: engine already reconstructs s41 correctly, NO `src/` change. Added `S41_JSONL` fixture and
`tests/reconstruction_cli_s41.test.ts` (5 tests). Full suite 531 → 536 green; `tsc --noEmit` clean.

## Design decisions
- Captured live `runCli` output before writing any assertion (s33/s38 lesson). Recorded node IDs/hashes from
  the real reader path: prompt #f4131b49, B `edit` #01Rw572a, C `user-edit` #a72dd041, surviving tip #fbd57365.
- Verbose ladder is 4 revisions (0..3), line counts `29, 41, 9, 43`; rev 2 is the 9-line partial-echo of the
  first user edit. Tip rev 3 (43 L) byte-matches on-disk `orders.py` (minus the trailing newline the engine
  drops at replay). Test count assertions all come from this live capture, none hand-written.
- Added an explicit `subtotal` ABSENCE assertion (in C1 and the verbose tip) — the s41-specific trap: the
  scenario asks for `subtotal` at step 7 but it never executed, so the engine must not invent it (contrast s40,
  whose JSONL DID contain a subtotal Edit → 55-line tip).

## Deviations
- The handoff said "531 → ~533 green"; actual is **531 → 536** (5 new tests, all pass). The "~533" was an
  estimate; 5 tests matching the s40 file's count is correct.
- Closed a pre-existing roadmap gap: `plans/roadmap.md`'s `[x] SNN` checklist stopped at S38 — the s39 and s40
  implementers never added their lines (the design doc DID get s39/s40 entries). To avoid a confusing
  S38 → S41 jump I added concise s39 and s40 lines (derived from the authoritative design-doc entries) as well
  as the s41 line. Strictly additive documentation; no behavior touched.

## Tradeoffs
- Considered adding s41-only to the roadmap and leaving the S39/S40 gap. Rejected: a sequential checklist that
  skips two entries reads as "those scenarios were never done." Three short lines fix the record at near-zero
  cost.

## Open questions
- None. s39/s40 roadmap lines were back-filled from the design doc; if their original owners want different
  prose they can revise, but the facts are accurate.
