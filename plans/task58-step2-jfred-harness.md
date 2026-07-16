# Task 58 — STEP 2 (+ task 110): scenario test harness into JFRED

Goal: a JFRED cloner can regenerate `scenarios/executed/` with `run-all-scenarios.py`
and run the full test suite. Ships: 3 submodules, the runner scripts, the run-scenario
skill (dispatcher + one copied lib file), tests + coverage scripts, and (task 110) this
machine's executed-scenarios data so `npm test` passes locally without a regeneration run.

Sources: RevEng working tree (`/Users/matkatmusicllc/Desktop/claude code src/RevEng`)
and jot (`/Users/matkatmusicllc/Programming/jot`). Target: `/Users/matkatmusicllc/Programming/jfred`.

## Facts the steps rely on (verified 2026-07-16)

- 6 of jot's 7 run-scenario libs are shims; real code lives in two public repos:
  `github.com/matkatmusic/tmux_lib` (pin `708aeb8`, pushed) and
  `github.com/matkatmusic/claude_plugin_lib` (jot pins `17e5991`, pushed). Only
  `common/scripts/run_scenario_lib.py` must be copied from jot.
- scenarios repo: `github.com/matkatmusic/jfred-claude-scenarios`, local HEAD `075ef56`
  ("added S86, updated S41") is 1 commit AHEAD of origin/develop — **user must push it**
  before JFRED is pushed; until then fetch the pin from the local clone.
- `run_scenario_lib.py` lines to patch: imports at 23–36 + FileLock fallback at 41
  (`common.scripts.*` → the two submodules), and the dispatcher filename inside the
  three orchestrator strings at 177, 284, 1121.
- `bgPermissions_loadClaude` (called at run_scenario_lib.py:311) hard-requires env vars
  `CLAUDE_PLUGIN_ROOT` (reads `assets/bg_agent_permissions.json` under it) and
  `CLAUDE_PLUGIN_DATA` (seeds a runtime copy). The dispatcher sets both, so the lib's
  env lookups at 176/1120 need NO fallback patch.
- `run-all-scenarios.py` already has `--model` as a flag (line 259) — the task's
  "hardcoded model → make it a flag" item is already done; only its import (line 21,
  `from tmux_lib.tmux_lib import …`) changes.
- `scenario-completeness-audit.py` imports stdlib only — copy unmodified.
- Tests audit (Explore agent, this session): top-level `tests/*.test.ts` import
  `../src`, `../scripts` (4 files), `../webapp` (25 modules — already in JFRED), and 8
  sibling helpers. `tests/fixtures.ts:16-19` `SCENARIO_ROOTS` hardcodes two private
  absolute paths (the ONLY load-bearing ones);
  `tests/reconstruction_steps_name_at_time.test.ts:17` has a private path in a comment.
  5 test files exec RevEng's `.claude` task-workflow tooling and must NOT ship:
  `archiveProcessed.test.ts`, `extractOpenSections.test.ts`, `getTaskDetails.test.ts`,
  `nextTaskNumber.test.ts`, `viewTaskHook.test.ts`. Exclude `tests/archive/`,
  `tests/__pycache__/`, `tests/.plate/` (dead; some carry private strings). Keep
  `tests/fixtures/` (data). `scenarios/*.txt` is NOT read by tests; ~7 tests read the
  host's real `~/.claude/{projects,file-history}` (host-dependent by design).
- `scripts/` (6 files) imports only `node:`, `../src`, and siblings — copy whole dir.
- Coverage tests derive `EXECUTED_ROOT` = `<repo>/scenarios/executed/`
  (check_scenario_coverage.test.ts:22); the scenarios repo's own `.gitignore` already
  ignores `executed/` — task 110's copy lands there untracked.
- jot's dispatcher semantics to replicate (jot_plugin_orchestrator.py:70–165): argv
  subcommand table for the 7 `run-scenario-*` entries; else read stdin hook JSON,
  lstrip prompt, `_util_matches_prefix(prompt, "/run-scenario")`
  (claude_plugin_lib/util_lib.py:50), re-pipe raw stdin via `io.StringIO`, call
  `runScenario_main()`; unmatched → exit 0 silent passthrough.

## Steps (in order)

### 1. Add the three submodules to JFRED

