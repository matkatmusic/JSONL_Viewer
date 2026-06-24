create a monitoring loop that checks the `plans/` folder for when the handoff document for 'Scenario X-1' is created, which documents the implementation of 'Scenario X-1'. 

The agent creating the handoff document for you hasn't finished/launched yet, so wait for the monitor to notify you that your specific 'Scenario X-1' handoff document is ready.

When the handoff document lands, read this discovered handoff doc to prepare for writing the plan for implementing handling 'Scenario X' in scenarios/executed/. 
Then read `~/.claude/guides/planning.md`.
Then, try to run 'Scenario X' through the reconstruction_cli tool to identify what the current reconstruction engine doesn't catch that appears in the 'Scenario X' JSONL. 
Then create the plan for 'Scenario X' so that the reconstruction_cli engine correctly handles the file change events in the JSONL.  When the plan is finished, write a handoff doc using the '/jot:handoff-prompt' skill.

If the monitor shuts off or exits due to timing out and you haven't received the 'Scenario X' handoff document, respawn the monitor.

include 'create handoff' in your task list for the next agent, who will implement the plan you create. 

'X' is N



Read everything in `~/.claude/guides/`
Then, create a monitoring loop that checks the `plans/` folder for when the handoff document for 'Scenario X' is created.  

The agent creating the 'Scenario X' plan for you hasn't finished/launched yet, so wait for the monitor to notify you that your specific Plan and Handoff documents are ready. 

When the handoff document lands, begin implementing the plan for handling 'Scenario X' using the '/jot:implement' skill.  When the implementation of the handling of 'Scenario X' is finished, write a handoff doc using the '/jot:handoff-prompt' skill.

If the monitor shuts off or exits due to timing out and you haven't received the 'Scenario X' handoff document, respawn the monitor.

include 'create handoff' in your task list, once you start implementing the plan for 'Scenario X'

'X' is N
