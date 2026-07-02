# Handoff: Scenario s41 (`s41-git-baseline-mid-commit`) — CHAR-LOCK, no engine change [PLANNED → IMPLEMENT]

MUST READ: plans/script-handling.txt

Conversation name: plan-scenario 41
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/98b41de5-61f6-428e-9935-00a5ec2d78ec.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s41/s41-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock the engine's reconstruction of Scenario **s41** (`s41-git-baseline-mid-commit`, third of the
`git-baseline` family) as a characterization test. The engine ALREADY reconstructs s41 correctly (verified
live), so this is a **CHAR-LOCK: tests only, NO source change.** s41 = s40 + a mid-stream `git commit "wip"`
between the two interleaved USER edits on `orders.py`.

## Current State
- Engine probed live against the s41 JSONL at the s40-IMPLEMENTED frontier (full suite 531 green). Result:
  CHAR-LOCK — no engine gap.
- Plan written: `plans/s41/s41-reconstruction-plan.md` (read it — it has the full probe findings).
- No source touched, no tests added yet, nothing committed.

## What Remains
1. Read `plans/s41/s41-reconstruction-plan.md`.
2. Add `S41_JSONL` to `tests/fixtures.ts` → `scenarios/executed/s41-git-baseline-mid-commit/6d01aabb-79c5-4ca9-88b9-7834a050bf6d.jsonl` (LOCAL copy convention, mirror S40_JSONL).
3. Capture exact `runCli([S41_JSONL, "--verbose"])` output LIVE before writing assertions (do not hand-write line counts).
4. Create `tests/reconstruction_cli_s41.test.ts` cloned from `tests/reconstruction_cli_s40.test.ts` (same helper fns). Ground-truth dir = `scenarios/executed/s41-git-baseline-mid-commit`. Lock: `orders.py` tip byte-identical to on-disk `orders.py`; assert `tests/test_orders.py` is ABSENT.
5. Run `npm test` — confirm the new test is collected (node:test via tsx, NOT vitest) and the full suite goes 531 → ~533 green; `npx tsc --noEmit` clean.
6. Update `plans/roadmap.md` and `plans/reconstruction-engine-design.md` with the s41 entry (s40 format).
7. Write the IMPLEMENTED completion handoff (title must contain `s41` + `IMPLEMENTED`) so the s41 impl monitor (`bscjjnh7c`) / downstream s42 pipeline fires.

## Key Files
- `plans/s41/s41-reconstruction-plan.md` — the plan (probe findings + step-by-step).
- `tests/reconstruction_cli_s40.test.ts` — clone this verbatim structure for s41.
- `tests/fixtures.ts` — add `S41_JSONL` (see S40_JSONL at ~line 150).
- `scenarios/executed/s41-git-baseline-mid-commit/orders.py` — the 43-line byte-compare ground truth.
- `src/reconstruction_cli.ts` — `runCli` entry (auto-wires the file-history BackupReader from session id).

## Context the Next Agent Won't Have
- **reader-DEPENDENT.** Correct reconstruction needs the file-history `BackupReader` (`46a5ebd9eadf2d8b@v1/v2/v3`). User edit #1 (`# reviewed by ops`) is only a 9-line truncated `edited_text_file` echo in-JSONL; user edit #2 (`# checked`) is NOWHERE in the JSONL — backup `@v3` supplies the tip. Without the reader the ladder degrades to 2 short revisions and the tip never materializes. `runCli` wires the reader automatically; no flag — but the backups must exist under `~/.claude/file-history` (they do on this machine).
- **The mid-stream `git commit` is INERT** — `git add`/`status`/`commit -m wip`/`log` Bash records produce no file events; the engine ignores them cleanly. fileDAG = 2 nodes (Claude edit + user edit). The commit is the only structural difference from s40, and it changes nothing in the reconstruction.
- **`subtotal` trap:** scenario step 5 asks Claude to add `subtotal(items, n)`, but it NEVER executed — session ends with "Thanks." + exit. No `subtotal` Edit in the JSONL or any backup, and on-disk `orders.py` has none. The engine correctly does NOT invent one. (Contrast s40, whose JSONL DID contain a subtotal Edit → 55-line tip. Do NOT expect a subtotal node here.)
- Only `orders.py` is reconstructed. `tests/test_orders.py` was written in the `--excludeJSONL`-dropped baseline session → no event → not reconstructed (same as s39/s40). Assert its absence.
- Runner gotcha (s38 lesson): `npm test` = `node --import tsx` / node:test. A vitest-style test file collects 0 tests silently — verify your new file actually runs.
- Lock-the-strings gotcha (s33/s38): capture live `runCli` output first; the engine drops a single trailing newline at replay, so the body equals the rendered file minus its trailing `\n`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # expect ~533 green, including the new s41 CLI test
npx tsc --noEmit    # clean
```
