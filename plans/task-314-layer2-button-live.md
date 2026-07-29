# Task 314 — Layer 2 page: make the [2] layer button live and drop [3]

## Goal
Spec S19 "Same page, one switcher". Layer 2 is NOT a second page. The `[2]` button
toggles snapshot visibility CLIENT-SIDE (task 312 always ships snapshots, so no refetch).
`[3]` is removed (unassigned). Rendering the 📸 nodes themselves is task 315.

## Key decision — why CSS show/hide preserves offsets
The wire (task 312) ALWAYS lays the ruler/bubbles out with snapshot instants included, and
ships the resulting `axisPx`. Every node and every `.tick` is `position: absolute` against its
own `--axis-px`. So hiding an element with `display: none` removes it without shifting any
sibling. Layer 1 therefore = "same layout, snapshot elements hidden"; Layer 2 = "same layout,
snapshot elements shown". This is exactly what the VERIFY demands: only snapshot nodes and
snapshot-only ruler rows appear/disappear; every other offset is unchanged. (The mockup instead
rebuilds the model per layer; the real page must not, or offsets would move.)

## The mechanism (the part task 315 obeys)
- `data-layer` attribute on `.viz-root` (mirrors how `--zoom` lives on `.viz-root`).
- CSS contract: `.viz-root:not([data-layer="2"]) .snap { display: none; }`.
- Task 315 marks its snapshot nodes, their labels, and any snapshot-only ruler tick with class
  `snap`. Nothing else carries it, so nothing else is touched by the toggle.

## Changes
1. `webapp/layer1.html`
   - `.viz-root` gains `data-layer="1"` (correct default even before JS).
   - layerbar: drop the `[3]` button; `[2]` loses `.uncomputed`; tooltip → "Layer 2 adds
     file-history snapshots"; both buttons carry `data-layer` (`1`/`2`) as the value source.
2. `webapp/layer1-layer-toggle.ts` (NEW — layer1-page.ts is at the 250 cap; precedent
   layer1-zoom.ts / layer1-time-toggle.ts): `wireLayerToggle()` wires each layerbar button to
   publish its `data-layer` onto `.viz-root` and move `.current`; syncs `.current` at boot. No
   callback / no reload — toggling is pure CSS.
3. `webapp/layer1-page.ts`: import + call `wireLayerToggle()` once in `bootLayer1Page` (next to
   `wireZoomControls()`). Page boots at module scope, so it must be called exactly once.
4. `webapp/layer1-styles.css`: remove the now-dead `.uncomputed` rule (only [2]/[3] used it);
   add the `.snap` hide contract.

## Deliberately skipped
- The mockup rewrites the h1 to "Layer 2 View"; the real h1 carries a longer subtitle and the
  task's VERIFY does not mention it. Skipped — add when the user asks and names the L2 subtitle.

## Tests — `tests/layer1-layer-toggle.test.ts` (node --import tsx --test, happy-dom)
- opens on Layer 1: exactly two layerbar buttons, `.viz-root[data-layer="1"]`, current is `1`,
  `[2]` title correct and NOT `.uncomputed`.
- click `[2]`: `.viz-root` → `data-layer="2"`, current moves to `2`.
- toggle 1 → 2 → 1 returns to `data-layer="1"`, current `1`.
