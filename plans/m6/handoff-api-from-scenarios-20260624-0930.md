# Handoff: IMPLEMENT the m6 (`m6-cp-user-edit-rewind`) reconstruction plan — a REAL ENGINE FIX (first since S19/S23), NOT a char-lock. The rewound branch reconstructs `m6_derived.py` with a DUPLICATED `return self.name` line; the fix is 2 `src/` files (+21/−2), prototyped live (all green) then reverted. Plan is COMPLETE and authoritative at `plans/m6/m6-reconstruction-plan.md` — follow it verbatim. Baseline 315 → 327.
Conversation name: api-from-scenarios — m6 planning monitor → plan m6 (cp-fork + user-edit + rewind)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/91037d55-2b4f-4a96-9fa0-a50e47ae7b0b.jsonl
Plan file (AUTHORITATIVE, ready to execute): /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/m6/m6-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `91ac563 implemented S23/M1 handling`. Working tree carries uncommitted m2 + m3 + m4 + m5 work plus this m6 PLAN (no m6 src/tests yet) — do NOT revert it. `git diff src/` is currently **EMPTY** (the prototyped m6 fix was reverted; you re-apply it per plan §4).

## Goal
Make `reconstruction_cli` reconstruct the **rewound branch** of `m6_derived.py` correctly. m6 = a `cp`-fork of `m6_source.py`→`m6_derived.py` (m1 pattern), a USER out-of-band edit inserting `# derived version` into the copy, Claude adds `transform()`, a `Rewind: 2, code` discards it, Claude adds `validate()`. Surviving branch (`#1d474d0b`) is already correct; the **rewound** branch (`#9b69e66c`, rewind @ `#a2903cef`) was WRONG — the `transform()` Edit spliced onto the bare 6-line copy (the `# derived version` user edit is missing from the rewound lineage) and duplicated `return self.name`. After the fix the rewound branch is the 10-line v2 (`# derived version` + `transform()`, no duplicate).

## Current State
- **Plan written and verified.** Ground truth confirmed live against the executed transcript; root cause proven; the fix was prototyped live (315 + the new tests all green) then reverted so you start clean.
- `npm test` = **315 pass / 0 fail**; `npx tsc --noEmit` clean; `git diff src/` EMPTY (baseline confirmed this session).
- No m6 src/test/doc edits exist yet — Task 1 starts from the clean baseline.
- The exact validated fix diff is reproduced verbatim in plan §4 (and was saved this session to scratchpad as `m6_fix.diff`, but the plan §4 code blocks are authoritative — type them in).

## What Remains
Execute plan `plans/m6/m6-reconstruction-plan.md` §5 Tasks 1–8 in order:
1. **Task 1 — Baseline & fixture:** confirm 315 green / tsc clean / src empty; append `M6_JSONL` (Desktop path) after `M5_JSONL` in `tests/fixtures.ts`.
2. **Task 2 — Apply the engine fix (§4):** `src/reconstruction_sidecar.ts` — add `findBackupPointAfter` + an `includeAfter` param on `backupSeedWriteFor`; `src/reconstruction_branches.ts` — pass `true` (NET-ZERO line change; that file is AT the 250-line cap, add NO comments there). `tsc` clean; `npm test` still 315.
3. **Task 3 — Sidecar unit tests (2):** in `tests/reconstruction_sidecar.test.ts`, lock the `includeAfter` fallback fires, and that at-or-before still wins when both exist.
4. **Task 4 — Engine lock (5):** `tests/reconstruction_engine_m6.test.ts` (mirror `engine_m5`; in-memory `m6Reader` with blob `b90d0fcb711472b4@v1` = the 7-line `# derived version` content). Test 5 proves the reader is LOAD-BEARING (without it the duplicate persists).
5. **Task 5 — CLI lock (5):** `tests/reconstruction_cli_m6.test.ts` (mirror `cli_m5`); the rewound byte-lock asserts NO duplicated `return self.name`.
6. **Task 6 — Docs (3):** flip roadmap line 30 `[ ] M6 ->`; prepend impl-notes entry; append m6 note in reconstruction-engine-design.md (after the m5 note, ~line 282).
7. **Task 7 — Verify:** `npm test` = **327** / `tsc` clean / `git diff --stat src/` = only the 2 files (+21/−2); prove each new test bites by reverting §4.2's `true` (rewound tests go RED) then restore.
8. **Task 8 — Commit (USER APPROVAL ONLY) + CREATE HANDOFF:** stage EXACTLY the listed files (never `git add -A`); message `Implemented m6 handling`; then write a completion handoff via `/jot:handoff-prompt` (explicit task — do it even if nothing is committed).

