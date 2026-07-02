# Handoff: Scenario s43 (`s43-git-baseline-uncommitted-module`) — CHAR-LOCK regression test IMPLEMENTED
MUST READ: plans/script-handling.txt

Conversation name: impl-scenario 43
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/72a14b38-35c4-4816-8a6c-1be75700861b.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s43/s43-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Lock Scenario s43 (`s43-git-baseline-uncommitted-module`) as a characterization
(CHAR-LOCK) regression test. The engine already reconstructs s43 correctly — NO
engine/`src` change. s43 is the FIFTH `git-baseline` scenario, a structural twin
of s42 whose baseline leaves `inventory.py` UNTRACKED in git (only `rename_inv.py`
+ `tests/` committed) — a no-op for reconstruction.

## Current State
DONE. Full suite green: **546 tests, 0 fail** (was 541 after s42; +5 s43). `npx
tsc --noEmit` clean. No `src/` change.
- `tests/reconstruction_cli_s43.test.ts` — 5 CLI tests (C1–C5), all pass.
- `tests/fixtures.ts` — added `S43_JSONL` (LOCAL executed copy, after `S42_JSONL`).
- `plans/reconstruction-engine-design.md` — s43 entry appended after s42.
- `plans/implementation-notes-api-from-scenarios.md` — s43 entry appended.
- NOTHING committed (matches the s39–s42 convention; the pipeline commits later).

Locked literals (captured live from `runCli` before writing asserts — s33 lesson):
prompt #5e47015d; nodes B `edit` #01Lvteyx (reorder) / C `user-edit` #47d06200
(`# reviewed by ops`) / D `edit` #01BoeBti (shrink); surviving tip #0b7f2b4c;
verbose 4-revision ladder `193, 232, 233, 255`; tip byte-matches rendered
`inventory.py` (modulo the one trailing newline the renderer drops).

## What Remains
1. Nothing for s43 itself — it is complete and green.
2. (Pipeline) The s44 planner is gated on this `IMPLEMENTED` handoff via
   `./monitor-handoff.sh s43 impl`; this doc's title fires it. s44 is the
   `git-baseline-then-rename` variant — don't assume CHAR-LOCK until its own CLI probe.
3. (Whoever commits) Stage the 6 s43-touched paths listed in Key Files alongside
   the still-uncommitted s40–s42 artifacts.

## Key Files
- `tests/reconstruction_cli_s43.test.ts` — the new 5-test CLI characterization (NEW).
- `tests/fixtures.ts` — `S43_JSONL` const (after `S42_JSONL`, ~line 166).
- `plans/s43/s43-reconstruction-plan.md` — the plan this implements.
- `plans/reconstruction-engine-design.md` — s43 design bullet (after the s42 bullet).
- `plans/implementation-notes-api-from-scenarios.md` — s43 impl-notes entry (file tail).
- `scenarios/executed/s43-git-baseline-uncommitted-module/` — the JSONL + rendered
  `inventory.py` ground truth the test byte-compares against.

## Context the Next Agent Won't Have
- **REAL divergence from s42 the live capture caught (a blind clone would have
  broken the test):** the s43 baseline adds `low_stock` BEFORE the rename run and
  the git-commit/backup point, so rev 0 — and every revision — carries SIX
  post-rename baseline funcs INCLUDING `low_stock` (s42 had five and asserts
  `low_stock` absent everywhere). The s43 test asserts `low_stock` PRESENT (rev 0
  baseline list + tip retention). `restock` was added AFTER the backup point and
  left no trace, so it is still asserted ABSENT everywhere, same as s42. Lesson for
  s44+: the backup-seed snapshots whatever existed at commit time, not the full
  scenario narrative — check def-presence per revision, never assume from the s42 twin.
- The s43 git twist (`inventory.py` untracked) is genuinely a NO-OP — git state
  never enters the JSONL and the file-history backup is written regardless of
  tracking, so rev 0 seeds identically to s42. No engine handling required.
- `--verbose --target inventory.py` returns EMPTY (reconstructed path is a temp
  `/private/var/folders/…/run-scenario.*/inventory.py`). Use `--verbose` alone and
  slice the `### …/inventory.py` block (the test's `fileVerboseBlock` does this).
- The sidecar/file-history reader is ALREADY wired into `runCli`; rev 0 seeds with
  no extra setup. This is a pure regression lock — if you find yourself editing
  `src/`, stop; the tip already byte-matches.

## How to Verify
```
npm test        # runner is `node --test`, NOT vitest → expect 546 pass / 0 fail
npx tsc --noEmit
```
