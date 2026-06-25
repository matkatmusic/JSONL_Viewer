# Handoff: s34 (`s34-script-rename-driver-back-and-forth`) — IMPLEMENTED, REAL ENGINE FIX + module split, suite 463→475 green
MUST READ: plans/script-handling.txt
Conversation name: api-from-scenarios — S34 impl (/impl-scenario 34) → implement S34 (script-rename-driver-back-and-forth)
JSONL: the active /impl-scenario 34 session under /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ (planning source of record: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/149e423f-6a85-4e83-96cc-5d28cd4cc85d.jsonl)
Plan file: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/s34/s34-reconstruction-plan.md

## Branch
`api-from-scenarios` based on `master`. HEAD = `cededae` (UNCHANGED — NOTHING committed; the worktree
carries uncommitted S28–S33 work plus the new S34 work, see Coordination Hazard).

## Goal
Make `reconstruction_cli` reconstruct Scenario s34 (a script rename whose driver is written BETWEEN two
manual `renames.csv` edits, and whose `ledger.py` gets a NO-BEACON trailing append between a beacon and a
later Edit). At HEAD `ledger.py` reconstructed to 186 lines (ground truth 187): the step-9 trailing append
fell OUTSIDE the later `report` edit's hunk window, so the existing hunk-context staleness test missed it.
S34 is a REAL engine fix (the first since m6/S28) plus a mandatory 250-line module split.

## Current State — IMPLEMENTED, all done
- **Full suite 475/475 green** (`npm test`); `npx tsc --noEmit` clean. Was 463 at HEAD; +12 (6 engine + 6 CLI).
- TDD proof: T1 (`test_S34_ledger_bytelock_out_of_window_reseed`) was written FIRST and FAILED at HEAD
  (ledger.py=186, truncated), then GREEN (187) after the fix.
- **The engine fix** (`src/reconstruction_reseed.ts`): added a SECOND staleness trigger `outOfWindowEditSeed`
  (+ helper `lastPriorTimeFor`), refactored `editBaseIsStale` to share a new `firstHunkMatchesBase`, and
  extended `staleEditSeedFor` to a two-trigger dispatch (s19/s23/m6 stale-hunk path OR s34 out-of-window
  path — DISJOINT). Reader-gated (runs only inside `seedStaleEditBases`), so reader-free reconstruction is
  byte-for-byte untouched. `import type { Path }` added.
- **The module split** (mandatory — the fix pushed reseed.ts to 274 > 250 cap): moved the beacon-completion
  family (`completeTruncatedBeacon` S27 / `completeElidedBeacons` S28 + private helpers) to a NEW
  `src/reconstruction_beacons.ts`. `src/reconstruction_branches.ts` now imports the two beacon functions from
  `./reconstruction_beacons.ts` and `seedStaleEditBases` from `./reconstruction_reseed.ts` directly (no
  re-export shim). Both modules end at **145 lines** (≤250).
- `renames.csv`'s step-7 NO-BEACON append is fixed by the EXISTING S27 `completeTruncatedBeacon` — NOT touched.
- Docs updated: `plans/roadmap.md` (S34 line), `plans/reconstruction-engine-design.md` (S34 note after S33),
  `plans/implementation-notes-api-from-scenarios.md` (prepended S34 entry).

## What Remains
1. **Commit (USER APPROVAL ONLY).** Stage EXACTLY the S34 paths — never `git add -A` (see Coordination Hazard):
   `src/reconstruction_reseed.ts`, `src/reconstruction_beacons.ts` (new), `src/reconstruction_branches.ts`
   (import update only), `tests/fixtures.ts`, `tests/reconstruction_engine_s34.test.ts`,
   `tests/reconstruction_cli_s34.test.ts`, `plans/roadmap.md`, `plans/reconstruction-engine-design.md`,
   `plans/implementation-notes-api-from-scenarios.md`, `plans/s34/`.
2. **Next scenario: s35** (`s35-script-rename-script-user-edit` — the rename SCRIPT itself is user-edited).
   This handoff's title (`s34 … IMPLEMENTED`) fires the `monitor-handoff.sh s34 impl` gate that unblocks the
   s35 planner. The s35 planning monitor (`bq3vvfxsg`) is already armed.

