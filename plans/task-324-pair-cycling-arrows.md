# Task 324 — independent base/target cycling arrows in the Diff Detail view

Settled design (user, 2026-07-29). Pair-mode header:
row 1 `<file name> [^][v] <base hash> - <target hash> [^][v]` — first arrow
pair moves the BASE node, second the TARGET; row 2 holds the diff tools
(`side-by-side / inline / [√] Full content / export as patch`).
Deviation to note: the Close button stays in row 1 — it serves every drawer
mode, not just diffs.

Movement defaults (ends were left definable): lane DOM order (323's rule),
skip `.n-created`, STOP at the lane ends, and an arrow is disabled when its
step would land on the other endpoint — base and target never collide.

## Step 1 — layer1.html

- In the row-1 tools area add
  `<span class="dtools" id="pairtools" hidden><button id="dbprev" title="previous base revision">↑</button><button id="dbnext" title="next base revision">↓</button><span class="dpair" id="dpairlabel"></span><button id="dtprev" title="previous target revision">↑</button><button id="dtnext" title="next target revision">↓</button></span>`
  (order in the row: dpath, base arrows, pair label, target arrows).
- Move the `#difftools` span out of `.dhead` into a new second header row
  `<div class="dhead" id="dhead2">…</div>` directly below, keeping its
  `hidden` default. Replace the `#dfull` button with
  `<label class="dfull-toggle"><input type="checkbox" id="dfull"> full content</label>`.

## Step 2 — layer1-drawer-diff.ts

- `openDiffDrawer`: `#dpath` shows only the basename (title keeps the path);
  fill `#dpairlabel` with `${describeSideName(base)} - ${describeSideName(target)}`;
  keep `#dmeta` as is.
- Extract the tail of `extendDiffSelection` (mark classes + `shownPair` +
  `openDiffDrawer`) into `showDiffPair(baseNode, targetNode, path)` so the
  arrows reuse it.
- New `stepPairSide(side: "base" | "target", offset: 1 | -1)`: neighbours =
  lane `.node:not(.n-created)` around that side's node; refuse when absent or
  equal to the other endpoint; otherwise `showDiffPair` with the moved side.
- After every pair render, set each of the four arrows' `disabled` from the
  same refusal rule.
- `paintModeButtons`: `#dfull` is now `(input).checked = fullContents`.
- `wireDiffTools`: `#dfull` listens on `change`; wire the four arrow buttons
  to `stepPairSide`.

## Step 3 — layer1-drawer.ts

`setDrawerTools("diff")` must also show `#pairtools` + `#dhead2` and hide the
single-node `#dprev/#dnext`; the other modes do the reverse. Extend
`setDrawerTools` rather than sprinkling visibility flips.

## Step 4 — CSS (only if needed)

`#dhead2` reuses `.dhead`'s rule by carrying the class; `.dpair` gets
monospace font like `.dmeta`. Nothing else.

## Step 5 — test + verify

DOM test in `tests/layer1-drawer-diff.test.ts` (or the drawer test file if none
exists): lane with commit/commit/disk nodes, open the pair (first, last),
click `#dbnext` → the `.diff-base` mark moves to the middle node and a new
`/api/layer1-diff` fetch fires; `#dbnext` then disables (next step would hit
the target). Typecheck, build:webapp, CDP: screenshot the two-row header,
step base/target arrows, assert marks move and arrows disable at the ends.
