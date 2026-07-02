## The Algorithm (user-specified)

```
JSONL shows a script-execution call (Bash OR ctx_execute/ctx_batch_execute) touched many tracked files at time T
        │
        ▼
Does the script (and its data inputs) still exist on disk?
   ├─ No  → recreate from the JSONL: reconstruct the script's own source
   │        (and data inputs, e.g. the CSV) from their Write/Edit records
   │        — i.e. run the Engine on the script file itself.
   └─ Yes → read it
        │
        ▼
Derive the transformation strategy from the script (per script-type plugin)
   (rename-functions.py + function-names.csv ⇒ whole-token old→new subs, scoped)
        │
        ▼
VALIDATE — the forward test:
   Build the "expected state" = the immediate post-script state at T:
     1. anchor = first captured BEACON after T (a read/cat/snapshot, ts > T),
        else the on-disk state (fallback — no later observation was captured).
     2. reverse every OBSERVED edit in (T, anchor] back onto the anchor,
        newest-first, landing on the state as it was just after the script ran.
        (Edit/Write records carry both before+after, so they invert cleanly —
         unlike the script transform itself.)
   Then run the Engine's pre-script state THROUGH the script (forward) and
   compare the result to that expected state:
   ├─ Match → forward(pre) == expected post-script state is proven.
   │           Inject the transform FORWARD as a synthetic authored event at T.
   └─ No   → not (fully) explained by this script → flag, drawing board.
```

```py
# in the loop that scans JSONLs and categorizes lines: 
if isScriptExecution(line):
    script = getScriptToExecute(line) # pull from JSONL
    preExecutionState = getPreExecutionState(workingdir) # the reconstructed state of the files that the script will run against. 
    beaconLine = getPostExecutionBeacon(line, jsonl) # the line with the beacon state pointers (read/cat events, file-history-snapshots, etc..) for the files the script will run against, pulled from the JSONL AFTER the script execution line was discovered.
    expectedState = getImmediatePostExecutionState(beaconLine, jsonl) # the 'rewinding' of the beacon state to just after the original script ran.
    resultingState = runScriptAgainstState(script, preExecutionState) # the invokation of the extracted script on the simulated pre-execution state.  This should happen either in-memory or in some temp/sandboxed folder. 
    if resultingState != expectedState: # finally, the comparison.
        throw ScriptExecutionOutputFailedToMatchError # or however we're expressing a step failed to reconstruct.
    else:
        # the replicated script execution worked! 
        # include it as a reconstructable step in the list. 
        # Inject the transform FORWARD as a synthetic authored event at T.
```

**Why forward, not reverse.** Validate by running `forward(pre)` and comparing to the known post-state — NOT by inverting the script. Forward validation needs no invertible transform, so it generalizes to any script (deletions, token collapses, non-bijective rewrites), not just clean renames.

**The comparison anchor.** The target is the *immediate* post-script state at T. The nearest captured truth is the first **beacon** after T (or on-disk if none), but the beacon may sit ahead of the script by some recorded edits. Those intervening edits are observed (Edit/Write records, which carry both before and after, so they invert cleanly), so we rewind them off the anchor — newest-first — to recover the state as it was the instant the script finished. Comparing against *that*, rather than the raw beacon/on-disk, isolates the script's effect from later drift.

**Central design point.** A script-execution event is a **transform event, not a content event.** Its effect depends on the live per-line belief at `T`, which is unknown until replay. So the synthetic event must carry the *transform spec* and be applied at replay time against the current belief — it cannot be pre-materialized into per-line `write` events at extraction time.
