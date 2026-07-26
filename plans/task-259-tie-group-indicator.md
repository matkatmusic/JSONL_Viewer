# Task 259 — Layer 1 View: group same-timestamp nodes behind one rounded rectangle

## What this changes

A pair widget draws one node row per ladder entry. Task 251 gave two nodes that share ONE instant
their own stacked rows (`RULER_NODE_ROW_PIXELS = 22`, `src/layer1_ruler_axis.ts:49`), which stopped
them overprinting but also erased the fact that they were simultaneous. This adds a rounded
rectangle drawn behind every run of 2+ nodes in one widget that share an instant.

## Facts the implementation relies on (verified, do not re-derive)

- `/api/layer1-view` ships every node's own `instant` as ISO text plus an absolute `axisPx`
  (`webapp/layer1-page.ts:24-38`). Two tied nodes therefore have EQUAL `instant` strings and
  DIFFERENT `axisPx`.
- The ladder order on the wire is `[...commits (oldest first), onDisk]`
  (`src/viewer_api_layer1.ts:89` `listPairNodeLadder`), and the axis charges tied nodes consecutive
  rows in that same order. So a tie is always a CONTIGUOUS run in the ladder — no sort, no grouping
  map is needed, one linear pass over the ladder is sufficient and correct.
- A node is centred on its offset: `.node` is `top: calc(var(--axis-px) * 1px)` with
  `transform: translate(-50%, -50%)`, 15 px tall with a 2.5 px ring
  (`webapp/layer1-styles.css:195-197`). Its painted box therefore reaches 10 px above and below its
  offset and 10 px left of the lane's x=0.
- `.node` sets `z-index: 6`; `.nlabel` sets none (`webapp/layer1-styles.css:200`). A marker with no
  `z-index`, appended BEFORE the nodes, paints under both — which is why the marker must be appended
  first rather than given a z-index of its own.
- `layer1-page.ts` is 231 lines against the project's 250-line cap, so the new logic gets its own
  module (the pattern `layer1-sources.ts` / `layer1-find-file.ts` / `layer1-zoom.ts` already set).
- The Stop hook enforces `tests/<module>.test.ts` naming.

## Step 1 — RED: write the failing tests

Create `jfred/tests/layer1-tie-groups.test.ts`.

Model it on `tests/layer1-page-spans.test.ts`: `import { test } from "node:test"`,
`import assert from "node:assert/strict"`, and `setupLayer1Dom()` from `./webapp-dom-test-helpers.ts`
for a DOM (`el()` needs `document`). Call `buildTieGroupMarkers` DIRECTLY — do not boot the page;
the behaviour under test is pure element construction and a page boot would only add a stubbed
stream to the failure surface.

Shared fixture constants (a real 40-character hash, matching `layer1-page-spans.test.ts`'s reason:
a short fake would let a broken truncation pass):

```ts
const TIED_INSTANT = "2026-07-20T16:00:00.000Z";
// The fixture's README.md tie: commit 4d5e6f70 and the file's mtime land on the same instant, so
// task 251's axis gives them rows 0 and 1 — one RULER_NODE_ROW_PIXELS apart.
const TIED_COMMIT = { instant: TIED_INSTANT, axisPx: 100 };
const TIED_ON_DISK = { instant: TIED_INSTANT, axisPx: 122 };
const LATER_ON_DISK = { instant: "2026-07-21T16:00:00.000Z", axisPx: 160 };
```

Three tests, one behaviour each:

1. `test_two_nodes_sharing_one_instant_are_wrapped_in_one_group_marker`
   - Steps: build a ladder of `[TIED_COMMIT, TIED_ON_DISK]` with `startPx = 100`.
   - Assert exactly ONE element comes back.
   - Assert its `--axis-px` is `"0"` — the run's FIRST node, expressed relative to the widget's own
     anchor, which is the offset the marker is drawn at.
   - Assert its `--span-px` is `"22"` — first node offset to last node offset, i.e. the vertical
     distance the rectangle must cover.
   - Assert its `class` contains `tiegroup`.

2. `test_nodes_at_distinct_instants_get_no_group_marker`
   - Steps: build a ladder of `[TIED_COMMIT, LATER_ON_DISK]` with `startPx = 100`.
   - Assert an EMPTY array comes back. This is the case that must stay free: the overwhelming
     majority of pairs have no tie at all and must render exactly as they do today.

3. `test_a_run_of_three_tied_nodes_yields_one_marker_spanning_all_three`
   - Steps: ladder `[TIED_COMMIT, { instant: TIED_INSTANT, axisPx: 122 }, { instant: TIED_INSTANT,
     axisPx: 144 }]` with `startPx = 100`.
   - Assert ONE marker, `--span-px` of `"44"`. This pins that a run is grouped as a whole rather
     than pairwise, which is what would silently produce two overlapping rectangles.

## Step 2 — GREEN: the module

Create `jfred/webapp/layer1-tie-groups.ts`.

