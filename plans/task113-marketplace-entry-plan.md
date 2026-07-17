# Task 113 — marketplace.json for jfredToolsPlugin

Goal: make jfredToolsPlugin installable via
`claude plugin marketplace add matkatmusic/jfredToolsPlugin` +
`claude plugin install jfredToolsPlugin@matkatmusic-jfred-tools`,
mirroring jot's self-hosted single-plugin marketplace
(`~/Programming/jot/.claude-plugin/marketplace.json`).

No tests: the deliverable is a static JSON manifest with no logic. The runnable
check is JSON validation (step 2). Do not run any test suites.

## Step 1 — create the marketplace file

Create `jfred/jfredToolsPlugin/.claude-plugin/marketplace.json` (sibling of the
existing `plugin.json`) with exactly this content — name/version/description/
keywords copied from `plugin.json`, structure copied from jot's marketplace:

```json
{
  "name": "matkatmusic-jfred-tools",
  "owner": {
    "name": "Matkat Music LLC"
  },
  "metadata": {
    "description": "matkatmusic/jfredToolsPlugin — /run-scenario (drive a Claude agent through a scenario file in tmux) and /sync-jsonl-projects (back up session JSONL files), usable from any directory",
    "version": "0.1.0"
  },
  "plugins": [
    {
      "name": "jfredToolsPlugin",
      "source": "./",
      "description": "Standalone home for '/run-scenario' (drive a Claude agent through a scenario file in tmux) and '/sync-jsonl-projects' (back up Claude Code session JSONL files and file-history), usable from any directory via --plugin-dir.",
      "version": "0.1.0",
      "author": {
        "name": "Matkat Music LLC"
      },
      "category": "development",
      "keywords": [
        "run-scenario",
        "sync-jsonl-projects",
        "tmux",
        "jfred",
        "scenario",
        "backup"
      ]
    }
  ]
}
```

## Step 2 — validate

`python3 -c "import json; json.load(open('jfred/jfredToolsPlugin/.claude-plugin/marketplace.json'))"`
from the RevEng root. Must exit 0.

## Step 3 — stage in the jfredToolsPlugin repo

`git -C jfred/jfredToolsPlugin add .claude-plugin/marketplace.json`.
Do NOT commit (user commits after their own verification). Because there is no
commit, the jfred/RevEng submodule pointers do not change — nothing to stage in
the parent repos for this step.

## Step 4 — close task 113 in RevEng

1. Remove the task-113 object from `tasks.json`.
2. Append it to the end of `completedTasks.json`'s array with added fields:
   - `"completionDate": "2026-07-17"`
   - no `commitHashes` yet (work staged, not committed — task-114 precedent)
   - `"closureNote"`: one sentence — self-hosted marketplace.json added to the
     jfredToolsPlugin repo mirroring the jot pattern; staged, not committed.
3. Validate both files with `python3 -c "import json; json.load(open(...))"`.
4. `git -C . add tasks.json completedTasks.json` (RevEng root).
