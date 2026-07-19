## 2026-07-16:16:30:00 — Task 108: jfredToolsPlugin created as JFRED submodule
Chat title: tackle-tasks 108 — create jfredToolsPlugin
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/85eb9001-800f-4eaa-8991-add37cf02eaf.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task108-jfredtoolsplugin-plan.md
/Users/matkatmusicllc/Programming/jot/scripts/jot_plugin_orchestrator.py
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/scripts/run_scenario_dispatcher.py
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/jfredToolsPlugin/

### Design decisions

- User decisions captured before planning (AskUserQuestion): libs carried as git
  submodules (`external/tmux_lib` + `external/claude_plugin_lib`, jot's pattern);
  NO marketplace entry in this task — split to new task 113 (appended to tasks.json).
- `common/scripts/run_scenario_lib.py` vendored from JFRED's copy (not jot's) because it
  already imports `external.claude_plugin_lib.*` / `external.tmux_lib.tmux_lib` directly —
  the no-forwarding-layers form; the only edits are the 3 dispatcher-path lines
  (`scripts/run_scenario_dispatcher.py` → `scripts/jfred_tools_dispatcher.py`).
- sync_lib family vendored from jot with the two shim imports (`common.scripts.hookjson_lib`,
  `common.scripts.util_lib`) retargeted to `external.claude_plugin_lib.*`; intra-family
  `common.scripts.sync_lib_*` imports kept (those files live in the plugin).
- Dispatcher = JFRED's 75-line dispatcher + jot's prompt-dispatch loop + namespace
  normalization for the `/jfredToolsPlugin:` prefix (matches plugin.json `name`).
- install.sh bakes the absolute clone path into the zshrc wrapper (same accepted
  property as jot's setup in ~/.claude/init.sh); it asks before appending, skips if
  `jfredToolsPlugin` already appears in ~/.zshrc, and supports `--dry-run`.
- `jfred/run-all-scenarios.py` untouched: it only sends the literal `/run-scenario <path>`
  prompt text into the driven session (line 186), so it is handler-agnostic between the
  interim `.claude` skill and this plugin.

### Deviations

- Plan's `test_argv_subcommand_routes_to_lib` used `run-scenario-convert`; implemented as
  `test_session_start_subcommand_writes_ready_signal` instead — same argv-routing
  contract, but proven already in JFRED's dispatcher test and needs no scenario fixture.
- Plan said "same shape as JFRED's existing consumption test" for the run-scenario
  consumption case — JFRED has no such test (its suite is passthrough-only). Consumption
  is asserted via the lib's own observable error blocks on side-effect-free inputs:
  missing scenario file ("scenario file not found") and unknown sync flag
  ("unrecognized argument: --bogus"), both of which fire before tmux/rsync work starts.
- The license-only clone already contained a `.gitignore` with `.plate/`; merged the
  planned entries into it instead of replacing.
- No pytest run by me (user instruction: no test suites). The repo's PostToolBatch hook
  auto-ran pytest after the test file landed (expected RED: dispatcher absent); all new
  and vendored python passed `python3 -m py_compile`. User runs the suite.

### Tradeoffs

- Tests vendored verbatim from jot (test_run_scenario_lib.py has zero jot-specific
  references; sync tests' "jot" strings are path fixture data). Alternative was writing a
  fresh reduced suite — rejected: the copied suites are the proof the vendored libs work.
- Dispatcher named `jfred_tools_dispatcher.py` (3-line sed in the lib) rather than reusing
  the misleading `run_scenario_dispatcher.py` name for a two-command dispatcher.

### Open questions

- Commit ordering (user action): commit inside `jfred/jfredToolsPlugin` first, push, then
  re-stage the gitlink in JFRED (it currently records the license-only commit `70ad1b6`),
  commit JFRED, then RevEng. Until then the staged JFRED pointer is intentionally stale.
- The interim `.claude` skill and the plugin will BOTH consume `/run-scenario` when cwd is
  inside the JFRED clone and the wrapper is active — harmless double-dispatch risk is the
  reason task 107 (remove the interim skill once the plugin is proven) exists; no action
  taken here.
