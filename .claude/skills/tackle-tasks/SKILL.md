---
name: tackle-tasks
description: tackle tasks found in @TASKS.md 
argument-hint: <N...>
---

First, invoke `/ponytail:ponytail ultra`. 

Then:

Read @TASKS.md and review the following tasks [$ARGUMENTS] from the file. Cross-reference the task with the codebase to determine if the task is still relevant or if it has been resolved.
Use the git history and recent commits (over the last 3 days) to confirm/deny the existence of the tasks named in $ARGUMENTS.

If a task is still problematic/relevant in the codebase, use the `/make-a-plan` skill to tackle it.  If clarification is needed for the task, use AskUserQuestion to ask the user for more information before beginning.

If a task is not problematic and @TASKS.md is therefore stale, mark the task as complete. Include a short summary of the reasoning for marking the task as complete when updating @TASKS.md.

Don't run any tests or suites.  The user will run tests after you have completed your work.

Finally, If you make any changes to the codebase, stage the changes but do not commit. use a subagent running `Sonnet 5` to generate a short (40 words or less) single-sentence summary of the work done, and show that summary to the user, so the user can use it as a commit message.