# Handoff: S13 (`s13-multi-edit-code-restore-read`) is IMPLEMENTED and fully verified — the rewound branch is now discovered STRUCTURALLY from the parentUuid fork (its abandoned `farewell` Edit is no longer orphaned), and the file-less surviving branch renders the fork honestly. 172 tests green, tsc clean, every file ≤ 250 lines. NOTHING is committed — the uncommitted S12 work + this S13 work both sit in the tree, awaiting user review/commit.
Conversation name: api-from-scenarios — S13 handoff monitor → implement S13 (multi-edit-code-restore-read)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/297fd035-d302-4c9d-98f4-2792b11d67dd.jsonl
Plan file (AUTHORITATIVE, executed): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s13/s13-reconstruction-plan.md
Implementation notes (running log, S13 entry prepended): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-api-from-scenarios.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `6a47c39 Implemented S11 handling` (the 129-test S11 baseline). No `-plate` branch. The working tree carries the **uncommitted S12 implementation** (the predecessor slice) PLUS this S13 work. S13 added 21 tests on top of S12's 151 → **172 total**.

## Goal
`api-from-scenarios` is a clean-room TypeScript engine that reconstructs a Claude Code session's file-change history from its JSONL transcript, one scenario at a time. **S13** is the seventh rewind-family scenario and the **S9 analog with an *edited* abandoned branch**: the session Writes `scenario13.py`(`greet`)+`tests/test_scenario13.py`, then a **code-restore rewind** forks at a system record into (a) an abandoned branch that Reads + **Edits** `scenario13.py` to add `farewell`, and (b) a surviving branch that only Reads (disk rolled back to the `greet`-only content). The abandoned tip is named by NO `last-prompt` head (the rewind re-prompted from the fork point), so `findConversationBranches` orphaned the `farewell` Edit — the fileDAG showed it, but the conversationDAG and `--list-branches` missed the rewound branch. This slice makes the engine attribute that Edit to a rewound branch and render the fork.

## Current State
**Fully implemented and verified; NOTHING committed.** `npm test` = **172 pass / 0 fail** (151 S12 baseline + 21 new). `npx tsc --noEmit` = no errors. Filesize sweep over the changed files = all ≤ 250 lines. The bare CLI now renders the S13 conversationDAG fork exactly per the plan's literal (root `#8faab841 (rewind point)`, rewound `#45cf4bf8` above file-less surviving `#9641c49c` with a `(no file changes)` marker); the fileDAG and `--surviving` content are unchanged.

Done, by part:
- **Part 1 — structural rewound discovery.** Four new forest walkers in `src/reconstruction_tree.ts`: `isGenuineUserPrompt` (user, not isMeta, no tool_result block), `findPromptForkPoints` (parents of ≥2 genuine prompts, first-appearance order), `collectDescendantUuids` (BFS down following children of EVERY type — the abandoned subtree threads through `attachment` records; inner loop extracted to `recordNewChildren` for the deep-nesting hook), `findDeepestPromptOrReply` (latest-timestamp user/assistant descendant). New leaf module `src/reconstruction_fork.ts` (`findStructuralRewoundBranches` + private helpers, dedup guard) wired into `findConversationBranches` (`src/reconstruction_branch.ts`) as a 2-line additive tail.
- **Part 2 — render the fork when surviving is file-less.** `src/reconstruction_graph.ts`: `buildSurvivingConvoBranch` keeps an empty-`turns` surviving branch when `rewound.length > 0`; `firstTurnTime` returns `Number.POSITIVE_INFINITY` for a 0-turn branch (sorts last). `src/reconstruction_graph_render.ts`: `renderBranchBlock` emits one `(no file changes)` marker for an empty branch.
- **Tests (21 new).** New: `tests/reconstruction_tree.test.ts` (9), `tests/reconstruction_fork.test.ts` (2), `tests/reconstruction_engine_s13.test.ts` (4), `tests/reconstruction_cli_s13.test.ts` (4); +2 in `tests/reconstruction_graph.test.ts`; `S13_JSONL` added to `tests/fixtures.ts`.
- **Docs.** `plans/roadmap.md` S13 flipped to `[x]`; S13 entry prepended to `plans/implementation-notes-api-from-scenarios.md`.

## What Remains
1. **User review of the diff.** This is the gate. Show the S13 working-tree changes (`src/reconstruction_fork.ts` is new; `src/reconstruction_tree.ts`, `src/reconstruction_branch.ts`, `src/reconstruction_graph.ts`, `src/reconstruction_graph_render.ts` are edited; the 5 new/edited test files). Note the diff also contains the **uncommitted S12 work** — decide commit scope.
2. **Commit S12 and S13.** Project rule: commit only when the user asks. S12 and S13 are two separate scenarios sitting in one tree. Recommended: commit S12 first (`Implemented S12 handling`), then S13 (`Implemented S13 handling`), mirroring the one-commit-per-scenario precedent (S7–S11). Confirm with the user whether the `plans/s12/`, `plans/s13/`, and handoff `.md` files go in the same commits (prior scenarios committed plan+handoff docs alongside the code).
3. **Next scenario: S14.** Roadmap line `[ ] S14` is empty. A planning session must produce the S14 plan/handoff first (same pipeline as S13: a monitor watches `plans/` for a new `# Handoff: S14 …` doc, then implements). Do NOT start S14 here.

