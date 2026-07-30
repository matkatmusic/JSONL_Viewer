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

## AMBIGUITIES (for the grilling round)

1. Drawer content for an edit node: raw hunks only, replayed full file, or
   hunks + lazy replay on demand?
2. New `LayeredNodeKind.derivedEdit` — bytes-carrying (replay attempted) or
   stub-like? Changes presumption-gap detection (layered_end_state.ts).
3. Scope: every Write/Edit/Bash event a node, or only edits currently lost
   to stubs? (Is L3 additive or a reclassification?)
4. Replay at view-build time (adds cost to ~10 s build) vs lazy per node?
5. Is the BackupReader stale-base fallback needed at build time, or lazily
   on node click?
6. Session attribution: edit changeId → one session always; any
   multi-session case to design for?
7. Are Bash-derived rename/copy/append/overwrite/delete in L3 scope, or
   Edit/Write hunks only?
8. Read echoes: visually distinguish "verified via Read echo" from
   "derived, unverified"?
9. `scriptRun` enum member already exists unused — reserved for L4, or does
   L3 need to avoid/coordinate with it?
10. Click behaviour: Diff pane on the hunk (cheap), or replayed base-vs-after
    diff like commit nodes?
11. Switcher stacking: layers additive (3 shows 2's snapshots too) — assumed
    yes per data-layer CSS, confirm.
12. Fixture volume: edits on the same fixture files as SNAPSHOTS, or a
    hand-authored small set?
