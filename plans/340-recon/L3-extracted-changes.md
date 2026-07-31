# L3 recon — timeline nodes for code changes extracted from JSONL

Phase-1 recon for task #340 (spec item S20 to follow after grilling).

## Event model (what the engine extracts today)

`extractFileEvents` (src/reconstruction_extract.ts) emits, sorted by
timestamp (`EventKind` in src/structures/vocabulary.ts:97-107):

- **write** — Write tool_use → `{changeId, target, content, timestamp}`, full content.
- **edit** — Edit tool_use, only when a `structuredPatch` was indexed from its
  tool_result; carries `{changeId, target, hunks, originalFile?, timestamp}` —
  hunks, not full content.
- **rename/copy/append/overwrite/delete** — from Bash parsing +
  `extractScriptRenameEvents`; append/overwrite content filled during replay
  from the sidecar.
- **user-edit** — `edited_text_file` attachment, full content.
- **script-execution** — distinct provenance kind (L4's subject, not L3's).

`changeId` (the tool_use block id) is the join key to a JSONL line
(`refsByChangeId`, layered_load.ts:56-70 → `JsonlRef{sessionFile, line}`).
Read echoes are NOT FileEvents — they become beacon/preAnchorStub nodes via
`collectReadEchoNodes` (layered_anchor.ts:92-102).

## The gap L3 fills

`LayeredNodeKind` (vocabulary.ts:125-131) =
`beacon | preAnchorStub | endState | presumedUserEdit | scriptRun`.
**No derived-edit node kind exists.** An edit event either becomes a beacon
(if `originalFile` present) or a byteless preAnchorStub; its hunks never
reach a timeline node — they are consumed only by the separate
`reconstruction_*` replay pipeline. L3 = a new node kind between stub and
beacon, carrying hunks (+ optionally replay-derived content).

## Verification cost

- `applyEdit` (reconstruction_replay_edit.ts:155-168) and
  `firstHunkMatchesBase` (reconstruction_reseed.ts:22-38): pure in-memory.
- The expensive part is upstream: `reconstructedBaseText` replays the whole
  prior lineage (O(events) per edit), still in-memory.
- `BackupReader` sidecar disk reads only on the stale-base fallback
  (`editBaseIsStale` → `staleEditSeedFor`). No sandbox anywhere in L3.

## Reusable AS-IS

- Path join: `relativizeToProjectFolder` (layer1_snapshot_wire.ts:16-23) —
  absolute event targets → repo-relative pair keys, exactly as snapshots do.
- JSONL Nav flash: node `data-session-id`/`data-session-file`/`data-line`
  attrs (layer1-widgets.ts `appendSnapshotNode`:27-37) →
  `describeNode` (layer1-drawer.ts:38-53) → `flashSession`
  (layer1-sessions.ts:97-119).
- Ruler/axis: `layOutNodeLadders` is generic over instants.
- Fixture self-check pattern (born ≤ event ≤ mtime etc.,
  viewer_api_layer1_fixture_data.ts:134-149).
- Layer gating: `layer1-layer-toggle.ts` sets `data-layer` on `.viz-root`;
  CSS hides `.n-snap` below 2 — "always ship on wire, CSS hides".

## Thin adapters needed (the seams)

1. `buildEditDerivedNode` beside `buildNodeFromEvent` (layered_load.ts:99-109):
   emit the new node kind for edit events instead of discarding to stub.
2. Wire: `edits?: WireEditOf<I,P,U>[]` on `WirePairOf`
   (webapp/layer1-wire.ts:26-35, the `snapshots?` precedent) + entries in
   `listPairLadderInstants`/`listOrphanLadderInstants` (wire.ts:96-109).
3. View build: an edits triad mirroring
   `collectViewSnapshotsByRelativePath`/`placeSnapshotsOnAxis`/`listSnapshotInstants`
   in viewer_api_layer1.ts.
4. DOM: `appendEditNode` in layer1-widgets.ts, `.n-edit` class,
   `describeNode` branch in layer1-drawer.ts.
5. Fixture: `FIXTURE_EDITS` + accessor + self-check in
   viewer_api_layer1_fixture_data.ts, wired through viewer_api_layer1_fixture*.ts.
6. Switcher: `[3]` button + CSS rule hiding `.n-edit` below `data-layer="3"`.

## SETTLED (user, 2026-07-30)

### L3 ships in three stages

1. **Read events.** A Read tool result usually carries full file contents, so
   it becomes a beacon.
2. **Bash tool results that carry full file contents** (e.g. `cat FILE`) —
   also beacons.
3. **Edit / Write events.** Applied on top of the beacon immediately preceding
   them they produce a *provably verified* beacon, because the
   `structuredPatch` supplies base → target.

Bash as a **source of file changes** (rename/copy/append/overwrite/delete) is
OUT of L3. Bash appears in L3 only as a **beacon source** (stage 2).

### Nodes carry real bytes, with a confidence signal

Every node should carry its actual bytes, produced by replaying its event on
top of the previous event in that file's timeline. Where that is not
achievable, reuse the engine's existing confidence signalling (a lot of work
already went into it) rather than inventing a second scheme.

### Replay is lazy — triggered by clicking a node

- Click a node → find the nearest beacon *before* it and replay from there.
- Any earlier nodes in that file's timeline not yet populated with real bytes
  are replayed first, in order. A non-sequential replay always starts from the
  nearest preceding beacon.
