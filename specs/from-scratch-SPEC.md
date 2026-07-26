# From-Scratch Reconstruction (Layered Lazy Timeline) — Spec

Distilled from the 2026-07-23 design interview (Q1–Q21). Decision ledger:
[`../from-scratch-reconstruction.hpp`](../from-scratch-reconstruction.hpp);
goal input: [`../plans/from-scratch-reconstruction-goal.md`](../plans/from-scratch-reconstruction-goal.md);
decided layout: [`../plans/mvp-app-mockup.html`](../plans/mvp-app-mockup.html);
Layer 1 View layout (S18, signed off 2026-07-25):
[`../plans/layer1-mockup.html`](../plans/layer1-mockup.html).

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

**Current milestone (2026-07-25): the Layer 1 View (S18)** — honest visual
data first. Under the user-facing renumbering below, Layer 1 is on-disk
state against git state and reads no JSONL at all, so it does NOT go through
`loadLayeredProject`; it is a separate path with its own endpoint. Layers 2
and 3 then add the JSONL-derived and snapshot evidence that the paragraph
above describes. Everything else is deferred behind this milestone.

## Key Decisions

- Attribution invariant (Q8): every adjacent-pair diff is a **presumed user
  edit** until a layer explains it — the engine may leave a gap but may never
  invent an attribution; only evidence convicts.
- Performance = layered laziness (Q21): layers 1–3 are parse-only and
  instant; layers 4+ compute on demand, scoped to the viewed file/region,
  outputs persisted keyed by input hashes; verified beacon states double as
  replay seeds. MVP ships layers 1–3 only.
