## 2026-07-17:13:05:00 — Tasks 116, 117, 115, 61 (tackle-tasks batch)
Chat title: tackle-tasks 116 117 115 61
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/5772e24f-c5ef-44f1-ba64-e0a406928148.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-116-117-115-61-plan.md
/Users/matkatmusicllc/Programming/jfred/jfredToolsPlugin/common/scripts/run_scenario_lib.py
/Users/matkatmusicllc/Programming/jot/common/scripts/filesize_check.py

### Design decisions

- Task 116: documented in jfredToolsPlugin/README.md ONLY. skills/run-scenario/SKILL.md
  was left untouched because its body is a deliberate "do nothing — the
  UserPromptSubmit hook does the work" stub; the README is the plugin's only
  human-facing doc. The task said "and/or".
- Task 116: the scenario list documented is the grep-verified set over the current
  RevEng scenarios checkout (s32 s36 s37 s38 s42 s43 s44 s74 s75 s80 s83 s84 s85
  s87-demo-composite) — a superset of the task description's list (adds s42, s43,
  s44, s83, which inherit MCP steps from their baseline scenarios). The grep
  command itself is included in the doc so the list is re-derivable.
- Task 61: per user decision this session (AskUserQuestion), the README quick start
  documents reality — `npm install && npm run app` — instead of the task
  description's stale "open jfred/jfred.html, zero install" line (no static HTML
  entry exists; webapp/index.html is served by viewer_server.ts and fetches
  /api/document). Screenshot slots reference assets/*.png as placeholders for
  open task 62.
- Task 115: split direction in app-router.ts is header → router (initializeHeader
  cluster moves out and imports renderRoute/setBreadcrumb back), because
  initializeHeader calls renderRoute() (line 237) — the task-description's
  suggestion of moving "per-route renderers" or the breadcrumb helpers would have
  created an import cycle. inspector.ts's showLineRenderCount counter moves into
  inspector-snapshots.ts behind a bump accessor for the same reason.
- Task 117: linter parses via runScenario_convertTxtToJson itself (sys.path insert
  of the plugin root) so it can never disagree with the runner; the agent-target
  checks replicate runScenario_executeSteps' active-agent state machine.

### Deviations

- TDD red-green loops could not be RUN: the user forbade running any test suite
  this session ("the user will run tests after"). Tests for the linter were
  written first per the TDD guide, but pytest was not executed. Verification was
  limited to one-shot linter smoke runs (s87, s1), filesize_check on every
  created/edited source file, and `npm run typecheck` in jfred.
- tasks.json / completedTasks.json untouched: none of the four tasks is marked
  complete because the suites haven't run yet. Close them after `npm test` (jfred)
  and `pytest` (jfredToolsPlugin) pass.

### Tradeoffs

- reconstruction_script_stage.ts was only 2 lines over cap; a comment trim would
  have been a smaller diff, but extracting the cohesive beaconless-run unit gives
  the file headroom and an honest module boundary instead of gaming the check.
- The linter re-reads the .txt to check written step numbers (the parser discards
  them); small duplication of the body-split rule, accepted to keep the parser
  untouched.

### Deviations found during implementation (subagent reports)

- Task 117: the executor's `spawn` branch does NOT register a new agent name —
  it rebinds the ACTIVE agent's pane under the same name; only `spawnconcurrent`
  registers `payload or f"a{agent_index}"`. The linter mirrors this exactly, and
  consequently resets an agent's prior-Say tally on `spawn` (a fresh session
  cannot be rewound into the previous session's Says). Stricter and truer than
  the plan's wording.
- Task 115 (C.1): `initializeHeader` assigns app-router's module-level
  `lastLoadedProject`; ESM imported bindings are read-only, so the move required
  a 4-line exported `resetLastLoadedProject()` setter in app-router.ts.
  app-router's file banner was updated to stop claiming the header wiring lives
  in that file.
- Task 61: `npm run app` hardcodes `--projects-dir` and viewer_server takes the
  FIRST occurrence of a flag, so the README documents the custom-folder case as
  a direct `npx tsx src/viewer_server.ts --projects-dir <dir>` invocation
  (verified: default port 7343, `--projects-dir` mandatory, optional `--port`
  and `--file-history-dir`).

### Relocation (2026-07-17, user direction)

All changes were MOVED out of the ~/Programming/jfred clone into the RevEng
submodule checkouts (`RevEng/jfred`, `RevEng/jfred/jfredToolsPlugin`) and staged
there; both main clones were reverted to clean. HEADs of both checkout pairs were
identical (06bf412 / 0abd46f), so the move is byte-exact. The README hook line was
also rewritten first per user wording: "Claude Checkpoints don't track external
changes. JFRED fills that gap." filesize_check and the linter smoke re-pass from
the submodule paths; `npm run typecheck` was NOT re-run there (no node_modules in
the submodule checkout — files are byte-identical to the typechecked ones).

### Verification (re-run by the orchestrator, 2026-07-17)

- filesize_check exit 0 on all 6 TS files (175/95/142/120/211/67 lines) and both
  new Python files.
- `npm run typecheck` exit 0.
- `tools/lint-scenario.py s87-demo-composite.txt` → OK, exit 0 (s1 also OK in
  the subagent's smoke; all six defect classes fire on a synthetic bad file).
- NOT run (per session constraint): `npm test` (jfred), `pytest`
  (jfredToolsPlugin — 9 new tests await this run).
- During implementation the jot stop-hook auto-ran pytest once mid-TDD (RED
  collection failure before the linter file existed) — that was the hook, not a
  session action; it resolves once the suite is run normally.

### Open questions

- The jot hook wants per-file test files named `tests/app-header.test.ts`,
  `tests/inspector-snapshots.test.ts`, `tests/reconstruction_script_beaconless.test.ts`,
  and `tests/test_lint-scenario.py`. The first three match the pre-existing
  convention gap (app-router.ts / inspector.ts had no per-file tests either;
  behavior stays covered by reconstruction_script_stage.test.ts and the
  viewmodel tests), and the hyphenated pytest name is not importable — the
  linter's tests live in tests/test_lint_scenario.py. Confirm this is
  acceptable or say the word and per-file DOM smoke tests get added.
- Tasks 116/117/115/61 remain OPEN in tasks.json pending your `npm test` +
  `pytest` runs; close them once green.
