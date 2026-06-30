# data sources
scenario: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/s2-move-file.txt
JSONL: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s2-move-file/70781551-ea2a-4ae3-a0db-e9e1bb6fee1f.jsonl
Per-step states: /Users/matkatmusicllc/Programming/RevEng-worktrees/api-from-scenarios/scenarios/executed/s37-script-rename-driver-back-and-forth-mcp/.step_states

# Desired usage functionality: 
- Be able to "say" something like: "I want the state of s2_moved.py before goodbye() was added", but programmatically: `cli --file s2_moved.py --step 2 --json`

# preferred approach to achieving:  
- get list of files modified by JSONL
- get number of steps in JSONL
- get which steps referenced which file
- get state of file at a specific step. 

the JSON format of the returned object (state of file at step N) still needs to be flushed out. 

# existing plan files
CLI->JSON plan file: /Users/matkatmusicllc/.claude/plans/snoopy-cooking-pnueli.md 