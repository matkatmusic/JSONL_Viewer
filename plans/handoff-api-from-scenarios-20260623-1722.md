# Handoff: S13 (`s13-multi-edit-code-restore-read`) is PLANNED — not implemented. The authoritative, ready-to-execute plan is `plans/s13/s13-reconstruction-plan.md`. This was a planning-only session: NOTHING in `src/` or `tests/` was changed for S13. The uncommitted S12 implementation is still in the working tree and must NOT be reverted or committed by the S13 work.

Conversation name: api-from-scenarios — S13 planning monitor (waited for the S12 handoff, then planned S13)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/3584f7fc-3c45-4dfd-954c-03171d34715b.jsonl
Plan file (AUTHORITATIVE, execute this): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s13/s13-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `6a47c39 Implemented S11 handling` (the 129-test S11 baseline). No `-plate` branch. The working tree carries the **uncommitted S12 implementation** (151 tests green) PLUS this session's two new untracked files: `plans/s13/` (the S13 plan) and this handoff. S13 itself added zero `src/`/`tests/` changes.

## Goal
`api-from-scenarios` is a clean-room TypeScript engine that reconstructs a Claude Code session's file-change history from its JSONL transcript, one scenario at a time. **S13** is the seventh rewind-family scenario and the **S9 analog with an *edited* abandoned branch**: the session Writes `scenario13.py`(`greet`)+`tests/test_scenario13.py`, then a **code-restore rewind** forks at one system record into (a) an abandoned branch that Reads + **Edits** `scenario13.py` to add `farewell`, and (b) a surviving branch that only Reads (disk is rolled back to the `greet`-only content). The job: make `reconstruction_cli` correctly attribute the abandoned `farewell` Edit to a **rewound branch**, instead of orphaning it.

## Current State
**S13 = planned only; engine UNCHANGED for S13.** The current engine does NOT crash on S13, but produces a two-DAG **disagreement**: the `farewell` Edit shows in the `fileDAG` yet the `conversationDAG` shows no fork and omits it, and `--list-branches` is missing the rewound branch. Verified facts (established this session by running the engine + parsing the transcript):
- `--surviving --verbose` is **already correct** (restored `greet`-only `scenario13.py` + original test) — must stay byte-for-byte unchanged.
- The `fileDAG` is **already correct** (`scenario13.py`: B write `#01KmxQkd`, D edit `#01EoFfFx`; `test_scenario13.py`: C write `#01WiSfee`) — must stay unchanged.
- `findConversationBranches` returns **only the surviving branch** (tip `9641c49c`); **zero rewound branches** — the bug.
- The S12 suite is green (151 pass / 0 fail per the S12 handoff `plans/handoff-api-from-scenarios-20260623-1655.md`); not re-run this session.

## Root cause (one line)
`findConversationBranches` enumerates rewound branches ONLY from `last-prompt` abandoned heads. S13's abandoned branch tip (`45cf4bf8`) is never a `last-prompt` head (the rewind re-prompted from the fork point `8faab841`), so it is invisible — while the branch-agnostic `fileDAG` still shows its Edit. The only structural signal is that fork point `8faab841` is the `parentUuid` of **two genuine user prompts** (`5741c77f` abandoned, `5f564d7d` surviving).

## What Remains
Execute `plans/s13/s13-reconstruction-plan.md` with `/jot:implement`, strict RED→GREEN, in its Task order:
1. **Task 0** — add `S13_JSONL` to `tests/fixtures.ts`.
2. **Task 1–3** — new walkers/predicate in `src/reconstruction_tree.ts` (`isGenuineUserPrompt`, `findPromptForkPoints`, `collectDescendantUuids`, `findDeepestPromptOrReply`) + new `tests/reconstruction_tree.test.ts`.
3. **Task 4** — extend `findConversationBranches` (`src/reconstruction_branch.ts`) to append the structural rewound branch, with the dedup guard; new `tests/reconstruction_engine_s13.test.ts`.
4. **Task 5** — `src/reconstruction_graph.ts`: keep a file-less surviving branch when a rewound branch exists; make `firstTurnTime` sort empty branches last; tests in `tests/reconstruction_graph.test.ts`.
5. **Task 6** — `src/reconstruction_graph_render.ts`: render `(no file changes)` for an empty branch; new `tests/reconstruction_cli_s13.test.ts` (end-to-end).
6. **Task 7** — regression sweep: 151 prior + new S13 tests green, `tsc` clean, filesize check, and diff S1–S12 CLI outputs (must be byte-for-byte unchanged).
7. After green: flip `plans/roadmap.md` `[ ] S13` → `[x]`, prepend an S13 entry to `plans/implementation-notes-api-from-scenarios.md`, and (only when the user asks) commit `Implemented S13 handling`.

