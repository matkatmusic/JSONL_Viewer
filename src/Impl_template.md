Read everything in `~/.claude/guides/`
Then, create a monitoring loop that checks the `plans/` folder for when the Handoff document for 'Scenario X' is created.  
**Do not begin implementing** the plan file for 'Scenario X' when the plan lands.  Wait for the handoff document that is specifically.  The plan file always lands before the handoff.

The agent creating the 'Scenario X' plan for you hasn't finished/launched yet, so wait for the monitor to notify you that your specific Handoff document is ready. 

When the handoff document lands, check if the doc is the scenario you're being tasked with.  
Your specific scenario is 'Scenario X'.  
If the handoff doc is not meant for you, continue monitoring.
If the monitor shuts off or exits due to timing out and you haven't received the 'Scenario X' handoff document, respawn the monitor.

When the handoff document lands, read the 'MUST READ' file at the top, then read the handoff itself, then the plan, and any other relevant files linked in the plan. 

Then begin implementing the plan mentioned within for handling 'Scenario X' using the '/jot:implement' skill. 

The scenario you're implementing engine handling for is here: `/Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/X-*.txt`.  the `scenarios/executed/X*/` folder contains the output from the run of that scenario, including the JSONL file and any rendered files. 

When the implementation of the handling of 'Scenario X' is finished, write a handoff doc using the '/jot:handoff-prompt' skill.

When you write the handoff, put 'MUST READ: plans/script-handling.txt' at the top.

Include 'create handoff' in your task list, once you start implementing the plan for 'Scenario X'.

Don't write a summary to me after you create the handoff, just provide the path to the handoff, as the skill specifies. 
