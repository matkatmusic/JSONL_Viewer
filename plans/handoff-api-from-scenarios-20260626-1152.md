# Handoff: s37 script-replay — Phase A committed, start Phase B (route the engine through `kept[]`)
Conversation name: script-replay (partitioned-puppy)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/ba079f53-7a92-486b-89c4-344621a8bfc5.jsonl
Plan file: /Users/matkatmusicllc/.claude/plans/task-implement-script-replay-partitioned-puppy.md
Implementation notes: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/implementation-notes-script-replay-partitioned-puppy.md

## Branch
`api-from-scenarios` based on `master`. Phase A is COMMITTED as `3994422 added --trace tool to reconstruction_cli`. Working tree is clean.

## Goal
Close the s37 (`s37-script-rename-driver-back-and-forth-mcp`) coverage gap: its reconstructed `ledger.py` carries a trailing `# names normalized via rename script` at step-8 that the ground truth does not. The fix ships in three committed-separately phases. Phase A (a line classifier `evaluateLine` + a `partitionLines` partition + a `--trace` diagnostic CLI) is done and committed. **You are starting Phase B: make the classifier's `kept[]` the engine's sole input, gated on byte-for-byte parity (no behavior change yet).** Phase C then models the `ctx_execute` rename and actually fixes s37.

