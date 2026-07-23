# Per-file reconstruction — candidate set + first target (task 180 / spec S8)

Ground truth for the per-file reconstruction sprint (S8–S13, tasks 180–190):
which files the engine must recover, in what order, and the first target's git
provenance. All facts below re-verified live against the repo on 2026-07-22.

## Baseline

- Repo: `~/Programming/jot`
- Baseline commit: `793e65241902f276caf5f5c28d539269e7d36d11`
- Candidate enumeration: `git diff --name-status 793e6524…` (working tree vs
  baseline), 131 files as of 2026-07-22 — **68 M / 11 A / 52 D**.

## Sources

All per-file reconstruction reads `~/Programming/jot-recovery/claude-data/`
ONLY — its `projects/` JSONL folders and `file-history/` snapshot dirs. Never
the live `~/.claude`.

## Phase order: M → A → D

User directive: M files were never renamed/moved since the baseline, only
modified — so the M phase needs no rename/move recovery, making it the
cheapest correctness gate. A (born after baseline) next; D (deleted since
baseline; final state is absence) last.

## First target (M phase)

- `common/scripts/plate/plate_cli.py`, blob at baseline
  `9d14d60df7aebcba8455bdea7d6b817bca572fe6` (verified:
  `git rev-parse 793e6524…:common/scripts/plate/plate_cli.py`).
- Git provenance — both commits verified pre-baseline ancestors
  (`git merge-base --is-ancestor`), so the file is modify-only since the
  baseline:
  - created at `7a7ea11a25e5a29ca68924de5e561e98d95cf191` (2026-05-01)
  - renamed at `dcb25ce14140fa48d6acf313c0bbb022fd511abe` (2026-05-08)

## M — modified since baseline (68)

```
.claude-plugin/marketplace.json
.claude-plugin/plugin.json
.gitignore
CHANGELOG.md
CODING_RULES.md
MIGRATION_TO_PYTHON.md
README.md
TROUBLESHOOTING.md
common/scripts/claude_lib.py
common/scripts/debate_lib.py
common/scripts/git_lib.py
common/scripts/git_test_funcs_lib.py
common/scripts/hookjson_lib.py
common/scripts/jot_lib.py
common/scripts/plate/plate_cli.py
common/scripts/plate/plate_lib.py
common/scripts/plate/spawn_summary_agent.py
common/scripts/plate/transcript_parse.py
common/scripts/plate_dispatcher.py
common/scripts/tmux_lib.py
common/scripts/todo_lib.py
common/scripts/util_lib.py
docs/design/architecture.md
docs/design/milestones.md
hooks/hooks.json
plans/migration_to_python/common_scripts_claude-launcher.sh.md
plans/migration_to_python/common_scripts_git.sh.md
plans/migration_to_python/common_scripts_hook-json.sh.md
plans/migration_to_python/common_scripts_invoke_command.sh.md
plans/migration_to_python/common_scripts_lock.sh.md
plans/migration_to_python/common_scripts_permissions-seed.sh.md
plans/migration_to_python/common_scripts_platform.sh.md
plans/migration_to_python/common_scripts_tmux-launcher.sh.md
plans/migration_to_python/common_scripts_tmux.sh.md
plans/migration_to_python/scripts_jot-plugin-orchestrator.sh.md
scripts/jot_plugin_orchestrator.py
tests/conftest.py
tests/test_claude_permissions.py
tests/test_debate_agents.py
tests/test_debate_archive_io.py
tests/test_debate_capacity.py
tests/test_debate_daemon.py
tests/test_debate_locks.py
tests/test_debate_main.py
tests/test_debate_retry.py
tests/test_debate_tmux.py
tests/test_dispatcher.py
tests/test_git_lib.py
tests/test_hookjson_lib.py
tests/test_jot_buildcmd.py
tests/test_jot_diag.py
tests/test_jot_dispatch.py
tests/test_jot_phase2.py
tests/test_jot_state.py
tests/test_jot_stop.py
tests/test_plate_main.py
tests/test_spawn_summary_agent.py
tests/test_tmux_communicate.py
tests/test_tmux_configure.py
tests/test_tmux_create.py
tests/test_tmux_destroy.py
tests/test_tmux_read.py
tests/test_todo_capture.py
tests/test_todo_list.py
tests/test_todo_stop.py
tests/test_util_filelock.py
tests/test_util_shell.py
tests/test_util_terminal.py
```

## A — added since baseline (11)

```
archive/common/scripts/run_scenario_lib.py
archive/common/scripts/sync_lib.py
archive/common/scripts/sync_lib_format.py
archive/common/scripts/sync_lib_paths.py
archive/common/scripts/sync_lib_rsync.py
archive/skills/run-scenario/SKILL.md
archive/skills/sync-jsonl-projects/SKILL.md
archive/tests/test_sync_lib.py
scripts/fibonacci.py
skills/make-a-plan/SKILL.md
tests/test_fibonacci.py
```

## D — deleted since baseline (52)

```
common/scripts/plate/_rebase_reword_summary.py
common/scripts/plate/append_plate_to_stack.py
common/scripts/plate/cascade_parent_chain.py
common/scripts/plate/check_drift_alert.py
common/scripts/plate/check_live_children.py
common/scripts/plate/check_rolling_intent_refresh.py
common/scripts/plate/clear_drift_alert.py
common/scripts/plate/instance_rw.py
common/scripts/plate/list_paused_plates.py
common/scripts/plate/next_resume_point.py
common/scripts/plate/print_resume_pointer.py
common/scripts/plate/register_parent.py
common/scripts/plate/verify_stash_refs.py
skills/plate/DESIGN.md
skills/plate/IMPLEMENTATION.md
skills/plate/PLATE STATE.md
skills/plate/README.md
skills/plate/SESSION_CONTEXT.md
skills/plate/SKILL.md
skills/plate/scripts/assets/permissions.default.json
skills/plate/scripts/assets/permissions.default.json.sha256
skills/plate/scripts/prompts/bg-agent.md
skills/plate/scripts/prompts/drift-judge.md
skills/plate/scripts/prompts/summary-agent.md
skills/plate/summary-template.md
skills/plate/tests/fixtures/sample-transcript.jsonl
skills/plate/tests/sequence/conftest.py
skills/plate/tests/sequence/test_enumerate_subagent_transcripts.py
skills/plate/tests/sequence/test_extract_files_created_since_timestamp.py
skills/plate/tests/sequence/test_helpers_convo.py
skills/plate/tests/sequence/test_helpers_git_test_funcs.py
skills/plate/tests/sequence/test_helpers_plate.py
skills/plate/tests/sequence/test_helpers_plate_sequence.py
skills/plate/tests/sequence/test_iter_tool_use_records_since_timestamp.py
skills/plate/tests/sequence/test_parse_files_created_from_bash_command.py
skills/plate/tests/sequence/test_plate_cli.py
skills/plate/tests/sequence/test_plate_e2e_wiring.py
skills/plate/tests/sequence/test_plate_extract_empty_log.py
skills/plate/tests/sequence/test_plate_scenarios.py
skills/plate/tests/sequence/test_session_end_hook.py
skills/plate/tests/sequence/test_summary_pipeline.py
tests/test_claude_buildcmd.py
tests/test_claude_misc.py
tests/test_debate_e2e_wiring.py
tests/test_debate_prompts.py
tests/test_jot_audit.py
tests/test_jot_e2e_wiring.py
tests/test_plate_set_summary_cli.py
tests/test_plate_summary_watch.py
tests/test_tmux_monitor.py
tests/test_todo_e2e_wiring.py
tests/test_todo_send.py
```
