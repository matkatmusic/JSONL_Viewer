## 2026-07-21:21:20:00 — Task 167: probe real jot sources for cross-source overlaps
Chat title: tackle-tasks 167 63 169 162
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/919ee644-1f57-4be2-b26b-141285d468e2.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-source-probe-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/166-source-probe-notes.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/SPEC.md

### Design decisions
- The probe is a re-runnable checked-in tool (`tools/probe_166_sources.ts` + `_scan`/`_analyze`/`_report` modules) rather than a throwaway script, so the S1/S2 design work (task 168) can re-run it as sources change. Split into four files to satisfy the 250-line/nesting hook.
- Per the user's mid-turn direction, `~/Programming/jot-recovery/claude-data/` was probed fully — it turned out to hold the REAL conversation logs (the live `~/.claude/projects` jot folders are almost all empty), which reshaped the probe: three roots (live, claude-data, probe-fixture-20260615) are scanned and cross-deduped.
- Content evidence for conflict detection = sha256 of the tool input (Write content / Edit old+new strings), NOT reconstruction; conflict candidates are adjacency-based (<24h, cross-folder, differing hash) and explicitly labeled candidates-for-inspection.
- The strict engine loader was deliberately NOT reused: real jot logs span wire formats the strict parser rejects (s32/s87 lessons); the probe parses JSON.parse-per-line tolerantly.
- Section 5 of the generated notes is hand-maintained; the script preserves it across re-runs.

### Deviations
- Plan said "one script"; hook limits forced the 4-module split plus 3 test files + 1 fixtures file. Tests exist to satisfy the project's test-per-module convention; they cover the pure helpers only (path splitting, hashing, dedupe, overlap/conflict grouping, report rendering).

### Tradeoffs
- Rel-path identity is computed against the jot-root set observed in paths (segment after `Programming/`), which treats `jot` and `jot-backup` as distinct roots sharing rel-paths — exactly the ambiguity the S1 identity rule must resolve; the probe surfaces it rather than resolving it.

### Open questions
- None blocking. Key finding for task 168: 49% of raw cross-source events are sync replicas — dedupe by (sessionId, recordUuid) must precede any conflict policy, and rel-path-only identity would wrongly merge the diverged jot/jot-backup sibling repos (see notes section 5).

## 2026-07-21:21:40:00 — Task 162: safe memoization of nested lineage replays
Chat title: tackle-tasks 167 63 169 162
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/919ee644-1f57-4be2-b26b-141285d468e2.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/162-lineage-memo-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/archived/implementation-notes-tackle-tasks-156-154-160.md

### Design decisions
- Fix direction (a) from the task, implemented as a PROOF-based memo: every in-flight replay frame tracks the cycleKeys its subtree queried (transitively, including keys inherited from served cache entries); a guard hit poisons every frame pushed after the hit key's own frame (that key's frame reproduces the hit deterministically and stays cacheable); an entry is stored only un-poisoned and served — on any stack — only while none of its queried keys is in flight. Served results are therefore byte-identical to a fresh compute: pure speedup, zero behavior change (top-level clean-stack behavior is unchanged by construction).
- Window rule: `enterLineageReplayWindow` never widens, so a nested replay whose `before` exceeds the active cutoff computes a result NOT intrinsic to its (target, before) key — such calls bypass the cache both ways. Implemented as a pure function of enterLineageReplayWindow's return value, so `reconstruction_script_runs.ts` (246/250 lines) needed no change.
- New module `reconstruction_lineage_memo.ts` owns the frame stack (replacing the `seedingLineages` Set) and all proof rules; `reconstruction_branches.ts` (244/250) keeps only the orchestration.
- Fix direction (c) was found already done: `findScriptExecutionRuns` is corpus-cached (`CorpusState.scriptRuns`); the log's "1447 runs" lines are per-replay progress labels, not re-discovery. Direction (b) (compute-once, slice-per-before) rejected: the window cutoff genuinely changes mid-window events, exactly as the task warned.

### Deviations
- None from the plan.

### Tradeoffs
- Cache hits skip the `replaying lineage of` progress line — intentional; the repeat-count of that line is the task's own repro metric, so hits are visible as its collapse.