## Current State
- **Full suite: 197 pass / 7 fail** via `node --import tsx --test tests/*.test.ts`. The **7 failures are pre-existing** (verified by stashing all Phase A work → identical 7): `test_findCoveredScenarios_includes_s19`, `test_readStepStateFiles_...`, `test_checkScenario_reports_every_step_passes_for_s19` (s19 ground truth not captured in this worktree — only s37 has `.step_states`), `test_a_file_less_surviving_branch_is_kept_...`, `test_findPromptForkPoints_returns_the_single_S13_fork_8faab841`, `test_findDeepestPromptOrReply_...` (S13 fixtures), and `s37 reproduces every captured step state` (THE step-8 bleed — Phase C's target).
- `npx tsc --noEmit` is clean.
- `npx tsx scripts/check_scenario_coverage.ts s37` → **FAIL 12/13**, step-8: `ledger.py @line 124: expected "" got "# names normalized via rename script"`. Trace shows `completeElidedBeacons` splices a synthetic Write completing an elided beacon (changeId `38731be9…`) + `seedStaleEditBases` reseeds from file-history backup.
- Phase A shipped: `evaluateLine`/`partitionLines` (`src/reconstruction_parse_lines.ts`), `renderTrace`+`TraceOptions` (`src/reconstruction_trace.ts`), `--trace`/`--hideIgnored`/`--onlyIgnored`/`--details`/`--line`/`--mode`/`--help` (`src/reconstruction_cli_trace.ts`), `Verdict`+`TraceDetailMode` enums (`src/structures/vocabulary.ts`), `jsonlPathsForScenario` (`tests/utilities.ts`). The four bash parsers in `reconstruction_extract.ts` are now exported.
- **Trace audited (Phase B's gate):** `--trace --hideIgnored` over s37 keeps every load-bearing write/edit/user-edit-beacon/read-beacon/file-history-snapshot. The ONLY dropped evidence is lines **158 & 162** (the two `ctx_execute` rename runs — `ignore` until Phase C adds `scriptExecution`) plus non-file-op bash and Read *requests*. Extraction does not consume 158/162 today, so kept[] is already a superset of what the engine reads → parity should hold trivially.

## What Remains
Phase B (plan §"Phase B — make `kept[]` the single gate", lines 317-347 of the plan file), in order:
1. **B1 — route input through `partition.kept`.** Find the reconstruction entrypoint that loads all records (via `loadTranscript`/`loadRecords`, called in `reconstruction_cli.ts:runCli` and in `scripts/check_scenario_coverage.ts` / `reconstruction_steps.ts`). Change it to hydrate ONLY `partition.kept` (map each `KeptLine.raw` through `parseRecord`) into the `TranscriptRecord[]` fed to `extractFileEvents`. `evaluateLine` becomes the sole keep/ignore decision. A kept line that fails `parseRecord` is reclassified `ignore` (preserve `loadTranscript`'s strict-parse behavior).
2. **B2 — gate on parity.** Write `test_kept_records_reproduce_the_full_s37_reconstruction`: reconstruct s37 from `partition.kept` and assert the produced `FileRevision[]` (or rendered snapshots) is byte-identical to reconstructing from the full record list. (s37 still fails step-8 in BOTH — parity, not correctness, is the point.)
3. **B3 — full-sweep parity.** Run `npx tsx scripts/coverage_ledger.ts` and confirm NO scenario regresses vs the pre-Phase-B ledger. If any needed line is mis-classified `ignore`, fix `evaluateLine` (it must be a strict superset of "lines the engine reads") and re-run. Use `--onlyIgnored --details` to audit drops.
4. **Stop and let the USER commit Phase B** once parity holds across the full sweep and `tsc` is clean. The user makes ALL commits — never commit yourself.
5. Then Phase C (plan §"Phase C", lines 350-503): `EventKind.scriptRename` + `ScriptRenameEvent`, `parseRenameSubs`/`parseScriptTargets`/`recoverCsvContentAsOf`/`isScriptRenameRun`/`extractScriptRenameEvents` in a new `src/reconstruction_script_rename.ts`, a replay handler `applyRenameSubs`, a forward-validation guard `scriptRenameIsValidated`, and finally reconcile the comment bleed (C8) — likely by making `completeElidedBeacons` defer to an in-transcript beacon instead of the comment-bearing file-history backup. Target: `check_scenario_coverage.ts s37` → `PASS 13/13`, no new sweep FAIL.

## Key Files
- `/Users/matkatmusicllc/.claude/plans/task-implement-script-replay-partitioned-puppy.md` — the authoritative 3-phase spec. READ Phase B (lines 317-347) and Phase C (350-503) before editing.
- `src/reconstruction_parse_lines.ts` — `evaluateLine` (the classifier), `partitionLines`, `KeptLine`/`LinePartition`. The B1 input rewrite consumes `partitionLines(...).kept`.
- `src/reconstruction_cli.ts` — `runCli` loads via `loadTranscript`; one of the B1 wiring points (250-line cap — it's AT the cap, so route via a helper, do not grow it).
- `src/reconstruction_extract.ts` — `extractFileEvents(records)`; the records fed here are what B1 changes. `toFileEvent` handles only Write/Bash/Edit (line ~154); the `ctx_execute` rename emits NO event (Phase C adds it).
- `src/reconstruction_beacons.ts` — `completeElidedBeacons` (the actual culprit for the step-8 bleed; C8). Already has a `notAfter`/`backupIsWithinBound` bound from s45.
- `scripts/check_scenario_coverage.ts` + `scripts/coverage_ledger.ts` + `scripts/coverage_scenarios.ts` — the coverage oracle / ledger / scenario discovery.
- `tests/utilities.ts` — `jsonlPathsForScenario("s37")` resolves the transcript (the old per-scenario `S37_JSONL` fixtures are gone).

## Context the Next Agent Won't Have
- **Ponytail ultra is active** (lazy/minimal mode) and **the user makes ALL commits** — never commit; stop after each phase and report. Phase A was committed by the user as `3994422`.
- **250-line-per-file cap is enforced by a hook** ("split, never condense"). `reconstruction_cli.ts` is AT 250 lines — any addition must go in a new module (Phase A added `reconstruction_cli_trace.ts` and `reconstruction_trace.ts` for exactly this reason). Test runner is `node --import tsx --test`, NOT vitest. Filter `Debugger`/`inspector` lines from stderr. `scenarios/` is a symlink — never `git add` under it.
- **The plan's line numbers were wrong** and were corrected against the real fixture: the renames.csv Write tool_use is line **117** (line 118 is its result record); readBeacon 177, fileHistorySnapshot 173, edit 185, editResult 186, user-edit beacons 83/131/166/167, the two `ctx_execute` runs 158/162. Reconstruction classifies Write/Edit by the assistant tool_use, NOT the result record.
- **Phase B parity should be near-trivial** because kept[] is already a superset of what the engine consumes (the only drops — 158/162 — produce no events today). If a scenario regresses, the cause is a record-class the engine reads that `evaluateLine` wrongly drops; widen the classifier, don't hack the engine.
- **The plan's stated root cause for s37 is suspect.** The plan blames `completeElidedBeacons`; this session confirmed the failing stage IS `completeElidedBeacons` (+ `seedStaleEditBases`) via the coverage trace, so C8 is the real fix locus — but per the broader project history (memory: s45) the plan's named culprit has been wrong before. Validate against the live coverage trace, don't trust the plan's prose.
- User refinements made to the `--trace` UI this session (all committed): ignored rows show `type:<recordType>`; `--details` previews are shape-aware (attachment→filename, snapshot→`file@vN`, tool-result→file basename); mode is `--mode <mode>` (explicit, validated — not a positional); `--line N`/`--details N` show ONLY that line.

## How to Verify
- Reproduce the gap: `npx tsx scripts/check_scenario_coverage.ts s37 2>&1 | grep -viE 'Debugger|inspector'` → currently `FAIL 12/13` step-8.
- Full suite: `node --import tsx --test tests/*.test.ts 2>&1 | grep -viE 'Debugger|inspector' | grep -E '^ℹ (tests|pass|fail)'` → baseline `197 pass / 7 fail` (the 7 are pre-existing; do not let the count of fails increase).
- Type check: `npx tsc --noEmit` → clean.
- Phase B sweep parity: `npx tsx scripts/coverage_ledger.ts` → no scenario regresses vs the pre-Phase-B ledger.
- Eyeball the kept set: `npx tsx src/reconstruction_cli.ts $(npx tsx -e 'import{listCoveredScenarios as l}from"./scripts/coverage_scenarios.ts";console.log(l().find(c=>c.scenarioId==="s37").jsonlPaths[0].toString())') --trace --onlyIgnored --details`.
