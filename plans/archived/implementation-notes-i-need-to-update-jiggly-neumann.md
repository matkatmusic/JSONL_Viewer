## 2026-06-25:01:44:00 — Per-step + post-edit on-disk state capture for run-scenario
Chat title: i-need-to-update-jiggly-neumann
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/e3ec3f3d-12b4-497c-b3b6-f3f67e7c2779.jsonl

### References

/Users/matkatmusicllc/.claude/plans/i-need-to-update-jiggly-neumann.md
/Users/matkatmusicllc/Programming/jot/common/scripts/run_scenario_lib.py
/Users/matkatmusicllc/Programming/jot/tests/test_run_scenario_lib.py
/Users/matkatmusicllc/Desktop/claude code src/RevEng/run-all-scenarios.py
/Users/matkatmusicllc/Desktop/claude code src/RevEng/tests/test_run-all-scenarios.py

### Design decisions

- Snapshots are written inside the agent's tmpdir at `.step_states/step-<NNN>/`
  (zero-padded step number) with a `manifest.json` of
  `{label, step_num, action, payload, files}`. This mirrors the existing
  `_snapshotAbandonedBranch` (`.abandoned_branches/abandoned-branch-N/`), which
  is left in place — per-step capture is additive.
- The copy logic was extracted from `_snapshotAbandonedBranch` into a shared
  `_copyWorkingTree(cwd, dest)` helper; both snapshot functions now call it.
- `_SNAPSHOT_EXCLUDE` gained `.step_states` and `.gitignore` so a snapshot never
  recursively copies prior snapshots or the runner-injected gitignore.
- Post-edit state (requirement 1) is covered by the same mechanism — the snapshot
  taken after an `edit` step is the post-edit state, and its manifest records
  `action: "edit"` so it is identifiable. No separate edit-only capture was built.
- Snapshot fires after every handled step (the `unknown` action still returns
  early before the snapshot), giving a clean 1:1 step→disk-state mapping. The
  rewind ordering is preserved: abandoned-branch snapshot (pre-rewind) → rewind →
  per-step snapshot (post-rewind state).
- `runScenario_launch` now writes a `.gitignore` into the tmpdir listing
  `.gitignore`, `.step_states/`, `.abandoned_branches/`. It lists itself so
  `git add -A` in git-baseline scenarios stages none of the runner snapshot
  artifacts, keeping committed trees aligned with what the engine reconstructs
  from the JSONL.
- The result dict from `runScenario_executeSteps` gained `step_states`
  (list of `step-NNN` labels) alongside `abandoned_branches`.

### Deviations

- **run-all-scenarios.py: no functional change.** The plan anticipated this.
  `copyScenarioOutputsToExecutedDir` already recurses every subdir including
  dotdirs (proven by the existing `.git` capture test), so `.step_states/` lands
  in `executed/<stem>/` automatically. Task 6 added only a characterization test
  (`test_copyScenarioOutputs_captures_step_states`), which passed on first run.
- **Subagents not used.** The plan's six tasks all edit the same library file in
  dependency order (shared helper → exclude set → snapshot fn → executor wiring),
  so parallel subagents would have collided. Implemented sequentially instead.

### Tradeoffs

- Snapshot-every-step vs only disk-changing steps: chose every step (user
  decision). Cost is N full-tree copies per scenario; acceptable for test
  fixtures and gives the engine a complete step→state map.
- Snapshots inside tmpdir + `.gitignore` vs a sibling states dir outside cwd:
  chose inside (user decision). Keeps run-all-scenarios capture automatic; the
  `.gitignore` (self-ignoring) prevents git pollution in baseline scenarios.

### Open questions

- File-size hook: the jot `post_tool_use` hook flags a 250-line cap.
  `test_run_scenario_lib.py` is now ~1216 lines and `run_scenario_lib.py` ~966 —
  both were already far over the cap before this change. I did not split them as
  part of this feature. Want these test/source files broken up separately?
- Should `run-all-scenarios.py` actively surface `step_states` (e.g. log a count
  or assert snapshot-count == step-count) rather than relying on the silent
  tmpdir copy? Left out as YAGNI; easy to add if useful for triage.

## 2026-06-25:02:08:00 — Prime every spawned agent with /ponytail

Follow-on request: every spawned tmux agent's first received message must be
`/ponytail` (invoking the ponytail skill).

- Added `_sendPonytailPrimer(pane_target, signal_dir)` in `run_scenario_lib.py`:
  mirrors `_executeSay` — clears `done`, sends `/ponytail`, waits for `done`.
- Wired it into both launch points: `runScenario_launch` (initial agent, after the
  ready-wait) and `_spawnClaudeInTmux` (used by both the killing `_executeSpawn` and
  the concurrent `_executeSpawnConcurrent`). All three agent-start paths are covered.
