# Task 329 — Range-diff across selected files via a base/target instant wash

Builds on the STAGED-uncommitted 328/DiffView work in jfred/webapp/ (layer1-diff-pane.ts,
layer1-diff-view.ts, layer1-drawer-multi.ts, layer1-revision-sources.ts). Executed
serially in-session: a worktree would branch from HEAD and lack all of it.

## What already exists (read these first, in this order)

- `webapp/layer1-drawer-diff.ts` — `extendDiffSelection(anchor, node, path)`: the
  shift-click pair. TODAY it refuses cross-bubble (`flashToast` "two nodes on ONE
  bubble") and builds ONE side-mode DiffView from lane order. `describeNodeStep` maps
  any lane node to a DiffStep. `paintLaneRings` sets `.diff-base`/`.diff-target`.
- `webapp/layer1-drawer-multi.ts` — `showDetailViewForFiles(view, targets)`: the nav
  pipeline; `listDiffableSteps(view, path)` builds each file's steps FROM THE WIRE
  VIEW (instants available there), `createDetailViewsForFiles` builds one inline-mode
  DiffView per sorted file with base=target=last step.
- `webapp/layer1-ranges.ts` — paints the JSONL `.range-wash` bands into `.washes`
  (the visual language to mirror; CSS at layer1-styles.css:202-222).
- `webapp/layer1-widgets.ts` — nodes carry `--axis-px` only; instants live in the
  wire view, so RANGE MATH RUNS ON THE VIEW, never on pixel values.

## Behavior (the user's 2026-07-29 design, decisions locked here)

1. The shift-click second node NO LONGER refuses cross-bubble. The two clicked nodes
   resolve to two global INSTANTS (base = earlier, target = later, by instant — not
   click order, matching today's axis rule).
2. A `.diff-wash` band is drawn into the existing `.washes` layer: `left:0; right:0`,
   top edge = base node's axis y, bottom edge = target node's bottom edge (its axis y
   + node height). Reuse `.range-wash`'s positioning formula (layer1-ranges.ts) with
   a distinct class + color token so JSONL bands and the diff wash coexist; base and
   target chips (small labels "base"/"target") sit on the two boundary nodes — reuse
   the `.diff-base`/`.diff-target` ring classes for the nodes themselves and add a
   chip element beside each.
3. The drawer shows one DiffView per file in the CURRENT nav selection (the same
   `targets` showDetailViewForFiles receives); when the nav selection is empty, the
   two clicked files alone. Per file, the pair derives from the range over that
   file's steps (wire-view instants):
   - nodes inside `[base, target]` (inclusive): baseIndex = first inside,
     targetIndex = last inside;
   - exactly one node inside: base = target = it → empty diff (the layered_instants
     / d5904cf4 case from the task);
   - ZERO nodes inside (file untouched during the range): base = target = the last
     step at-or-before the base instant → empty diff of the state it held throughout;
   - no step at-or-before either (file born after the range): keep the section with
     the existing no-steps body text, reworded "No state inside the selected range."
   The last two rules are THIS PLAN's decisions (the task doesn't specify) — noted in
   the implementation notes for user review; do not silently change them.
4. Single-lane pairs keep working unchanged as the degenerate case: two nodes on one
   lane produce the same result through the instant path, so the old lane-index path
   in extendDiffSelection is REPLACED, not special-cased.
5. `clearDiffPair()` also removes the wash and chips.

## Structure (250-cap aware)

NEW `webapp/layer1-diff-wash.ts` — the pure core + the painter:
- `export function resolveRangeStepIndexes(instants: string[], baseInstant: string,
  targetInstant: string): { baseIndex: number; targetIndex: number } | undefined` —
  pure, implements rule 3 (undefined = born-after-range). Instants are the wire's ISO
  strings; ISO compare IS chronological (the repo leans on this elsewhere).
- `export function paintDiffWash(baseNode, targetNode)` / `export function
  clearDiffWash()` — DOM band + chips, mirroring layer1-ranges.ts's formula.

EDIT `webapp/layer1-drawer-diff.ts` — `extendDiffSelection` rewritten: resolve both
nodes' instants (via their step in the wire view — thread the current view in the
same way layer1-drawer-multi.ts gets it), order them, `paintDiffWash`, then build the
per-file DiffViews through `createDetailViewsForFiles`-style config but with
range-derived base/targetIndex per file (extend layer1-drawer-multi.ts with an
optional range param rather than duplicating its loop — one canonical pipeline).
Delete the cross-bubble refusal and its toast.

EDIT `webapp/layer1-styles.css` — `.diff-wash` (the band, diff color token) and
`.diff-chip` (the two labels). Nothing else.

Wire nothing new into layer1-page.ts unless an import forces it.

## Tests — authored FIRST (RED), tests/layer1-diff-wash.test.ts

node --test conventions of the existing suite (`test_<behavior>`, plain-English step
comments; DOM-free — the pure function carries the logic):
- `test_range_with_many_nodes_picks_first_and_last_inside`
- `test_range_with_one_node_inside_uses_it_for_both_sides`
- `test_range_with_no_nodes_inside_holds_the_preceding_state`
- `test_file_born_after_the_range_resolves_to_undefined`
- `test_boundary_instants_are_inclusive`
RED is authorship order; the implement pass runs `npm run typecheck` +
`npm run build:webapp` only — suites and fixture-mode visual review run at close time.

## Order

1. Tests (RED). 2. layer1-diff-wash.ts pure core. 3. Painter + CSS.
4. extendDiffSelection rewrite + drawer-multi range param. 5. Both typechecks.
User reviews on the real page via `--fixture` (task 330's harness) before close.

## Traps

- Do not read instants off DOM pixels; `--axis-px` accumulates gaps and cannot be
  inverted (S18 rule).
- The foreign staged 328/DiffView code is UNCOMMITTED — do not rebase, revert, or
  reformat any of it; build strictly on top.
- mockup-checks' `checkCrossBubbleRefusal` asserts the OLD refusal — it will need
  reclassification at close time (behavior deliberately changed by 329); do not
  edit the mockup or its checks in this task.
- happy-dom tests need the CSS.highlights fake (memory: tasks 142-145) — irrelevant
  if the test stays DOM-free as planned; keep it DOM-free.
