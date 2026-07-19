# Handoff: Task 58 STEP 2 complete — JFRED is a pushed, self-contained tool; STEP 3 is task 111
Conversation name: tackle-tasks 58 — JFRED steps 1+2 (webapp/engine + scenario harness)
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/d4542af6-dde8-4940-8837-40fb7a5f3e8f.jsonl
Plan file: plans/task58-step2-jfred-harness.md (STEP 2, executed) and plans/task58-step1-jfred-populate.md (STEP 1, executed)

## Branch
`develop` (RevEng, based on `master`). Second repo: /Users/matkatmusicllc/Programming/jfred, default branch, PUSHED to https://github.com/matkatmusic/jfred.git at 082468f.

## Goal
Make JFRED (github.com/matkatmusic/jfred) the complete, self-contained public home of the
reconstruction tool: anyone who clones it can run the viewer (`npm run app`, port 7343),
regenerate `scenarios/executed/` with `run-all-scenarios.py`, and pass the full test suite —
with zero dependency on the jot plugin. Task 58 steps 1 and 2 are DONE and pushed; STEP 3
(archive RevEng's old frontends, add JFRED as a RevEng submodule, repoint 7343, clean-room
check) is now task 111 in tasks.json.

## Current State
- JFRED @ 082468f (pushed) contains: `src/` engine + `viewer_server.ts`, `webapp/`,
  `tests/` (top-level suite minus 5 RevEng task-workflow tests), `scripts/` (6 coverage
  scripts + new `run_scenario_dispatcher.py`), `run-all-scenarios.py`,
  `scenario-completeness-audit.py`, `common/scripts/run_scenario_lib.py` (copied from jot,
  9 lines patched), `.claude/skills/run-scenario/SKILL.md` + `.claude/settings.json`
  (UserPromptSubmit hook → dispatcher), `assets/bg_agent_permissions.json`, and 3 submodules:
  `scenarios@075ef56`, `external/tmux_lib@708aeb8`, `external/claude_plugin_lib@17e5991`
  (all pins reachable from public remotes).
