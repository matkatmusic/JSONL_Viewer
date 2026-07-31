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

## SETTLED (user, 2026-07-30)

### Hide only. Never re-lay-out.

CSS hiding, the existing Layer-2 mechanism. **Dead gaps are acceptable** — the
ruler does not squish when rows are emptied.

The mental model: filtering a kind out should feel exactly like switching from
a higher layer down to a lower one. Going from layer 3 to layer 2 loses every
edit node but keeps every snapshot, and the ruler stays put. Same here.

**Hide the nodes only** — not the lane tie lines between the survivors.

### It is a "show" row of checkboxes, not a "filter out" row

Checkboxes, not radios. The row reads as
**`show: [✓] git  [✓] 📷  [✓] Edit …`**.

**Clicking a layer button is the same as toggling the checkboxes for the node
types that layer adds.** The checkboxes are the source of truth; layer buttons
are presets over them.

**Zero checked = show nothing.** That falls straight out of the model — an
unchecked box hides its kind, and unchecking all of them hides everything.

### The show row replaces the legend

The static `.legend` swatches (layer1.html:89-96) are replaced by this row
rather than sitting beside it.

### Filtering applies everywhere, including the ruler

Whatever is toggled on in the show row is what appears **everywhere in the
GUI** — the bubbles and the ruler alike. So an expanded ruler row's file list
**re-filters** to the visible kinds; it does not keep listing every event.

### Persistence: settings storage, not the URL

Filter state is stored persistently with the rest of the settings data. **No
`&kinds=` URL parameter.**

## RESOLVED BY THE ABOVE (were listed as ambiguities)

- **Composition with path/session filters** — the choice does not matter,
  because "hide only" already forces the shape. Path and session filters remove
  rows and re-lay-out the ladder; the kind filter only hides nodes with CSS.
  They operate at different stages and cannot merge into one funnel. Two
  mechanisms, by construction.
- **Washes / node-identity checks** (layer1-diff-wash.ts:59 inspecting
  `.n-snap`) — this was a note, not a question, and hide-only makes it moot:
  nothing redraws, so the wash keeps inspecting the same DOM it always did.

## RESOLVED (grilling, 2026-07-30) — nothing open

Answers first; the question and its evidence are kept below as the record.

- **A — buttons 1–7 stay as presets; the `data-layer` gate retires.** The
  checkboxes are the single source of truth. Blast radius is fully enumerated
  below and includes one unit test and three visual/CDP probes that must change
  in the same commit.
- **L8 and L9 are not layers.** Neither adds a node kind, so neither has
  checkboxes to toggle. The show row is always present; range-export is a mode
  you arm. The L1–L9 numbering stops matching the UI at 8, deliberately.
- **Computation is triggered by visibility, not by the button.** A kind's data
  is computed the first time it becomes visible, however it was turned on — so
  ticking a checkbox can start a slow job, and the progress bar must be able to
  fire from the show row.
- **Confidence is display-only.** The show row filters by node kind alone; the
  seven confidence states are read off a node, not filtered by.

## The question, as asked

**A. Do the layer buttons survive as their own mechanism, or become pure
presets?**

Restating the original question, which was too abstract: today the layer
switcher hides snapshots with a CSS rule keyed on `data-layer`
(`.viz-root:not([data-layer="2"]) .n-snap {display:none}`,
layer1-styles.css:71). Adding a `[✓] 📷` checkbox means **two different things
can hide the same class**, and they can disagree — e.g. sitting on layer 1
(snapshots hidden by the layer gate) and then ticking the snapshots box.

The settled rule "clicking a layer = toggling that layer's checkboxes" mostly
answers this: the checkboxes become the single source of truth and the
`data-layer` CSS gate is retired. Worth confirming that consequence explicitly,
because it changes an existing mechanism rather than adding one — and because
it decides whether the layer buttons remain visible at all once they are just
shortcuts for groups of checkboxes.

_Code re-check (2026-07-30): **the blast radius is small and fully enumerated.**
Exactly **one** CSS rule keys on `data-layer` —
`.viz-root:not([data-layer="2"]) .n-snap {display:none}`
(layer1-styles.css:71). `layer1-layer-toggle.ts` (32 lines) does nothing but
set `dataset.layer` and move a `.current` class — no refetch, no re-render.
Other readers: `layer1.html:16,40-41` (seed + buttons), one unit test
(tests/layer1-layer-toggle.test.ts), three visual/CDP probes
(scripts/visual/mockup.ts:27, layer2-checks.ts:18,53, mockup-checks.ts:44), and
the glossary (jfred/docs/ui-component-glossary.md:5,27). Retiring the gate is
contained, but the test and the three probes must be updated in the same change
or the suite breaks._

## RESOLVED BY THE CODEBASE (was open)

**Which checkboxes appear — data-driven, by precedent.**

The question was whether the show row lists only the kinds present in the
loaded project or a fixed list of every known kind. **Every other filter
surface in layer 1 is already built from loaded data, never a hardcoded list:**
`renderSessionPane` (layer1-sessions.ts:156-173) builds rows from
`listVisibleSessions()` filtered by `sessionTouchesTheProject`, and
`listFileNavEntries` (layer1-filenav.ts:24-32) builds nav rows straight from
the fetched `view.pairs` / `gitOrphans` / `diskOrphans`. Consistency settles
it: build the kind row from the kinds present in the loaded view.
