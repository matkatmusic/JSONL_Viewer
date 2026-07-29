# Task 323 — Layer 1 File Detail view: up/down arrows cycle the selected node

Goal: with the drawer open on ONE selected node, up/down arrow buttons in the
drawer header select the previous/next node in that file's timeline. Selection
STOPS at the ends (arrow disabled), no wrap.

## Facts the plan relies on

- A file's timeline order IS the DOM order of `.node` elements inside its
  `.lane` (jfred/webapp/layer1-widgets.ts `appendAxisNode`: created →
  commits ascending → on-disk). No separate model list is needed.
- `.n-created` nodes are never openable (layer1-drawer.ts click guard), so
  cycling must skip them: select `.node:not(.n-created)` within the lane.
- `openNodeDrawer(node, path)` already does everything a new selection needs:
  clears the diff pair, re-anchors, calls `highlightLandedElement(node)`
  (so the find-file marks follow), scrolls the node into view, redraws the
  minimap, and fetches content. Cycling = call it with the adjacent node.
- The module-scope `anchor` in layer1-drawer.ts is the current selection.

## Steps

1. jfred/webapp/layer1.html — in the `.dhead` control strip (before the
   `#imgtools` span), add:
   `<span class="dtools"><button id="dprev" title="previous revision">↑</button><button id="dnext" title="next revision">↓</button></span>`
   No `hidden` attribute: the pair is meaningful whenever the drawer is open,
   and `setDrawerTools` must NOT manage it (it only toggles img/diff tools).

2. jfred/webapp/layer1-drawer.ts —
   a. `findAdjacentNode(offset: 1 | -1): HTMLElement | undefined` — from
      `anchor.node.parentElement` query `.node:not(.n-created)`, index the
      anchor, return the element at index+offset (undefined past either end).
   b. In `openNodeDrawer`, right after `anchor = …`, set each arrow button's
      `disabled` to `findAdjacentNode(offset) === undefined` (up = -1 earlier,
      down = +1 later).
   c. In `wireNodeDrawer`, wire both buttons: on click, take
      `findAdjacentNode(offset)`; if defined, `void openNodeDrawer(it, anchor.path)`
      (the path is the same file — cycling never leaves the lane).

3. No CSS: the existing `.dtools button` styling covers the two buttons.

## Verification

Typecheck + `npm run build:webapp` in jfred. Visual verification is the
user's job (hard-reload layer1, click a mid-ladder node, cycle with the
arrows, confirm the end arrows disable). No test suites run per instruction.

Line-cap check: layer1-drawer.ts is 111 lines; the additions (~18 lines)
stay well under 250.
