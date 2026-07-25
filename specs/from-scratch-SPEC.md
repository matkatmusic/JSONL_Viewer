# From-Scratch Reconstruction (Layered Lazy Timeline) — Spec

Distilled from the 2026-07-23 design interview (Q1–Q21). Decision ledger:
[`../from-scratch-reconstruction.hpp`](../from-scratch-reconstruction.hpp);
goal input: [`../plans/from-scratch-reconstruction-goal.md`](../plans/from-scratch-reconstruction-goal.md);
decided layout: [`../plans/mvp-app-mockup.html`](../plans/mvp-app-mockup.html).

## Goal

A layered, lazy reconstruction timeline: `loadLayeredProject(projectFolder, …)`
renders the cheap evidence (commits, file-history snapshots, on-disk end
state) instantly as per-file layer-1..3 timelines, honestly showing every
unexplained diff as a presumed user edit; the vertical timeline app (per-file
widgets on one shared time axis, ruler-armed segment cuts) lets the user cut
ranges of verified states into git-diff patches. Done = layers 1–3 load and
render for a real project, and a segment selection emits a git-diff patch
that applies cleanly. "Fill in the gaps, but only when you want the gaps
filled in."

## Key Decisions

- Attribution invariant (Q8): every adjacent-pair diff is a **presumed user
  edit** until a layer explains it — the engine may leave a gap but may never
  invent an attribution; only evidence convicts.
- Performance = layered laziness (Q21): layers 1–3 are parse-only and
  instant; layers 4+ compute on demand, scoped to the viewed file/region,
  outputs persisted keyed by input hashes; verified beacon states double as
  replay seeds. MVP ships layers 1–3 only.
- One machine, one clock (Q7/Q9): single UTC-ms axis; git committer time
  (seconds) widened ×1000; same-second ties broken by content order.
- Anchor rule (Q14): a timeline begins at its anchor — the first
  full-content evidence; earlier byteless mentions are pre-anchor stubs
  (position known, content unknown), display-only — byte-consuming
  operations refuse unpromoted stubs.
- Identity (Q11/Q12): one `ReconstructionEntity` per file; typed directed
  edges (`RenameEdge` / `CopyEdge` / `ScriptDependsOn`); lineage derived by
  `lineageOf` walking `RenameEdge`s, never stored as a group.
- Hunk discipline (Q15, governs deferred layer 5+): partial-content records
  content-verified at their recorded line position; mismatch means the base
  is wrong → repair the base from evidence.
- Patch semantics (Q18): segment cuts partition the timeline; cuts allowed
  on verified states only; per file,
  `patch = diff(endStateOfPreviousSelection, rightmostStateInThisSelection)`;
  first segment's base is the anchor; emitted as git-diff. Overlap is
  impossible by construction (the ruler is fully partitioned). Per Q17(a)/(b):
  a cut mark is one global instant that snaps PER FILE, AT-OR-BEFORE, to that
  file's nearest verified state — never pulling future content backward;
  files born after a cut are absent from that segment.
- Orientation: vertical (decided; horizontal rejected for MVP), with a
  Condense button squashing per-session lanes to one column per file.
- Reuse, don't rebuild (Q20 + goal; user-reinforced 2026-07-24): reuse as
  much existing engine code as possible — before writing any new module,
  check whether an existing engine piece covers it. Named reuse: merged
  sorted file-touching row list, script-run identification chain, hunk
  application discipline, kept/ignored row classification, rewind
  kept-vs-reverted snapshot comparison, the webapp Details view (including
  its `[{ }]` raw-JSON node buttons), and the webapp Changes view
  (Fork-style tree + diff).
- UI additions (user-directed 2026-07-24): layer buttons carry tooltips
  naming what each layer adds; the timeline legend sits above the timeline,
  always visible (not part of the scrolled area); clicking a script-run node
  shows the before/after diff of its affected files in the detail pane
  (same mechanism as segment diffs), with the script body displayed per a
  mockup to be produced before implementation.
- Deferred (not MVP): layers 4+ computation, commit creation from selections
  (Q17 SETTLED 2026-07-24, still post-MVP: one commit per segment via
  apply-and-commit from the baseline; per-file at-or-before snap with
  manifest lines; author date = cut instant, committer date = export time
  — full closure in from-scratch-reconstruction.hpp), `edited_text_file`
  positive beacons, horizontal orientation.
- Spec file (2026-07-24): this file, alongside the still-live task-166
  `SPEC.md` — the per-file jot-recovery items continue in parallel.
- Code home (2026-07-24): in place in `jfred/src` (engine) and
  `jfred/webapp` (app), new modules beside existing ones with a `layered_`
  filename prefix (webapp: `layered-` per its kebab convention); TypeScript
  (the .hpp is sketch-only).

