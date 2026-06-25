# Handoff: Scenario s42 (`s42-git-baseline-from-s38`) IMPLEMENTED — CHAR-LOCK, no engine change

MUST READ: plans/script-handling.txt

Conversation name: impl-scenario 42
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/af6f945c-9e6a-481c-ad17-3c50dad455e0.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s42/s42-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock the engine's reconstruction of Scenario s42 (`s42-git-baseline-from-s38`, fourth of the `git-baseline`
family) as a characterization test. The engine ALREADY reconstructs s42 byte-perfect, so this was a
CHAR-LOCK: tests only, NO `src/` change. s42 is the first git-baseline composed with an s38-style MCP
script-rename built entirely in the (excluded) baseline session, so the mid-stream transcript is plain Edits
plus one user edit on `inventory.py`.

## Current State
DONE and green.
- `tests/fixtures.ts`: added `S42_JSONL` (local-copy convention, after `S41_JSONL`).
- `tests/reconstruction_cli_s42.test.ts`: NEW, 5 tests cloned from the s41 file and adapted to s42's
  three-node / four-revision ladder. All 5 collected by `node:test` and passing.
- Full suite: **536 → 541 green** (`npm test`). `npx tsc --noEmit`: clean.
- NO engine `src/*.ts` change. (The `M src/Impl_template.md` / `M src/Plan_template.md` in `git status` are
  pre-existing skill-template edits from the running pipeline, not this task.)
- Docs (additive): `plans/roadmap.md` s42 line, `plans/reconstruction-engine-design.md` s42 entry,
  `plans/implementation-notes-impl-scenario-42.md`.
- NOTHING committed (the series leaves committing to the user).

## What Remains
1. Nothing for s42 itself — it is complete and verified.
2. Optional, user's call: commit the accumulated uncommitted work (s40, s41, s42 tests + plans + docs).

## Key Files
- `tests/reconstruction_cli_s42.test.ts` — the 5 s42 characterization tests.
- `tests/fixtures.ts` — the `S42_JSONL` constant.
- `plans/s42/s42-reconstruction-plan.md` — the plan with every locked value.
- `scenarios/executed/s42-git-baseline-from-s38/inventory.py` — ground-truth tip the test byte-matches.
- `scenarios/executed/s42-git-baseline-from-s38/58525cea-…jsonl` — the s42 mid-stream transcript (local copy).

## Context the Next Agent Won't Have
- **Locked live-probe facts** (capture-before-assert reproduced these exactly): prompt #09c1efd9; linear
  3-node ladder on `inventory.py` — B `edit` #01HyE14A (adds `reorder`) → C `user-edit` #6a022912 (appends
  `# reviewed by ops`) → D `edit` #01SNebUt (adds `shrink`); one `surviving tip #a017b766`, no rewound, no
  `write` node; `--verbose` 4 revisions (0..3), line counts `145, 173, 174, 191`.
- **reader-DEPENDENT** (like s39/s41): the first `inventory.py` Edit has no usable `toolUseResult.originalFile`,
  so rev 0 is seeded from the `~/.claude/file-history` backup, which already carries the post-rename names from
  the excluded s38-style baseline. `runCli` auto-wires the `BackupReader`; no flag. That is WHY the renamed
  identifiers appear with no rename replay in the mid-stream transcript.
- **Ladder is FULLY MONOTONIC** here — unlike s40/s41 there is NO 9-line partial-echo snapshot revision; both
  the Claude edits and the user edit land as full-state revisions (145→173→174→191).
- **`low_stock`/`restock` trap:** the scenario baseline asks for both (steps 2 and 7) but the executed on-disk
  `inventory.py` contains NEITHER and the transcript never mentions them. The test asserts their absence
  everywhere (word-boundary regex), the way s41 asserts `subtotal`'s absence — the engine must not invent them.
- **Only `inventory.py` reconstructs.** `tests/test_inventory.py` and `rename_inv.py` were written in the
  excluded baseline session → no event → asserted to appear NOWHERE.
- **Runner gotcha:** `npm test` = `node --import tsx --test tests/*.test.ts` (`node:test`), NOT vitest.
  `npx tsx --test <file>` prints nothing — use the `node --import tsx --test` form to run a single file.
- **Probe gotcha:** a throwaway probe importing `./src/...` must sit at the REPO ROOT (relative import resolves
  against the script's own dir). Created `probe_s42.ts` at root, captured output, deleted it.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # expect 541 green (536 + 5 new s42 CLI tests)
npx tsc --noEmit    # clean
git status          # only the new s42 test file + fixtures.ts line + docs; NO engine src/ change
```