## Key Files
- `src/reconstruction_reseed.ts` — the fix lives here (`outOfWindowEditSeed`, `lastPriorTimeFor`,
  `firstHunkMatchesBase`, two-trigger `staleEditSeedFor`). Now 145 lines (stale-edit-base family only).
- `src/reconstruction_beacons.ts` — NEW; the beacon-completion family moved here (s27/s28). 145 lines.
- `src/reconstruction_branches.ts` — import update only (pipeline stage 5 unchanged).
- `tests/reconstruction_engine_s34.test.ts` / `tests/reconstruction_cli_s34.test.ts` — the 12 lock tests.
- `tests/fixtures.ts` — `S34_JSONL` added after `S33_JSONL`.
- `plans/s34/s34-reconstruction-plan.md` — the authoritative plan (exact fix code + all anchors).
- `scenarios/executed/s34-script-rename-driver-back-and-forth/` — rendered ground-truth files.

## Context the Next Agent Won't Have
- **The bug is an OUT-OF-HUNK-WINDOW stale base, detected by CONTENT not hunk position.** The `report` edit's
  hunk context (`if __name__ == "__main__":`) matches the 173-line beacon base perfectly, so `editBaseIsStale`
  returns false; the fix asks for the at/before backup (`d5ade1bd80e08f91@v4`, 174 L, taken AFTER the beacon
  yet AT/BEFORE the edit), gated so it fires ONLY when the existing path didn't, the backup is strictly newer
  than the last captured event, its content differs from the base, and the hunk still splices cleanly (a
  poison backup is rejected). This is why the full suite stays green (no regression).
- **S34 is reader-DEPENDENT.** No-reader: ledger.py=186, renames.csv=4 (the RED proof). Real reader after fix:
  187/5. A poison reader is rejected by the forward-validation guards → falls back to 186/4, never fabricated.
  Engine bytelock tests build the reader exactly as the CLI does (`createSidecarReader(findSessionId(records)!,
  getDefaultFileHistoryRoot())`) — this is the FIRST reader-dependent engine test.
- **PLAN DEVIATION (S33 lesson, captured live):** the plan's C6 substitution literal
  `re.sub(rf"\b{re.escape(old)}\b", new, text)` was the S33 f-string form; the real `apply_renames.py` uses the
  STRING-CONCAT form `re.sub(r"\b" + re.escape(old) + r"\b", new, text)`. The test asserts the REAL literal.
- **The synthetic reseed Write adds NO DAG node** (changeId = backup blob name, spec 40) — `ledger.py`'s
  fileDAG stays 5 nodes (B,D,E,I,K); the 174-line reseed surfaces only as a `--verbose` revision.
- **The FAILED `report` edit** (`toolu_01Q1y1…`, "file modified since read", no `structuredPatch`) is the
  on-disk-modified marker; it produces no event/node. Only the successful retry `#01KcAiCq` is in the lineage.
- Anchors (live-captured): A prompt `#7d7450c2`; surviving tip `#97e510eb`; `extractFileEvents` =
  {write:4, edit:2, userEdit:4, overwrite:0}, userEdit ids `["0ee68aad","2a0d75ba","720ee20c","ba8ee917"]`;
  ledger.py ladder 156→157→173→173→**174**→187; renames.csv 3→4→5.

## How to Verify
```
cd /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios
npm test            # 475 / 0
npx tsc --noEmit    # No errors found
node --import tsx --test tests/reconstruction_engine_s34.test.ts tests/reconstruction_cli_s34.test.ts   # 12/12
wc -l src/reconstruction_reseed.ts src/reconstruction_beacons.ts   # both 145 (≤ 250)
```

## Coordination Hazard (same as S28–S33)
The worktree carries uncommitted prior-scenario work — `src/parse/loadTranscript.ts` (S32 fix),
`src/reconstruction_branches.ts`, `_reseed.ts`, `_sidecar.ts`, `_user_edit.ts`, the S28–S33 test/plan/doc
files, and unrelated `src/Impl_template.md` / `src/Plan_template.md` edits by other agents.
`src/reconstruction_reseed.ts` and `src/reconstruction_branches.ts` ALSO carry S28–S33 edits — your S34 hunks
interleave with those. `git diff --stat` is NOT S34-only — confirm the commit-split with the user; never
`git add -A`.
