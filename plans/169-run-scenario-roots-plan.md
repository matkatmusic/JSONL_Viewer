# Task 169 plan — /run-scenario named fixed workspace roots (spec S2)

Home verified: the run-scenario skill is a SKILL.md stub in `~/Programming/jfredToolsPlugin/`;
the real logic is the UserPromptSubmit hook → `scripts/jfred_tools_dispatcher.py` →
`common/scripts/run_scenario_lib.py` (parser, launcher, executor). The scenario linter is
`tools/lint-scenario.py`. NOT in ~/Programming/taskTools (that repo holds only the task skills).

## Syntax (additive; absent = today's random `mkdtemp` behavior, unchanged)

Header (beside `session:`/`model:`/`ponytail:`, before `---`):
```
root: work1 = /tmp/jfred-scenario-roots/s88-a
root: work2 = /tmp/jfred-scenario-roots/s88-b
```
The FIRST declared root is primary: the initial agent's cwd and the shared signal dir.
Spawn steps pick a root with a trailing `in <name>`:
```
- [ ] 7. EndCurrentAgentAndSpawnNewAgent: in work2
- [ ] 9. SpawnNewAgent: bob in work2
```
No `in` clause → today's default (the launch cwd). Roots are created FRESH at launch and then
REUSED (never reset) across every session/agent of the run.

## Changes — `common/scripts/run_scenario_lib.py`

1. Parser (`runScenario_convertTxtToJson`): collect `root:` header lines (`name = path`,
   name lowered, path kept verbatim) into a `roots` list of `{name, path}` dicts, returned in
   the scenario dict. For `spawn`/`spawnconcurrent` steps, split a trailing `in <name>` out of
   the payload via new `runScenario_splitSpawnRoot(payload) -> (payload, root_or_None)` and
   store it as the step's `root` key — the payload stays clean for the linter's agent walk
   and the executor's `--excludeJSONL`/agent-name semantics.
2. New `_seedWorkspaceRoot(root)`: the conftest.py + tests/conftest.py + .gitignore seeding
   extracted verbatim from `runScenario_launch` (DRY — every root needs it); .gitignore gains a
   `.run-scenario-root` line (the marker below).
3. New `runScenario_createFixedRoot(path)`: expanduser → SAFETY GUARD (an existing non-empty
   dir WITHOUT the `.run-scenario-root` marker file, or a non-dir path, raises — a header typo
   must never delete unrelated data) → rmtree if present → mkdir -p → write marker → seed →
   return str. Fresh-per-run, stable-within-run.
4. `runScenario_launch`: parse the scenario's roots; declared → primary = createFixedRoot(first),
   extras created+seeded too; none → `mkdtemp` exactly as today. `cwd`/`signal_dir` = primary.
5. `_spawnClaudeInTmux`: new `signal_dir: str = ""` param (default cwd — today's behavior);
   waits/priming use it, so an agent in root 2 still signals the PRIMARY root's signal dir.
6. `_executeSpawn` / `_executeSpawnConcurrent`: new `settings_file: str = ""` param
   (default `<cwd>/settings.json` — today's behavior); pass `signal_dir` through to
   `_spawnClaudeInTmux` so secondary-root agents reuse the primary root's settings + signals.
7. `runScenario_executeSteps`: new `roots: list | None = None` param. Build `roots_by_name`
   (expanduser), `agent_cwd_by_name = {"a1": cwd}`, `primary_settings = <cwd>/settings.json`.
   Per step, `current_cwd` = the target agent's cwd. `Edit` uses `current_cwd`. Spawn actions
   resolve `step.get("root")` via new `_resolveSpawnRoot(step, roots_by_name, default)` —
   unknown name raises ValueError (loud failure beats a silent wrong dir); resolved cwd is
   recorded in `agent_cwd_by_name`. Snapshots stay PRIMARY-root-only (ponytail comment: extend
   per-root when the task-177 acceptance scenario needs it).
8. `runScenario_launchAndExecute` + `runScenario_execute`: pass `roots=parsed.get("roots")`;
   `runScenario_execute` also fixes the latent `parsed["cwd"]` KeyError → `parsed.get("cwd", "")`.

## Changes — `tools/lint-scenario.py`
New `lintScenario_checkSpawnRoots(parsed)`: any step `root` not among the declared header roots
is a finding; wired into `lintScenario_lintFile`. (Header `root:` lines need no other linter
change — unknown header lines were already ignored.)

## Tests (pytest, appended to existing files; do NOT run — user runs suites)
- `tests/test_run_scenario_lib.py`: parser collects roots + strips `in <name>` from spawn
  payloads (and leaves non-spawn payloads alone); `runScenario_splitSpawnRoot` table cases;
  `runScenario_createFixedRoot` creates marker+seeds, resets a marked root, REFUSES an unmarked
  non-empty dir; `_resolveSpawnRoot` raises on undeclared names.
- `tests/test_lint_scenario.py`: undeclared spawn root is flagged; declared one is clean.

## Docs
README.md: short "Named fixed workspace roots" subsection with the syntax block above.

Stage in ~/Programming/jfredToolsPlugin; do not commit.
