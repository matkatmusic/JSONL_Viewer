# Handoff: Scenario s45 (`s45-rewind-abandoned-branch`) IMPLEMENTED — engine fix landed, ready for s46
MUST READ: plans/script-handling.txt

Conversation name: impl-scenario 45
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/8e70df05-b655-4df8-9239-0e1ec445c74b.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s45/plan-s45-rewind-abandoned-branch.md

## Branch
`api-from-scenarios` based on `master`

## Goal
Scenario s45 (the first CODE-REWIND scenario after the git-baseline family) is now correctly
reconstructed. It was a REAL engine gap (not a char-lock): the surviving branch's final `calc.py`
revision was a fabricated `add+multiply+multiply` duplicate. The engine has been fixed via strict
red-green TDD so the surviving tip byte-matches the rendered on-disk `calc.py`, with the rewound
branch and `test_calc.py` left untouched. This handoff fires the s46 planning session.

## Current State
- **s45 IMPLEMENTED. Full suite green: 559 passing (was 552), 0 failing, tsc clean. NOTHING committed**
  (s39+ pipeline convention — working tree left dirty for the next agent).
- Engine fix in `src/reconstruction_beacons.ts` (the ONLY `src/` change):
  - New helper `backupIsWithinBound(candidate, notAfter)`.
  - `elidedBeaconSeed` gained a `notAfter: Date | undefined` parameter; it now skips backup
    candidates taken after `notAfter`.
  - `completeElidedBeacons` now iterates by index and passes `events[index+1]?.timestamp` as the
    bound, so an elided beacon's completing backup can never carry a LATER edit's effect.
- New test file `tests/reconstruction_cli_s45.test.ts` (7 tests, all green): 4 GREEN-on-arrival
  characterization (DAG, list-branches, rewound `add+subtract` tip byte-match, `test_calc.py`
  byte-match) + 3 that were RED before the fix (surviving tip has exactly one `multiply`, surviving
  tip byte-matches on-disk, surviving ladder = 4 revs with no duplicated `multiply`).
- `S45_JSONL` added to `tests/fixtures.ts`.
- Implementation notes: `plans/implementation-notes-impl-scenario-45.md`.

## What Remains
1. **Plan scenario s46** (`/plan-scenario 46`): probe `reconstruction_cli` against the s46 JSONL,
   classify char-lock vs real gap, write `plans/s46/plan-s46-*.md` + the PLANNED→IMPLEMENT handoff.
2. Nothing else for s45 — it is complete and verified. Do NOT commit (pipeline convention).

## Key Files
- `src/reconstruction_beacons.ts` — the fix (`backupIsWithinBound`, `elidedBeaconSeed` `notAfter`,
  `completeElidedBeacons` index iteration).
- `tests/reconstruction_cli_s45.test.ts` — the 7 s45 tests.
- `tests/fixtures.ts` — `S45_JSONL` constant.
- `plans/s45/plan-s45-rewind-abandoned-branch.md` — the plan (its root-cause hypothesis was wrong;
  see below).
- `plans/implementation-notes-impl-scenario-45.md` — full deviation/trace record.

## Context the Next Agent Won't Have
- **THE PLAN'S LEADING ROOT-CAUSE HYPOTHESIS WAS WRONG.** The plan and handoff blamed the
  stale-edit-base reseed (`seedStaleEditBases` in `reconstruction_reseed.ts`). A stage-by-stage trace
  of `reconstructFileOver` for the surviving lineage proved the spurious revision is inserted by
  `completeElidedBeacons` (the s28 elided-beacon stage in `reconstruction_beacons.ts`), NOT the reseed
  stage. Lesson: always trace the actual pipeline before trusting a plan's named culprit.
- **Why it misfired:** the 8-line rewind-restore echo (`E`) starts past line 1, so `beaconIsElided`
  flags it. The visible window is the unchanged `add` tail, which matches EVERY backup version
  (v2 `add`, v4 `add`, v5 `add+multiply`). The old code kept the LATEST matching version — v5, taken
  AFTER the `multiply` edit — and spliced it before that edit, so the edit appended a second
  `multiply`. The bound (`backupTime <= next event's timestamp`) excludes v5 and keeps v4 (the actual
  restore).
- **calc.py backup timeline** (from a probe, now deleted): v2 `add`@02:07:06 · v3 `add+subtract`
  @02:07:17 · v4 `add`(restore)@02:07:38 · v5 `add+multiply`@02:07:54. Surviving lineage: B write
  `add`@02:06:53 · E echo 8L@02:07:35 · F edit(multiply)@02:07:50.
- **Post-fix surviving ladder is 4 revisions** (not 3): rev0 `add`(14) → rev1 echo(8, EXPECTED
  partial tail, cf s40) → rev2 `add`(14, the bounded elided-beacon seed = v4) → rev3 `add+multiply`
  (27, tip). The rev2 `add` seed is the restore state and is correct to surface; the tip is rev3.
- **s28 stays green** because its elided beacon is effectively terminal (no later same-file edit), so
  `notAfter` is undefined → unbounded → original behavior. The full suite is the regression gate.
- **Don't commit.** The tree already carries uncommitted s43/s44 artifacts (plans + tests); leave
  them alone — they are not part of s45.
- The MUST READ `plans/script-handling.txt` (HAS-BEACON/NO-BEACON script replay) does NOT apply
  mechanically to s45 — there is no Bash/MCP script rewrite. It is linked per template convention.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test          # expect 559 passing, 0 failing
npx tsc --noEmit  # clean
node --import tsx src/reconstruction_cli.ts scenarios/executed/s45-rewind-abandoned-branch/*.jsonl --surviving --verbose
# surviving calc.py final revision = add+multiply (27 lines, ONE def multiply), NOT add+multiply+multiply
```