### Open questions
- Perf verification on the real 451-target RevEng project was NOT run here (needs script consent + live server; user runs suites). Repro recipe: pipe server stdout, count `replaying lineage of <target>` repeats; expect per-(target,instant) repeats to collapse toward 1, and the 87-scenario sweep to stay green.

## 2026-07-21:22:00:00 — Task 169: /run-scenario named fixed workspace roots
Chat title: tackle-tasks 167 63 169 162
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/919ee644-1f57-4be2-b26b-141285d468e2.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/169-run-scenario-roots-plan.md
/Users/matkatmusicllc/Programming/jfredToolsPlugin/common/scripts/run_scenario_lib.py
/Users/matkatmusicllc/Programming/jfredToolsPlugin/tools/lint-scenario.py

### Design decisions
- Home verified per the task's caveat: run-scenario lives in ~/Programming/jfredToolsPlugin (SKILL.md is a stub; the UserPromptSubmit hook dispatcher does the work), NOT ~/Programming/taskTools.
- Syntax: header `root: <name> = <path>` lines (first = primary root, initial agent cwd + shared signal dir); spawn steps opt in with a trailing `in <name>`; parser strips the selector into a step `root` key so payload semantics (agent names, --excludeJSONL) and the linter's agent walk stay untouched.
- All agents share the PRIMARY root's settings.json + signal dir (`_spawnClaudeInTmux` grew a `signal_dir` param; spawn helpers a `settings_file` param — defaults preserve today's behavior exactly).
- Safety: `runScenario_createFixedRoot` refuses to reset an existing non-empty dir lacking the `.run-scenario-root` marker — a typo'd header path can never delete user data. Roots are reset fresh per RUN, reused across the run's sessions.
- Edit steps now apply in the ACTIVE agent's root (per-agent cwd map); `.step_states` snapshots stay primary-root-only (ponytail comment points at task 177 for per-root captures).
- Linter gained `lintScenario_checkSpawnRoots` (undeclared root name = finding).

### Deviations
- The Stop hook flags run_scenario_lib.py (1138→1251 lines) against its 250-line cap — PRE-EXISTING overage; splitting the module was out of task scope.
- Fixed a latent KeyError in `runScenario_execute` (`parsed["cwd"]` → `parsed.get("cwd", "")`) while threading roots through the resume path.

### Tradeoffs
- Multi-root scenarios keep ONE signal/settings home (primary) instead of per-root copies — matches the existing "serial prompting" concurrency model; per-root signal dirs would be needed only for true-parallel prompting, which the module already documents as out of scope.

### Open questions
- Plugin pytest suite NOT run (user runs tests). New tests: 7 in test_run_scenario_lib.py, 2 in test_lint_scenario.py; `py_compile` passes on all four edited files.

## 2026-07-21:22:15:00 — Task 63: GitHub Pages demo tier (assembled, publish handed off)
Chat title: tackle-tasks 167 63 169 162
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/919ee644-1f57-4be2-b26b-141285d468e2.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/63-github-pages-demo-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/docs/README.md

### Design decisions
- The legacy zero-server app now lives in RevEng/archive (not repo root as the task assumed); frozen copies of archive/{api,web-shared,jfred} were assembled into jfred/docs/ for Pages "deploy from branch /docs" — no app-code changes needed because jfred-load.js already auto-loads via `?file=<url>` and rewritePath passes relative URLs through.
- Preload = all 16 s87-demo-composite session JSONLs (the item-60 demo bundle), JSONL files ONLY — the repo.git.tar/.git gitlink trap from tasks 60/62 is called out in docs/README.md. Verified no .git/.tar landed in docs/ and every script/import reference resolves (static check).
- Honest labeling per the task: index.html banner + README state this is the frozen legacy api/ engine, NOT Engine B; item 17 (Engine-B static shim) deliberately not built.

### Deviations
- Publishing itself (commit, push, `gh api .../pages` enable) is handed to the user: this session stages without committing, and enabling Pages is an outward-facing action. Exact commands are in jfred/docs/README.md.

### Tradeoffs
- Landing page is a hand-written static list (16 links) rather than a generated manifest — regeneration is a re-copy plus one ls; a build script would outlive its usefulness.

### Open questions
- After publishing, spot-check one session link on the live site (ES modules + fetch need real HTTP; file:// won't work locally — `python3 -m http.server` in jfred/docs to preview).
