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

## SETTLED (user, 2026-07-30)

### Branch work is deferred until a layer-3-or-higher button is clicked

Nothing branch-related runs on page load. When the user clicks `[3]` or above,
the progress bar runs its normal page-load stages, then the ruler-resolving
stage, then a stage labelled specifically **"reconstructing branches"**.

This leans the plumbing question toward a **second, on-demand fetch** rather
than parsing JSONL inside `buildLayer1View` — the work is triggered by a click,
not by the initial view build. _(Residual: confirm the fetch is session-scoped
and that L3/L7 use the same trigger.)_

### One ruler for the whole project

Forked lanes **share the trunk's ruler ticks**. No local sub-axis, no second
ruler. Every message carries a timestamp, and that timestamp is what places a
node on the ruler — including a rewind point, which is a conversation record
with a timestamp like any other.

### Bubbles widen to fit their lanes

More than two lanes in a bubble is fine. Widen the bubble so lanes do not
overlap, rather than stacking or hiding them.

### Rewinds come from the engine's branch data, not from the log

There is no such thing as an explicit rewind record in a conversation log. The
closest artifact is a user prompt that typed `/rewind`. Rewind positions are
**derived**, and the engine already does that derivation
(`collectAbandonedHeads` / `findRewindPoint` / `findStructuralRewoundBranches`).
L5's job is to consume the branch data the engine hands over — not to detect
rewinds itself. This makes the old Q9 (structural forks vs explicit rewinds)
moot: the engine returns one branch model, and there is no "explicit" kind to
distinguish it from.

### Layer gating

Cumulative `layer >= N`, per the global rule settled in L4 — applies to every
layer, so it needs no per-layer confirmation.

## BLOCKED ON A VISUAL CHOICE

**Branch rendering inside a per-file bubble.** The original idea was each
bubble's timeline getting a forked path, but the choice has to be made by
looking at it. Deliverable: **a static HTML mockup showing 2–3 different ways
branches could render** in the current per-file bubble timeline — zero
interactivity, purely to pick a direction. Lane scope (a lane per session vs a
conversation-wide tree spanning forked subagents) rides on that choice and
stays open until then.

## STILL OPEN

**A. The ruler silently squashes long time gaps. Does a rewind point survive
that?**

_Definition — what the earlier draft meant by "capped gap":_ the ruler does not
space ticks in true proportion to elapsed time. `measureGapPixels`
(webapp/layer1-ruler-axis.ts:37-42) computes `elapsedHours × 2.5px`, then
clamps it between **16px and 120px**, then widens it further if the row's
content needs room. So a three-week gap and a three-hour gap can both render as
120px, and there is **no on-screen cue** that compression happened — no
squiggle, no break marker. It is always on, applied to every ruler.

Now that forked lanes share the trunk's ticks (settled above), a rewind point
whose real timestamp is days away from its neighbours can land visually
adjacent to a completely unrelated event. Question: acceptable, or does a
rewind point need guaranteed visual separation / a break marker?

_Code re-check (2026-07-30): **still open — no break marker exists.** Zero
break/discontinuity/ellipsis glyphs anywhere in the ruler modules or CSS; the
nearest thing, `.tiegroup`, means the opposite (simultaneity). But the hook to
hang one on already exists: `measureGapPixels` takes a `contentFloorPx`
argument and `layOutNodeLadders` (layer1-ruler-axis.ts:108-114) already feeds
it `rowsPerInstant × RULER_NODE_ROW_PIXELS`, so forcing extra room at a chosen
instant is a parameter, not new machinery. Only the glyph would be new._

_(Flag: task 341 describes gap compaction as "a separate on-demand button."
Nothing like that exists in layer1-ruler-axis.ts today — the compression is
always-on. Worth reconciling before either is specced.)_

**B. Can a branch-lane node join a tie group with a trunk node?**

_Definition — "tie group":_ when two or more ladder nodes share the exact same
instant, they are stacked on separate 22px rows so they don't overprint (task
251), and then a **rounded rectangle is drawn behind the whole stack** to
restore the fact that they were simultaneous — `buildTieGroupMarkers`
(webapp/layer1-tie-groups.ts), styled at layer1-styles.css:264-266. Related but
separate: a ruler tick holding more than one event gets a dotted underline and
becomes clickable (`markMultiEventTicks`, layer1-tick-files.ts:145-159).

Question: if a trunk node and a forked-lane node land on the same instant,
does the rounded rectangle span **across** the lanes, or does each lane get its
own tie group?

_Code re-check (2026-07-30): **contingent, not open — it cannot be answered
yet.** Layer 1 has no plural lanes. `.lane` today means exactly one thing: the
single vertical node stack inside one bubble (layer1-widgets.ts:48,
layer1-styles.css:250), and `groupTiedLadderNodes` (layer1-tie-groups.ts:19-30)
takes one flat ordered node list, single-pass, with no lane awareness — its
comment notes "a tie is contiguous by construction." Multi-lane bubbles are
precisely what the branch-rendering mockup above would introduce. This question
is downstream of that choice and should be answered with it, not before._

**C. Should "L5 never re-implements sibling absorption" be written into the
spec as an invariant?**

_Definition — "sibling absorption":_ when Claude fires several tool calls in
one turn, those parallel calls are written to the JSONL as separate assistant
records sharing one `message.id`, each with its own tool_result child. A naive
walk back up `parentUuid` from the head only follows one of them; the others
dead-end sideways and **look exactly like abandoned rewind branches**.
`absorbParallelToolCallSiblings` (src/reconstruction_trunk_absorb.ts:153-160)
pulls those true siblings back onto the trunk — while deliberately refusing to
absorb a dead-end that is followed by real conversational content, because that
pattern *is* a genuine rewind.

Why an invariant was proposed: get this wrong in either direction and the
branch UI lies. Too loose → every ordinary multi-file parallel edit renders as
a spurious abandoned branch. Too strict → real rewinds get swallowed into the
trunk and vanish from the timeline. The engine already handles it; the proposal
is just to write down "don't redo this." Question: is that worth a line in the
spec, or is "reuse the engine, never reimplement it" already the standing rule
across all layers (as settled for rewind derivation above)?

_Code re-check (2026-07-30): **it is not already a written rule — this would be
new.** `CLAUDE.md` only forwards to `plans/coding-requirements.md`, whose
closest item is the generic §3 "DRY — extract to generic, parameterized
helpers" plus scoped one-offs ("reuse the page's existing loadbar rather than
adding a second idiom", line 84). No `jfred/CLAUDE.md` exists; `jfred/docs/`
has nothing. Repo-wide, "reuse the engine" appears only as per-feature
instances (specs/from-scratch-SPEC.md:231; L3's confidence-signalling line),
never as a general principle. So the choice is real: write one general rule, or
keep stating it per feature as the codebase does today._
