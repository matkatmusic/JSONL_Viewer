# Handoff: IMPLEMENT Scenario s38 (`s38-script-rename-script-user-edit-mcp`) — CHAR-LOCK, no engine change
MUST READ: plans/script-handling.txt

Conversation name: Plan Scenario s38
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/312e3dd6-9a5e-48ba-a929-b61bd3f4da30.jsonl
Plan file: plans/s38/s38-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock in the engine's existing correct handling of Scenario s38
(`script-rename-script-user-edit-mcp`, the MCP twin of S35). No source change —
just a regression test that snapshots the `reconstruction_cli` output for the
s38 JSONL so it's verified on every run.

## Current State
Planning verified s38 is a CHAR-LOCK. Ran the s38 JSONL through
`reconstruction_cli --verbose` and diffed each file's final reconstructed
revision against the on-disk executed file — all three match byte-for-byte:
`inventory.py` (229 lines), `tests/test_inventory.py` (74), `rename_inv.py` (47).
CLI ran clean (no parser crash). No `src/` change needed: the S27/S28
incomplete-beacon rescue and the S32 MCP `ctx_execute` parser fix are already in
the worktree.

## What Remains
1. Add the s38 test suite, mirroring `tests/reconstruction_cli_s37.test.ts` (the
   most recent char-lock CLI suite). Import `runCli` directly, run it on the s38
   JSONL, and assert the exact output (capture live `runCli` output first to lock
   the exact strings — do NOT hand-write expected literals).
2. Run the full suite; confirm the new tests pass and nothing else broke. The
   suite is the baseline — get the current count by running it, don't assume.
3. Write the IMPLEMENTED completion handoff to `plans/s38/` (title must contain
   the whole word `IMPLEMENTED` and start with the `s38` token).

## Key Files
- `plans/s38/s38-reconstruction-plan.md` — the (short) plan.
- `scenarios/executed/s38-script-rename-script-user-edit-mcp/fa5ad942-4316-406b-95a5-65995b112970.jsonl` — input JSONL.
- `scenarios/executed/s38-script-rename-script-user-edit-mcp/` — on-disk ground-truth files.
- `tests/reconstruction_cli_s37.test.ts` — closest template (s37 = MCP twin of S34).
- `src/reconstruction_cli.ts` — exports `runCli(argv)`.

## Context the Next Agent Won't Have
- s38 = S35 ⊕ S32: the rename SCRIPT itself is user-edited (coalesced/elided
  beacons → S27/S28 rescue paths) AND the run is driven via MCP `ctx_execute`
  (S32 parser path). Both already handled; that's WHY it's a char-lock.
- The 3 files touched are `inventory.py`, `tests/test_inventory.py`,
  `rename_inv.py` (the rename script). CLI history headers show temp
  `run-scenario.<tok>/...` paths; the on-disk basenames are what to compare.
- LESSON from s33/s34: capture live `runCli` output to lock exact CLI strings
  before writing assertions — don't transcribe by hand.

## How to Verify
`npx vitest run` — all green, including the new s38 tests. No diff under `src/`.
