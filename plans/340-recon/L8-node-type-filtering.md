# L8 recon — node-type timeline filtering

## Existing filter machinery (one funnel)

`filterLayer1ViewByTargets` (webapp/layer1-filter.ts:100) — WHOLE-FILE path
filtering only; always re-runs `relayOutLayer1View` → `layOutNodeLadders`
(same module the server uses) so ruler rows physically disappear and gaps
recompact. Composition today = AND via set intersection
(`intersectFilterTargets`, layer1-page.ts:91-104), single funnel at
layer1-page.ts:114-116. #326 semantics: undefined = no filter, [] = empty
stage. Session filter contributes its own path list. Washes are decorative
overlays over the already-drawn view (`rememberDrawnView`) — they filter
nothing.

## Two OPPOSITE precedents for hiding

- Path filter: full re-layout, rows removed, ladder recompacted.
- Layer switcher (kind toggle): PURE CSS
  (`.viz-root:not([data-layer="2"]) .n-snap {display:none}`,
  layer1-styles.css:71) — offsets never shift; snapshot-only ruler ticks are
  hidden by `markMultiEventTicks` (layer1-tick-files.ts:144-157) adding
  `n-snap` to the TICK when every event at that row is a snapshot — slot/gap
  retained, DOM-measured post-render.

## Legend

Static inert `.legend` spans in layer1.html:89-96 (six swatches, inline CSS
vars, no JS/data hooks, not in the glossary). Candidate to become filter
chips but needs wiring + data-kind attrs.

## URL/state

No existing filter round-trips through the URL; `?dir=&repo=&ref=&time=`
pattern in layer1-sources.ts:29-71 (non-default-only writes, repeated
params via append/getAll; history.replaceState). /api/layer1-settings
stores project/source identity only, never view state. A `&kinds=` param =
NEW pattern.

## Reusable AS-IS / thin adapters

- `markMultiEventTicks` generalized from the single `.n-snap` literal to an
  N-kind hidden-class set — the direct template for "hide row when all its
  events are hidden kinds".
- Existing `n-*` classes give every kind a stable selector; future kinds
  (n-edit, n-script, …) follow.
- New small `layer1-kind-filter.ts` state module mirroring onlySelectedIsOn,
  producing a CSS class/attribute toggle (switcher-style), NOT a call into
  filterLayer1ViewByTargets.
- If gaps must collapse: needs a kind-aware `listPairLadderInstants` variant
  + re-layout — much bigger.

## AMBIGUITIES (grilling)

1. Hide-only (CSS, dead gaps stay — today's Layer-2 behaviour) vs re-layout
   (gaps recompact — path-filter behaviour)? THE cost/UX crux.
2. If CSS-only: is a dead gap acceptable, or must all-hidden rows also
   collapse (contradicts "offsets never shift")?
3. Hide nodes only, or also the lane tie lines between surviving nodes?
4. Composition: kind-filter ANDs with path/session filters in the one
   funnel, or an independent second pass (paths pick bubbles, kinds hide
   nodes within)?
5. Does the Layer switcher's snapshot hide become redundant/subsumed, or
   stay a separate mechanism that can hide the same class?
6. UI shape: radio "show only X" (task phrasing) vs checkboxes "hide these
   kinds" (scales to many kinds)?
7. Zero-kinds-checked = show nothing ([] precedent) or show everything
   (safer)? Conflicting precedents — pick one explicitly.
8. URL param &kinds= and/or /api/layer1-settings persistence (both new
   patterns), or ephemeral like every other filter?
9. Legend-as-chips vs separate control (legend stays informational)?
10. Data-driven chips from kinds present in the loaded view, vs hardcoded
    list extended per layer?
11. Expanded ruler rows (#300): does the expansion's file list re-filter by
    hidden kinds or always list every event?
12. Washes + node-identity checks (layer1-diff-wash.ts:59 checks .n-snap
    classList) may need kind-filter awareness if filtering redraws.
