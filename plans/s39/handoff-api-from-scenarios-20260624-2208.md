# Handoff: IMPLEMENT Scenario s39 (`s39-git-baseline-seed`) — CHAR-LOCK, no engine change

MUST READ: plans/script-handling.txt

## Objective

Implement test coverage for Scenario **s39** (`s39-git-baseline-seed`). The engine
**already reconstructs s39 correctly** (probed live, byte-verified) — this is a
CHAR-LOCK: **add tests only, NO source change**. The full plan is at
**`plans/s39/s39-reconstruction-plan.md`** — read it first; it is short and authoritative.

## Current State

- Branch: `api-from-scenarios`. Frontier work for s37/s38 is uncommitted in the worktree
  (`git status` shows modified `tests/fixtures.ts`, `plans/…`, and untracked s38 test +
  s38 IMPLEMENTED handoff). Do NOT commit unless the user asks.
- Baseline test suite: **511 green**, `tsc --noEmit` clean (as reported by the s38 impl).
- No `plans/s39/` test or fixture exists yet — only the plan and this handoff.

## What Remains (in execution order)

1. Add `S39_JSONL` to `tests/fixtures.ts`, pointing at the local JSONL copy
   `scenarios/executed/s39-git-baseline-seed/356cbd5e-009f-457d-9c05-d56aa944b25c.jsonl`
   (mirror `S37_JSONL` / `S38_JSONL`).
2. Write `tests/reconstruction_cli_s39.test.ts` (model on the s37/s38 CLI tests, scaled
   to ONE file). **Capture live `runCli` output first** (s33 lesson) and lock exact
   strings from it. Assert the invariants in the plan (§Implementation step 2):
   - default view: `conversationDAG` + `fileDAG`, single surviving branch (no rewind
     header), the lone prompt turn + an `orders.py` Edit turn;
   - `--verbose` for `orders.py`: exactly 2 revisions; rev 0 has `total`/`names` and NO
     `count`; final revision contains documented `count(items)` and, after stripping the
     `  N | ` line-number prefixes, BYTE-MATCHES on-disk
     `scenarios/executed/s39-git-baseline-seed/orders.py`;
   - NO history/section for `tests/test_orders.py`.
3. (Optional, to match the per-scenario convention) Add a minimal
   `tests/reconstruction_engine_s39.test.ts` asserting the same via `reconstructBranches`:
   one surviving branch, one file history (`orders.py`), 2-rev ladder, rev 0 seeded from
   `originalFile`, tip byte-equal to on-disk; no history for `tests/test_orders.py`.
4. Run the full suite + `tsc --noEmit`; confirm all green.
5. Add the s39 entry to `plans/reconstruction-engine-design.md` if that doc tracks each
   scenario (mid-stream `originalFile`-seed char-lock).
6. Write the completion handoff (title `# Handoff: s39 … IMPLEMENTED …`) to
   `plans/s39/` so the s40 planner's monitor (`monitor-handoff.sh s39 impl`) fires.

## Context the Next Agent Won't Have

- **Why no engine change / the headline:** s39 does `EndCurrentAgentAndSpawnNewAgent
  --excludeJSONL`. That excludes the FIRST agent's session (the `git init`, the Write of
  `orders.py` + `tests/test_orders.py`, the "baseline" commit, the `feature` branch) from
  the transcript. The s39 JSONL therefore contains ONLY the post-respawn agent: one prompt
  ("add count()"), one `Read`, one `Edit` of `orders.py`, "Thanks". There are **no git Bash
  commands and no spawn markers in the JSONL** — the respawn is invisible to the engine.
- The engine seeds `orders.py` rev 0 (29-line baseline, `total`/`names`, NO `count`) PURELY
  from the Edit's `toolUseResult.originalFile` — there is **no Write event** in this
  transcript. rev 1 (tip, 41 lines, adds `count`) is byte-identical to on-disk. This
  mid-stream-open + `originalFile`-seed is the characterization to lock.
- `tests/test_orders.py` (on-disk, 17 lines) is correctly NOT reconstructed: it has no
  event in this transcript. **Do NOT** pass a file-history sidecar root hoping to surface
  it — with no event, the sidecar can't either, and fabricating it would be wrong for this
  input.
- Engine keys `orders.py` under the absolute temp path
  (`…/run-scenario.n06bs921/orders.py`); the existing CLI tests match on the `/orders.py`
  suffix — do the same.
- Verbose output carries `  N | ` line-number prefixes; strip before any byte-compare.
- This is the FIRST `git-baseline-seed` scenario; s40 (`git-baseline-user-edits`) and s42
  (`git-baseline-from-s38`) build on it. Keep the s39 tests faithful to the actual input.

## Verification

`node --import tsx --test tests/*.test.ts` (all green, expect 511 + the new s39 tests) and
`tsc --noEmit` (clean).

## Conversation JSONL

Planning session transcript:
`/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/` (current session JSONL).