```bash
JFRED="/Users/matkatmusicllc/Programming/jfred"
REVENG="/Users/matkatmusicllc/Desktop/claude code src/RevEng"
cd "$JFRED"
git submodule add -b develop https://github.com/matkatmusic/jfred-claude-scenarios.git scenarios
git submodule add -b develop https://github.com/matkatmusic/tmux_lib.git external/tmux_lib
git submodule add -b develop https://github.com/matkatmusic/claude_plugin_lib.git external/claude_plugin_lib
# scenarios: origin lacks 075ef56 — fetch it from the local clone and pin it
git -C scenarios fetch "$REVENG/scenarios" develop && git -C scenarios checkout 075ef5627029ec3bb72f88b6c4f1f767fb914d89
git -C external/tmux_lib checkout 708aeb8e6841a870f112549a83640f405149603f
git -C external/claude_plugin_lib checkout 17e5991
git add scenarios external/tmux_lib external/claude_plugin_lib .gitmodules
```

### 2. Copy the runner + coverage scripts + tests

```bash
cp "$REVENG/run-all-scenarios.py" "$REVENG/scenario-completeness-audit.py" "$JFRED/"
rsync -a "$REVENG/scripts/" "$JFRED/scripts/"
rsync -a --exclude='archive' --exclude='__pycache__' --exclude='.plate' \
  --exclude='archiveProcessed.test.ts' --exclude='extractOpenSections.test.ts' \
  --exclude='getTaskDetails.test.ts' --exclude='nextTaskNumber.test.ts' \
  --exclude='viewTaskHook.test.ts' "$REVENG/tests/" "$JFRED/tests/"
```

Then two patches in the JFRED copies:
- `tests/fixtures.ts` — replace the `SCENARIO_ROOTS` absolute-path array with the
  single repo-relative root, derived the same way check_scenario_coverage.test.ts
  does: `new URL("../scenarios/executed/", import.meta.url)` → `fileURLToPath`.
  Keep the exported names/shape so no other file changes.
- `tests/reconstruction_steps_name_at_time.test.ts:17` — drop the private absolute
  path from the comment (keep the explanatory text).
- `run-all-scenarios.py:21` → `from external.tmux_lib.tmux_lib import tmux_sendAndSubmit, tmux_waitForClaudeReadiness`
  (script lives at repo root; its own dir is on sys.path, so `external.*` resolves as
  a namespace package).

### 3. Copy + patch run_scenario_lib.py; copy the assets

```bash
mkdir -p "$JFRED/common/scripts" "$JFRED/assets"
cp /Users/matkatmusicllc/Programming/jot/common/scripts/run_scenario_lib.py "$JFRED/common/scripts/"
cp /Users/matkatmusicllc/Programming/jot/assets/bg_agent_permissions.json{,.sha256} "$JFRED/assets/"
```

Patches in JFRED's `common/scripts/run_scenario_lib.py` (nothing else changes):
- Lines 23–36: `from common.scripts.hookjson_lib import …` →
  `from external.claude_plugin_lib.hookjson_lib import …`; same for
  `bg_permissions_lib`, `claude_lib`, `util_lib`; the tmux block →
  `from external.tmux_lib.tmux_lib import (…)`.
- Line 41 (FileLock fallback): `from common.scripts.util_lib import FileLock` →
  `from external.claude_plugin_lib.util_lib import FileLock`.
- Lines 177, 284, 1121: `scripts/jot_plugin_orchestrator.py` →
  `scripts/run_scenario_dispatcher.py` (string inside the f-string only).

### 4. Write the dispatcher — `$JFRED/scripts/run_scenario_dispatcher.py`

New file, modeled 1:1 on jot_plugin_orchestrator.py's routing (argv table lines
88–94, stdin path lines 121–165) but only the run-scenario slice:

