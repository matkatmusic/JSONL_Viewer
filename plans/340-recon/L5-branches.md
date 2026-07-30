# L5 recon — branches in timeline bubbles

## Branch discovery (parse-only, reusable AS-IS)

`ConversationBranch = {tip: Uuid, rewindPoint: Uuid|undefined, isSurviving}`
(src/reconstruction_branch.ts:27-31). Built in three passes (:67-91):
surviving head (`findSurvivingHead` → `findWorkingTreeOwner` content-signature
tiebreak), rewound tips (`collectAbandonedHeads` + `findRewindPoint`,
reconstruction_trunk.ts:132,:71), structural forks
(`findStructuralRewoundBranches`, reconstruction_fork.ts:17).
`selectBranchRecords(records, tip)` = ancestor chain + uuid-less meta
records; `collectSurvivingUuids` runs `absorbParallelToolCallSiblings`
(reconstruction_trunk_absorb.ts) so parallel-tool-call siblings never read
as rewinds. All parse-only — records in, no BackupReader.

## Kept-vs-reverted: EXISTS as a composition (recon correction, user-flagged)

First pass wrongly reported "no comparator". The capability is composed from:
- `reconstructBranches(records, reader)` (reconstruction_engine.ts:172-190) —
  surviving FileHistory[] PLUS per-rewound-branch `RewoundBranchHistory
  {rewindPoint, tip, histories}` with fully reconstructed revisions
  (`buildRewoundBranchHistory` filters to the diverging changeIds).
- `findWorkingTreeOwner` (reconstruction_worktree.ts) — rewind-moment
  snapshot CONTENT signatures (carried backupFileName per path; a `code`
  restore's refresh snapshots correctly ignored) decide which content owns
  the surviving working tree.
- The steps core (reconstruction_steps.ts:1) is branch-agnostic on purpose:
  "disk keeps abandoned-branch writes after a conv-only rewind" — the
  conv-only vs code-rewind outcome is already modeled.
L5's kept-vs-reverted = compare a rewound branch's reconstructed final bytes
against the surviving state at/after the rewind — a thin composition of the
above, not new comparison logic.

## Kept/ignored (Verdict) correction

`Verdict` (vocabulary.ts:110-120) classifies RAW JSONL LINES, consumed by
reconstruction_parse_lines.ts / extract.ts:87 (drops ignore) /
reconstruction_trace.ts. Ignored lines are dropped BEFORE FileEvents exist —
no cheap inheritance to timeline nodes. The cheap, already-threaded flag is
`isOrphaned` (branch membership) in the OLD app's pipeline
(reconstruction_json.ts:35,59, reconstruction_tool_calls.ts).

## Rendering precedent — old app only

webapp/views/timeline-sessions.ts: `computeGraphLaneRuns` (:60-76, contiguous
orphan runs; first row = fork curve, last = end/rejoin),
`checkNodeIsAbandonedBranchTip` (:79-89). `buildGraphCell`
(timeline-render-row-cells.ts:52-77): `.g-rail.g-l1/.g-l2`, `.g-start`/
`.g-fork`/`.g-end`. Dimming: `.tl-row.orphan .tl-main {opacity:.5}`
(webapp/styles.css:396). Branch chips: `renderBranchStrip`
(views/conversation.ts:71-77). NOTHING on the layer1 bubble page has any
fork/orphan concept.

## Critical architecture finding

`buildLayer1View` reads NO JSONL and imports none of
reconstruction_branch/graph/json (grep-verified zero hits). Branch structure
lives entirely in the old app's pipeline. L5 needs either JSONL parsing in
the Layer-1 view build or a session-scoped second fetch — same fork as
L3/L7.

## Thin adapters needed

- Port lane-run logic (fork/end/rejoin boundaries) from flat row list to a
  bubble's vertical ladder — re-derive from GraphTurn/rewindPoint against
  ladder node order, not a verbatim copy.
- New wire field: `branches?: WireBranchOf<I,P,U>[]` on WirePairOf (+ ladder
  helper + fixture counterpart + `data-layer="5"` CSS).
- An isOrphaned/BranchRole-equivalent field on Layer-1 node wire types.

## AMBIGUITIES (grilling)

1. Plumbing: JSONL parsing inside buildLayer1View, or second session-scoped
   fetch merged client-side? (Shared with L3/L7 — settle once.)
2. Lane scope: branch lane per SESSION, or conversation-wide tree spanning
   forked subagents (forkContextRef)?
3. SETTLED (2026-07-30): kept-vs-reverted is byte-content, via the existing
   reconstructBranches + findWorkingTreeOwner composition above.
4. Ruler interaction: forked-lane instants share the trunk's ruler ticks, or
   a local sub-axis? Capped-gap could merge a rewind point into an unrelated
   tick.
5. Tie-groups: can a fork-lane node join a tie-group with a trunk node at
   the same instant — what does that look like?
6. Rewind-point anchoring: rewindPoint is a conversation Uuid, not a file
   instant — where does a lane with no file turns fork/end vertically?
7. >2 lanes per bubble (trunk + 2 rewound tips): allowed? Color/position vs
   session-wash coloring?
8. Switcher: `data-layer="5"` cumulative (>=) like 1→2, confirm.
9. Structural forks (no rewind marker) vs explicit rewinds: visually
   distinct or identical?
10. Spec should state L5 NEVER re-implements sibling absorption (engine
    already does it) — confirm as a written invariant.
