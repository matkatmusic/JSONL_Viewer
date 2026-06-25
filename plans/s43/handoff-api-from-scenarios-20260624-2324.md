# Handoff: IMPLEMENT Scenario s43 (`s43-git-baseline-uncommitted-module`) — CHAR-LOCK, no engine change

MUST READ: plans/script-handling.txt

Conversation name: plan-scenario 43
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/3c972b2c-9772-4509-b892-4ab0a4115a7b.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s43/s43-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock Scenario s43 as a characterization (CHAR-LOCK) regression test. The engine
**already reconstructs s43 correctly** — verified this session. NO engine/`src`
changes. Add one CLI test plus its fixture, mirroring the s39–s42 pattern.

## Classification (verified this session)
s43 is the `git-baseline` family, structurally a twin of s42. The baseline session
(write `inventory.py` terse-named + `tests/test_inventory.py`, add `low_stock`,
write `rename_inv.py` with three renames `qty_chk→check_quantity` /
`add_item→insert_item` / `rm_item→remove_item`, run it through the **MCP
`ctx_execute` sandbox**, add `restock`, `git init` / `git commit "baseline"`) is
dropped by `--excludeJSONL`. The recorded JSONL opens **mid-stream** with three
`inventory.py` events only:
1. Claude edit adds `reorder` (rev1)
2. user edit appends `# reviewed by ops` (rev2)
3. Claude edit adds `shrink` (rev3)

rev0 is seeded from the file-history backup left by the excluded baseline, which
already carries the post-rename names — that's why `check_quantity` etc. appear
with no rename replay. The s43 twist (`inventory.py` left **untracked** in git;
only `rename_inv.py` + `tests/` committed) is a **no-op for reconstruction** —
git state never enters the JSONL.

## Verification already run
```
node --import tsx src/reconstruction_cli.ts \
  scenarios/executed/s43-git-baseline-uncommitted-module/bc144725-0013-4991-8994-4ee99efab8f4.jsonl --verbose
```
- Single reconstructed file: `inventory.py`. (`rename_inv.py` and
  `tests/test_inventory.py` are from the excluded baseline → NOT reconstructed,
  same as s39–s42.)
- Rev ladder: rev0 **193** → rev1 **232** → rev2 **233** → rev3 **255** lines.
- Tip (rev3, 255 lines) is **byte-identical** to the on-disk rendered
  `scenarios/executed/s43-git-baseline-uncommitted-module/inventory.py` (diff empty,
  modulo the single trailing newline the renderer drops at replay).

## Current State
Working tree has prior uncommitted s40–s42 artifacts (plans + CLI tests) plus the
new untracked `plans/s43/` (this handoff + `s43-reconstruction-plan.md`). Nothing
for s43 staged/committed. Full suite was green at 531/531 after s42.

## What Remains (in order)
1. Add `S43_JSONL` to `tests/fixtures.ts` →
   `scenarios/executed/s43-git-baseline-uncommitted-module/bc144725-0013-4991-8994-4ee99efab8f4.jsonl`
   (short comment in the same style as the `S42_JSONL` block at fixtures.ts:159).
2. Clone `tests/reconstruction_cli_s42.test.ts` → `tests/reconstruction_cli_s43.test.ts`.
   Swap fixture → `S43_JSONL`; ground-truth dir →
   `scenarios/executed/s43-git-baseline-uncommitted-module`; update per-revision line
   counts to **193 / 232 / 233 / 255** and the comments to s43. Helper functions
   (`fileVerboseBlock`, `finalRevisionSlice`, `revisionSlice`,
   `stripLineNumberPrefixes`, `stripTrailingNewline`) carry over verbatim.
3. Assert the tip byte-matches on-disk `inventory.py` AND each intermediate
   revision's line count (as s42 does).
4. `npm test` → expect full suite green (runner is `node --test`, **NOT** vitest).
5. Append the s43 entry to `plans/reconstruction-engine-design.md` (after s42) and
   `plans/implementation-notes-api-from-scenarios.md`.
6. Write the completion handoff (title `# Handoff: Scenario s43 … IMPLEMENTED …`)
   to `plans/s43/` so the s44 planner's `monitor-handoff.sh s43 impl` fires.

## Context the Next Agent Won't Have
- `--verbose --target inventory.py` returns EMPTY because the reconstructed path is
  a temp dir (`/private/var/folders/…/run-scenario.*/inventory.py`), not the literal
  `inventory.py`. Use `--verbose` alone and slice the `### …/inventory.py` block (the
  s42 test's `fileVerboseBlock` already does this) — do not chase the empty `--target`.
- The sidecar/file-history reader is ALREADY wired into `runCli`, so rev0 seeds
  correctly with no extra setup. Do not add a reader or touch the engine.
- This is a pure regression lock. If you find yourself editing `src/`, stop —
  something is wrong; the tip already byte-matches.
- `S43_JSONL` points at the LOCAL executed copy beside the rendered ground truth, so
  the byte-compare stays a genuine cross-source check (same convention as s39–s42).

## Verification command
```
npm test
```
