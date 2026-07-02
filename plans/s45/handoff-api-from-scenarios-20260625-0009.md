# Handoff: IMPLEMENT Scenario s45 (`s45-rewind-abandoned-branch`) — ENGINE GAP, fix via TDD
MUST READ: plans/script-handling.txt

Conversation name: plan-scenario 45
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/e52e431d-b1ad-42d9-885e-afc15a785e1d.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s45/plan-s45-rewind-abandoned-branch.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Make `reconstruction_cli` correctly reconstruct Scenario s45, the first **code-rewind**
scenario after the git-baseline family. The transcript writes `calc.py`(`add`)+`test_calc.py`,
edits in `subtract`, then `Rewind: 2, code` abandons that edit and restores `calc.py`, then
edits in `multiply`. **Unlike s39–s44 this is NOT a char-lock** — the engine has a real gap:
the **surviving branch's final `calc.py` revision is a spurious `add+multiply+multiply`
duplicate** (the post-rewind `multiply` edit is replayed onto a base that already holds
`multiply`). Fix the engine via strict red-green TDD so the surviving tip byte-matches the
rendered on-disk `calc.py`, without disturbing the already-correct rewound branch or test file.

## Current State
- **Planning complete; nothing implemented yet. NO `src/` change made. Nothing committed.**
- Plan written: `plans/s45/plan-s45-rewind-abandoned-branch.md` (full TDD step list + code map).
- Gap confirmed by live probe (`node --import tsx src/reconstruction_cli.ts <s45 jsonl> --verbose`):
  - Surviving `calc.py` ladder = 4 revisions: `add`(14) → partial-echo tail(8) → `add+multiply`(27)
    → **`add+multiply+multiply`(40 lines, 653 bytes) printed LAST**. On-disk `calc.py` = `add+multiply`
    (443 bytes). Using the existing `finalRevisionSlice` convention, the tip byte-match **FAILS**.
  - Rewound/abandoned branch (`--branch 836ea480`) = `add` → `add+subtract` (2 revs) — **already correct**,
    byte-matches `.abandoned_branches/abandoned-branch-1/calc.py`.
  - `tests/test_calc.py` — single revision, **already correct**.
- Transcript verified at event level: **exactly one** `multiply` edit (`F #01WvVsu6`); the duplicate
  is engine-fabricated, not in the data.
- Suite baseline (from s44 handoff): **552 passing**, runner `node --test` via `npm test` (NOT vitest).

## What Remains
1. **Read the plan** `plans/s45/plan-s45-rewind-abandoned-branch.md` end-to-end — it has the full
   ground-truth DAG, the code-map file:line anchors, and the ordered TDD steps.
2. **Add `S45_JSONL`** to `tests/fixtures.ts` after the `S44_JSONL` block (local executed JSONL
   `scenarios/executed/s45-rewind-abandoned-branch/6bdd9f73-5ab9-4c7c-bb41-5fdf9da5a09a.jsonl`).
3. **Create `tests/reconstruction_cli_s45.test.ts`** by cloning `reconstruction_cli_s44.test.ts`
   (reuse its verbose helpers verbatim). Write the GREEN-on-arrival characterization tests first
   (DAG, list-branches, rewound `add+subtract` tip byte-match, `test_calc.py` byte-match).
4. **Write the RED tests** that pin the bug: surviving `calc.py` final revision has exactly ONE
   `def multiply(`, and its body byte-matches on-disk `calc.py`. Confirm they FAIL today while the
   552 prior tests + the Step-3 tests stay green.
5. **Diagnose & fix (GREEN):** trace `reconstructFileOver` (`reconstruction_branches.ts:36-54`),
   dumping the surviving revision list before/after `seedStaleEditBases` (`:52`, reader-gated).
   Determine whether the `multiply` edit `F`'s base is a stale already-`multiply` revision and
   reseed it from the rewind-restore backup (m6 `backupSeedWriteFor`/`findBackupPointAfter` pattern)
   OR suppress the spurious revision. Make the **smallest general** change in the existing
   reader-gated reseed path — **no scenario/branch/filename special-casing.**
