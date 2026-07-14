---
name: pick-a-task
description: read the open tasks in tasks.json, compare each against the current state of the project, pick the easiest/simplest one, and report why in under 70 words. Takes no arguments.
---

Open tasks: !`node .claude/skills/scripts/getTaskDetails.ts | grep ^OPEN`

Compare each open task above against the current state of the project — pull full details with `node .claude/skills/scripts/getTaskDetails.ts <N...>` where a title alone isn't enough, and check the relevant code/files to judge scope (already partly done? one-file change? decision-only?).

Pick the single easiest/simplest open task. Report to the user: its number, title, and why it is the easiest — the whole report in under 70 words. Do not start implementing it.
