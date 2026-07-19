# Handoff: Implement the s87 engine-gaps plan (Scenario s87, 56/118 → 118/118)
MUST READ: plans/script-handling.txt
Conversation name: s87 parser fix + engine-gap diagnosis
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/e96de7cd-33e1-4740-a50e-a294a4952df8.jsonl
Plan file: plans/s87-engine-gaps-plan.md

## Branch
`develop` (RevEng superproject; engine work happens inside the `jfred/` submodule, also on `develop`)

## Goal
Make the reconstruction engine reproduce all 118 captured step states of
scenario s87-demo-composite (`jfred/scenarios/executed/s87-demo-composite/`).
The scenario and its capture are fixed ground truth — engine changes only.

## Current State
- Parser layer DONE this session (staged in jfred): `effort` assistant key +
  `file-history-delta` record type modeled (`src/parse/loadTranscript.ts`,
  `src/structures/vocabulary.ts`, matching tests). s87 loads fully everywhere.
- Coverage: `npx tsx scripts/check_scenario_coverage.ts s87` → FAIL 56/118.
  `npm test` (from jfred/) → 775/776, only the s87 coverage test fails.
- Three root causes fully diagnosed and verified against live engine runs
  (diagnosis details embedded in the plan file). No engine fix implemented yet.

## What Remains
1. Read plans/s87-engine-gaps-plan.md (RevEng root) and implement Phase 1:
   sandbox recorded-cwd remap in `jfred/src/reconstruction_script_sandbox.ts`
   (+3 call sites), failing test first. Gate: coverage ≥ 65/118.
2. Phase 2: mid-stream tail-truncated beacon completion (s27 mechanism extended
   with an s45-style `notAfter` bound). Gate: coverage ≥ 88/118.
3. Phase 3: script-rename registration in
   `jfred/src/reconstruction_script_renames.ts` (code-literal
   shutil.move/os.rename channel + chain-aware phantom guard). Gate: 118/118.
4. Full-suite verification: `npm test` 776/776; check no other scenario moved.
5. Stage (do not commit) all changes in jfred.

## Key Files
- plans/s87-engine-gaps-plan.md — THE plan; per-phase tests, fixes, file:line targets, gates.
- plans/script-handling.txt — the forward-validation premise (MUST READ).
- plans/coding-requirements.md — mandatory project coding standards.
- jfred/src/reconstruction_script_sandbox.ts — Phase 1 (`runScriptAgainstState`, :154).
- jfred/src/reconstruction_beacons.ts + reconstruction_reseed.ts — Phase 2 (`beaconIsElided` :77, `completeTruncatedBeacon`).
- jfred/src/reconstruction_script_renames.ts — Phase 3 (`extractScriptRenameEvents`, phantom guard :74-76).
- jfred/scripts/check_scenario_coverage.ts — the per-step oracle.

## Context the Next Agent Won't Have
- The elided-beacon splice on inventory.py is CORRECT — do not bound/reorder it
  (first instinct from the rescue trace, disproven: the gap is a MISSING script
  event at 23:49:28, killed by the un-remapped hardcoded cwd).
- HAZARD: the recorded tmpdir `/private/var/folders/.../run-scenario.7y52smqe`
  still exists on disk; without the Phase-1 remap, replaying the step-89 run
  can MUTATE it (and the capture). Never replay against recorded paths.
- Records load in readdir order, which is NOT timestamp order — the Phase-3
  chain guard must sort by executor timestamp.
- Backups for the driver session gap: nothing between 23:48:14 and 23:55:05 —
  only script replay can fill the rename window; no backup shortcut exists.
- The coverage checker reads the LIVE ~/.claude/file-history — do not clean it.
- User preferences: comment out replaced code (don't delete), no forwarding
  layers, verb-named functions, domain types over primitives.

## How to Verify
```
cd jfred
npx tsx scripts/check_scenario_coverage.ts s87   # per-phase gates: 65 / 88 / 118
npm test                                          # final: 776/776
```
