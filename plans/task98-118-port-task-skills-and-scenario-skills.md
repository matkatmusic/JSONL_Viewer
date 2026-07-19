# Plan: Tasks 98 + 118 — port task* skills to a standalone taskTools plugin; move scenario skills + templates into jfredToolsPlugin

Two independent ports. Do Part A (task 118, small, submodule-local) first, then Part B (task 98).
All work is staged, never committed. No test suites are run (user constraint for this session);
the one new test file is written but left for the user to run.

Working directory for every step unless stated otherwise:
`/Users/matkatmusicllc/Desktop/claude code src/RevEng` (call it `$REVENG`).

---

## Part A — Task 118: move `/impl-scenario` + `/plan-scenario` and their templates into jfredToolsPlugin

The canonical jfredToolsPlugin checkout is `$REVENG/jfred/jfredToolsPlugin` (never touch
`~/Programming/jfredToolsPlugin` — that clone is user-managed; they pull into it).

### A1. Copy the three templates into the plugin

Create `$REVENG/jfred/jfredToolsPlugin/templates/` and copy into it, byte-identical:

- `$REVENG/plans/templates/Impl_template.md`
- `$REVENG/plans/templates/Plan_template.md`
- `$REVENG/plans/templates/Plan_Impl_template.md`

Do NOT edit template contents (their absolute `~/Programming/RevEng-worktrees/...` paths and
cwd-relative `plans/` / `scenarios/executed/` references are intentional — they resolve against
the session's working directory, not the plugin).

### A2. Create the two plugin skills

Create `$REVENG/jfred/jfredToolsPlugin/skills/impl-scenario/SKILL.md`:

```markdown
---
name: impl-scenario
description: Implement a plan for a numbered scenario from the Impl_template.
argument-hint: <N>
---

Read the file `templates/Impl_template.md` under this plugin's root (the plugin root is two
directories up from this skill's base directory shown above).

Your X is $ARGUMENTS
```

Create `$REVENG/jfred/jfredToolsPlugin/skills/plan-scenario/SKILL.md` identically, but with
`name: plan-scenario`, description `Plan an engine handler for a numbered scenario from the
Plan_template.`, and `templates/Plan_template.md` as the file to read.

Rationale for the wording: skill bodies are model-read text; the harness prints
"Base directory for this skill: <path>" at invocation, so "two directories up" is resolvable
without relying on `${CLAUDE_PLUGIN_ROOT}` substitution inside markdown body text.

### A3. Update the plugin README

In `$REVENG/jfred/jfredToolsPlugin/README.md`, extend the top command list ("A Claude Code
plugin carrying two commands") to include the two new commands and change "two" to "four":

- `/plan-scenario <N>` — plan an engine handler for numbered scenario N from `templates/Plan_template.md`.
- `/impl-scenario <N>` — implement the plan for numbered scenario N from `templates/Impl_template.md`.

Leave `plugin.json` / `marketplace.json` descriptions alone except: in both files' description
strings, no change is required for correctness (skills are discovered from `skills/`); skip
editing them (ponytail: manifest prose churn adds nothing).

### A4. Archive the superseded RevEng copies (archive, don't delete — task 118's explicit convention)

- `mkdir -p "$REVENG/archive/claude-skills"`
- `git mv .claude/skills/impl-scenario archive/claude-skills/impl-scenario`
- `git mv .claude/skills/plan-scenario archive/claude-skills/plan-scenario`
- `git mv plans/templates plans/archived/templates`

If any of those paths are untracked (git mv fails), use plain `mv` instead — verify with
`git ls-files .claude/skills plans/templates` first and use `git mv` only for tracked paths.

---

## Part B — Task 98: standalone taskTools plugin at `~/Programming/taskTools`

Mirrors jfredToolsPlugin's layout: `.claude-plugin/{plugin.json,marketplace.json}`, `skills/`,
`scripts/`, `hooks/hooks.json`, `README.md`. Everything stays TypeScript, run via bare `node`
(node ≥22.6 type-stripping — the same way the scripts run today).

### B1. Scaffold the repo

```sh
mkdir -p ~/Programming/taskTools && cd ~/Programming/taskTools && git init
mkdir -p .claude-plugin skills scripts hooks
```

`.claude-plugin/plugin.json` (mirror jfredToolsPlugin's shape):

```json
{
  "name": "taskTools",
  "version": "0.1.0",
  "description": "Task-list management skills backed by tasks.json/completedTasks.json: /create-task, /pick-a-task, /tackle-tasks, /update-tasks, /view-task (zero-token via UserPromptSubmit hook). Usable from any directory via --plugin-dir.",
  "author": { "name": "Matkat Music LLC" },
  "keywords": ["tasks", "todo", "create-task", "tackle-tasks", "view-task"]
}
```

`.claude-plugin/marketplace.json` (mirror jfredToolsPlugin's self-hosted pattern):

```json
{
  "name": "matkatmusic-task-tools",
  "owner": { "name": "Matkat Music LLC" },
  "metadata": {
    "description": "taskTools — task-list management skills for tasks.json/completedTasks.json",
    "version": "0.1.0"
  },
  "plugins": [
    {
      "name": "taskTools",
      "source": "./",
      "description": "Task-list management skills backed by tasks.json/completedTasks.json: /create-task, /pick-a-task, /tackle-tasks, /update-tasks, /view-task.",
      "version": "0.1.0",
      "author": { "name": "Matkat Music LLC" },
      "category": "development",
      "keywords": ["tasks", "todo", "create-task", "tackle-tasks", "view-task"]
    }
  ]
}
```

### B2. Shared task-file resolution module — `scripts/taskFiles.ts` (NEW logic; test first, B3)

Behavior in plain English:
- A project's task pair lives either in `<root>/.taskTools/` (the new housing folder, user-decided
  2026-07-18) or at `<root>/` directly (existing repos like RevEng keep working untouched).
- Resolution order: `.taskTools/tasks.json` exists → the `.taskTools/` pair; else root
  `tasks.json` exists → the root pair; else default to the `.taskTools/` pair (that is where
  first-run seeding will create them).
- Seeding (first-run generation, task 98's 2026-07-17 addition) is a SEPARATE function invoked
  only by `nextTaskNumber.ts` (i.e. only when a task is being created — read-only skills must
  not write files into arbitrary projects). It creates any missing file of the resolved pair
  as `[]`, creating the parent folder if needed.
- Reads are tolerant: missing/invalid file → empty array (a fresh project must not crash
  `/pick-a-task` or the hook).

```ts
// Resolves a project's tasks.json / completedTasks.json pair: .taskTools/ when present,
// project root otherwise (pre-plugin repos keep their root files); neither present -> the
// .taskTools/ pair, which seedTaskFilesIfAbsent creates on first task creation.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type TaskRecord = { taskNumber: number; title?: string; description?: string } & Record<string, unknown>;
export type TaskFilePair = { tasksPath: string; completedTasksPath: string };

function pairIn(folder: string): TaskFilePair {
  return { tasksPath: join(folder, "tasks.json"), completedTasksPath: join(folder, "completedTasks.json") };
}

export function resolveTaskFiles(root: string): TaskFilePair {
  const housed = pairIn(join(root, ".taskTools"));
  if (existsSync(housed.tasksPath)) return housed;
  const atRoot = pairIn(root);
  if (existsSync(atRoot.tasksPath)) return atRoot;
  return housed;
}

export function seedTaskFilesIfAbsent(pair: TaskFilePair): void {
  for (const path of [pair.tasksPath, pair.completedTasksPath]) {
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "[]\n");
  }
}

export function readTaskFile(path: string): TaskRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
```

### B3. The one runnable check — `scripts/taskFiles.test.ts` (write BEFORE B2 per TDD; do NOT run — user runs later)

`node:test` + `node:assert/strict` + `fs.mkdtempSync(join(tmpdir(), "taskTools-"))`. Four tests,
each a single behavior, step comments in plain English:

- `test_resolvePrefersTaskToolsFolder` — root has BOTH `.taskTools/tasks.json` and root
  `tasks.json` → resolved pair is the `.taskTools/` one.
- `test_resolveFallsBackToRootTasksJson` — only root `tasks.json` exists → root pair.
- `test_resolveDefaultsToTaskToolsWhenNeitherExists` — empty root → `.taskTools/` pair, and no
  files/folders were created by resolving.
- `test_seedCreatesBothFilesWithEmptyArrays` — empty root → after
  `seedTaskFilesIfAbsent(resolveTaskFiles(root))`, both files exist and parse to `[]`; calling
  seed again on a pair whose tasks.json now holds one record leaves that record intact.

Session constraint: write the file, do not execute it. README documents `node --test scripts/`.

### B4. Port the four scripts into `scripts/`

Copy from `$REVENG/.claude/skills/scripts/`, then modify:

- `nextTaskNumber.ts` — replace its private `readTaskFile` + hardcoded `"tasks.json"` /
  `"completedTasks.json"` with:
  `const pair = resolveTaskFiles(process.cwd()); seedTaskFilesIfAbsent(pair);` then read both
  via the shared `readTaskFile`. Output contract unchanged: prints `max+1`, min 1.
- `getTaskDetails.ts` — same substitution (resolve, NO seeding, shared tolerant reads). All
  output text unchanged.
- `extractOpenSections.ts` — copy unmodified (operates on cwd `plans/`, no task files).
- `archiveProcessed.ts` — copy unmodified.
- `viewTaskHook.ts` — copy from `$REVENG/.claude/hooks/viewTaskHook.ts` into `scripts/`
  (mirrors jfredToolsPlugin, whose hook script lives in `scripts/`). Replace its private
  `readTaskFile` + the two `join(root, "tasks.json")` reads with
  `resolveTaskFiles(root)` + shared `readTaskFile`. Everything else byte-identical.

Import the shared module with an explicit extension (`import { ... } from "./taskFiles.ts"`) —
node type-stripping requires the real filename.

### B5. Hook registration — `hooks/hooks.json`

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/viewTaskHook.ts\""
          }
        ]
      }
    ]
  }
}
```

### B6. Port the five skills into `skills/`

Copy each `SKILL.md` from `$REVENG/.claude/skills/<name>/` and apply ONLY these path edits
(every other byte unchanged):

- `create-task/SKILL.md` — `` !`node .claude/skills/scripts/nextTaskNumber.ts` `` →
  `` !`node "${CLAUDE_PLUGIN_ROOT}/scripts/nextTaskNumber.ts"` ``
- `pick-a-task/SKILL.md` — both `node .claude/skills/scripts/getTaskDetails.ts` occurrences
  (the bang command and the prose instruction) → `node "${CLAUDE_PLUGIN_ROOT}/scripts/getTaskDetails.ts"`
- `tackle-tasks/SKILL.md` — the bang `getTaskDetails.ts $ARGUMENTS` → plugin-root form as above.
- `update-tasks/SKILL.md` — all four script references (`extractOpenSections.ts --list`,
  `extractOpenSections.ts`, `getTaskDetails.ts`, `archiveProcessed.ts`, and the
  `nextTaskNumber.ts` fallback mention) → plugin-root form.
- `view-task/SKILL.md` — copy unchanged (it is a do-nothing stub; the hook answers).

`${CLAUDE_PLUGIN_ROOT}` is set by Claude Code when executing a plugin's commands/hooks, which
covers skill bang-command preprocessing; prose mentions using the same literal string are
resolvable by the model via the skill's announced base directory.

### B7. README.md

Short, mirroring jfredToolsPlugin's README structure: the five commands (one line each);
task-file location rules (`.taskTools/` preferred, root fallback for pre-plugin repos,
first `/create-task` seeds `.taskTools/tasks.json` + `completedTasks.json`); the
`--plugin-dir`-NOT-`--add-dir` gotcha copied verbatim in spirit from jfredToolsPlugin's
"Enabling the plugin" section; `node --test scripts/` for the check.

### B8. Install on this machine

In `~/.claude/init.sh`, inside the existing `command claude \` invocation, add one line after
the other `--plugin-dir` lines:

```sh
    --plugin-dir "$HOME/Programming/taskTools" \
