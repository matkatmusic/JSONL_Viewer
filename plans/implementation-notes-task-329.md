# Implementation notes — Task 329: range-diff across selected files via a base/target instant wash

- Timestamp: 2026-07-30
- Topic: Layer 1 Diff view — two shift-clicked nodes become a global base/target instant
  wash; every nav-selected file diffs across that range.
- Conversation: tackle-tasks [329] (ultra-twinkly-wind)
- JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/f7d5bed5-6831-4332-912e-e19fe5396350.jsonl

## References

- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/329-instant-wash-diff.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-task-330.md (fixture harness used to review this on the real page)
- Builds on the staged-uncommitted 328/DiffView work (webapp/layer1-diff-pane.ts, layer1-diff-view.ts, layer1-drawer-multi.ts, layer1-revision-sources.ts).

## What changed

- NEW webapp/layer1-diff-wash.ts — pure `resolveRangeStepIndexes`, `readNodeInstant`, the `paintDiffWash`/`clearDiffWash` painter, and the drawn-view / nav-targets memo the gesture reads.
- NEW tests/layer1-diff-wash.test.ts — five RED-first range-rule tests.
- webapp/layer1-drawer-multi.ts — `extendDiffSelection` moved here and rewritten for the instant wash; `listDiffableSteps` split over a new internal `listDatedSteps`; `createDetailViewsForFiles` gained an optional `DiffWashRange`.
- webapp/layer1-drawer-diff.ts — the old lane-index pair gesture, `laneNodes`, `readAxisPx`, `paintLaneRings` and the cross-bubble refusal toast deleted; `clearDiffPair` now also clears the wash.
- webapp/layer1-diff-view.ts — `DiffViewConfig.emptyText` overrides the zero-steps body.
- webapp/layer1-drawer.ts — imports `extendDiffSelection` from layer1-drawer-multi.ts.
- webapp/layer1-page.ts — re-arms the drawn view and nav targets on every render.
- webapp/layer1-styles.css — `.diff-wash` band, mirroring `.range-wash`.

## Design decisions (spec was silent — confirm)

- **Empty range** (a file with exactly one node inside the wash, or none): base = target,
  producing an empty diff of the state the file held. A file with NO node inside the range
  holds its last state at-or-before the base instant. Both are this implementation's rule,
  per the plan; the task only named the one-node case (the layered_instants / d5904cf4 example).
- **File born after the range** (every step post-dates the wash): the section renders with
  the body text "No state inside the selected range." rather than being dropped.

## Deviations

- (a) The wash's top/bottom edges are ±half a node row (`RULER_NODE_ROW_PIXELS / 2`), exactly
  as the session wash closes on its covered events — not literally the base node's top and the
  target node's bottom. This keeps the two wash languages identical and reuses layer1-ranges.ts.
- (b) The empty-range and born-after-range rules above are deviations from an unspecified spec.
- (c) A single-file range pane defaults to inline mode (the mode buttons still offer side); the
  old lane pair opened in side mode.
- (d) The lane rings (`.diff-base`/`.diff-target`) mark the two WASH boundary nodes and no longer
  follow a pane's per-section base/target arrow steps — there is no longer one lane behind the pair.
- (e) `checkCrossBubbleRefusal` in scripts/visual/mockup-checks-diff.ts asserts the removed
  "two nodes on ONE bubble" refusal; it must be reclassified (behavior intentionally changed),
  not treated as a regression, at close time.

## Tradeoffs

- Instants are read from the drawn wire view (`readNodeInstant`), never from `--axis-px`: the
  S18 ruler accumulates gap caps, so a pixel offset cannot be inverted to an instant. The wash
  PAINTER does use `resolveAxisPixelsAt` for placement, but only after the instants are known.

## Open questions

1. Confirm the empty-range and born-after-range rules (decisions above) match intent.
2. Should the range wash and a selected-JSONL wash be visually distinguishable enough when both
   are on screen? They use different color tokens (sel-edge/c-user vs c-script) but the same shape.

## Verification

- `npm run typecheck` → exit 0; `npm run build:webapp` → exit 0.
- No import cycle (drawer-multi → drawer-diff → diff-wash; neither drawer-diff nor diff-wash
  imports back).
- Test suite and fixture-mode visual review deferred to close time per repo rule.
