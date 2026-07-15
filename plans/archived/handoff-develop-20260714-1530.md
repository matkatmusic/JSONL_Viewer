# Handoff: Task-management skill suite complete — port to jot, then pick up task 88
Conversation name: more tasks 3
JSONL: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/106e0ee3-e167-474c-bce4-902e02e38986.jsonl
Plan file: none — this session built tooling, not a planned feature

## Branch
`develop` based on `master`

## Goal
Give the repo a complete task-management skill suite around `tasks.json` / `completedTasks.json` (which replaced TASKS.md): harvest open items from plans/ notes into tasks, create tasks with injected numbering, view tasks zero-cost, pick the easiest task. All built; the remaining work is porting the suite into the jot plugin (`~/Programming/jot`) and resuming feature work.

## Current State
All committed on `develop` (`d47314c`, `e2b0186`, `69ed3fe`, `e60c7f0`). Working tree has only pre-existing user changes (package.json, src/reconstruction_*.ts, old plan-file deletions) — do not revert them.

- `.claude/skills/update-tasks/SKILL.md` — harvests `### Open questions` (implementation-notes) / `## What Remains` (handoffs) via `!`command`` injections; creates tasks via the create-task skill; archives sources. Ran once: tasks 86–96 created, 17 files archived.
- `.claude/skills/create-task/SKILL.md` — appends one task; discernment rule (AskUserQuestion or /grill-me when vague); optional `handoffFilePaths`.
- `.claude/skills/pick-a-task/SKILL.md` — no-args; injects open-task titles, reports the easiest in <70 words. Ran once: picked task 88.
- `.claude/skills/view-task/SKILL.md` + `.claude/hooks/viewTaskHook.ts` + `.claude/settings.json` — `/view-task <N...>` is answered by a UserPromptSubmit hook emitting `{"decision":"block","reason":<formatted task>}` (zero model cost; needs a fresh session to fire).
- `.claude/skills/scripts/` — shared home: `getTaskDetails.ts` (no args → `OPEN|DONE <n>: <title>` lines; with numbers → full JSON), `nextTaskNumber.ts`, `extractOpenSections.ts` (no-arg default = plans/ top-level notes/handoffs), `archiveProcessed.ts` (REQUIRES file list; moves to sibling `archived/`; COLLISION = leave in place).
- Tests (all green, `node --test`): `tests/getTaskDetails.test.ts`, `nextTaskNumber.test.ts`, `extractOpenSections.test.ts`, `archiveProcessed.test.ts`, `viewTaskHook.test.ts`.

## What Remains
1. **Port the suite into the jot plugin** (`~/Programming/jot`) — the user's stated intent ("I'm going to add these skills to jot"). Add `viewTask_main()` in `common/scripts/view_task_lib.py` (translate `.claude/hooks/viewTaskHook.ts` 1:1; mirror `todo_listMain` in `common/scripts/todo_lib_scan.py`: stdin JSON → strict `/view-task` prefix match → `hookjson_emitBlock`), register `("/view-task", lambda: viewTask_main())` in `_PROMPT_DISPATCH` in `scripts/jot_plugin_orchestrator.py`, add a do-nothing `skills/view-task/SKILL.md` (copy `skills/todo-list/SKILL.md`'s body), and pytest `tests/test_view_task_lib.py` (jot's PostToolBatch hook demands it). Then decide whether update-tasks/create-task/pick-a-task also move (they are plain SKILL.md + node scripts; jot skills so far are Python-backed).
2. **Task 88** (picked as easiest by /pick-a-task): swap rev-card op badge letters (A/M) for the mockup's word badges — `webapp/views/timeline.ts:1183–1217` (`op-badge` span) + a styles.css width tweak. Confirm with the user before styling choices.
3. Optional hygiene: `git add tests/archive tests/fixtures/scenario-check` sweep-in was deliberately left unstaged twice — ask the user whether those pre-existing untracked files should ever be committed.

## Key Files
- `.claude/skills/scripts/*.ts` — all four shared task scripts (canonical home; per-skill scripts/ dirs were removed)
- `.claude/skills/{update-tasks,create-task,pick-a-task,view-task,tackle-tasks}/SKILL.md` — the suite
- `.claude/hooks/viewTaskHook.ts` + `.claude/settings.json` — the zero-cost hook pattern to port
- `~/Programming/jot/scripts/jot_plugin_orchestrator.py` (`_PROMPT_DISPATCH`), `~/Programming/jot/common/scripts/todo_lib_scan.py` (`todo_listMain` = the pattern to mirror)
- `tasks.json` / `completedTasks.json` — task store; max taskNumber currently 96

## Context the Next Agent Won't Have
- The `!`command`` dynamic-injection technique runs at skill-invocation time; skills reference scripts by repo-relative path. Template-literal backticks inside an injected command break the injection — that's why every injection calls a script file instead of `node -e`.
- The repo's PostToolBatch hook REQUIRES `tests/<name>.test.ts` for every `.ts` you create, and flags >3-level nesting; jot's hook wants `tests/test_<name>.py`.
- `archiveProcessed.ts` deliberately has NO no-arg default (accidental-mass-archive guard) — do not "fix" that; `extractOpenSections.ts` owns the default glob.
- User workflow preferences enforced this session: stage but never commit; never sweep pre-existing untracked files into staging (`git add plans/` and `git add -A tests/` both over-swept and were unwound); the user commits themselves.
- jot repo paths: the LIVE plugin skills load from `~/Programming/jot` (the plugin cache at `~/.claude/plugins/cache/matkatmusic-jot/jot/1.1.5` is stale — it lacks implement/handoff-prompt).
- A `view_task_lib.py` was already written once and then reverted (user pivoted to RevEng-first); its shape is in this conversation's JSONL if needed, but rewriting from `viewTaskHook.ts` is just as fast.
- update-tasks step 1 injects the file list and step 5 passes THAT list to `archiveProcessed.ts` — the list is captured once so a note written mid-run can't be archived unscanned.

## How to Verify
`NODE_OPTIONS= node --test tests/getTaskDetails.test.ts tests/nextTaskNumber.test.ts tests/extractOpenSections.test.ts tests/archiveProcessed.test.ts tests/viewTaskHook.test.ts` — 11 tests, all pass. For the jot port: `cd ~/Programming/jot && python3 -m pytest tests/test_view_task_lib.py -x`. For `/view-task`: start a NEW Claude Code session in RevEng and type `/view-task 88`.
