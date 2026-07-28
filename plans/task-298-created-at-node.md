# Task 298 — the Layer 1 "created at" node

Draw the mockup's `created at` node (plans/layer1-mockup.html lines 316, 518, 743-755, 955-971)
in the shipped Layer 1 View, sourced from each file's birthtime.

## Reliability rule (decided here, documented in spec S18)

A birth instant yields a `created at` node ONLY when it is strictly EARLIER than the file's mtime
and later than epoch 0. On macOS/APFS birthtime is real; on ext4 it is frequently 0 or a copy of
mtime, and a copied file can report a birth LATER than its mtime. Each of those degenerate answers
produces NO created node rather than a false one — which also means a file born and last modified
at the same instant keeps exactly one disk node, as today.

## Steps

1. `jfred/src/layer1_disk_walk.ts` — `DiskFileState` gains optional `createdAt`, filled by one
   `readCreatedInstant(stats)` helper applied at BOTH statSync call sites.
2. `jfred/src/viewer_api_layer1.ts` — `Layer1WirePair` gains optional `created`;
   `listPairNodeLadder` emits it FIRST (commits oldest-first, then mtime last), and
   `placePairNodesOnAxis` reads the commits back at that same one-node shift. Ladder ORDER only
   decides which tied node takes the upper row — offsets are looked up per instant — so
   created-first is safe regardless of where the birth instant falls against the commits.
3. `jfred/webapp/layer1-wire.ts` + `jfred/webapp/layer1-filter.ts` — mirror both exactly, or a
   folder filter's client-side re-layout disagrees with the shipped offsets.
4. `jfred/webapp/layer1-widgets.ts` — `buildPairWidget` draws `n-disk n-created` labelled
   "created at" and puts it in the ladder task 259's tie markers read.
5. `jfred/webapp/layer1-styles.css` + `jfred/webapp/layer1.html` — the dotted rule and the legend
   swatch, copied from the mockup.
6. `jfred/webapp/layer1-drawer.ts` — a `.n-created` node is INERT (mockup's `hot` rule); its label
   carries `title="created-at is not the latest on-disk state — nothing to show"`.
7. `specs/from-scratch-SPEC.md` (S18) — replace "birthtime is not portable, so it is never read".
8. One test in `jfred/tests/` covering the reliability rule and the ladder shift.

## Not done

Existing placement tests build their fixtures in a tmpdir, where birth === mtime, so no created
node appears and their hand-derived ladders stand unchanged.