- **Layer renumbering (user-directed 2026-07-25) — honest visual data first.**
  The user-facing layers are now: **Layer 1 = Current File State vs Git
  State** (on-disk file list paired against the repo tree, commit nodes on the
  ruler — no JSONL involved); **Layer 2 = adds JSONL-derived start points**;
  **Layer 3 = adds file-history snapshots**. This supersedes the S2/S3/S4
  numbering, which those sections keep as *internal* engine-layer names —
  S2 (anchors/end state) and S4 (snapshots) are now inputs to user-facing
  Layers 2 and 3, and S3 (commit beacons) feeds user-facing Layer 1. The
  Layer 1 View is the current milestone; it is specified in **S18** and it
  gates everything else.
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
- Status: done (#198 done 2026-07-24, jfred@05c305c — anchor selection + byte-op refusal in layered_anchor.ts, Edit-originalFile + complete-Read-echo beacon classes in layered_load.ts; #199 done 2026-07-25, staged — layered_end_state.ts end-state + presumption-gap completion wired per session timeline, validated by npm test + real-jot smoke)

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
- Status: done 2026-07-25, staged — `mergeSessionTimelines` in jfred/src/layered_merge.ts: per-session end states dedupe to ONE (owned by no session), presumption gaps are re-derived against the merged neighbours (another session's beacon can explain a gap its owner could not), and corroboration marks list the other sessions that observed the same bytes — never on a single-session content group. `sortNodesOntoAxis` moved to layered_instants.ts so the loader and the merge share one sort.

### S6. Typed edges and derived lineage
Rename and copy evidence from layers 1–3 produce typed directed edges
(`RenameEdge` with `timestampOfRename`, `CopyEdge` with `timestampOfCopy`,
each carrying its `JsonlRef` evidence); `lineageOf` walks `RenameEdge`s to
derive one continuous history; copies fork (both entities alive; `bornCopy`'s
first content = `copiedFrom`'s reconstructed state at `timestampOfCopy`).
No stored lineage groups.
- Verify: unit test — rename chain walks end-to-end; copy fork leaves both lineages independent afterward.
- Tasks: #203
- Status: done 2026-07-25, staged — jfred/src/layered_lineage.ts (edges + `lineageOf`) with jfred/tests/layered_lineage.test.ts, 7 tests green; jfred/src/layered_load.ts wires the edges in. Edges come solely from `extractFileEvents`' existing `EventKind.rename`/`EventKind.copy` channel (no new parsing) and their `JsonlRef` evidence from the loader's existing `indexJsonlRefsByChangeId`; copy born-content uses `mergeSessionTimelines` (S5) + `checkNodeCarriesBytes` (S2). No stored lineage groups: `findCopyBornContent(edge)` derives born-content on demand and returns `undefined` when no verified source state precedes the copy. Deviation from Reuse-don't-rebuild: the engine's `resolveFinalPath` is NOT reused — it returns only the last path (it cannot yield the ordered chain `lineageOf` needs) and would infinite-loop on a recorded `mv a b; mv b a` cycle; the layered walk uses a shared seen-set and terminates.

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
- Status: done — #207 (2026-07-25) offsets + per-session lanes; CSS owns all layout and the JS emits only `--axis-ms` / `--axis-span-ms`, so there is no JS layout pass and no cross-boundary import from `src/` into `webapp/` (tsconfig.webapp.json pins rootDir to webapp). #208 (2026-07-25, jfred@09c8df9 + @0f0c459) adds the dashed cross-lane corroboration lines: `listCorroboratedInstants` in src/viewer_api_layered.ts runs the S5 merge server-side and ships the instants as `corroboratedInstants` on the wire (webapp/ may not import src/), and the page draws one `.layered-corroboration` per instant on the `.layered-lanes` container so a line spans every lane, sharing the `--axis-ms` scale with the node dots. Tests: tests/layered-app-widgets.test.ts (3 green).
- SUPERSEDED IN PART (2026-07-25, S18): the `--axis-ms` contract — JS emits raw milliseconds, CSS multiplies by a fixed scale — cannot express S18's capped-gap ruler, whose positions accumulate. Widget offsets, node offsets and the #208 corroboration lines migrate to a precomputed `--axis-px` (task #239). The division of labor is unchanged: one number crosses the JS→CSS boundary and CSS still does the placing. DONE 2026-07-25 (#239, staged): `src/viewer_api_layered.ts` runs `resolveInstantOffsets` (task #234) over the whole graph and ships `axisOffsetsPx` — every instant keyed by the same ISO text its nodes already carry — beside `corroboratedInstants`, since webapp/ may not import src/. The page looks an offset up and emits `--axis-px` / `--axis-span-px`; `--axis-scale` is gone from layered-styles.css, which still owns every placement rule. Tests updated: tests/layered-app-widgets.test.ts states the fixture's ruler offsets explicitly (as it already did for corroboration), and tests/viewer_api_layered.test.ts asserts the wire's key agreement.
- CAVEAT (not an S8 gap): S8 renders whatever the graph holds, and the graph is currently LAYER-1 ONLY — `collectCommitBeaconNodes` (S3) and `collectSnapshotBeaconNodes` (S4) are never called from anywhere in src/, so no commit or snapshot beacon reaches a widget. Wiring them into `loadLayeredProject` is unclaimed by any task and blocks S9.

### S9. Layer switcher with per-layer tooltips
A `Layer: [1]..[12]` control above the timeline; 1–3 selectable (switching
re-renders at that layer's detail); buttons for layers 5 and up are disabled
until the functionality each enables becomes unlocked to work with this new
engine mode. Every layer button carries a tooltip naming what that layer
adds (1 start/end, 2 commits, 3 snapshots, 5 derived edits, 7 script runs,
8/9 branches, 10 verified replay, 12 decoration).
- Verify: DOM test — selecting a layer changes the rendered node set; layer-5+ buttons disabled while their functionality is unlocked-false; each button exposes its what-it-adds tooltip text.
- Tasks: #209
- Status: open — DEFERRED behind the S18 milestone. The tooltip text above is STALE: per the 2026-07-25 renumbering the selectable three are 1 = current-vs-git, 2 = JSONL start points, 3 = file-history snapshots. Re-derive the full 1..12 tooltip list from S18 before implementing.

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

### S18. Layer 1 View — Current File State vs Git State (MILESTONE)
User-directed 2026-07-25; layout signed off against
[`../plans/layer1-mockup.html`](../plans/layer1-mockup.html). The first
honest visual: what is on disk right now, against what the repository says,
with nothing inferred from JSONL. **Reads no JSONL at all** — it is a new
server path beside `loadLayeredProject`, not a change to it.

**Inputs.** A project folder on disk (`dir`), a git repo (`repo`), and an
optional commit hash or branch (`ref`, default = the repo's active branch).
Surfaced as two text boxes plus an optional ref box in the page header, each
folder box carrying an `[Open…]` button. A browser cannot return an absolute
path from `<input type="file" webkitdirectory>` or the File System Access
API, so `[Open…]` calls `/api/pick-folder`; the local server runs the OS
folder dialog (macOS: `osascript -e 'choose folder'`) and returns the POSIX
path. Boxes stay editable for paste-in. All three map to URL params
(`?dir=&repo=&ref=`) so a view is one shareable link. (As shipped in #236 the
picker is a **GET**, not the POST originally specified — it is side-effect-free
and `webapp/app-header.ts` already called it that way.)

**Pairing.** `current file state` = the on-disk file walk of `dir`. `starting
repository state` = the repo tree at `ref`, split into **tracked files** and
**gitlinks** — a gitlink is a submodule, not a file, so pairing one would
invent a phantom repo-only row per submodule. Only `trackedFiles` pairs. A
path present in both, relative to its own root, forms a **pair**, and each
pair renders as one file widget.

**Disk walk — ask git, don't re-implement it (revised 2026-07-25).** The walk
runs `git ls-files -z --cached --others --exclude-standard` in `dir` and keeps
the entries whose `stat` says `isFile()`. That one call stops at a gitlink
exactly as `git ls-tree -r` does — jfred's four submodules hold 10,884 files,
every one of which used to land in "No repository match" — and additionally
honors nested `.gitignore` files, `.git/info/exclude` and `core.excludesFile`,
none of which a hand-rolled matcher understands. The `isFile()` stat is doing
two jobs: `ls-files` names the gitlink itself, which is a directory, and a
tracked-but-deleted file has no disk entry. `.git` and `node_modules` stay
excluded **unconditionally** by an explicit name check applied on top of git's
answer, since a project that neither tracks nor ignores `node_modules` would
otherwise flood the view with it. The hand-rolled recursive walk survives only
as the fallback for a project folder that is **in no repository at all** — a
legitimate input here, since the two roots are independent. Note the
deliberate asymmetry with `readRepoTreeAtRef`, which throws loudly: a bad
`ref` is something the user typed and must surface, but "this folder is not a
repo" is an ordinary input the fallback handles.

**Per-pair history.** Walk git history for each pair's path; a commit that
touched the file contributes one commit node, a commit that did not
contributes nothing. The file's current on-disk state is the final node. No
`--follow` — rename tracking is S6's job, so a renamed file simply shows the
shorter history.

**Ruler bounds.** Start = the oldest first-commit instant across all pairs,
pulled earlier if any disk-orphan's timestamp predates it. End = the newest
mtime in `current file state`. mtime is used throughout, including for
orphans (birthtime is not portable).

**Ruler scale — floored linear, capped (revised 2026-07-25).** Position is
linear in UTC-ms at **2.5 px per hour**, except that any single gap between
adjacent instants renders at least **16 px** and at most **120 px**. Formally
`pos(i) = pos(i-1) + clamp((t_i - t_{i-1}) × scale, floor, cap)`. The FLOOR is
new and supersedes this section's earlier "no floor" position: at 2.5 px/hr
two commits ~20 minutes apart resolve under 1 px and their 15 px dots
overprinted, which real data made unreadable, so 16 px is one dot diameter
plus a hair. The CAP was raised **24 → 120** in the same change: with a floor
pushing every gap apart, 24 px no longer bought enough compression to matter,
and 120 px keeps a long quiet stretch legible instead of collapsing it to a
quarter inch. Both preserve ordering and short-gap proportion within the band.
This accumulates, so it cannot be
expressed in CSS the way S8's `--axis-ms` is: the server/loader resolves each
instant to a pixel offset once, globally, and the page emits `--axis-px`.
S8's widgets and corroboration lines migrate to that axis.

**Orphans.** Exactly two bucket widgets, each a plain file list with each
member's own timestamp, each placed at its earliest member's instant: **"No
on-disk match"** (repo paths with no disk counterpart) and **"No repository
match"** (disk paths with no repo counterpart). Buckets are omitted when
empty.

**Output contract (user-settled 2026-07-25).** The engine emits JSON carrying
exactly three top-level properties, and these are the names the webapp
renders — the endpoint (#235) passes them through unchanged, adding `axisPx`
and node detail but never renaming or inverting them:

| property | contents | renders as |
|---|---|---|
| `pairs` | paths present in BOTH lists | one file widget each |
| `gitOrphans` | repo paths with NO on-disk counterpart | the "No on-disk match" bucket |
| `diskOrphans` | on-disk paths with NO repo entry | the "No repository match" bucket |

The two orphan sets are mirror images, so a swap is **invisible to the
acceptance test** — which counts two buckets either way. Treat the direction
as load-bearing.

**Progress stream (feedback fix, 2026-07-25).** A real repo takes ~10 s to
build, during which the page showed nothing and read as frozen. `GET
/api/layer1-view` therefore accepts **`?progress=1`**, which returns the same
view as the terminal line of an **NDJSON stream** framed exactly as
`/api/document` already frames its own: progress and error lines carry a
`kind`, the terminal payload has none. Stages are `walking project folder`,
`reading repository tree`, `reading file history` (counted, one line per
pair), `resolving the ruler`. Without the param the endpoint is still one JSON
body, and both paths return the identical view.

This forced a **route split**: `src/viewer_api_layer1.ts` keeps the builder
and the wire types and now knows nothing about HTTP, while the new
`src/viewer_api_layer1_route.ts` parses the query, validates the two folders
and frames the response. The seam is one-directional by necessity — importing
the other way would be a cycle, since the stream must call the builder WITH
its progress sink. The socket handling is deliberate rather than borrowed: the
build is **synchronous**, so each line is written with Nagle off and the
socket uncorked immediately or every line would sit buffered until the build
ended. One further asymmetry falls out of it — a bad `dir`/`repo` is caught
before any header is written and is still a **400**, but a bad `ref` is only
discovered inside the build, after the header is out, so it arrives as a
terminal **error line**. The page surfaces both through the same crumb.

**Page chrome (feedback fixes, 2026-07-25).** Four additions, all driven by
the first live run against jfred:

- **Sticky ruler gutter.** The ruler is a real flex COLUMN of `.canvas`, not
  padding plus an absolutely-positioned overlay, so it can be `position:
  sticky; left: 0` and stay pinned to the scrollport's left edge under
  horizontal scroll while still scrolling vertically with the content — a tick
  marks a node's row. Its background is load-bearing: widgets scroll *under*
  the gutter, not through it.
- **Zoom control.** `−` / `+` / `Reset` in the header, 1.25 per step, clamped
  to **0.1 – 4**, applied as `--zoom` on `.viz-root` (inherited) and consumed
  by `.canvas { zoom: var(--zoom, 1) }`. This is the **native CSS `zoom`
  property, never `transform: scale()`**: `zoom` participates in layout, so the
  scroll container's scrollable area shrinks with the content instead of
  leaving the page scrolling over a huge empty region. It also scales font
  size, so tick labels shrink in step with the gaps between them, which is why
  the 13 px tick-label collision skip stays correct at every level and the
  ruler needs no re-render on zoom. Verified in a real engine: sticky survives
  the zoom context at 51%, 100% and 195% with the gutter at 0.00 px from the
  pane's left edge after scrolling 315,000 px right.
- **8-character commit labels.** A node is labelled `hash.slice(0, 8)` with the
  **full 40 on its `title`**. 40 monospace characters at 10 px is ~240 px —
  wider than a widget, and most of the overprinting in the reported
  screenshot. The wire is untouched: `Layer1WireCommit.hash` is part of the
  frozen contract, so truncation happens only at render.
- **Dashed leader line, bubble top → ruler (#250).** Every widget carries a
  `.filebox::before` horizontal dashed rule so a bubble can be traced to its
  timestamp without eyeballing the vertical position. `top: -2px` cancels the
  2 px border so the line sits on the **border-box top edge**, which is
  `margin-top: var(--axis-px)` — precisely the ruler tick for the bubble's
  first instant. `right: 100%` starts it at the bubble's left edge running
  leftward, and the opaque sticky gutter paints over the excess, so it appears
  to begin at the gutter's right edge at every scroll position. Its width is
  `calc(100vw / var(--zoom, 1))`: a visible bubble is by definition less than
  one scrollport width right of the pinned gutter, and dividing by the
  inherited `--zoom` cancels `.canvas`'s scaling so the *rendered* length is
  exactly 100vw at every level. A fixed px width is WRONG here — 100,000 px
  was tried and left 291 of this repo's 805 widgets short on a ~156,000 px
  canvas. `isolation: isolate` on `.canvas` is load-bearing, not tidiness:
  `zoom` creates a stacking context only when it is not 1, so at 100 % the
  leader's `z-index: -1` would otherwise escape to the root and paint behind
  `.viz-root`'s opaque background, invisible.

**Testing is split by concern (user-directed 2026-07-25).** Path extraction
and placement are tested separately: the #232 test asserts *only* which paths
land in `pairs` / `gitOrphans` / `diskOrphans` — no `axisPx`, no timestamps,
no ruler data — and #240 covers vertical placement on its own.

- Verify: **acceptance test (user-defined) — point `dir` at a folder of files and `repo` at an unrelated repo; the timeline shows exactly the two orphan bucket widgets and zero pair widgets.** Path test (#232, paths only): a partial-overlap fixture yields the right three sets, and the unrelated-repo case yields empty `pairs` with every repo path in `gitOrphans` and every disk path in `diskOrphans`. Placement test (#240): pair widget offset = its first commit, node offsets within a widget, buckets at their earliest member, capped-gap rule end to end (5-hour gap → 12.5 px, 6-week gap → exactly 24 px, order preserved), and a disk orphan predating the first commit landing at 0. Unit tests: disk walk excludes `.git`/`node_modules`/gitignored paths AND submodule contents. DOM test (#237): widgets, nodes and buckets render at the offsets the endpoint supplies. Feedback-fix tests (#241-#243): the progress strip shows while the view streams and hides when it ends, a counted line fills the bar to its fraction, a terminal error line lands in the crumb; the zoom buttons scale the canvas and the readout tracks, and zoom-out clamps at the minimum; a commit label shows the short hash and reveals the full one on hover while the on-disk label carries no title at all.
- Tasks: #230, #231, #232, #233, #234, #235, #236, #237, #238, #239, #240, #241, #242, #243, #244, #245, #246, #247, #248, #249, #250, #251, #252, #253, #254, #255, #256, #257, #259, #260, #261, #262, #263, #264, #265, #266, #267, #268, #269, #270, #271, #272, #273, #274, #275, #276, #277, #278, #279, #280, #281, #282, #283, #284, #285, #286, #287, #288, #289
- Status: DONE 2026-07-25 — milestone COMPLETE, all eleven tasks (#230-#240) closed. The basic render is functional (RevEng@9ca446d) and the user has since exercised it against the live jfred repo; their refinement feedback — a progress indicator while Layer 1 computes, zoom in/out for large repos, a minimum y-gap so nodes stop colliding, 8-character commit hashes, a .gitmodules-aware disk walk so submodule contents stop filling the no-repository-match bucket, and a ruler pinned to the left edge outside the scroll — is follow-up work tracked separately, not a reopening of this milestone. NOTE: many still-open tasks carry a "DEFER UNTIL AFTER THE LAYER 1 VIEW MILESTONE IS COMPLETE" prefix in their descriptions; that condition is now satisfied. Done 2026-07-25, staged: #230 (`walkCurrentFileState`, jfred/src/layer1_disk_walk.ts), #231 (`listRepoTreeAtRef`, jfred/src/layer1_repo_tree.ts), #234 (`resolveInstantOffsets` + the locked 2.5 px/hr and 24 px constants, jfred/src/layer1_ruler_axis.ts) and #236 (the picker already shipped in jfred/src/viewer_server.ts; its server test now drives both branches through a fake `osascript` on the child's PATH — kept a GET, not the POST the task named, since it is side-effect-free and webapp/app-header.ts already calls it that way). Also done 2026-07-25, jfred@7e0c9c2: #232 (`pairDiskFilesAgainstRepoPaths`, jfred/src/layer1_pairing.ts — exact relative-path join emitting the user-settled shape `{ pairs, gitOrphans, diskOrphans }`, the rename to those names being a follow-up staged on top of that commit; an empty bucket is an empty list, so "omitted when empty" is the renderer reading that emptiness rather than the joiner encoding it. Its test asserts PATHS ONLY per the 2026-07-25 split — placement is #240), #233 (`listPairCommitHistory`, jfred/src/layer1_commit_history.ts — layered_git_beacons.ts's `listCommitsTouchingFile` was EXPORTED and re-typed to `Path` rather than a second git-log reader being written; Layer 1 drops the blob read, so unlike a Layer-2 beacon a delete-commit still counts as a touch) and #239 (see the S8 entry above). Also done 2026-07-25, staged: #235 (`handleLayer1ViewRequest` + `buildLayer1View`, jfred/src/viewer_api_layer1.ts, routed as `GET /api/layer1-view?dir=&repo=&ref=` in jfred/src/viewer_server.ts — a NEW surface beside /api/layered-graph that reads no JSONL. It composes the five layer1_* modules and passes `pairs`/`gitOrphans`/`diskOrphans` through unchanged, adding per-node `axisPx` plus a `ruler` array of the view's distinct instants ascending; a pair carries `{ path, commits: [{ hash, instant, axisPx }], onDisk }` and a bucket row `{ path, instant, axisPx }`, rows sorted ascending so a bucket's placement is its first row. `dir`/`repo` are validated for existence-and-is-a-folder at the boundary and a bad ref is caught by listRepoTreeAtRef, so all three bad inputs are a 400 carrying the message with no stack. REQUIRED SIDE FIX: `listCommitsTouchingFile` logged from HEAD unconditionally, so a non-HEAD `ref` paired that ref's tree against HEAD's ladders — it now takes an optional `ref` defaulting to the newly exported `ACTIVE_BRANCH_REF`, passed through by `listPairCommitHistory`, and was converted from an `execSync` template to a `spawnSync` argument array because the ref is now URL input that must never reach a shell). Also done 2026-07-25, staged: #237 (jfred/webapp/layer1.html + jfred/webapp/layer1-page.ts — markup and CSS lifted from plans/layer1-mockup.html, served by the existing `/app/*` static handler so viewer_server.ts needed NO change. The wire stays frozen: `axisPx` is ABSOLUTE per node and the page's one permitted arithmetic operation is subtracting `pair.commits[0].axisPx` for widget-relative node offsets — the user settled this 2026-07-25 rather than reopening #235's shipped contract to carry a per-pair widget offset. Each bucket binds its own wire property to its own title, so an invisible gitOrphans/diskOrphans swap cannot pass. DEFECT CAUGHT BY THE DOM TEST: `fillSourceBoxesFromUrl()` was defined but never called by `bootLayer1Page()`, so a `?dir=&repo=&ref=` link would have opened an empty form and drawn nothing — the shareable link, which is the page's whole input contract, was dead; fixed and pinned by a URL round-trip test. `bootLayer1Page` is exported deliberately: node's module cache runs a top-level boot only on first import, so DOM tests must re-boot per document) and #240 (jfred/tests/viewer_api_layer1_placement.test.ts — the 250-line cap forced a split from tests/viewer_api_layer1.test.ts, which keeps the #232 path and bad-input cases, with the shared fixture extracted to tests/layer1-view-test-helpers.ts; each file spawns its OWN viewer on its own port, 18900 and 19400, since two suites sharing a port fail in a way that looks nothing like a port problem. The fixture gained a disk orphan six weeks before the first commit and a retimed second commit, giving the hand-derived ladder 0 → 24 (six weeks, capped from 2520) → 36.5 (+5 h = 12.5) → 44 (+3 h = 7.5) → 68 (+20 h, capped from 50) — both cap directions and the pre-first-commit anchor proven end to end through the endpoint rather than against the resolver. Expected values are derived by hand, never by calling resolveInstantOffsets, or the test would agree with any bug. src/viewer_api_layer1.ts needed no change: the endpoint was correct. A second git orphan was skipped — both buckets sort through the same `orderRowsByInstant`, so one multi-member bucket proves the ordering). Also done 2026-07-25, staged: #238 (jfred/tests/layer1-acceptance.test.ts — the MILESTONE ACCEPTANCE TEST, on its own port base 19900. Every other Layer 1 test exercises one half; this one runs a real folder and a real UNRELATED repo through the real GET /api/layer1-view on a spawned viewer into the real page render, asserting zero pair widgets, exactly two buckets, and which path lands in which bucket. The page fetches a RELATIVE url and node's native fetch rejects those, so the harness supplies ONLY the origin via a new `forwardFetchToOrigin` in tests/webapp-dom-test-helpers.ts (built on a `NATIVE_FETCH` captured at module load, so it can never forward through `stubFetchRoutes`); the route, the git reads and the response are all real — canning the view would have made this a second copy of the #237 DOM test. New UNRELATED fixture builders sit BESIDE the overlapping ones, which three files depend on: two commits of one file each so the gitOrphans rows carry different instants, and a nested `docs/readme.md` so a bucket listing basenames instead of repo-relative paths is caught. `flushAsyncWork` is deliberately NOT used — three zero-delay turns cannot hold a real HTTP round trip plus git subprocesses — so the exported `loadLayer1View` promise is awaited instead, and `bootLayer1Page()` is called for EVERY document because it is what seeds the header boxes `loadLayer1View` reads and node's module cache runs the top-level boot only on first import. src/viewer_api_layer1.ts needed no change: an independent probe confirmed the endpoint already returns the hand-derived ladder 0/12.5/36.5/44 for the unrelated fixture). Remaining: none — every task in this milestone is closed.
- Supersedes: task #221 ("timeline bubble reading 'no snapshots available' for files with no snapshots and no commit reference"), removed from tasks.json 2026-07-25 — such a file is now a member of the "No repository match" bucket, which carries the same information without a per-file empty widget.
- Formerly a "known cosmetic issue, deliberately not solved": at 2.5 px/hr two commits ~20 minutes apart resolved under 1 px and their 15 px dots overlapped, because there was a cap on gaps but no floor. Real data DID make it unreadable, so it is now **SOLVED** by the 16 px per-gap floor (see "Ruler scale — floored linear, capped" above). Measured against the live jfred repo: the smallest gap between two nodes inside one widget is exactly 16 px, and 0 of 2,141 rendered node labels overlap another.
- Follow-up feedback fixes, done 2026-07-25 (#241-#244): the disk walk now asks git (`git ls-files -z --cached --others --exclude-standard`) instead of hand-rolling exclusion, which is what finally emptied the "No repository match" bucket of submodule contents; `listRepoTreeAtRef` was RENAMED to `readRepoTreeAtRef` and now returns `{ trackedFiles, submodulePaths }`; the ruler gained the 16 px floor and its cap rose 24 → 120; `?progress=1` added the NDJSON stream and with it the `viewer_api_layer1.ts` → `viewer_api_layer1_route.ts` split; the page gained the sticky ruler gutter, the zoom control and 8-character hash labels. Measured against the live jfred repo before and after: pairs 832 → **833**, repo-only 4 → **0**, disk-only 6,415 → **8** (every remaining row a genuinely untracked file created during this work). `pairs` moving to 833 is not over-reach — the repo tracks 837 paths of which four are gitlinks, so all 833 real tracked files now pair; the old hand-rolled matcher applied `.gitignore` patterns to TRACKED files, which git does not do, and was dropping one.
- Formerly an open observation from #241-#244 — a ruler tick sitting **32 px above** the node it marks (`.filebox`'s 2 px border plus its top padding, between the box's `margin-top: var(--axis-px)` anchor and the `.lane` its nodes sit in), with the decision left open between shifting the lane up by the header inset or accepting it as the header's cost. **DECIDED 2026-07-25: accept the inset, and make the correspondence traceable at the box edge instead.** Shifting `margin-top` to align the first node would leave the bubble's top edge corresponding to no instant, and that edge is exactly what #250's leader line points at. The inset is now **52 px** (the padding rose 30 → 50 for #247), and the thing the reader traces is the bubble's top edge, which matches its tick within 1.5 px for all 807 widgets at every zoom and scroll position.
- Follow-up visual fixes, done 2026-07-25 (#245, #247, #250) — all in `jfred/webapp/layer1.html` plus one line of `jfred/webapp/layer1-page.ts`: **#245** a pair bubble is now labelled with the file's **BASENAME**, full path on its `title`, bounded by `max-width: calc(100% - 24px)` + `text-overflow: ellipsis` so a long name can no longer spill past the border onto its neighbours. Truncating the *full path* was rejected on the evidence — six sibling bubbles all render `demo-baseline/file-hist…`, so the shared prefix survives and the distinguishing tail is what gets cut; the basename inverts that. Folder context is deferred to the File Nav tree (#252-#255), so two files sharing a basename are separable only by hover until then. **#247** `.filebox`'s padding-top is now **DERIVED, not chosen**: `.sub` is abspos at `top: 24px` with a 15 px line box so the header ends at y 39, and a `--axis-px: 0` node reaches 10 px above the lane top (7.5 px half-height + its 2.5 px ring), giving 49 → **50 px**. That is what stopped the commit node and its short-hash label overprinting the "N commits · on disk" line; nudging the node instead would have made it lie about its own timestamp. Move `.fname`/`.sub`'s `top` or font sizes and the value must be redone. **#250** see "Dashed leader line" above. Verified in a real headless engine against this repo's own 807 widgets across five scenarios (zoom 100 % and 64 %; unscrolled, scrolled 1,200 px, 120,000 px, and to the far edge at 155,362 px): zero names escaping their bubble, zero commit-node/header collisions, zero leader failures, every bubble top on its tick.
- **Widget anchor = its EARLIEST node, span = to its LATEST, whichever KIND each is (#247/#248/#249, 2026-07-25).** `buildPairWidget` anchored on `pair.commits[0].axisPx` unconditionally and hardcoded its span to the on-disk node, so a file whose disk mtime PREDATED its first commit produced a negative `onDisk.axisPx − startPx`. The disk node is abspos in the lane under `translate(-50%, -50%)`, so a negative offset drew it above the lane top — over the widget's own filename/sub header, or clear outside the bubble — and the lane was simultaneously too short to contain a ladder whose last node was a commit. Both are now one `nodePx` list: `startPx = Math.min(...nodePx)`, `--span-px = Math.max(...nodePx) − startPx`, which also covers an empty ladder without a fallback. The anchor stays a REAL ruler tick (the `ruler` array carries every instant the view draws, on-disk included), so #250's leader keeps pointing at something. This is the single root cause behind all three reported shapes — a hash below a bubble (#248), an "on disk" above one (#249), and both overprinting the header inside one (#247's second report, `specs/bug screenshots/on-disk collision inside bubble.png`). Measured on the live jfred repo: disk-node header collisions **250 → 0** across all 808 widgets at both zoom levels and every scroll position, with names, leaders and tick alignment still clean.
- **Same-instant nodes carry a grouping rectangle (#259, done 2026-07-26, jfred@d4e4ca3).** #251 stopped a tie overprinting by charging that instant one 22 px row per tied node, which destroyed the information that the rows were one moment. `webapp/layer1-tie-groups.ts` restores it: a tie is an equality test on the wire's own ISO `instant` strings — nothing in `layer1_ruler_axis.ts` or the wire format changed — and ties are always a CONTIGUOUS run, because `listPairNodeLadder` emits commits oldest-first then the on-disk node and the axis charges tied nodes consecutive rows in that same order, so grouping is one linear pass. The rectangle's geometry is DERIVED from `.node` (centred on `--axis-px`, 15 px + a 2.5 px ring): `top: --axis-px − 11px`, `height: --span-px + 22px`, `left: -11px`. It carries no `z-index` on purpose — appended before the nodes, DOM order alone keeps it behind the dots (`z-index: 6`) and their labels. Note the tie the user actually meets most often is commit-vs-commit, not commit-vs-mtime: git commit stamps are second-precision and a rebase collapses several onto one committer instant (#282 adds an author/committer toggle for exactly that).
- **File Nav pane, reusing the shared tree (#252, done 2026-07-26, jfred@d4e4ca3).** `webapp/layer1-filenav.ts` constructs `FileSidebarEntry`-shaped rows from the `/api/layer1-view` payload — `pairs` (commit count, present), `gitOrphans` (count 0, `isDeleted`), `diskOrphans` (count 0, present) — and hands them to the EXISTING `buildFileTree` + `renderFileTreeNode`; `buildFilesSidebarViewModel` is not reused because it consumes a `WireTimelineDocument` Layer 1 does not have. The pane is a flex sibling of `main.timelines` inside `.stagewrap`, so it lands left of the sticky ruler with no involvement in the zoomed `.canvas`. Two things the CSS forced: `layer1.html` never loads `styles.css`, so the tree's rules were copied and retargeted at this page's tokens (no `--mono/--text/--sel/--sel-hover/--guide/--orange` here), and `.minimap` is abspos against `.stagewrap`, so its `left` had to grow by the pane's width.
- **Jumping to a bubble aligns its TOP, not its middle (#277, done 2026-07-26).** `scrollIntoView({ block: "center" })` centres a box that is as tall as its own ladder span, so a long-history bubble's name and first node land far above the viewport — which reads as "only the horizontal scroll worked". Now `block: "start"` with `inline: "center"` kept, in one shared `landOnBubble`, plus `scroll-margin-top: 14px` on `.filebox`. `layer1-ruler-click.ts` carried the identical call and was fixed with it.
- **A File Nav click is not a search (#278, done 2026-07-26).** #252 wired `onFileClick: jumpToNamedBubble`, which substring-matches, keeps a cycle counter and writes `find "<term>": n of N` into the crumb — so clicking the root `.gitignore` walked every nested one, and no substring rule could ever have picked the root, its path being a substring of all the others. `jumpToBubbleAtPath` matches the `.fname`'s recorded path for EQUALITY (the `title` attribute then, `data-path` since #280), holds no cycle state and writes no counter; an unmatched path (an orphan, which lives in a bucket rather than a bubble) reports that instead of failing silently.
- **The minimap clears the ruler (#269, done 2026-07-26).** `.minimap` is abspos against `.stagewrap`, which spans the gutter as well as the stage, so `left: 12px` sat on the ruler. It became `calc(232px + 82px + 12px)` — File Nav width, gutter (`--rail-x` 80px + the rail's 2px border), inset — and #279 has since replaced the first literal with the shared `--filenav-w` property and the second with 120px, `--rail-x` having grown to 118px for #276.
- **Folder deselect was already shipped (#254, closed 2026-07-26, jfred@4d9eab7).** No code: #253's `attachFolderClick` reads `wasSelected` off the row's own class, so clicking the selected folder again clears it and calls `onFolderClick([])`, which `filterLayer1ViewByTargets` treats as "no filter" and re-lays out the full view and the full timestamp range. The multi-folder deselect the user described belongs to #255 (shift-click multi-select).
- **Find-box cycle buttons, and a readout that clears (#271 + #273, done 2026-07-26).** The find box wrote `find "<term>": n of N` into `#crumb`, which also carries the stage's pair and orphan counts — so a search destroyed them and emptying the box left a dead result behind with nothing able to restore them. The readout now has its OWN `#find-status` element in the `.sources` row, making "clear it" one empty string rather than a save-and-replay of the crumb. `selectNextMatch` became `selectMatchAtStep(term, step)` — `(cycleIndex + step + matches.length) % matches.length`, the `+ matches.length` being what makes -1 wrap to the LAST match rather than yield a negative index — driven by new `‹`/`›` buttons beside the input, with Enter unchanged. Emptying the box drops all three pieces of a live search together (readout, lit bubble, cycle position); an `input` listener, not `keyup`, so a paste, a cut and the field's native clear button all count. **#272 was dropped** on user direction: its subject (the Enter-cycles hint hidden while typing) stops existing once the buttons are a visible affordance. TRAP the tests caught: the cycle position is MODULE scope, so a fresh happy-dom document does not reset it — two tests searching one term had the second resume at the first's position.
- **The ruler shows seconds and hundredths (#276, done 2026-07-26).** `formatInstantLabel` sliced the ISO string at 16, giving `MM-DD HH:MM` — so instants seconds apart rendered as IDENTICAL text, which is the direct cause of the duplicate-looking rows in #268. Now `slice(5, 22)` → `MM-DD HH:MM:SS.hh`, the precision the user gave in #275 (`07-18 19:42:08.22`); the third millisecond digit is dropped rather than rounded because this is a label, not a value anything computes from. 17 characters at 10 px does not fit the old gutter, so `.ruler .tick`'s width went 70 → 108 px and `--rail-x` 80 → 118 px, keeping the same 10 px of clearance between label and rail.
- **A truncated bubble name reveals itself in-page (#280, settling #270, done 2026-07-26).** `.filebox .fname` ellipsises at the bubble's 168 px and the full path was reachable only through the native `title` tooltip, which the user rejected — delayed, unstyled, gone on the first mouse move. `:hover` now lifts `max-width` and `overflow`, so the name simply runs past the bubble; the opaque background and `z-index: 7` are load-bearing, not decoration, because `.stage`'s bubbles sit 26 px apart and 7 is DERIVED — above `.node`'s 6 so the revealed name covers its neighbours' dots, below `.ruler`'s 8 so it still scrolls under the sticky gutter. Suppressing the tooltip means not having the attribute, so the full path moved to **`data-path`**, which is also the find box's haystack and the File Nav jump's identity — the three readers in `layer1-find-file.ts` moved with it. File Nav ROWS keep their `title`: they are not width-truncated and have no hover reveal to make it redundant.
- **The File Nav is drag-resizable (#279, done 2026-07-26).** `.filenav`'s width was a hardcoded `232px` that `.minimap`'s `left` repeated, so a drag would have moved one and not the other. One `--filenav-w` custom property on `.stagewrap` — the nearest common ancestor of both — now drives both, and the duplicated literal #269 flagged is gone. The handle is a 6 px `.filenav-grip` straddling the pane's right edge, abspos against `.stagewrap` so grabbing it cannot itself change the layout it is measuring; `webapp/layer1-filenav-resize.ts` writes the property on pointer move, clamped 120-640 px, listening on the WINDOW rather than the grip because a fast drag outruns a 6 px handle. Native `resize: horizontal` was REJECTED: it grabs at the bottom-right corner rather than the edge the user asked for, and it writes the element's own width, which no other rule can read.
