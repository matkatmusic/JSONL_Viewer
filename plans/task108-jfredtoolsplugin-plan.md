# Task 108 — Create jfredToolsPlugin

Create the standalone Claude Code plugin `jfredToolsPlugin` carrying `/run-scenario` and
`/sync-jsonl-projects`, add it as a git submodule of JFRED, and give JFRED an ask-first
`install.sh` that wires a `claude()` zshrc wrapper using `--plugin-dir`.

**Decided (user, 2026-07-16):** libs carried as git submodules (jot's pattern); NO
marketplace entry (split to task 113). Replacing JFRED's interim `.claude` skill is task
107 (NOT this task); removing the commands from jot is task 109 (NOT this task).

**Constraints for the implementing agent:**
- DO NOT run any test suites (`pytest`, `npm test`, etc.). The user runs tests afterwards.
  `python3 -m py_compile <file>` for syntax sanity is allowed.
- DO NOT `git commit` or `git push` in any repo. Stage only.
- All plugin python follows the pattern already proven in jot/JFRED; copy, don't rewrite.

## Repos touched

| Repo | Working tree | Action |
|---|---|---|
| jfredToolsPlugin | `jfred/jfredToolsPlugin/` (new submodule clone) | populate, stage |
| JFRED | `jfred/` | `.gitmodules` + gitlink + `install.sh`, stage |
| RevEng | `.` | tasks bookkeeping, stage |

Paths below are relative to the RevEng root `/Users/matkatmusicllc/Desktop/claude code src/RevEng`.
Source paths use `JOT = /Users/matkatmusicllc/Programming/jot`.

## Phase 0 — submodule scaffolding (git only, no code)

1. In `jfred/`: `git submodule add https://github.com/matkatmusic/jfredToolsPlugin.git jfredToolsPlugin`
   - The repo is license-only (branch `master`, HEAD `70ad1b6`); the clone will contain only `LICENSE`.
2. In `jfred/jfredToolsPlugin/`:
   - `git submodule add -b develop https://github.com/matkatmusic/tmux_lib.git external/tmux_lib`
   - `git submodule add -b develop https://github.com/matkatmusic/claude_plugin_lib.git external/claude_plugin_lib`
   - (Same URLs/branches as `jfred/.gitmodules` and `JOT/.gitmodules`.)

## Phase 1 — vendor the proven files (copies with pinned line edits only)

Copy manifest. "edit" lines are the ONLY allowed differences from the source file.

| Dest (in `jfred/jfredToolsPlugin/`) | Source | Edits |
|---|---|---|
| `common/scripts/run_scenario_lib.py` | `jfred/common/scripts/run_scenario_lib.py` | 3 lines (176/284/1121 region): `scripts/run_scenario_dispatcher.py` → `scripts/jfred_tools_dispatcher.py` |
| `common/scripts/sync_lib.py` | `JOT/common/scripts/sync_lib.py` | imports: `common.scripts.hookjson_lib` → `external.claude_plugin_lib.hookjson_lib`; `common.scripts.util_lib` → `external.claude_plugin_lib.util_lib`. Keep `common.scripts.sync_lib_paths/_rsync/_format` imports unchanged. |
| `common/scripts/sync_lib_paths.py` | `JOT/common/scripts/sync_lib_paths.py` | none (stdlib-only imports) |
| `common/scripts/sync_lib_rsync.py` | `JOT/common/scripts/sync_lib_rsync.py` | none |
| `common/scripts/sync_lib_format.py` | `JOT/common/scripts/sync_lib_format.py` | none |
| `assets/bg_agent_permissions.json` | `JOT/assets/bg_agent_permissions.json` | none |
| `assets/bg_agent_permissions.json.sha256` | `JOT/assets/bg_agent_permissions.json.sha256` | none |
| `skills/run-scenario/SKILL.md` | `JOT/skills/run-scenario/SKILL.md` | none |
| `skills/sync-jsonl-projects/SKILL.md` | `JOT/skills/sync-jsonl-projects/SKILL.md` | none |
| `tests/test_run_scenario_lib.py` | `JOT/tests/test_run_scenario_lib.py` | none expected (0 "jot" refs; imports `common.scripts.run_scenario_lib`, valid here). BUT: grep the copy for `run_scenario_dispatcher\|orchestrator` — retarget any expected hook-command strings to `jfred_tools_dispatcher.py`. |
| `tests/test_sync_lib.py` | `JOT/tests/test_sync_lib.py` | none ("jot" occurrences are path fixture data — leave) |
| `tests/test_sync_lib_paths.py` | `JOT/tests/test_sync_lib_paths.py` | none |
| `tests/test_sync_lib_rsync.py` | `JOT/tests/test_sync_lib_rsync.py` | none |
| `tests/test_sync_lib_format.py` | `JOT/tests/test_sync_lib_format.py` | none |

Why JFRED's `run_scenario_lib.py` and not jot's: JFRED's copy already imports
`external.claude_plugin_lib.*` / `external.tmux_lib.tmux_lib` directly (no
`common/scripts` shims) — the no-forwarding-layers form this plugin also uses. The two
files are otherwise identical (verified by diff: 9 changed lines, all imports +
dispatcher path).

Fixture check: grep the four copied test files for `base_env` and `_hooks_file`. If any
test uses them, copy those two fixtures from `JOT/tests/conftest.py` into the plugin's
`tests/conftest.py` (drop the `JOT_LOG_FILE`/`JOT_SKIP_LAUNCH` lines only if no copied
test reads them — verify by grep, don't assume).

## Phase 2 — dispatcher (TDD: test first, then code)

### 2a. RED — `tests/test_jfred_tools_dispatcher.py`

Adapt `jfred/tests/test_run_scenario_dispatcher.py` (43 lines, subprocess-based). Test
functions, each with plain-english step comments per the TDD guide:

- `test_unmatched_prompt_passes_through_silently` — stdin `{"prompt":"hello"}` → rc 0, empty stdout.
- `test_run_scenario_prompt_is_consumed` — same shape as JFRED's existing consumption test.
- `test_sync_jsonl_projects_prompt_is_consumed` — stdin `{"prompt":"/sync-jsonl-projects --dry-run ..."}`
  routes to `sync_main` (assert via its observable effect the same way JFRED's test asserts
  run-scenario consumption; mirror that technique).
- `test_plugin_namespaced_prompt_is_normalized` — stdin `{"prompt":"/jfredToolsPlugin:run-scenario x"}`
  behaves identically to `/run-scenario x` (jot normalizes `/jot:` the same way,
  `JOT/scripts/jot_plugin_orchestrator.py:143-147`).
- `test_argv_subcommand_routes_to_lib` — argv mode `run-scenario-convert <file>` returns 0
  and prints the converted path (mirrors `_ARGV_DISPATCH` contract).

### 2b. GREEN — `scripts/jfred_tools_dispatcher.py`

Start from `jfred/scripts/run_scenario_dispatcher.py` (75 lines) verbatim, then:

1. Keep the `sys.path.insert(repo-root)` + `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`
   `os.environ.setdefault` block unchanged (repo root here = plugin root; correct for both
   plugin-hook and manual invocation).
2. Add `from common.scripts.sync_lib import sync_main`.
3. Replace the single `/run-scenario` prompt match with a `_PROMPT_DISPATCH` tuple of
   `("/run-scenario", runScenario_main)` and `("/sync-jsonl-projects", sync_main)`,
   longest-prefix-first iteration — copy the loop shape from
   `JOT/scripts/jot_plugin_orchestrator.py:149-162` including the stdin re-pipe.
4. Add the namespace normalization before matching: if prompt starts with
   `/jfredToolsPlugin:`, rewrite to `/` + remainder and re-serialize `raw` — copy
   `JOT/scripts/jot_plugin_orchestrator.py:143-147` with the prefix changed.
5. Module docstring: name the plugin and both commands.

`python3 -m py_compile` the dispatcher and every copied `.py`. Do not run pytest.

## Phase 3 — plugin metadata

- `.claude-plugin/plugin.json` — modeled on `JOT/.claude-plugin/plugin.json`:
  `name` = `jfredToolsPlugin` (this string is the skill namespace and must match the
  dispatcher's normalization prefix), `version` = `0.1.0`, description naming the two
  commands, author `Matkat Music LLC`, repository `https://github.com/matkatmusic/jfredToolsPlugin`.
- `hooks/hooks.json` — exactly one hook (trimmed from jot's):
  ```json
  {"hooks": {"UserPromptSubmit": [{"hooks": [{"type": "command",
    "command": "python3 ${CLAUDE_PLUGIN_ROOT}/scripts/jfred_tools_dispatcher.py"}]}]}}
  ```
- `conftest.py` (plugin root) — sys.path bootstrap so `common.*`/`external.*` resolve
  under pytest, same shape as jot's root `conftest.py` but inserting the plugin root:
  ```py
  import sys
  from pathlib import Path
  sys.path.insert(0, str(Path(__file__).resolve().parent))
  ```
- `tests/conftest.py` — only if the Phase 1 fixture check found used fixtures.
- `.gitignore` — `__pycache__/`, `.pytest_cache/`, `.plugin_data/`.
- `README.md` — short: what the plugin provides, enable via
  `claude --plugin-dir <path-to-jfred-clone>/jfredToolsPlugin` (state plainly: the flag is
  `--plugin-dir`, NOT `--add-dir`), `git submodule update --init --recursive` after clone,
  `pytest` to run tests. No marketplace instructions (task 113).

## Phase 4 — JFRED `install.sh`

New file `jfred/install.sh` (chmod +x). Behavior, in order:

1. `set -euo pipefail`; resolve `JFRED_ROOT` from the script's own location
   (`cd "$(dirname "$0")" && pwd`) — never hardcode a path; the baked path in the zshrc
   line is whatever clone the user ran install.sh from (same accepted property as jot's setup).
2. `git -C "$JFRED_ROOT" submodule update --init --recursive`.
3. If `~/.zshrc` already contains `jfredToolsPlugin`, print "already installed" and exit 0.
4. Print exactly what will be appended, then ASK (`read -r -p "Append to ~/.zshrc? [y/N] "`);
   any answer but `y`/`Y` exits 0 without touching the file. `--dry-run` flag: print the
   block and exit 0 without asking.
5. Append to `~/.zshrc`:
   ```sh
   # jfredToolsPlugin (added by jfred/install.sh)
   claude() {
     command claude --plugin-dir "<JFRED_ROOT>/jfredToolsPlugin" "$@"
   }
   ```
   with `<JFRED_ROOT>` expanded to the resolved absolute path.
6. Runnable check for the branching: `bash install.sh --dry-run` from the jfred root must
   print the block and exit 0 with `~/.zshrc` untouched — run this once (it is not a test
   suite; it mutates nothing).

`jfred/run-all-scenarios.py` needs NO change: it sends the literal text
`/run-scenario <path>` into the driven session (`run-all-scenarios.py:186`); it is
handler-agnostic between the interim `.claude` skill and this plugin. State this in the
implementation notes; do not touch the file.

## Phase 5 — bookkeeping + staging

1. RevEng `tasks.json`: move task 108's object to `completedTasks.json` with
   `completionDate: "2026-07-16"`, no `commitHashes` (nothing committed this session;
   user commits), and a `closureNote`: plugin created as JFRED submodule with jot-style
   `--plugin-dir` enablement per the 2026-07-16 design input; libs as `external/`
   submodules; marketplace split to task 113; skill swap remains task 107, jot removal
   task 109. Task 113 was already appended this session — leave it.
2. Stage (no commits):
   - `git -C jfred/jfredToolsPlugin add -A`
   - `git -C jfred add .gitmodules jfredToolsPlugin install.sh`
   - RevEng root: `git add tasks.json completedTasks.json plans/task108-jfredtoolsplugin-plan.md`
     plus the implementation-notes file `/jot:implement` creates.
3. Note for the user in the final summary: the jfredToolsPlugin gitlink recorded in JFRED
   still points at the license-only commit `70ad1b6`; it advances only after the user
   commits inside `jfred/jfredToolsPlugin` and re-stages the pointer — commit ordering is
   plugin repo → JFRED → RevEng.

## Verification gate (95% confidence rationale)

- Every `.py` except the dispatcher is a byte-copy with pinned import/path edits already
  proven in jot or JFRED production use.
- The dispatcher is JFRED's working 75-line dispatcher plus jot's already-working prompt
  loop and normalization block — both source patterns run in production today.
- The env contract (`CLAUDE_PLUGIN_ROOT` from Claude Code plugin hooks, setdefault
  fallback for manual runs) is exactly jot's + JFRED's existing contract.
- Runner compatibility is structural: `run-all-scenarios.py` emits prompt text only.