6. **Verify:** `npm test` all green (552 + new s45 cases). Then **commit nothing** (s39+ convention).
7. **Write the IMPLEMENTED completion handoff** (title naming Scenario s45 with the word IMPLEMENTED)
   to fire the s45→s46 chain.

## Key Files
- `plans/s45/plan-s45-rewind-abandoned-branch.md` — the plan (read first).
- `tests/reconstruction_cli_s44.test.ts` — clone source for the new test (helpers + structure).
- `tests/fixtures.ts` — add `S45_JSONL` here.
- `src/reconstruction_branches.ts` (`reconstructFileOver` :36-54; `seedStaleEditBases` :52).
- `src/reconstruction_reseed.ts` (`editBaseIsStale` :58, `staleEditSeedFor` :112, `seedStaleEditBases` :131).
- `src/reconstruction_replay_edit.ts` (`applyEdit` :174-187, `insertHunkAdditions` :113-139).
- `src/reconstruction_sidecar.ts` (`findBackupPointAfter`, `backupSeedWriteFor(..., includeAfter)`).
- `src/reconstruction_replay.ts:124` (`userEditChangesContent`, S15 guard).
- `scenarios/executed/s45-rewind-abandoned-branch/` — JSONL + rendered ground truth
  (`calc.py`, `tests/test_calc.py`, `.abandoned_branches/abandoned-branch-1/calc.py`).

## Context the Next Agent Won't Have
- **This is the S23/m6 duplicate-insertion bug class, but on a code-rewind SURVIVING branch's
  post-restore Claude edit.** S23 fixed it by generalizing `editBaseIsStale` to a content-walk;
  m6 by an `includeAfter` backup fallback. Prefer extending those existing reader-gated paths.
- **The duplicate is the LAST printed revision, not a tip-hash mismatch you'd see in `--list-branches`.**
  `--list-branches` reports `surviving tip #c3457a61`; the bug only shows in the `--verbose` ladder
  where rev 3 (`add+multiply+multiply`, ts 02:07:50) is printed AFTER rev 2 (`add+multiply`, ts
  02:07:54) — array order and timestamp order disagree. The existing `finalRevisionSlice` (last
  `revision N @` block) is what selects the wrong 40-line revision, so the byte-match test catches it.
- **s45 is reader-DEPENDENT.** The rewind restore is carried only by file-history backups
  (`calc.py` v2 after `add`, v4 = restored `add`-only before `multiply`); there is no explicit
  `edited_text_file` "revert to add" event. The fix almost certainly lives in a reader-gated stage.
- **The rev-1 8-line "partial-echo tail" on the surviving branch is EXPECTED** (the restore user-edit
  `E #294c26cb` echo; same partial-tail shape as s40). Do NOT try to "fix" it — it is not the bug.
- **`plans/script-handling.txt` (the MUST READ) does NOT apply mechanically here** — s45 has no
  Bash/MCP script rewrite. It is linked per template convention; the HAS-BEACON/NO-BEACON logic is inert.
- **Live identifiers** for assertions: rewind prompt `A #d205e794`; surviving tip `#c3457a61`;
  rewound tip `#836ea480`; `calc.py` nodes B write `#01ULxQoJ` / D edit(subtract) `#01JquFb6` /
  E user-edit(restore) `#294c26cb` / F edit(multiply) `#01WvVsu6`; `test_calc.py` write `C #01XyPyNZ`.
- CLI: verbose section header is the **full absolute temp path**, so `--target calc.py` matches
  nothing — slice by `### …/calc.py` section (the reused s44 helpers already do this).
- Don't commit (s39+ family convention). The tree already carries uncommitted s43/s44 artifacts —
  leave them alone.

## How to Verify
```
npm test
```
Expect all green: **552 prior tests + the new s45 cases**, 0 failures. Spot-check with:
```
node --import tsx src/reconstruction_cli.ts scenarios/executed/s45-rewind-abandoned-branch/*.jsonl --surviving --verbose
```
The surviving `calc.py` final revision must be `add`+`multiply` (27 lines, ONE `def multiply`), not
`add`+`multiply`+`multiply`.