```python
#!/usr/bin/env python3
"""Entry point for JFRED's /run-scenario skill.

Routes the UserPromptSubmit hook payload (stdin JSON) and the argv-mode
run-scenario-* subcommands (fired by the driven agent's generated hooks) to
run_scenario_lib. Unconsumed prompts exit 0 with empty stdout (silent passthrough).
"""
from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))
# run_scenario_lib + bg_permissions_lib locate the repo and the permissions
# asset through the plugin env contract; standalone JFRED provides both here.
os.environ.setdefault("CLAUDE_PLUGIN_ROOT", str(_ROOT))
os.environ.setdefault("CLAUDE_PLUGIN_DATA", str(_ROOT / ".plugin_data"))

from external.claude_plugin_lib.util_lib import _util_matches_prefix
from common.scripts.run_scenario_lib import (
    runScenario_execute,
    runScenario_launch,
    runScenario_launchAndExecute,
    runScenario_main,
    runScenario_saveTxtAsJson,
    runScenario_sessionEnd,
    runScenario_sessionStart,
    runScenario_stop,
)

_ARGV_DISPATCH: dict = {
    "run-scenario-launch": lambda argv: runScenario_launch(*argv),
    "run-scenario-session-start": lambda argv: runScenario_sessionStart(*argv),
    "run-scenario-stop": lambda argv: runScenario_stop(*argv),
    "run-scenario-session-end": lambda argv: runScenario_sessionEnd(*argv),
    "run-scenario-execute": lambda argv: runScenario_execute(*argv),
    "run-scenario-launch-and-execute": lambda argv: runScenario_launchAndExecute(*argv),
    "run-scenario-convert": lambda argv: print(runScenario_saveTxtAsJson(argv[0])) or 0,
}


def main() -> int:
    argv = sys.argv[1:]
    if argv:
        fn = _ARGV_DISPATCH.get(argv[0])
        if fn is None:
            return 0
        rc = fn(argv[1:])
        return 0 if rc is None else int(rc)

    raw = sys.stdin.read()
    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        data = {}
    prompt = (data.get("prompt", "") if isinstance(data, dict) else "").lstrip()
    if _util_matches_prefix(prompt, "/run-scenario"):
        sys.stdin = io.StringIO(raw)
        rc = runScenario_main()
        return 0 if rc is None else int(rc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

### 5. Skill + hook

- Copy jot's `skills/run-scenario/SKILL.md` to `$JFRED/.claude/skills/run-scenario/SKILL.md`
  unchanged (its body is "do nothing; the hook does the work").
- Create `$JFRED/.claude/settings.json`:

```json
{
    "hooks": {
        "UserPromptSubmit": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "python3 \"$CLAUDE_PROJECT_DIR/scripts/run_scenario_dispatcher.py\""
                    }
                ]
            }
        ]
    }
}
```

### 6. package.json, tsconfig, .gitignore

- `package.json` scripts: add back `"test": "node --import tsx --test tests/*.test.ts"`.
- `tsconfig.json` include: `["src", "webapp", "tests", "scripts"]` (exclude unchanged).
- `.gitignore`: append `.plugin_data/` (runtime seed dir the dispatcher points
  CLAUDE_PLUGIN_DATA at). `executed/` needs nothing — it's ignored by the scenarios
  repo's own .gitignore.

### 7. Task 110 — copy the executed-scenarios data

```bash
rsync -a --exclude='.plate' "$REVENG/scenarios/executed/" "$JFRED/scenarios/executed/"
```

Confirm afterwards: `git -C "$JFRED/scenarios" status --short` shows NO untracked
`executed/` entries (the ignore holds), and `ls "$JFRED/scenarios/executed" | wc -l`
matches the source count minus `.plate`.

### 8. Stage + privacy gate + verify (no test suites — the user runs those)

- `cd "$JFRED" && git add -A`
- Gate: `git grep matkatmusicllc` and `git grep "Desktop/claude code"` → zero hits;
  scrub and re-stage if not.
- Python smoke (import-level only, no live agents):
  `cd "$JFRED" && python3 -c "import scripts.run_scenario_dispatcher"` must import
  cleanly (proves the patched lib + both submodules resolve), and
  `python3 -m py_compile run-all-scenarios.py scenario-completeness-audit.py`.
- `npx tsc --noEmit` in JFRED (build check, not a test run) — proves tests/ + scripts/
  compile against src/ + webapp/.
- Do NOT run `npm test` or run-all-scenarios — the user does that.

### 9. RevEng side

No RevEng source changes. Stage this plan + the implementation-notes update. Remind
the user: push the scenarios repo (1 commit, `075ef56`) before JFRED is pushed, or
cloners can't fetch the scenarios pin.
