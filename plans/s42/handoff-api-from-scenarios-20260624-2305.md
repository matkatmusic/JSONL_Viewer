# Handoff: IMPLEMENT Scenario s42 (`s42-git-baseline-from-s38`) — CHAR-LOCK, no engine change

MUST READ: plans/script-handling.txt

Conversation name: plan-scenario 42
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/b80d00ae-0002-4c44-bfdf-9248554a58e3.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s42/s42-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock the engine's reconstruction of Scenario **s42** (`s42-git-baseline-from-s38`, fourth of the
`git-baseline` family) as a characterization test. The engine ALREADY reconstructs s42 byte-perfect, so this
is a **CHAR-LOCK: tests only, NO source change.** s42 = a git-baseline scenario (baseline session dropped by
`--excludeJSONL`) whose baseline was built with an s38-style MCP script-rename; the rename lives entirely in
the excluded baseline, so the mid-stream transcript is plain Edits + one user edit on `inventory.py`.

## Current State
- Planning probe confirmed: `runCli` reconstructs `inventory.py`'s tip BYTE-IDENTICAL to on-disk
  `scenarios/executed/s42-git-baseline-from-s38/inventory.py`. No crash, no engine change needed.
- `s41` is already IMPLEMENTED upstream (CHAR-LOCK, 536 tests green). This handoff was gated on the s41
  IMPLEMENTED handoff, which has landed.
- Nothing for s42 written yet beyond the plan + this handoff. The plan file above is complete and self-contained.

## What Remains
Execute the plan in `plans/s42/s42-reconstruction-plan.md`, in order:
1. Add `S42_JSONL` to `tests/fixtures.ts` (after `S41_JSONL`, local-copy convention):
   `/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s42-git-baseline-from-s38/58525cea-c958-449a-894a-1c562a18a2bd.jsonl`
2. Capture live `runCli` output (default / `--list-branches` / `--graphFile` / `--verbose`) BEFORE writing
   assertions — throwaway probe AT THE REPO ROOT (not `/tmp`), run via `npx tsx`, then delete it.
3. Create `tests/reconstruction_cli_s42.test.ts` by cloning `tests/reconstruction_cli_s41.test.ts` (same
   helpers), 5 tests adapted to s42's three-node / four-revision ladder.
4. Verify: `npm test` → 536 + 5 = 541 green; `npx tsc --noEmit` clean; `git status` shows only the new test
   file + the fixtures line + docs (NO `src/` change).
5. Docs (additive): roadmap line, design-doc entry, `plans/implementation-notes-impl-scenario-42.md`. Do NOT commit.

## Key Files
- `plans/s42/s42-reconstruction-plan.md` — the plan; has every locked value and reference fact.
- `tests/reconstruction_cli_s41.test.ts` — clone this verbatim (helpers + 5-test structure), swap s41→s42.
- `tests/fixtures.ts` — add `S42_JSONL` (see s39/s40/s41 local-copy comments for the pattern).
- `scenarios/executed/s42-git-baseline-from-s38/inventory.py` — ground-truth tip the test byte-matches.
- `scenarios/executed/s42-git-baseline-from-s38/58525cea-…jsonl` — the s42 mid-stream transcript (local copy).

## Context the Next Agent Won't Have
- **Locked structural facts from the probe** (capture-before-assert should reproduce these exactly):
  - fileDAG: linear THREE nodes on `inventory.py` — `B edit #01HyE14A` (adds `reorder`) →
    `C user-edit #6a022912` (appends `# reviewed by ops`) → `D edit #01SNebUt` (adds `shrink`). No `write`
    node, no `branch ` line.
  - `--list-branches`: one `surviving  tip #a017b766`, file `inventory.py`, no `rewound`.
  - `--verbose` `/inventory.py`: 4 revisions (0..3), line counts `145, 173, 174, 191`. rev0 baseline (5 funcs:
    check_quantity/insert_item/remove_item/find_item/tot_value), rev1 +reorder, rev2 +`# reviewed by ops`,
    rev3 (tip) +shrink, byte-matches on-disk after stripping `  N | ` prefixes + the dropped trailing newline.
- **reader-DEPENDENT** (same as s39/s41): the first `inventory.py` Edit has NO usable `originalFile`, so rev0
  is seeded from the `~/.claude/file-history` backup (which already carries the post-rename names from the
  excluded s38-style baseline). `runCli` auto-wires the `BackupReader`; no flag. Backups must exist locally
  (they do). This is WHY the renamed identifiers appear without any rename replay in the mid-stream transcript.
- **`low_stock` / `restock` trap:** the scenario's baseline asks for both (steps 2 and 7), but the executed
  on-disk `inventory.py` contains NEITHER and the mid-stream transcript never mentions them. Assert their
  absence everywhere (the way s41 asserts `subtotal`'s absence) — the engine must not invent them.
- **Only `inventory.py` reconstructs.** `tests/test_inventory.py` and `rename_inv.py` were written in the
  excluded baseline session → no event → assert they appear NOWHERE.
- **Runner gotcha (s38 lesson):** `npm test` = `node --import tsx` / `node:test`, NOT vitest. Confirm the 5
  named s42 tests are actually collected and run.
- **Probe-script gotcha (s38 lesson):** a throwaway probe importing `./src/...` must live at the REPO ROOT
  (relative import resolves against the script's own dir); delete it when done.
- Use word-boundary regex (`/\bdef reorder\(/`, `/\blow_stock\b/`) for identifier presence/absence checks, as
  s41 does for `count`/`subtotal`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # expect 541 green (536 + 5 new s42 CLI tests)
npx tsc --noEmit    # clean
git status          # only the new test file + fixtures.ts line + docs; NO src/ change
```