## Key Files
- `plans/s13/s13-reconstruction-plan.md` — THE plan: verified topology, exact expected outputs, the dedup/regression logic, the TDD task list, the flagged display decision (resolved "show it").
- `src/reconstruction_tree.ts` (249/250 — FULL) — the four new forest walkers (`isGenuineUserPrompt`, `findPromptForkPoints`, `collectDescendantUuids`, `findDeepestPromptOrReply`) + the original ancestor/head walkers.
- `src/reconstruction_fork.ts` (125) — NEW: `findStructuralRewoundBranches` (the parentUuid-fork discovery + dedup guard). Imports `ConversationBranch` TYPE-only from `reconstruction_branch.ts` (no runtime cycle).
- `src/reconstruction_branch.ts` (215/250) — `findConversationBranches` now appends `findStructuralRewoundBranches(records, existingTips)`.
- `src/reconstruction_graph.ts` (237/250) — `buildSurvivingConvoBranch` + `firstTurnTime` Part-2 changes.
- `src/reconstruction_graph_render.ts` (133) — the `(no file changes)` marker.
- `tests/reconstruction_engine_s13.test.ts` / `tests/reconstruction_cli_s13.test.ts` — the S13 engine + end-to-end CLI locks (no backup reader needed: the abandoned `farewell` Edit replays over the trunk `greet` Write, both in-transcript).
- `plans/implementation-notes-api-from-scenarios.md` — read the TOP entry for the full S13 design-decision/deviation/tradeoff log.

## Context the Next Agent Won't Have
- **The append logic deliberately lives in a NEW module `reconstruction_fork.ts`, NOT in `reconstruction_branch.ts` (plan's first choice) or `reconstruction_tree.ts` (plan's fallback).** Both were out of line-budget after Part 1 (tree.ts hit 249/250; branch.ts had ~35 lines, too little for the ~70-line append). The `ConversationBranch` type is imported `type`-only, so there is no value import cycle. Do NOT "consolidate" it back — it would breach the 250-line cap and force condensing (the project rule is "split, don't condense").
- **`collectDescendantUuids` MUST follow children of EVERY record type.** The abandoned subtree threads `prompt → attachment → assistant`; a type-filtered walk stops at the attachment and finds nothing. Verified against the real transcript.
- **`isGenuineUserPrompt` is load-bearing for fork detection.** It rejects tool-result `user` records (e.g. a Write result) and `isMeta` /exit machinery, so `findPromptForkPoints` yields exactly `[8faab841]` and not a false fork at the Write record. Six records have ≥2 children of *some* type; only `8faab841` parents two genuine prompts.
- **The abandoned tip is `45cf4bf8` (last assistant "Thanks!"), NOT the later trailing `system` record `a4380554`.** `findDeepestPromptOrReply` restricts to user/assistant records by latest timestamp.
- **The dedup guard is the whole regression story.** S7/S8/S11/S12 abandoned tips ARE `last-prompt` heads, so the structural pass skips any abandoned subtree already holding an existing tip → no double-count. S9/S10 read-only abandoned branches MAY be appended by Part 1 but are filtered downstream for free (`buildRewoundBranchHistory` / `buildRewoundConvoBranch` drop a branch whose diverging records changed no file — `divergingIds.size === 0` / `turns.length === 0`). Verified: S9/S10 `--list-branches` + default stay linear; S11 shows exactly one rewound branch; S1 default unchanged.
- **Do NOT "fix" the conversationDAG root to the absolute parentUuid-null root.** For a fork, `resolveRootUuid` returns the rewind point (`8faab841`); the pre-fork trunk Writes B/C appear ONLY in the fileDAG. This matches S12's design and the plan's expected literal.
- **A repo Stop hook reruns the suite after every edit and a lint hook blocks >3× indent nesting + a 250-line/file cap.** Expect inline RED failures during strict RED→GREEN (intended). The hook logs can lag a step behind (they sometimes report a stale failure from the prior edit) — re-run `npx tsx --test <file>` directly to confirm true state.
- **The S13 CLI tests use the real on-disk file-history backups** for this session (consistent with S5/S7/S12 real-transcript CLI tests). The engine/branch tests need only `loadRecords(S13_JSONL)`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect: 172 pass / 0 fail
npx tsc --noEmit         # expect: no errors (the real type gate — tsx does not type-check)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done   # expect: no FLAGGED
P="scenarios/executed/s13-multi-edit-code-restore-read/546faa49-72b6-4b57-9557-d54e2ff7aa56.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                 # both DAGs; conversationDAG forks: rewound #45cf4bf8 above surviving #9641c49c (no file changes)
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null # surviving #9641c49c + rewound #45cf4bf8 (rewind @ #8faab841)
npx tsx src/reconstruction_cli.ts "$P" --branch 45cf4bf8 --verbose 2>/dev/null  # greet + farewell
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null        # greet only (unchanged)
# Regression spot-check (must be unchanged from pre-S13): S11 default + --list-branches, S9/S10 --list-branches, S1 default.
```
