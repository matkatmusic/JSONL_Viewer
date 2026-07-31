# Sibling absorption

## Term
"Sibling absorption" is the surviving-trunk walk's step of pulling
parallel-tool-call sibling records back onto the trunk, implemented by
`absorbParallelToolCallSiblings` in `jfred/src/reconstruction_trunk_absorb.ts`.

## Root cause
When a single assistant API response contains multiple tool calls, the
transcript splits it into several sibling JSONL records that all share the
same `message.id`. Each tool_result then parents onto its *own* tool_use
sibling, not onto a single shared parent. The surviving-trunk ancestor walk
(`collectAncestorUuids` from a single head) follows only one parent chain, so
it reaches one sibling and its result, while the other siblings dead-end and
are dropped as if they were an abandoned/rewound branch.

In scenario s85 (`s85-git-commit-csv-and-move-scripts`), this silently
dropped the sibling record for `Write two.py` and its result. Since script
discovery reads execution evidence off exactly those kinds of records, the
dropped siblings starved script discovery — `core_*.py` files ended up with
no reconstructed history, and the Files nav never got a rename revision to
badge, which is what surfaced as the original task 145 symptom ("s85 script
renames missing from the Files nav").

## Fix
`absorbParallelToolCallSiblings` (`jfred/src/reconstruction_trunk_absorb.ts`)
runs two rules over the full record set after the ancestor walk builds the
trunk set:
1. Absorb every assistant record that shares a trunk assistant record's
   `message.id` — the split siblings of an API response the trunk already
   holds part of.
2. Then, to a fixed point, absorb any tool_result-only user record or
   attachment record whose parent is already on the trunk — but only when
   its *entire* subtree is plumbing (tool_result echoes / attachments). A
   dead-end tool_result followed by real conversational content (a genuine
   rewound exchange) is left off the trunk so it still dims correctly.

Wired into the trunk build via the sole call site,
`collectSurvivingTrunkUuids` in `jfred/src/reconstruction_trunk.ts:65`.

## Commit reference
- `84eab291` — introduces `absorbParallelToolCallSiblings` and wires it into
  `collectSurvivingTrunkUuids`.
- `479deff2` — follow-up correction ("fixed failing test"): tightens rule 2
  from "parent already absorbed" to "parent already absorbed AND the entire
  descendant subtree is plumbing", so a real rewound branch that happens to
  start with a bare tool_result no longer gets wrongly absorbed.

## Follow-up tracking
Task 145's closureNote flagged a follow-up: rename REVISIONS for moved-away
script sources (the source file, e.g. `one.py`, still showed as alive after
`shutil.move` renamed it to `core_one.py`). That is tracked as task 155,
"Represent script moves as true rename revisions (merge source history into
destination)" — already closed (fixed via
`reconstruction_script_move_events.ts`).
