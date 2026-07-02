# Handoff: s39 (`s39-git-baseline-seed`) IMPLEMENTED — CHAR-LOCK, no engine change

MUST READ: plans/script-handling.txt

Conversation name: impl-scenario 39
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/ (current session JSONL)
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s39/s39-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock the engine's reconstruction of Scenario **s39** (`s39-git-baseline-seed`, the FIRST of a new
`git-baseline` scenario family) as a characterization test. The engine already reconstructs s39
correctly, so this was a CHAR-LOCK: tests only, NO source change.

## Current State
DONE. **526 tests green** (517 prior — which already included the uncommitted s38 work — plus 9 new
s39 tests), `tsc --noEmit` clean. No source files changed. Added:
- `tests/fixtures.ts` — `S39_JSONL` constant (points at the LOCAL worktree executed copy, unlike the
  sibling-store paths the other fixtures use; see Context).
- `tests/reconstruction_cli_s39.test.ts` — 5 CLI tests.
- `tests/reconstruction_engine_s39.test.ts` — 4 engine tests.
- `plans/reconstruction-engine-design.md` — appended the s39 design entry (517 → 526).
- `plans/implementation-notes-api-from-scenarios.md` — appended the s39 notes section (incl. the
  reader-dependence deviation).

NOTHING is committed (matches the s37/s38 convention — the user commits, not the implementer).

## What Remains
1. (s40 planner) Nothing to do for s39 itself. This handoff's landing fires the s40 planner's monitor
   (`monitor-handoff.sh s39 impl`). s40 = `git-baseline-user-edits` = s39 + 2 interleaved USER edits on
   `orders.py`. Treat the git-baseline family as reader-DEPENDENT (see below) when planning s40/s42.
2. (user, when ready) Commit the s39 test + doc changes.

## Key Files
- `tests/reconstruction_engine_s39.test.ts` — the structural + byte-lock characterization (uses the real
  file-history sidecar reader).
- `tests/reconstruction_cli_s39.test.ts` — DAG / list-branches / graphFile / verbose locks.
- `tests/fixtures.ts` — `S39_JSONL`.
- `plans/s39/s39-reconstruction-plan.md` — the plan this implements.
- `scenarios/executed/s39-git-baseline-seed/orders.py` — the rendered ground truth the tip byte-matches.

## Context the Next Agent Won't Have
- **The plan's reconstruction mechanism was WRONG and the tests correct it.** The plan/handoff said s39
  rev 0 is seeded "PURELY from the Edit's `toolUseResult.originalFile` (no Write event)" and is
  reader-independent. Probed live: s39 `orders.py` is **reader-DEPENDENT**. The lone Edit has no usable
  `originalFile`, so WITHOUT a backup reader the engine cannot recover the 29-line pre-edit base —
  `orders.py` collapses to a single degraded **18-line** revision. WITH the real sidecar reader (exactly
  the CLI's path, `buildSidecarReader`) it yields the clean 2-revision ladder **29 → 41 L** with a
  byte-perfect tip. The plan's "no Write event" half IS correct (extractFileEvents = 1 edit, 0 write).
  This matches the known `originalFile not always populated` issue. → The engine test uses
  `realReader(records)` for the byte-lock and adds an explicit test locking the 18-line no-reader
  degradation. **This reader-dependence is the s39 characterization that governs s40/s42.**
- **Why the transcript is tiny:** s39 does `EndCurrentAgentAndSpawnNewAgent --excludeJSONL`, which drops
  the FIRST agent's whole baseline session (the `git init`, the Write of `orders.py` +
  `tests/test_orders.py`, the "baseline" commit, the `feature` branch) from the transcript. The s39 JSONL
  is ONLY the post-respawn agent: one prompt ("add count()"), one Read, one Edit of `orders.py`, "Thanks".
  There are NO git Bash commands and NO spawn markers in the JSONL — the respawn is invisible to the engine.
- `tests/test_orders.py` (on-disk, written in the excluded session) is correctly NOT reconstructed — it has
  no event here, and a sidecar can't legitimately reattach it. Do NOT try to surface it.
- **`history.revisions.length` ≠ the CLI's "revision N" count.** The single Edit (no write/user-edit
  boundary) is ONE `FileRevision` whose lines carry two value-snapshots; the verbose renderer renders those
  as `revision 0`/`revision 1`. So the engine test asserts `revisions.length === 2` ONLY because the
  reader recovers a separate base revision; the CLI test owns the rendered "2 revisions / rev 0 = 29 lines".
- `S39_JSONL` points at the LOCAL worktree copy (`scenarios/executed/s39-git-baseline-seed/356cbd5e….jsonl`)
  rather than the sibling RevEng store, so the byte-compare reads the `orders.py` beside it. The sibling
  store also has an s39 dir, but the plan chose local for a self-contained compare.
- Engine keys `orders.py` under its absolute temp path; tests match on the `/orders.py` suffix. Verbose
  carries `  N | ` line-number prefixes — stripped before the CLI byte-compare.
- Locked literals (from live `runCli`): prompt `#5b518fc2`, edit node `B  edit  #01XCwxVH`, surviving tip
  `#d8c61657`.

## How to Verify
```
node --import tsx --test tests/*.test.ts    # 526 green (incl. 9 s39 tests)
npx tsc --noEmit                            # clean
```
