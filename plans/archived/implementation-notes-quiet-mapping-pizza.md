## 2026-06-25:00:00:00 — Concurrent multi-agent + compact/clear scenarios

Chat title: quiet-mapping-pizza
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/b89b6b7d-71f1-46ca-833a-1eb9c64ddfa1.jsonl

### References

/Users/matkatmusicllc/.claude/plans/quiet-mapping-pizza.md
/Users/matkatmusicllc/Programming/jot/common/scripts/run_scenario_lib.py
/Users/matkatmusicllc/Programming/jot/tests/test_run_scenario_lib.py
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/scenarios/

### Design decisions

- **Turn-taking concurrency** (not true-parallel): multiple agents stay alive in
  separate tmux sessions, but the scenario prompts one at a time and waits for the
  shared `done` signal. Chosen because the signal dir is shared per-run; true
  parallel prompting would require per-agent signal dirs + Stop/SessionEnd hook
  rework. Ceiling documented in a `ponytail:` comment in `_executeSpawnConcurrent`.
- **Target syntax `@aN`**: optional `@(\w+)` token between the action keyword and
  the `:` in `_STEP_RE`. Agents auto-named `a1` (initial), `a2`, `a3`… Untargeted
  steps go to the last-addressed (`active`) agent; `SpawnNewAgent` makes the new
  agent active (matches the old killing-spawn's "new agent becomes current").
- **Per-agent JSONL via side table**: after each `Say`, the executor snapshots the
  shared `jsonl_path.txt` into `agent_jsonl[active]`. This side table does NOT feed
  `captured` — preserving the existing `--excludeJSONL` semantics that s39–s44
  depend on. Targeted `Record @aN` pulls from the side table.

### Deviations

- **End-of-run session cleanup added** (not in the first plan draft): the executor
  now best-effort kills every registered agent session still alive at the end of a
  run, guarded by `tmux_hasSession`. Reason: concurrent runs leave multiple live
  tmux sessions named `{base}-a{index}`; without cleanup a re-run collides on those
  names. Single-agent scenarios are unaffected (their one session is already gone
  by then, so nothing is killed).
- **Test file NOT split despite the 250-line jot hook.** Both
  `run_scenario_lib.py` (~886 lines) and `tests/test_run_scenario_lib.py` (~1030
  lines) were already far over the limit before this work. Splitting them is a
  separate refactor, out of scope and risky; matched the existing single-file
  pattern instead. See Open questions.

### Tradeoffs

- Turn-taking vs true-parallel (see Design decisions): chose turn-taking for a
  small, deterministic change. Cost: scenarios cannot test concurrent-write races
  where two agents write the same file in the same instant — acceptable, that was
  not the goal ("multiple agents edit the same files" is satisfied by sequencing).
- Per-agent JSONL via a side table vs blanket auto-capture: chose the side table so
  `captured` is untouched and the `--excludeJSONL` behavior of s39–s44 is
  preserved. Regression test `test_executeSteps_excludeJsonlOmitsPriorAgentTranscript`
  guards this.

### Results

- Engine: `run_scenario_lib.py` — new `SpawnNewAgent` action (`spawnconcurrent`),
  optional `@agentName` target in `_STEP_RE`, agent registry + routing in
  `runScenario_executeSteps`, `_executeSpawnConcurrent`, targeted `Record`,
  end-of-run cleanup.
- Tests: 7 new tests added; full suite `43 passed`.
- Scenarios: s53–s62 (concurrent) + s63–s72 (compact/clear) written; all 20
  parse-check clean (0 unknown steps, session headers match stems). Totals across
  the 20: 13 `SpawnNewAgent`, 112 targeted steps, 6 `Rewind`, 8 `/compact`, 5 `/clear`.

### Follow-up fix — compaction/clear completion gating (2026-06-25)

- **Bug:** `_executeCompact`/`_executeClear` waited only on `tmux_waitForClaudeReadiness`
  + a 2s sleep. A readiness glyph can appear before the summary is built, so the
  next `Say` could race in mid-compact.
- **Fix:** both now clear `ready`, send the slash command, then block on `ready`
  reappearing — `runScenario_sessionStart` re-touches `ready` from the SessionStart
  hook that fires on compaction/clear completion (source "compact"/"clear"), so it
  is the reliable done-signal. New const `COMPACT_DONE_TIMEOUT_S = 180`. Signatures
  gained a leading `signal_dir` arg; call sites updated.
- **Tests:** `test_executeSteps_compact_waitsForCompactionDoneHook` and
  `test_executeSteps_clear_waitsForClearDoneHook` replace the old send-only tests —
  they assert `ready` is cleared before the send and that the step blocks until the
  simulated hook re-touches it. Suite still `43 passed`.
- Applied to `/clear` as well as `/compact` (same SessionStart mechanism, same race).

### Open questions

- **End-to-end smoke not run** (verification item 3). It needs a live tmux + real
  Claude agents, which this environment can't drive headless. Please run, when able:
  `/run-scenario …/s53-concurrent-two-agents.txt` (expect `jsonl_paths` with 2
  distinct entries and `notes.py` containing add+sub+mul) and
  `/run-scenario …/s63-compact-basic.txt`.
- **`/clear` JSONL behavior**: does it continue the same transcript (clear marker)
  or start a new JSONL? `Record` captures whatever `jsonl_path.txt` holds
  afterward. Confirm during the smoke run; not a blocker for authoring/parse.
- **250-line file limit**: the jot `post_tool_use` hook flags both engine and test
  files. Do you want a follow-up task to split them, or is the limit not enforced
  for these pre-existing large files?
