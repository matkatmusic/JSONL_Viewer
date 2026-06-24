create a monitoring loop that checks the `plans/` folder for when the handoff document for 'Scenario mX-1' is created, which documents the implementation of 'Scenario mX-1'. 

The agent creating the handoff document for you hasn't finished/launched yet, so wait for the monitor to notify you that your specific 'Scenario mX-1' handoff document is ready.

When the handoff document lands, read this discovered handoff doc to prepare for writing the plan for implementing handling 'Scenario mX' in scenarios/executed/. 
Then read `~/.claude/guides/planning.md`.
Then, try to run 'Scenario X' through the reconstruction_cli tool to identify what the current reconstruction engine doesn't catch that appears in the 'Scenario X' JSONL. 
Then inspect the codebase using subagents to identify where the gaps are, based on the output that was generated when 'Scenario mX' was run through the reconstruction_cli.

Then create the plan for 'Scenario mX' so that the reconstruction_cli engine correctly handles the file change events in the JSONL.  The scenario you're crafting a plan for handling is here: `/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/sX-*.txt`.  the `scenarios/executed/sX*/` folder contains the output from the run of that scenario, including the JSONL file and any rendered files. 

When the plan is finished, write a handoff doc using the '/jot:handoff-prompt' skill.

If the monitor shuts off or exits due to timing out and you haven't received the 'Scenario mX' handoff document, respawn the monitor.

include 'create handoff' in your task list for the next agent, who will implement the plan you create. 

'X' is N



Read everything in `~/.claude/guides/`
Then, create a monitoring loop that checks the `plans/` folder for when the handoff document for 'Scenario mX' is created.  Do not begin implementing the the plan file for 'Scenario mX' lands.  Wait for the handoff document.  

The agent creating the 'Scenario mX' plan for you hasn't finished/launched yet, so wait for the monitor to notify you that your specific Handoff document is ready. 

When the handoff document lands, begin implementing the plan mentioned within for handling 'Scenario mX' using the '/jot:implement' skill. The scenario you're implementing handling for is here: `/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/mX-*.txt`.  the `scenarios/executed/mX*/` folder contains the output from the run of that scenario, including the JSONL file and any rendered files. 


When the implementation of the handling of 'Scenario mX' is finished, write a handoff doc using the '/jot:handoff-prompt' skill.

If the monitor shuts off or exits due to timing out and you haven't received the 'Scenario mX' handoff document, respawn the monitor.

include 'create handoff' in your task list, once you start implementing the plan for 'Scenario mX'

'X' is N
