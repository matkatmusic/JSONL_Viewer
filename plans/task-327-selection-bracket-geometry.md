# Task 327 — [ ] selection brackets hug the node, off the label text

One file: `jfred/webapp/layer1-styles.css`, the shared
`.node.found/.node.aimed ::before/::after` block (~lines 412-416).

## Geometry

The lane's `.nlabel` starts 14px right of the rail; the node dot spans
±7.5px around it. Today each bracket is `width: 5px` with a 2px margin and a
2px border, so the right bracket spans ~9.5→16.5px and overprints the label.

Change, keeping `.found` and `.aimed` identical:
- `width: 5px` → `width: 3px`
- `margin-right: 2px` / `margin-left: 2px` → `1px`
- vertical stays (`top/bottom: -6px`), only the horizontal overlapped.

Right bracket then spans ~8.5→13.5px — clear of the 14px label, tighter to the
dot, matching the mockup's intent ("brackets sit OUTSIDE the dot in the empty
gutter", plans/archived/layer1-mockup.html ~334).

## Verify

`build:webapp` not needed for CSS (served directly) but run typecheck anyway
with the batch; CDP: click a node, screenshot, confirm the right bracket no
longer touches the label glyphs (assert via `getBoundingClientRect` of the
`::after` is not scriptable — use the screenshot for the visual and assert the
computed style width/margins changed).
