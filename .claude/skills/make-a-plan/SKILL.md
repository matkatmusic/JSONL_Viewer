---
name: make-a-plan
description: make a plan following a specific set of rules, then implement it using '/jot:implement'. 
---

Draft a plan that conforms to the rules defined in `~/.claude/guides/planning.md`.

Double-check your plan for correctness and accuracy regarding solving the problem/implementing the feature requested by the user.
Make sure you are over 95% certain that the plan will succeed at achieving the desired result. 

After drafting the plan, check for any missing steps or potential issues that could arise during implementation. If any are found, revise the plan accordingly.

Once the plan is complete, implement the plan using `/jot:implement <path_to_plan>`.

Once implementation is complete, STAGE your work but do not commit. 
Generate a short single-sentence summary of the work done, and show that message to the user. 