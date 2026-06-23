monitor the `plans/` folder for when the handoff document for Scenario X-1 is created, which documents the implementation of Scenario X-1. 
When the handoff document lands, read this discovered handoff doc to prepare for writing the plan for implementing handling Scenario X in scenarios/executed/ 
Then read `~/.claude/guides/planning.md`.
Then, try to run Scenario X through the reconstruction_cli tool to identify what the current reconstruction engine doesn't catch that appears in the Scenario X JSONL. 
Then create the plan for Scenario X so that the reconstruction_cli engine correctly handles the file change events in the JSONL.  When the plan is finished, write a handoff doc using the /jot:handoff-prompt skill.


read everything in `~/.claude/guides/`
Then, monitor the `plans/` folder for when the handoff document for Scenario X is created.  When the handoff document lands, begin implementing the plan for handling Scenario X using the /jot:implement skill.  When the implementation of the handling of Scenario X is finished, write a handoff doc using the /jot:handoff-prompt skill.