## Spec Items

### S1. Loader entry point and shared instant axis
`loadLayeredProject(projectFolder, {repoPath?, jsonlPaths?, snapshotPaths?})`
discovers the sources (explicit paths win; otherwise discovered from the
folder) and returns a `ReconstructionGraph` of per-file
`ReconstructionEntity`s holding per-session `SessionTimeline`s, every node
placed by its `Instant` on the one UTC-ms axis: JSONL timestamps as-is, git
committer seconds widened ×1000, same-second ties broken by content order.
- Verify: unit test on a fixture folder — returned entities match the files the fixture evidences; explicit-path override respected; a commit and a JSONL record in the same second order by content.
- Tasks: #195, #196, #197
- Status: done (#195 done 2026-07-24, jfred@462e075; #196 + #197 done 2026-07-24, staged — layered_load.ts + layered_instants.ts)

### S2. Layer 1 — anchors, pre-anchor stubs, end state, presumption gaps
Per file: anchor = first full-content evidence (commit blob, snapshot, Write
body, complete Read echo, populated originalFile); earlier byteless mentions
become pre-anchor stubs that refuse byte-consuming operations; the on-disk
end state is the final node; every adjacent pair with unexplained differing
content gets a presumed-user-edit gap node.
- Verify: unit tests — anchor chosen correctly per evidence class; stub byte-op refusal; end-state node present; gap nodes appear only between differing verified states.
- Tasks: #198, #199
- Status: open (#198 implemented 2026-07-24, staged — anchor selection + byte-op refusal in layered_anchor.ts, Edit-originalFile + complete-Read-echo beacon classes in layered_load.ts; #199 end-state/gap nodes open)

### S3. Layer 2 — commit beacons
Given a repo path, each commit touching a file contributes a verified beacon
node (blob content) at its committer instant on that file's timeline.
- Verify: unit test with a fixture repo — beacon nodes carry blob bytes and committer instants; author time never used.
- Tasks: #200
- Status: done 2026-07-24, jfred@43b8a5d (jfred/src/layered_git_beacons.ts)

### S4. Layer 3 — snapshot beacons via owning-session sidecar
File-history snapshots become verified beacon nodes; a snapshot reference
(`abc123@vN`) resolves through the owning session's sidecar, never a global
name lookup.
- Verify: unit test with two sessions using the same `@vN` name for different bytes — each timeline gets its own session's bytes.
- Tasks: #201
- Status: done 2026-07-24, jfred@43b8a5d (jfred/src/layered_snapshot_beacons.ts)

### S5. Multi-session merge and corroboration
Per-session `SessionTimeline`s merge into one derived view per
`ReconstructionEntity`, nodes ordered by their `Instant` (the shared UTC-ms
axis point, per the hpp); when multiple sessions observed the same bytes,
the nodes are marked as corroborating (input for the dashed cross-lane
lines).
- Verify: unit test — two sessions' nodes interleave by `Instant`; same-bytes nodes carry the corroboration mark; single-session is the degenerate case.
- Tasks: #202
- Status: open

### S6. Typed edges and derived lineage
Rename and copy evidence from layers 1–3 produce typed directed edges
(`RenameEdge` with `timestampOfRename`, `CopyEdge` with `timestampOfCopy`,
each carrying its `JsonlRef` evidence); `lineageOf` walks `RenameEdge`s to
derive one continuous history; copies fork (both entities alive; `bornCopy`'s
first content = `copiedFrom`'s reconstructed state at `timestampOfCopy`).
No stored lineage groups.
- Verify: unit test — rename chain walks end-to-end; copy fork leaves both lineages independent afterward.
- Tasks: #203
- Status: open

### S7. App page skeleton
The new layered page becomes the webapp's main page; the current webapp page
is NOT replaced — it is renamed to `webapp_old.html` and stays served, so
its features can be compared against the new design. New page layout: left
collapsing drawer (JSONL session list + file nav), timeline canvas in the
left half, right half split top/bottom — top the Details pane, bottom the
Changes pane hidden until a segment is selected. Clicking a file in the
drawer scrolls to its widget.
- Verify: DOM test — regions present, drawer collapses, file click scrolls, Changes pane hidden with no selection; server test — `webapp_old.html` serves the pre-existing page.
- Tasks: #204, #205, #206
- Status: done (#204 done 2026-07-24, jfred@462e075; #205 done 2026-07-24 — index.html + layered-app.ts, root serving flipped; #206 done 2026-07-24, jfred@43b8a5d — /api/layered-graph endpoint + page fetch-on-load)

### S8. Per-file widgets on one shared vertical axis
Each file renders as a rounded widget offset to its history's start on the
shared vertical time axis, per-session lanes inside; dashed cross-lane lines
where S5 marked corroboration.
- Verify: DOM test on a two-file, two-session fixture — widget offsets ordered by start instant; lanes per session; dashed line present exactly at corroborated instants.
- Tasks: #207, #208
- Status: open

### S9. Layer switcher with per-layer tooltips
A `Layer: [1]..[12]` control above the timeline; 1–3 selectable (switching
re-renders at that layer's detail); buttons for layers 5 and up are disabled
until the functionality each enables becomes unlocked to work with this new
engine mode. Every layer button carries a tooltip naming what that layer
adds (1 start/end, 2 commits, 3 snapshots, 5 derived edits, 7 script runs,
8/9 branches, 10 verified replay, 12 decoration).
- Verify: DOM test — selecting a layer changes the rendered node set; layer-5+ buttons disabled while their functionality is unlocked-false; each button exposes its what-it-adds tooltip text.
- Tasks: #209
- Status: open

### S10. Condense button
Toggles per-session lanes into a single all-nodes column per file and back;
the condensed column looks like the current webapp's timeline — each row
shows the node's classification plus a truncated version of the original
message.
- Verify: DOM test — condensed mode shows one column with all nodes, rows carrying classification and truncated original-message text; toggle restores lanes.
- Tasks: #210
- Status: open

### S11. Kept/ignored dimming and branch end-vs-rejoin rendering
Nodes reuse the engine's kept/ignored row classification: ignored dimmed;
a branch whose content did not carry forward visually ends, one whose
content carried forward visually rejoins — so a selection rectangle
contains exactly what its patch contains.
- Verify: DOM test with a rewind fixture — dimming classes match classification; reverted branch terminates, kept branch rejoins.
- Tasks: #211
- Status: open

### S12. Always-visible timeline legend
The timeline legend renders at the top of the timeline area and stays
visible while the timeline scrolls (it is not part of the scrolled content).
- Verify: DOM/CSS test — legend present above the timeline; scrolling the timeline leaves the legend in view.
- Tasks: #212
- Status: done 2026-07-24, jfred@43b8a5d (legend above the sole scroll container in index.html)

### S13. Details on node click, with raw-JSON button
Clicking a timeline node fills the top-right pane with the existing webapp
Details view for that node (reused, not reimplemented), retaining the
existing `[{ }]` button that shows the node's raw JSON.
- Verify: DOM test — node click renders the Details view with that node's data; the `[{ }]` button reveals the node's JSON.
- Tasks: #213
- Status: open

### S14. Script-run node detail mockup
An HTML mockup in `plans/` (peer of `mvp-app-mockup.html`) showing how a
clicked script-run node presents both the script body and the before/after
diff of affected files in the detail pane. Produced and user-approved before
S15 is implemented.
- Verify: mockup file exists and the user has signed off on the layout.
- Tasks: #214
- Status: done (plans/script-run-detail-mockup.html; user signed off 2026-07-24)

### S15. Script-run node click shows before/after diffs
Clicking a script-run node shows the before/after state of each affected
file as a diff in the detail pane — the same diff mechanism the segment
selection uses — alongside the script body, laid out per the S14 mockup.
- Verify: DOM test with a fixture containing a script-run node — clicking it renders per-file before/after diffs and the script body in the detail pane.
- Tasks: #215
- Status: open

### S16. Ruler, marks, and segment partition
"Create segments for patch extraction" arms the global left ruler; the user
adds cut marks (triangles); a mark is one global instant that snaps per file,
at-or-before, to that file's nearest verified state (Q17a/b — never pulling
future content backward; unverified or mid-residual cut states refused); the
entire ruler length partitions into segments P1..Pn spanning every file's
lanes.
- Verify: DOM test — arming enables marks; a mark attempt on an unverified node is refused; a mark between two files' beacons snaps to each file's own at-or-before verified state; n marks yield n+1 contiguous segments covering the full ruler.
- Tasks: #216, #217
- Status: open

### S17. Segment patch generation as git-diff
Selecting a segment computes, per file,
`patch = diff(endStateOfPreviousSelection, rightmostStateInThisSelection)`
where each state is the file's at-or-before snapped verified state at the
segment's cut (first segment's base = anchor; a file born after the cut is
absent from that segment's patch and first appears — as a creation — in the
segment containing its birth), concatenated into one git-diff shown in the
reused Changes view; the emitted patch applies cleanly.
- Verify: unit test — on a fixture, each segment's emitted git-diff `git apply`s in sequence to reproduce the final state, including a file born after cut 1 (absent from segment 1's patch, created by segment 2's); DOM test — segment selection shows the patch in the Changes pane.
- Tasks: #218, #219
- Status: open
