# Task 315 — draw 📸 snapshot nodes on the file bubbles

## Context (traced end to end)
- Task 312 already ships snapshots on the wire. `WirePair.snapshots?: WireSnapshot[]`
  and `WireOrphan.snapshots?` (webapp/layer1-wire.ts). Each `WireSnapshot` carries
  `{ instant, axisPx, version:number, sessionId, sessionFile, line? }`. Key OMITTED when empty → `?? []`.
- Slotting is already baked into `axisPx` server-side. `layOutNodeLadders` +
  `assignRowSlots` (webapp/layer1-ruler-axis.ts) charge tied nodes consecutive 22px rows;
  the ladder order is created?, commits, onDisk, **snapshots appended** (viewer_api_layer1.ts
  `listPairNodeLadder`, mirrored in webapp/layer1-filter.ts). So a snapshot tied to the mtime
  (mockup src/index.ts @v3) already has a DISTINCT axisPx one row below onDisk. Drawing is all
  that's left — no re-layout.
- Bubble builder: `buildPairWidget` in **webapp/layer1-widgets.ts** (75 lines, NOT at cap).
  Nodes are placed at `axisPx - startPx`. Tie-group rectangle from `buildTieGroupMarkers(ladder, startPx)`.

## Scope
Pair bubbles only. Orphan buckets are plain lists (mockup addBucket draws no per-node dots) — out of scope.
Render only; the [2]/[3] toggle is task 314, click behaviour is task 317.

## Changes
1. **webapp/layer1-widgets.ts** (inline, not a new module — this file is not at the cap):
   - `const snapshots = pair.snapshots ?? [];`
   - ladder becomes `[...created?, ...commits, onDisk, ...snapshots]` (matches the server order
     EXACTLY → tie-group contiguity + span both correct).
   - new `appendSnapshotNode(lane, axisPx, snapshot)`: dot `node n-snap` + label `nlabel n-snap`,
     label text `@v${version} 📸`, identity on BOTH elements as `data-` attrs (task 280 precedent,
     NOT title): `data-version`, `data-session-file`, `data-line` (omitted when line undefined).
     `n-snap` on both = single hide handle for task 314.
   - loop `snapshots` after the onDisk append.
   - import `WireSnapshot`.
2. **webapp/layer1-styles.css** after `.n-created`: `.node.n-snap { background: var(--c-snap); }`
   — `.node.` scopes the fill to the dot so the label's `n-snap` stays a plain hide handle.
3. **webapp/layer1.html** legend: add `<span><i style="background:var(--c-snap)"></i> 📸 file-history snapshot (Layer 2)</span>`
   after the "created at" swatch (S12 — legend not optional).
4. **tests/layer1-page-snapshots.test.ts** (happy-dom, mirrors layer1-page-spans.test.ts harness):
   - a pair with 2 snapshots → two `.node.n-snap` dots + labels at their `axisPx-startPx`,
     text `@v1 📸`/`@v2 📸`, data attrs present.
   - a snapshot-free pair → zero `.n-snap`, bubble anchor/span unchanged from Layer 1.
   - a snapshot sharing the onDisk instant (distinct axisPx, one row below) → both nodes at their
     own offsets (not overlapping) and a `.tiegroup` marker present.

## Verify
`node --import tsx --test tests/layer1-page-snapshots.test.ts` + typecheck.