- If the replay output matches the beacon *after* the clicked node, the node is
  marked **verified**; if it does not, **derived**. Either way the diff viewer
  shows the replay result.

### Drawer content for an edit node

The diff viewer: base = nearest verified beacon before the node, target = that
base with the record's oldString/newString / `structuredPatch` applied. If
several edit nodes sit between the clicked node and the beacon, each
intermediate node is computed first, in order.

Plus a button on the node showing the formatted raw JSON pulled straight from
the transcript. The old web app already had this — the `[{ }]` button on
timeline rows and revision-viewer cards. Port it; do not invent a new one.

### Provable beacons get a check mark

Not Read events alone: any event provable as a beacon (full-file Read, a
`Bash(cat FILE)` tool result) renders with a check mark — e.g. `[R]✓`.

### `scriptRun` is L4's, untouched here

Everything script-execution belongs to L4, including the trivially cheap part
(stamping a run's timestamp onto the axis).

### Layers are additive

Layer N renders its own node type on top of every earlier layer's nodes. The
layer buttons are essentially node-type filters — the extra job they do is
replaying that node type on top of the previous layer's beacons / computed
state.

## STILL OPEN

**A. When an edit's base can't be trusted, the engine silently swaps in a
backup blob — should L3 keep it silent?**
Sometimes an Edit's first hunk does not match the text the engine reconstructed
for that moment (a rewind, or the user changed the file outside Claude). The
engine detects this (`editBaseIsStale`, reconstruction_reseed.ts:41) and
splices in a synthetic Write seeded from the `~/.claude/file-history` sidecar
backup (`staleEditSeedFor`:127). **In the old web app this was invisible** —
the reseeded revision rendered as an ordinary numbered card with no badge; the
only trace is a provenance buffer that is disabled by default and that nothing
in the viewer ever switched on. Two questions for L3:
(a) does the sidecar read happen during the view build, or lazily when the node
is clicked (it is the one disk-touching step in L3 — everything else is
in-memory)?
(b) is a reseeded node still "verified", or does it get its own marker
distinct from verified/derived?

_Code re-check (2026-07-30):_
- _(a) **Lazy is cheap — the precedent already exists.** `seedStaleEditBases` is
  reachable only from reconstruction_branches.ts:130, a stage in the full
  reconstruction pipeline that layer1 never imports. But a per-HTTP-request
  sidecar read is already implemented for another node kind:
  `readSnapshotFileContent` → `createSidecarReader`
  (viewer_api_layer1_snapshot.ts:66-73), dispatched per request from
  viewer_api_layer1_file.ts:67-68. Copy that shape and "lazy on click" costs
  almost nothing new._
- _(b) **A reseeded marker would be a new concept.** `LayeredNodeKind`
  (vocabulary.ts:125-131) has exactly five members — beacon, preAnchorStub,
  endState, presumedUserEdit, scriptRun — and there is **no**
  provenance/confidence/verified field on any node or wire type
  (layer1-wire.ts: zero hits). It fits the existing enum-of-kinds pattern, but
  it is an addition, not a relabel._

**B. One edit belongs to one session — but one file's timeline holds several
sessions. How do L3 nodes show that?**
A `changeId` maps to exactly one session file, so an individual edit node is
never ambiguous. The ambiguity is at file level: `loadLayeredProject` builds
one `sessionTimelines[]` per file, one entry per session that touched it
(layered_load.ts:161-171) — so a file's L3 nodes can come from several
sessions. In the old web app you saw this as the **sessions sidebar** on the
left, and clicking an entry flashed that session's first timeline row.
So: do edit nodes from different sessions interleave on the file's single row
(distinguished only by the flash/sidebar), or does each session get its own
lane? And does an edit node get the `data-session-*` attributes so JSONL Nav
can flash it, as snapshot nodes already do?

_Code re-check (2026-07-30):_
- _The **attributes half is settled** — just follow the contract.
  `appendSnapshotNode` (layer1-widgets.ts:28-38) stamps
  `data-version`/`data-session-id`/`data-session-file`/`data-line` on both dot
  and label; `describeNode` (layer1-drawer.ts:38-53) reads them back. A new
  node kind copies that verbatim._
- _The **lane half is contingent, not open.** Layer 1 has no multi-lane
  machinery at all: `buildPairWidget` (layer1-widgets.ts:41-48) builds exactly
  **one** `.lane` div per bubble, with created/commits/onDisk/snapshots
  flattened into it. Per-session lanes exist only in the older, separate
  `layered-app.ts:128-135` viewer. So "interleave vs one lane per session"
  cannot be decided here — it is downstream of L5's branch-lane mockup
  decision, which is the thing that would introduce lanes in the first place._

**C. Which fixture files get the mockup's edit nodes?**
The layer-1 fixture (viewer_api_layer1_fixture_data.ts) already has two tiers:
4 hand-written sessions with real-looking titles and 7 snapshots total, plus 7
loop-generated `bulk-N.jsonl` sessions with 105 snapshots whose only job is to
make both scroll axes real. It has no edit-node concept yet. Options:
(a) add edit nodes to the 4 hand-written sessions — reuses their already-
consistent born/commit/disk timestamps and the existing import-time self-check
for free, but the demo file gets longer and edits sit among unrelated
snapshots;
(b) author a separate small edit-only fixture, which keeps L3 review isolated
but must import this file's `sessionIdFor`/`sessionFileFor`/`ms()` helpers to
avoid duplicating the machinery.
Also: do the bulk sessions need edit nodes at all, or is scroll-stress already
covered by their snapshots?