## Key Files
- `plans/m6/m6-reconstruction-plan.md` — authoritative plan (§2 ground truth incl. all changeIds/tips, §3 root cause, §4 exact fix diff, §5 tasks, §6 acceptance, §7 reference map).
- `src/reconstruction_sidecar.ts` (179 lines) — add `findBackupPointAfter` after `findBackupAtOrBefore`; add `includeAfter` to `backupSeedWriteFor`.
- `src/reconstruction_branches.ts` (**250 lines — AT CAP**) — `staleEditSeedFor` (~line 101) passes `true`; NET-ZERO only.
- `tests/reconstruction_engine_m5.test.ts`, `tests/reconstruction_cli_m5.test.ts` — the templates to mirror for m6.
- `tests/reconstruction_sidecar.test.ts` — has `test_seed_passes_through_when_no_backup_precedes_the_edit` (the at-or-before lock); add the 2 new sidecar tests beside it.
- `tests/fixtures.ts` (87 lines) — append `M6_JSONL` after `M5_JSONL`.
- Executed transcript: `scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl`.

## Context the Next Agent Won't Have
- **The `# derived version` user edit reaches the two branches DIFFERENTLY.** The ORIGINAL out-of-band edit (record `8897e505`, 16:07:51) is on the abandoned lineage and `extractFileEvents` emits NO file event for it — so the rewound `m6_derived` raw events are just `[copy, transform-edit]`. On the SURVIVING branch `# derived version` re-enters via a SEPARATE disk-echo user-edit (`e4073b7d`, 16:08:21) at the post-rewind Read. Don't expect the rewound branch to carry a user-edit revision — it carries a synthetic `overwrite` (the backup seed) instead.
- **Why `backupSeedWriteFor` was inert (the whole reason for the fix):** the only pre-edit backup (`@v1`, 16:07:55.**546**) is **22 ms AFTER** the transform edit's tool-use timestamp (16:07:55.**524**) because the user edit and the edit that consumes it share one turn. `findBackupAtOrBefore` (≤ when) misses it; the fix adds a `findBackupPointAfter` fallback used ONLY on the stale-edit reseed path.
- **Scope the fallback — do NOT change `backupSeedWriteFor`'s default.** `seedEditBaseFromBackup` (spec-39 first-event-edit) MUST keep `includeAfter=false` or the existing `test_seed_passes_through_when_no_backup_precedes_the_edit` goes RED (I hit this — a blanket fallback breaks it; scoping via the `includeAfter` flag fixes both).
- **`reconstruction_branches.ts` is at the 250-line cap.** A PostToolUse hook blocks any save that pushes it over. The fix there is intentionally just appending `, true` to one existing call (net-zero). Put all explanatory comments in `sidecar.ts` (which has room).
- **The fix is reader-dependent** (unlike m5, whose endpoint was reader-independent): WITHOUT a `BackupReader` the rewound branch STILL shows the duplicate (2 revisions). Engine test 5 locks this both ways.
- **`historyEndingWith` suffixes MUST lead with a slash** (`/m6_derived.py`, `/m6_source.py`) — `test_m6_source.py` also ends with `m6_source.py`.
- **Worktree-git-checkout hazard:** do NOT `git checkout`/`restore` the four shared docs (`tests/fixtures.ts`, `plans/roadmap.md`, `plans/implementation-notes-…md`, `plans/reconstruction-engine-design.md`) — they carry uncommitted m2–m5 edits. Revert specific lines by hand.
- **Monitor false-fire lesson (carry forward):** name the next scenario (m7) ONLY in a handoff TITLE line, never in loose body prose.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test              # baseline now 315; after impl expect tests 327 / pass 327 / fail 0
npx tsc --noEmit      # expect: clean
git diff --stat src/  # after impl: reconstruction_sidecar.ts + reconstruction_branches.ts ONLY (+21/-2)
P="scenarios/executed/m6-cp-user-edit-rewind/134feae4-4eb0-4008-9ef7-05e27ad3113d.jsonl"
npx tsx src/reconstruction_cli.ts "$P" --branch 9b69e66c --verbose 2>/dev/null
# expect: m6_derived.py 3 revisions; rev1 = 7-line # derived version seed; rev2 = 10-line transform v2; NO duplicated return self.name
npx tsx src/reconstruction_cli.ts "$P" --list-branches 2>/dev/null
# expect: surviving #1d474d0b (3 files) + rewound #9b69e66c rewind @ #a2903cef (m6_derived.py)
```
