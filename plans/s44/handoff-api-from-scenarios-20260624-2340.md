# Handoff: Scenario s44 (`s44-git-baseline-then-rename`) — CHAR-LOCK regression test TO IMPLEMENT
MUST READ: plans/script-handling.txt

Conversation name: plan-scenario 44
JSONL (s44 reconstruction input): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s44-git-baseline-then-rename/56f60db2-0bf0-4685-99dd-ef8f65685245.jsonl
Plan file: plans/s44/plan-s44-git-baseline-then-rename.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock in `reconstruction_cli`'s already-correct handling of Scenario s44 with a single regression test.
s44 is the `git-baseline` family with the script-rename running **mid-stream** (not in the excluded
baseline). The engine reconstructs every file the transcript touches byte-for-byte already, so this is a
**characterization-lock test only — NO source change**.

## Current State
- Planning complete. The s44 JSONL was probed against the post-s43 engine (`--verbose`):
  - `inventory.py` tip (rev4, 264 lines) — **byte-identical** to on-disk `inventory.py`.
  - `rename_inv.py` tip (rev2, 38 lines) — **byte-identical** to on-disk `rename_inv.py`.
  - `tests/test_inventory.py` — **not reconstructed** (no mid-stream event), as expected.
- No engine gap. No `src/` edit needed.
- Nothing for s44 is committed. Uncommitted tree also holds the just-landed s43 impl artifacts
  (`tests/reconstruction_cli_s43.test.ts`, `tests/fixtures.ts` mod, `plans/s43/*`) — leave those alone.

## What Remains
1. **`tests/fixtures.ts`** — add `S44_JSONL` immediately after the `S43_JSONL` block (~line 177), value:
   `"/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s44-git-baseline-then-rename/56f60db2-0bf0-4685-99dd-ef8f65685245.jsonl"`.
   Add a comment block mirroring the s43 entry, noting the mid-stream-rename distinction (below).
2. **`tests/reconstruction_cli_s44.test.ts`** — clone `tests/reconstruction_cli_s43.test.ts`. Reuse its
   helpers (`fileVerboseBlock`, `finalRevisionSlice`, `stripLineNumberPrefixes`, `readGroundTruth`). Set
   `S44_GT = scenarios/executed/s44-git-baseline-then-rename`. Assert:
   - `inventory.py` final-revision tip byte-matches on-disk `inventory.py`.
   - `rename_inv.py` final-revision tip byte-matches on-disk `rename_inv.py`  ← **s44-specific, new vs s43**.
   - `tests/test_inventory.py` is absent from the reconstruction output.
3. Capture live `runCli` output BEFORE finalizing assertions (lesson from s33). Run `npm test`
   (runner is `node --test`, NOT vitest). Expect green; record the new total.
4. Write the completion handoff (title must name Scenario s44) so the s44 impl monitor fires the s45 line.
   Do **not** commit (pipeline convention — nothing committed across the s39+ family).

## Key Files
- `plans/s44/plan-s44-git-baseline-then-rename.md` — the full plan (read first).
- `tests/reconstruction_cli_s43.test.ts` — the clone source; same structure/helpers.
- `tests/fixtures.ts` — add `S44_JSONL`.
- `scenarios/executed/s44-git-baseline-then-rename/` — `inventory.py`, `rename_inv.py`, `tests/test_inventory.py` (the rendered ground truth) + the JSONL.
- `src/reconstruction_cli.ts` — exports `runCli`; verbose header uses the **full absolute path**.

## Context the Next Agent Won't Have
- **s44 vs s42/s43**: in s42/s43 the rename lived in the EXCLUDED baseline, so the mid-stream transcript
  had only `inventory.py` events and `rename_inv.py` was never reconstructed. In s44 `--excludeJSONL`
  fires at step 4 (before the rename script exists), so the mid-stream transcript CONTAINS the full rename
  machinery: `rename_inv.py` is Written (1 tuple) + 2 USER edits (2 more tuples), the MCP `ctx_execute`
  runs it, then `inventory.py` gets restock/reorder/`# reviewed by ops`/shrink. That is why
  `rename_inv.py` is reconstructed here — the new assertion relative to s43.
- **The MCP rename leaves NO `inventory.py` DAG node.** Its effect surfaces only because rev0 of
  `inventory.py` (175 lines) is seeded from the file-history backup taken AFTER the rename ran (before the
  first mid-stream Edit) — so rev0 already carries the POST-rename names (`check_quantity`/`insert_item`/
  `remove_item`, verified 14 new-name lines / 0 old) plus `low_stock`. **Reader-DEPENDENT.** Do not expect
  a rename-replay step.
- **Verbose-output gotcha**: `--target inventory.py` matches NOTHING because the verbose header is the full
  absolute path (`### /private/var/folders/.../inventory.py`). Parse the unfiltered `--verbose` output by
  file section instead (that is what the s43 test helpers already do). Also: the final revision block runs
  to EOF with no trailing blank-line separator, so a naive "save on blank line" parser grabs the
  second-to-last revision — make sure the extractor flushes the last block (the s43 helpers handle this).
- Runner is `node --test` via `npm test`, NOT vitest.

## How to Verify
```
npm test
```
Expect all green (s43 left the suite at 546). Confirm the three s44 assertions pass and the new total is
546 + (number of s44 test cases).