```ts
// Task 259: the rounded rectangle behind a run of nodes that share ONE instant.
//
// Task 251 stopped a commit and an on-disk mtime at the same instant from overprinting by giving
// each its own 22 px row — but once they are on separate rows nothing says they were simultaneous.
// This restores that: one rectangle per run, anchored on the single ruler tick the instant occupies.
//
// Its own module rather than more of layer1-page.ts, which is at the repo's 250-line cap.

import { el } from "./app-dom.ts";

// One ladder entry as the wire ships it. Structural, not imported from layer1-page.ts: that module
// imports THIS one, so importing back would be a cycle (webapp/views/sidebar.ts mirrors
// timeline-file-tree.ts's types for the same reason).
export interface TieGroupNode {
    instant: string;
    axisPx: number;
}
```

Then two functions:

- `function groupTiedLadderNodes(ladder: readonly TieGroupNode[]): TieGroupNode[][]` — one linear
  pass appending each node to the current run when its `instant` equals the previous node's, else
  starting a new run; return only the runs of length 2 or more. Comment WHY a linear pass is
  correct: ties are contiguous by construction of `listPairNodeLadder` + the axis's row charging.
- `export function buildTieGroupMarkers(ladder: readonly TieGroupNode[], startPx: number): HTMLElement[]`
  — map each run to
  `el("div", { class: "tiegroup" })` with `--axis-px` set to `run[0].axisPx - startPx` and
  `--span-px` set to `run.at(-1).axisPx - run[0].axisPx`.

Set the two custom properties with `element.style.setProperty(name, String(value))`, the same way
`layer1-page.ts`'s `setAxisPx` does. Do NOT import `setAxisPx` from `layer1-page.ts` — that is the
cycle named above; a two-line local setter is the smaller cost.

Comparison note (`~/.claude/guides/single-condition-branching.md`): the run test is ONE condition —
`node.instant === previous.instant`.

## Step 3 — GREEN: wire it into the widget

In `jfred/webapp/layer1-page.ts`'s `buildPairWidget` (line 118), replace the `nodePx` derivation so
the ladder itself is the local, then hand it to the marker builder:

```ts
    // The ladder in wire order — commits oldest-first, on-disk last (src/viewer_api_layer1.ts's
    // listPairNodeLadder). Held whole rather than just its offsets so task 259 can read the
    // instants back off it.
    const ladder = [...pair.commits, pair.onDisk];
    const nodePx = ladder.map((node) => node.axisPx);
    const startPx = Math.min(...nodePx);
    const lane = setAxisPx(el("div", { class: "lane" }), 0);
    lane.style.setProperty("--span-px", String(Math.max(...nodePx) - startPx));
    // Markers go in BEFORE the nodes: neither carries a z-index, so DOM order is what keeps the
    // rectangle behind the dots and their labels (.node's own z-index: 6 is above both).
    lane.append(el("div", { class: "lrail" }), ...buildTieGroupMarkers(ladder, startPx));
```

The rest of `buildPairWidget` is unchanged. Add the import beside the existing `layer1-*` imports,
alphabetically (`./layer1-tie-groups.ts` sorts after `./layer1-sources.ts`).

The existing comment on line 120-121 explaining `Math.min` over all node kinds stays — it still
describes why `startPx` is a min.

## Step 4 — the style rule

Add to `jfred/webapp/layer1-styles.css`, immediately after the `.nlabel` rule (line 201), so the
lane's three drawn things read top-to-bottom in the file:

```css
  /* Task 259: two nodes at ONE instant sit on stacked 22 px rows (task 251); this rectangle says
     they were simultaneous. Geometry is DERIVED from .node above, not chosen: a node is centred on
     its --axis-px and its painted box (15 px + a 2.5 px ring) reaches 10 px past that in every
     direction, so -11px/+22px clears the first and last rows with a 1 px hairline. left: -11px
     clears the dots, which translate(-50%) puts 10 px left of the lane's x=0. No z-index and no
     pointer-events: it is appended before the nodes so DOM order already paints it underneath, and
     nothing in the lane is clickable. */
  .lane .tiegroup { position: absolute; left: -11px; right: 0;
    top: calc(var(--axis-px) * 1px - 11px); height: calc(var(--span-px) * 1px + 22px);
    border: 1.5px solid var(--c-anchor); border-radius: 10px; background: var(--seg-a); }
```

`--c-anchor` (pink) and `--seg-a` (faint green wash) are already defined for both themes at
`layer1-styles.css:9-34`; no new token.

## Step 5 — verify

- `npm run typecheck` (or the repo's configured check) must pass.
- Do NOT run the test suite — the user runs tests.
- Report to the user which bubble to look at for a visual check: the tie is `README.md`
  (commit `4d5e6f70` and its mtime both at `2026-07-20T16:00:00Z`), reachable by typing
  `README.md` into the page's "Find bubble" box.

## Explicitly out of scope

- Any change to `src/layer1_ruler_axis.ts` or the wire format — the tie is already fully described
  by the `instant` values the page receives.
- A marker across DIFFERENT bubbles that share an instant. The task asks for the indicator inside
  the timeline bubble; the shared ruler tick plus task 264's leader line already connect bubbles.
- `plans/layer1-mockup.html`. It is the design reference, not a build output.
