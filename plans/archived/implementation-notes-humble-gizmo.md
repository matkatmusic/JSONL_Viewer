## 2026-06-27:12:35:00 — Fix s34 coverage failure (spurious pre-rename ledger.py comment)
Chat title: diagnose-the-cause-of-humble-gizmo
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Programming-RevEng-worktrees-api-from-scenarios/515dab17-295a-4761-9f55-e299d39534cb.jsonl

### References
/Users/matkatmusicllc/.claude/plans/diagnose-the-cause-of-humble-gizmo.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/plans/handoff-api-from-scenarios-20260627-1142.md
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/src/reconstruction_script_execution.ts
/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/src/reconstruction_script_stage.ts

### Design decisions
- The plan framed the bug as a "tighten the upper time-bound on a recovered append" in either
  seedStaleEditBases (A) or completeElidedBeacons (B). The live trace disproved BOTH. The real
  cause is that s34 runs its rename via Bash `python3 apply_renames.py` — an INDIRECTED script
  invocation. The `TARGETS=[...]` list and the `renames.csv` reference live inside the written
  apply_renames.py file, not in the Bash command string. `parseScriptTargets`/`csvBasenameOf`
  parse only the run's inline code, so `injectScriptExecutions` (the s37 script-replay stage) never
  associates the run with ledger.py and bails. completeElidedBeacons then falls back to the only
  `record_entry` backup (03:35:54), which already carries an out-of-band `# names normalized via
  rename script` comment the clean post-rename state never had → spurious revision.
- There is NO comment-free `record_entry` backup in the file-history (backups jump add_entry/138 →
  record_entry/139+comment), so the intermediate clean state MUST be COMPUTED by replaying the
  rename script, exactly the s37 Phase C design. Branch B (bound-tightening) is impossible — there
  is no comment-free backup to pick.
- Fix locus: resolve `python <file>.py` indirection in reconstruction_script_execution.ts —
  replace a run's code with the invoked script's authored Write body before the rename-CSV
  machinery parses it. Smallest change that makes the EXISTING injectScriptExecutions stage fire.

### Deviations
- Departed from the plan's Step 3 (A/B time-bound guard). Implemented script-indirection resolution
  instead, because the trace proved the plan's root-cause hypothesis wrong. Same goal (s34 13/13,
  sweep 66/72), correct mechanism.

### Tradeoffs
- Considered KEEPING completeElidedBeacons for the comment and merely ADDING the clean state — a
  bigger, two-mechanism change. Rejected: injectScriptExecutions already exists for exactly this and
  runs before completeElidedBeacons; the out-of-band comment append (step 9) is a genuine separate
  change that the stale-edit-base family is designed to recover from the later Edit. Verifying step 9
  survives empirically via the coverage checker rather than predicting the engine interaction.

### Open questions
- RESOLVED: s34 step 9 (record_entry + comment, 139 lines) DOES still reconstruct once the rename
  beacon is replaced by the computed clean state — the stale-edit-base family recovers the out-of-band
  comment from the later Edit, as the architecture intends. s34 verified 13/13.

### Verification (final)
- s34: OK 13/13. Full sweep: 66/72 (up from 65); remaining FAILs {s35,s38,s41,s42,s43,s44} — s34 gone,
  none new.
- Unit suite: fail 30→28 with my source edit applied; fail-set diff vs reverted-source baseline shows
  ZERO new failures and exactly the 2 s34 tests fixed (the s34 scenario test + the new
  test_checkScenario_reports_every_step_passes_for_s34).
- tsc --noEmit clean. reconstruction_script_execution.ts = 244 lines (≤250); script_stage unchanged.
- NOTHING committed (the user makes all commits).

### Files changed
- src/reconstruction_script_execution.ts — added writtenContentInRecord, writtenContentByBasename,
  resolveScriptIndirection; findScriptExecutionRuns now maps runs through resolveScriptIndirection.
- tests/check_scenario_coverage.test.ts — added test_checkScenario_reports_every_step_passes_for_s34.
