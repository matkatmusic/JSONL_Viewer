# Handoff: IMPLEMENT s34 (`s34-script-rename-driver-back-and-forth`) — PLANNED, REAL ENGINE FIX (reader-dependent), suite 463→475
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S34 planning (/plan-scenario 34)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/149e423f-6a85-4e83-96cc-5d28cd4cc85d.jsonl
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s34/s34-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (UNCHANGED — NOTHING committed; the worktree
carries uncommitted S28–S33 work, see Coordination Hazard).

## Goal
Make `reconstruction_cli` reconstruct Scenario s34 correctly. s34 is a script rename whose driver script
is written BETWEEN two manual `renames.csv` edits ("back and forth"), and whose `ledger.py` gets a
manual trailing append AFTER the script beacon but BEFORE a later Claude `Edit`. UNLIKE S33 this is NOT
a char-lock: `ledger.py` reconstructs to 186 lines at HEAD, ground truth is 187 — the step-9 trailing
append (`# names normalized via rename script`) is dropped because it falls OUTSIDE the later `report`
edit's hunk window, so the existing `editBaseIsStale` (hunk-context only) misses it. This is a **REAL
engine fix** (first since m6/S28) in `src/reconstruction_reseed.ts`, plus a mandatory 250-line module
split, plus 12 lock tests.

## Current State — PLANNED (fix prototyped + reverted byte-clean)
- Suite **463/463 green** at HEAD; `npx tsc --noEmit` clean.
- The fix was prototyped live: after applying it, suite stayed **463/463 green**, `tsc` clean, and all
  four s34 files byte-equal ground truth (`ledger.py`→187 via the new path, `renames.csv`→5 via existing
  S27, `test_ledger.py`→57, `apply_renames.py`→54). Then reverted byte-clean — `src/reconstruction_reseed.ts`
  is back to its pre-prototype S28 state (grep for `outOfWindowEditSeed` returns nothing).
- Live-verified targets the plan pins (all captured this session):
  - conversationDAG `A prompt #7d7450c2`; `--list-branches` tip `#97e510eb`, surviving=4, rewound=0.
  - `extractFileEvents` = `{write:4, edit:2, userEdit:4, overwrite:0}`, userEdit ids sorted
    `["0ee68aad","2a0d75ba","720ee20c","ba8ee917"]`.
  - WITH reader: `ledger.py` ladder 156→157→173→173→**174**→187 (the 174 = the NEW reseed revision);
    `renames.csv` 3→4→**5** (existing S27 `completeTruncatedBeacon`).
  - WITHOUT reader: `ledger.py`=186, `renames.csv`=4 (the RED state). S34 is reader-DEPENDENT.

### Files created this session
- `plans/s34/s34-reconstruction-plan.md` — the authoritative plan (test-by-test anchors, exact fix code).
- `plans/s34/handoff-…-1955.md` — this handoff.

## What Remains (execute the plan, in order)
1. **create handoff** for the next agent (s35 planner) when implementation is done.
2. Confirm baseline 463/0, tsc clean.
3. Add `S34_JSONL` fixture (`tests/fixtures.ts`, after `S33_JSONL`).
4. Write the RED engine test T1 first; run it — it MUST FAIL at HEAD (ledger.py=186).
5. Apply the engine fix to `src/reconstruction_reseed.ts` (refactor `editBaseIsStale` to share
   `firstHunkMatchesBase`; add `lastPriorTimeFor` + `outOfWindowEditSeed`; extend `staleEditSeedFor`;
   `import { Path }`). Re-run T1 → GREEN.
6. **250-line split (MANDATORY):** move the s27/s28 beacon-completion family to new
   `src/reconstruction_beacons.ts`; update `src/reconstruction_branches.ts` imports to point directly at
   each module (no re-export shim). Confirm both src modules ≤250 lines.
7. Write engine tests T2–T6 (`tests/reconstruction_engine_s34.test.ts`) and CLI tests C1–C6
   (`tests/reconstruction_cli_s34.test.ts`); capture live `runCli` output before locking C-test strings.