- The primer runs during launch/spawn, NOT inside the executeSteps loop, so it gets
  no per-step snapshot and no progress checkbox — it is invisible to the scenario.
- Tests added: `test_sendPonytailPrimer_sends_ponytail_and_waits` and
  `test_launch_first_message_is_ponytail`; `_installLaunchDoubles` now stubs
  `tmux_sendAndSubmit`. Suite: 50 passed.
- Note for the reconstruction engine: the transcript now opens with a `/ponytail`
  turn (no file changes). The engine may need to skip this leading turn.

## 2026-06-25:02:30:00 — Capture only on code change, not every turn

Revision: snapshot a step ONLY when it actually changed code on disk. The engine
can't attribute a step number to a conversational turn ("thanks", "looks good") or
to a `/rewind` revert, so those must not produce snapshots.

- Added `_workingTreeSignature(cwd)` — `{relpath: sha1}` over the working tree,
  honoring `_SNAPSHOT_EXCLUDE` (and the same conftest.py/__pycache__ drops as
  `_copyWorkingTree`).
- `runScenario_executeSteps` now tracks `last_signature` (seeded from the starting
  tree). After each handled step it recomputes the signature and snapshots only when
  `action != "rewind"` AND the signature changed; then updates `last_signature`.
- Net effect: code-writing Says and Edits are captured; chatter Says are skipped
  (no file delta); `/rewind` is skipped (revert + explicit guard — its abandoned
  state is still captured by `_snapshotAbandonedBranch`). Snapshot labels stay
  `step-<NNN>` so each capture is traceable to the scenario step that authored it.
- This supersedes the earlier "snapshot every step" decision in the plan.
- Tests: rewrote `test_executeSteps_snapshots_every_step` →
  `test_executeSteps_snapshots_only_on_code_change`; added
  `test_executeSteps_rewind_does_not_snapshot_even_when_tree_changes`. Suite: 51 passed.

## 2026-06-25:09:50:00 — Concurrency cap, skip-existing on .step_states, optional --model

Three run-all-scenarios.py revisions (+ supporting lib plumbing):

1. **Max 7 concurrent sessions.** Replaced `launchAllScenarios` + `pollUntilComplete`
   with `runScenariosWithLimit` (helpers `fillOpenSlots`, `reapFinishedSessions`):
   fills open slots up to `MAX_CONCURRENT_SESSIONS = 7`, polls in-flight sessions, and
   frees each slot the moment its scenario finishes or exceeds POLL_TIMEOUT_S (now a
   per-session deadline, not a global one). Test: `test_runScenariosWithLimit_caps_concurrency`.
2. **--skip-existing now keys on `.step_states/`.** `hasCapturedRun` returns True iff
   `executed/<stem>/.step_states/` exists (the artifact the engine needs), not merely a
   `.jsonl`. Tests updated accordingly.
3. **Optional `--model` CLI arg** (default `claude-opus-4-6[1m]`; pass `--model ""` to
   skip). The model threads: run-all-scenarios `--model` → `/run-scenario <path> --model
   <m>` → `runScenario_main` (parsed via `_splitScenarioAndModel`, which rsplits so
   space-containing paths stay intact) → orchestrator (`*argv`, no change) →
   `runScenario_launchAndExecute` → `runScenario_launch` + `runScenario_executeSteps` →
   spawn helpers → `_primeSpawnedAgent`. The primer (renamed from `_sendPonytailPrimer`)
   now sends `/model <m>` (only when set) before `/ponytail ultra`, so every launched
   AND spawned agent runs on the chosen model. Tests:
   `test_primeSpawnedAgent_pins_model_then_loads_ponytail`,
   `test_primeSpawnedAgent_skips_model_when_none`,
   `test_splitScenarioAndModel_preserves_paths_with_spaces`,
   `test_launchScenario_includes_model_flag` / `_omits_model_flag_when_empty`.

Open question: `run-all-scenarios.py` is now ~274 lines (>250 soft cap from the jot
hook); it was ~249 before. Left as-is — splitting the CLI orchestrator is out of scope.

### Verification

- `cd /Users/matkatmusicllc/Programming/jot && python3 -m pytest tests/test_run_scenario_lib.py -q` → 53 passed.
- `cd "/Users/matkatmusicllc/Desktop/claude code src" && python3 -m pytest RevEng/tests/test_run-all-scenarios.py -q` → 18 passed.
- `cd "/Users/matkatmusicllc/Desktop/claude code src/RevEng" && python3 -m pytest tests/test_run-all-scenarios.py -q` → 15 passed (14 prior + 1 new).
- End-to-end run on a rewind+edit scenario (e.g. `--only s19-user-edit-conv-rewind`)
  and git-baseline isolation check (`--only s39-git-baseline-seed`) are listed in
  the plan's final verification and have not been run live in this session
  (require a tmux/Claude pane).