- `scenarios/executed/` holds 195 copied fixture dirs (untracked by design — the scenarios
  repo's .gitignore covers it). Task 110 closed on this (completedTasks.json).
- USER CONFIRMED: full `npm test` passes in JFRED; privacy gates (`git grep matkatmusicllc`
  and `"Desktop/claude code"`) are zero-hit on HEAD.
- Two test bugs fixed in BOTH repos' `tests/script-run-changes.test.ts`: raw strings where
  `Path` expected (2 call sites), and the declined-build test relying on a wrong gate
  default (see below). RevEng fix committed at 5b63b59.
- RevEng tasks.json: 110 closed; 107 marked BLOCKED BY 108+109; 108 carries the
  plugin-dir design input; 111 created (STEP 3) and extended with the frontend-archiving
  requirement. All committed through ea3a28c.
- RevEng's unstaged noise (deleted plans/*.md, package.json, launch.json) predates this
  session — do not clean it up unprompted.

## What Remains
Execute task 111 (in tasks.json — read its full description first), in its numbered order:
1. Zero-jot sweep in JFRED: `git grep -E 'common\.scripts|CLAUDE_PLUGIN_ROOT|Programming/jot|jot_plugin'`
   should hit only scripts/run_scenario_dispatcher.py's env bootstrap and comments.
2. Archive RevEng's superseded frontends into `archive/` (NEVER delete — user convention):
   `api/`, `jfred/`, `web-shared/`, `diff/`, `js-engine/`, `jsonl-tree-viewer.ts`; confirm
   before also moving `fork-style-mockup.html`, `revision-timeline-mockup.html`,
   `engine-pipeline-diagrams.html`. Purpose: a RevEng cloner must immediately see JFRED is
   the current webapp.
3. Add JFRED as a RevEng submodule at the now-free `jfred/` path
   (url https://github.com/matkatmusic/jfred.git).
4. Repoint RevEng's `npm run app`/viewer_server so 7343 serves FROM the submodule; decide
   what of RevEng's own src/+webapp/ copies stays canonical (goal: ONE canonical home).
5. Clean-room check: fresh `git clone --recursive` of JFRED in a scratch dir, in a session
   WITHOUT jot (`command claude` bypasses the ~/.claude/init.sh wrapper that injects
   `--plugin-dir ~/Programming/jot`): npm install, npm run app on 7343, npm test, and the
   /run-scenario skill + hook fire from the project .claude/.
Afterwards: close task 58 (its steps 1-2 are done; 111 was split out of it). Tasks
107/108/109 (jfredToolsPlugin arc) and 60/61/62/64 + 17/63 (demo data, README, screenshots,
CI, Pages) remain open against the JFRED repo.

## Key Files
- tasks.json — tasks 111 (STEP 3 spec, authoritative), 58 (history + decisions appendix), 107-109
- plans/task58-step2-jfred-harness.md — executed STEP 2 plan with all verified facts/line numbers
- plans/implementation-notes-task58-step1-jfred.md — both steps' design decisions, deviations, verification
- /Users/matkatmusicllc/Programming/jfred/scripts/run_scenario_dispatcher.py — the jot-orchestrator replacement (sets CLAUDE_PLUGIN_ROOT/-DATA itself)
- /Users/matkatmusicllc/Programming/jfred/common/scripts/run_scenario_lib.py — the one file copied from jot (9 patched lines)
- /Users/matkatmusicllc/Programming/jfred/tests/fixtures.ts — SCENARIO_ROOTS now repo-relative (was 2 private absolute paths)
- src/reconstruction_exec_gate.ts (both repos) — consent gate; DEFAULTS ON for CLI/tests, viewer server boots it off

## Context the Next Agent Won't Have
- The task-58 manifest's "copy 7 jot lib files" premise was STALE: 6 of the 7 are shims onto
  the two public repos (tmux_lib, claude_plugin_lib) — jot already extracted them. Submodules
  replaced copies; the "tmux_lib exists twice, consolidate" item dissolved (same repo).
- User vocabulary rules: never say "vendor" (say "copy the file into X"), never "corpus",
  never "mint". Archive-don't-delete is a standing convention.
- The declined-build test failed because `reconstruction_exec_gate.ts` deliberately DEFAULTS
  ON (CLI/tests/coverage) and only the viewer server boots it off — a "declined" test must
  call setImpureExecutionAllowed(false) itself and restore true in finally.
- `npx tsc` on this machine is shimmed: prints "TypeScript: No errors found" while exiting 2
  and masking real errors. ALWAYS use `./node_modules/.bin/tsc --noEmit` directly.
- A PostToolBatch hook auto-runs pytest on new Python files, creating `__pycache__/*.pyc`
  that EMBED absolute private paths — JFRED's .gitignore now covers them, but any new
  Python in a fresh repo needs the same guard before the privacy gate.
- The privacy gate is exactly `git grep matkatmusicllc` + `git grep "Desktop/claude code"`
  = zero hits; submodule URLs say "matkatmusic" (no "llc") and pass.
- jot enablement mechanism (relevant to tasks 107-109): ~/.claude/init.sh wraps `claude` and
  passes `--plugin-dir /Users/matkatmusicllc/Programming/jot` — the flag that loads plugins
  is `--plugin-dir`, NOT `--add-dir` (file access only). The user wants jfredToolsPlugin
  enabled the same way, as a JFRED submodule, with install.sh asking before touching ~/.zshrc.
- run-all-scenarios.py's "hardcoded model" item from task 58 was already done — `--model` is
  a flag with `claude-opus-4-6[1m]` as default.
- The 5 dropped test files (archiveProcessed/extractOpenSections/getTaskDetails/
  nextTaskNumber/viewTaskHook) exec RevEng's .claude task tooling — they are RevEng-only by
  design, not an omission.

## How to Verify
- JFRED: `cd /Users/matkatmusicllc/Programming/jfred && npm test` (user-confirmed passing;
  needs `scenarios/executed/` present — regenerate via
  `python3 run-all-scenarios.py <tmux-pane>` if ever cleared) and
  `./node_modules/.bin/tsc --noEmit` (exit 0).
- Privacy gate before any push: `git grep matkatmusicllc` and
  `git grep "Desktop/claude code"` → both exit 1 (no hits).
- RevEng: `node --import tsx --test tests/script-run-changes.test.ts` → 3 pass.