8. Update docs: `plans/roadmap.md`, `plans/reconstruction-engine-design.md`,
   `plans/implementation-notes-api-from-scenarios.md` (append/prepend S34; do not rewrite prior entries).
9. Verify (`npm test` → 475/0; tsc clean; both src modules ≤250) and commit per the plan's Commit
   hygiene (USER APPROVAL ONLY; never `git add -A`).

## Key Files
- `plans/s34/s34-reconstruction-plan.md` — the plan (read first; has the exact fix + all anchors).
- `src/reconstruction_reseed.ts` — where the fix goes (`staleEditSeedFor`/`editBaseIsStale`); pipeline
  stage 5 inside `src/reconstruction_branches.ts:reconstructFileOver`.
- `src/reconstruction_sidecar.ts` — `backupSeedWriteFor` (atOrBefore picks `@v4`=174 for the report
  edit), `findBackupAtOrBefore`, the real reader (`createSidecarReader`/`getDefaultFileHistoryRoot`).
- `tests/reconstruction_engine_s33.test.ts` / `tests/reconstruction_cli_s33.test.ts` — structural
  templates to copy helpers from verbatim.
- `scenarios/executed/s34-script-rename-driver-back-and-forth/` — rendered ground-truth files.
- `plans/script-handling.txt` — MUST READ; HAS-BEACON vs NO-BEACON premise.

## Context the Next Agent Won't Have
- **`renames.csv` is ALREADY fixed by the existing S27 `completeTruncatedBeacon` — do NOT touch it.** The
  step-7 (`tot_credits`) append left no beacon; its 4-line step-5 beacon is a prefix of the 5-line `@v3`
  backup, so S27 completes it. The ONLY new code is for `ledger.py`.
- **The bug is an OUT-OF-HUNK-WINDOW stale base.** The `report` edit's hunk matches the 173-line beacon
  base perfectly (context = `if __name__ == "__main__":`), so `editBaseIsStale` returns false and the
  step-9 trailing line is lost. The fix detects drift by CONTENT against the at/before backup (`@v4`=174,
  taken after the beacon, before the edit), gated so it fires only when the existing path did not and the
  backup is strictly newer than the last captured event and the hunk still splices cleanly (forward-
  validated — a poison backup is rejected). Prototyped 463→463 green; this is why it's safe.
- **The FAILED `report` edit (`toolu_01Q1y1…`, no `structuredPatch`) is the on-disk-modified marker** —
  it produces no event/node; only the successful retry `#01KcAiCq` (K) is in the lineage. Don't expect a
  node for step-7/step-9 — they have no beacon and no tool_use; they surface only as synthetic reseed
  revisions in `--verbose` (changeId = blob name, kept out of the DAG per spec-40).
- **The fix forces a 250-line split** (`reconstruction_reseed.ts` would hit ~270). The project rule is
  "split, never condense" and "no forwarding layers" — move the beacon family out and import directly.
- **Reader is REQUIRED for the bytelock tests.** A no-reader reconstruction is the RED proof (186/4), not
  the lock target. Build the reader as the CLI does, or use `runCli`.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # baseline 463/0 now; 475/0 after the work
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s34.test.ts tests/reconstruction_cli_s34.test.ts   # 12/12 after the work
wc -l src/reconstruction_reseed.ts src/reconstruction_beacons.ts   # both ≤ 250
```

## Coordination Hazard (same as S28–S33)
The worktree carries uncommitted prior-scenario work — `src/parse/loadTranscript.ts` (S32 fix),
`src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`, `_user_edit.ts`, the S28–S33
test/plan/doc files, and unrelated `src/Impl_template.md` / `src/Plan_template.md` edits by other agents.
`src/reconstruction_reseed.ts` and `src/reconstruction_branches.ts` ALSO carry S28–S33 edits — your S34
hunks interleave with those. `git diff --stat` is NOT S34-only — confirm the commit-split with the user;
never `git add -A`.