## Key Files
- `plans/s13/s13-reconstruction-plan.md` — THE plan: exact expected outputs, the dedup/regression logic, the TDD task list, line-budget guidance, and a flagged display decision.
- `src/reconstruction_tree.ts` (92/250) — home for the four new forest walkers.
- `src/reconstruction_branch.ts` (**212/250 — tight**) — `findConversationBranches` extension; extract a helper or move it to `reconstruction_tree.ts` to stay under the 250-line cap.
- `src/reconstruction_graph.ts` (**223/250 — tight**) — `buildSurvivingConvoBranch`/`assembleDag`/`firstTurnTime` Part-2 change.
- `src/reconstruction_graph_render.ts` (129/250) — the `(no file changes)` line.
- `src/reconstruction_engine.ts:206-228` — `buildRewoundBranchHistory` already drops file-less branches (`divergingIds.size === 0`); this is what keeps S9/S10 regression-safe.

## Context the Next Agent Won't Have
- **The abandoned branch is fully walkable in the LOADED tree, but threads through `attachment` records.** The chain is `8faab841` (system fork) → `5741c77f` (prompt) → `59db88b1` (assistant Read) → … → `6e9cff20` (assistant, the `farewell` Edit) → … → `45cf4bf8` (assistant "Thanks!", the tip). `collectDescendantUuids` MUST follow children of every type or it stops immediately (a naive non-attachment walk finds nothing). Verified.
- **`isGenuineUserPrompt` is load-bearing for fork detection.** Six records have ≥2 children, but only `8faab841` has ≥2 children that are real prompts. The predicate must reject tool-result `user` records (e.g. `87ad16f4`, a Write result) and `isMeta` /exit machinery — else `6f235fe3` (the Write) falsely reads as a fork. Verified the predicate yields exactly `[8faab841]`.
- **The rewound tip is `45cf4bf8` (last assistant), NOT `a4380554` (a trailing `system` record at a later timestamp).** `findDeepestPromptOrReply` must restrict to user/assistant records, mirroring how the surviving tip is a conversational head rather than the literal last bookkeeping record.
- **Dedup guard is the whole regression story.** S7/S8/S11/S12 abandoned tips ARE `last-prompt` heads, so the structural pass must SKIP any abandoned subtree that already contains an existing branch tip. Without it you double-count those branches. S9/S10's read-only abandoned branches get appended but are filtered downstream (no file change), so they cost nothing.
- **Do not "fix" the conversationDAG root back to the absolute root.** For a fork it is the rewind point (`resolveRootUuid` returns `rewound[0].rewindPoint` = `8faab841`). The pre-fork writes B/C therefore appear ONLY in the fileDAG — that is correct, matching S12's design.
- **A repo Stop hook runs the test suite after edits and a lint hook blocks >3× indent nesting + a 250-line/file cap.** Expect inline RED failures during strict RED→GREEN (intended). Keep new functions shallow; `reconstruction_branch.ts` and `reconstruction_graph.ts` have little headroom — extract helpers, never condense (project rule: split, don't condense).
- **The S13 CLI tests need the on-disk file-history backups** for this session (consistent with the S5/S7/S12 real-transcript CLI tests). The engine/branch tests (Task 1–5) need only `loadRecords(S13_JSONL)`.
- **One display decision is flagged in the plan** (whether to show the file-less surviving branch with a `(no file changes)` marker, or omit it). The plan chooses to show it (honest about the fork, mirrors S11). If the user prefers omitting it, only Task 5/6 expected strings + the Part-2 gate change.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test                 # expect: 151 prior + new S13 tests, 0 fail
npx tsc --noEmit         # expect: no errors (tsx does not type-check)
for f in src/*.ts src/**/*.ts tests/*.ts; do \
  python3 /Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py "$f" || echo "FLAGGED: $f"; done
P="scenarios/executed/s13-multi-edit-code-restore-read/546faa49-72b6-4b57-9557-d54e2ff7aa56.jsonl"
npx tsx src/reconstruction_cli.ts "$P" 2>/dev/null                 # both DAGs; rewound fork now visible
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null # surviving #9641c49c + rewound #45cf4bf8
npx tsx src/reconstruction_cli.ts "$P" --branch 45cf4bf8 --verbose 2>/dev/null  # greet + farewell
npx tsx src/reconstruction_cli.ts "$P" --surviving --verbose 2>/dev/null        # greet only (unchanged)
# Regression: S11 default + --list-branches, S9/S10 --list-branches, S1 default must be unchanged.
```