```

### B9. Smoke-verify the hook path fires (single command, not a suite)

From `$REVENG`:

```sh
claude --plugin-dir ~/Programming/taskTools -p "/view-task 7" 2>&1 | head -20
```

Expected: the task-7 text (jot windowSizeBlocks task) printed by the hook's block decision.
If the command stalls >2 min or errors on plugin trust, kill it, note "verify interactively"
in the final summary, and continue — git preserves everything either way.

### B10. Delete the RevEng `.claude/` copies (task 98's explicit instruction — delete, not archive)

Check `git ls-files .claude` first; use `git rm -r` for tracked paths, plain `rm -r` otherwise:

- `.claude/skills/create-task`, `pick-a-task`, `tackle-tasks`, `update-tasks`, `view-task`,
  `scripts` (all six dirs)
- `.claude/hooks/viewTaskHook.ts` (and the `hooks/` dir if now empty)

Then edit `$REVENG/.claude/settings.json`: remove the `UserPromptSubmit` hook block and the
`Bash(node .claude/skills/scripts/*)` allow entry (leave whatever else remains; if nothing
remains, the file becomes `{}`). In `.claude/settings.local.json`, remove the now-dead
`Bash(node .claude/skills/scripts/*)` allow entry only.

`.claude/skills/make-a-plan/` stays (not part of either task). RevEng's root `tasks.json` /
`completedTasks.json` stay at the root (the plugin's root-fallback reads them).

---

## Part C — Bookkeeping + staging

1. Move tasks 98 and 118 from `tasks.json` to `completedTasks.json` (append at the end, same
   object shape), each gaining `"completionDate": "2026-07-18"` and a ≤60-word `closureNote`
   stating what was built/moved and that work is staged-not-committed. Omit `commitHashes`
   (nothing is committed yet).
2. Stage, never commit, in all three repos:
   - `$REVENG/jfred/jfredToolsPlugin`: `git add templates skills/impl-scenario skills/plan-scenario README.md`
   - `$REVENG`: `git add -A` for the archive moves, deletions, settings.json, tasks.json,
     completedTasks.json, this plan file (settings.local.json is untracked-by-design — leave unstaged if untracked)
   - `~/Programming/taskTools`: `git add -A`
3. Spawn a Sonnet 5 subagent to produce a ≤40-word single-sentence commit summary of the whole
   change set; show it to the user.

## Verification (definition of done)

- `jfred/jfredToolsPlugin/skills/{impl,plan}-scenario/SKILL.md` + `templates/` exist; RevEng
  copies live under `archive/claude-skills/` and `plans/archived/templates/`.
- `~/Programming/taskTools` contains plugin.json, marketplace.json, hooks.json, 5 skills,
  6 scripts (4 ported + taskFiles.ts + viewTaskHook.ts) + 1 test file, README.
- `grep -rn "\.claude/skills/scripts" ~/Programming/taskTools` returns nothing.
- RevEng `.claude/skills/` contains only `make-a-plan/`; `.claude/hooks/` gone or empty;
  settings.json has no viewTaskHook reference.
- B9 smoke output shown (or its interactive-verify caveat noted).
- `git status` in all three repos shows staged changes, zero commits made.
