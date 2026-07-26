# Plan — Layer 1 View visual fixes (tasks 250, 245, 247)

Three user-reported visual defects on the Layer 1 View page. All three live in exactly two
files:

- `jfred/webapp/layer1.html` — the page's single `<style>` block (CSS only).
- `jfred/webapp/layer1-page.ts` — the renderer (one line of TypeScript changes).

One test file changes: `jfred/tests/layer1-page.test.ts`.

Screenshot evidence lives in `specs/bug screenshots/` (RevEng root, not the jfred submodule).

---

## Measurements this plan depends on

Read these off `jfred/webapp/layer1.html` before editing; every number below is derived from
them, and the implementing agent must confirm they still hold.

| Selector | Declaration | Consequence |
| --- | --- | --- |
| `.viz-root` | `font: 13px/1.5 system-ui, …` | `line-height: 1.5` (a unitless number) is **inherited**, so every descendant's line box is `1.5 × its own font-size`. |
| `.filebox` | `padding: 30px 12px 14px` | The `.lane`'s content-box top sits 30 px below the bubble's padding-box top. |
| `.filebox` | `min-width: 168px`, `border: 2px solid` | A pair bubble is exactly 168 px wide: every child that could widen it (`.fname`, `.sub`, `.node`, `.nlabel`) is absolutely positioned, and abspos boxes do not contribute to max-content sizing. |
| `.filebox` | `margin-top: calc(var(--axis-px) * 1px)` | The bubble's **border-box top edge** is at its first instant's absolute ruler position. |
| `.filebox .fname` | `position: absolute; top: 7px; left: 12px; white-space: nowrap` | Unbounded width: the name escapes the bubble to the right. Font is `600 13px` → line box 19.5 px → occupies y 7 → 26.5 px. |
| `.filebox .sub` | `position: absolute; top: 24px; left: 12px`, `font-size: 10px` | Line box 15 px → occupies y **24 → 39 px**, i.e. 9 px *past* the 30 px padding-top. |
| `.node` | `width/height: 15px`, `transform: translate(-50%, -50%)`, `box-shadow: 0 0 0 2.5px` | A node at `--axis-px: 0` is centred on the lane's top edge, so with its ring it occupies `padding-top − 10px` → `padding-top + 10px`. |
| `.nlabel` | `top: calc(var(--axis-px) * 1px); transform: translateY(-50%)`, `font: 10px` | A label at `--axis-px: 0` occupies `padding-top − 7.5px` → `padding-top + 7.5px`. |
| `.canvas` | `position: relative; display: flex; zoom: var(--zoom, 1)` | Not a stacking context at `zoom: 1`; **is** one at any other zoom. |
| `.ruler` | `position: sticky; left: 0; z-index: 8; width: 96px; background: var(--page)` | Opaque, pinned to the scrollport's left edge, painted above the stage. |
| `.timelines` | `overflow: auto` | Clips ink overflow. In LTR, overflow past the **left** edge is unreachable — it never becomes scrollable area. |

### Root causes, stated once

- **Task 247** — `.sub` ends at y 39 px but the lane starts at y 30 px, so the first node
  (y 20 → 40) and its short-hash label (y 22.5 → 37.5) are drawn straight through the
  `.sub` text. This is why every screenshot shows an 8-char hash overprinting `on disk`.
- **Task 245** — `.fname` has no width bound and `white-space: nowrap`, while the bubble is
  fixed at 168 px, so long paths spill across the neighbouring bubbles.
- **Task 250** — nothing connects a bubble to the ruler; the bubble's border-box top edge
  already *is* its first instant's ruler position, so the leader has an exact target and
  needs no measurement.

### Explicitly out of scope

- The on-disk node rendering **above** the bubble, and commit hashes rendering **below** it.
  Those come from `onDisk.axisPx − startPx` being negative in `buildPairWidget`
  (`startPx` is `pair.commits[0].axisPx`, never a `min` over both). That is **tasks 248 and
  249**. Do not change `startPx`, `--span-px`, or any offset arithmetic in this plan.
- Node-vs-node collision when a commit and the on-disk instant resolve within a few pixels
  of each other. Not reported in isolation; nudging a node off its own instant would make
  the node lie about its timestamp.
- The node-vs-tick vertical offset (a node sits `padding-top` px below its own tick).
  Task 251 owns ruler spacing; task 250's leader deliberately targets the bubble's top edge,
  which *is* exact.

---

## Step 1 — RED: assert the file-name label is the basename with the full path on hover

File: `jfred/tests/layer1-page.test.ts`

The fixture pair's path is `"src/index.ts"` (`buildPartialOverlapView`, line ~52).

1a. In `test_pair_widget_and_its_nodes_render_at_the_endpoints_axis_pixels` (line ~120),
replace the existing full-path assertion:

```ts
    assert.equal(widget.querySelector(".fname")?.textContent, "src/index.ts");
```

with the basename expectation:

```ts
    assert.equal(widget.querySelector(".fname")?.textContent, "index.ts");
```

Why this line and not a new test: that assertion is the *existing* statement of what `.fname`
holds, and leaving it asserting the old behaviour would make the suite contradict itself.

1b. Add a new test immediately after
`test_a_commit_label_shows_the_short_hash_and_reveals_the_full_one_on_hover`, following that
test's shape (it is the established pattern for "short label, full value on hover"):

```ts
test("test_a_file_name_label_shows_the_basename_and_reveals_the_full_path_on_hover", async () => {
    // Scenario (task 245): a full path is unbounded in width but the bubble is a fixed 168 px,
    // so the label carries only the BASENAME — and because six sibling bubbles can share the
    // same leading directory, a truncated path would leave them all reading alike. The whole
    // path must stay recoverable, which is what the hover title is for.
    // Steps:
    // load the partial-overlap view, whose single pair is at "src/index.ts".
    await loadPageWithView(buildPartialOverlapView(), BOTH_ROOTS_SEARCH);
    const name = listMatching("#stage .filebox:not(.bucket) .fname")[0]!;
    // the visible label is the basename alone — the directory is what overprinted the neighbours.
    assert.equal(name.textContent, "index.ts");
    // the hover title is the full wire path, so nothing the endpoint sent is unrecoverable.
    assert.equal(name.getAttribute("title"), "src/index.ts");
    // an orphan bucket's title is not a path, so it must NOT gain a title attribute — that is
    // what proves the change landed on the pair widget's name and not on every .fname el() builds.
    assert.equal(findBucketTitled("No repository match")?.getAttribute("title"), null);
});
```

`findBucketTitled`, `listMatching`, `loadPageWithView` and `BOTH_ROOTS_SEARCH` already exist
in this file — do not add helpers.

1c. Confirm `jfred/tests/layer1-acceptance.test.ts` line ~136 needs **no** change: it expects
`.fname` to be `"kept.txt"`, a root-level file whose basename equals its path.

Do not run the suite — per the invoking skill the user runs tests.

---

## Step 2 — GREEN: render the basename and carry the full path as the title

File: `jfred/webapp/layer1-page.ts`, function `buildPairWidget` (line ~112).

2a. Add a basename helper directly above `buildPairWidget`, using the idiom already in this
codebase (`webapp/layered-app.ts:64`):

```ts
// The label a pair bubble shows. A full path is unbounded in width while the bubble is a fixed
// 168 px, and six siblings sharing one leading directory all truncate to the same text — so the
// bubble shows the basename and hands the whole path to the hover title. ponytail: a local
// one-liner, matching webapp/layered-app.ts's own `split("/").pop()`; lift it into a shared
// module if a third caller ever needs it.
function getPathBasename(path: string): string {
    return path.split("/").pop() ?? path;
}
```

The name carries a verb (`get…`) per `plans/coding-requirements.md` §5.

2b. In `buildPairWidget`'s returned element, change only the `.fname` line:

```ts
        el("div", { class: "fname", text: getPathBasename(pair.path), title: pair.path }),
```

`el()` omits an undefined attribute, and `buildOrphanBucket` passes no `title`, so bucket
titles are untouched — which is what step 1b's third assertion pins.

Leave `.sub` as `${pair.commits.length} commits · on disk`. The directory is deliberately not
moved into `.sub`: folder context is the File Nav tree's job (tasks 252–255), and the hover
title already makes the path recoverable. Two files sharing a basename will show two
identically-labelled bubbles, disambiguated by hover — accept this and note it in the
implementation notes.

---

## Step 3 — Bound the file-name label to its bubble (task 245, CSS)

File: `jfred/webapp/layer1.html`, the `.filebox .fname` rule (line ~128).

Add three declarations to the existing rule; change nothing else in it:

```css
  /* Task 245: the bubble is a fixed 168 px but this label is abspos + nowrap, so without a bound
     a long basename overprints the neighbouring bubbles. 100% is the padding box (164 px on a
     168 px bubble); minus the 12 px `left` and a matching 12 px on the right, the label spans
     exactly the bubble's content width and ellipsises inside its own border. */
  .filebox .fname { position: absolute; top: 7px; left: 12px;
    max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis;
    font: 600 13px ui-monospace, Menlo, monospace; color: var(--c-snap); white-space: nowrap; }
```

A *trailing* ellipsis is correct here only because step 2 already replaced the path with the
basename. Do not apply a trailing ellipsis to a full path: the screenshot
`specs/bug screenshots/on-disk above timeline bubble 2.png` shows six bubbles all rendering
`demo-baseline/file-hist…`, i.e. the shared prefix survives and the distinguishing suffix is
what gets cut.

`.bucket .fname` overrides only `color`/`font-family`/`font-size`, so bucket titles inherit
the bound as well — harmless, their titles are short.

---

## Step 4 — Clear the header before the lane's first node (task 247, CSS)

File: `jfred/webapp/layer1.html`, the `.filebox` rule (line ~124).

Change the padding's **top** value from `30px` to `50px` and record the derivation:

```css
  /* padding-top is derived, not chosen: `.sub` is abspos at top:24px with a 15 px line box
     (10px × the inherited 1.5), so the header ends at y 39. The lane starts at padding-top and
     its `--axis-px: 0` node is translate(-50%,-50%)-centred there, reaching 10 px above it
     (7.5 px half-height + its 2.5 px ring). 39 + 10 = 49, so 50 px is the first value that
     clears the header — this is what stopped the short-hash label overprinting "on disk".
     Task 247. Move `.fname`/`.sub`'s `top`, or their font sizes, and this value must be redone. */
  .filebox { position: relative; flex: none; min-width: 168px;
    margin-top: calc(var(--axis-px) * 1px);
    border: 2px solid var(--box); border-radius: 14px;
    background: color-mix(in srgb, var(--surface) 88%, transparent); padding: 50px 12px 14px; }
```

Do **not** touch `margin-top`. It keeps the bubble's border-box top edge at `--axis-px`, which
is the exact target step 5's leader line aims at; compensating the padding by shifting
`margin-top` would align the node with its tick but make the leader point at nothing.

The bubble grows 20 px taller. `.lane`'s `min-height` is `--span-px + 18px` and padding-bottom
is 14 px, so the last node still has clearance — no other value needs adjusting.

---

## Step 5 — Draw the dashed leader from each bubble's top to the ruler (task 250, CSS)

File: `jfred/webapp/layer1.html`.

5a. Add `isolation: isolate` to the existing `.canvas` rule (line ~111), keeping every other
declaration:

```css
  /* isolation makes .canvas a stacking context UNCONDITIONALLY. Required, not cosmetic: `zoom`
     creates one only when it is not 1, and without a stacking context here the leader's
     `z-index: -1` escapes to the root, where it paints behind `.viz-root`'s opaque background
     and is invisible at 100% zoom. Inside .canvas it lands behind the bubbles and above the
     page background, which is exactly where a leader belongs. */
  .canvas { position: relative; min-width: max-content; display: flex; zoom: var(--zoom, 1);
    isolation: isolate; }
```

5b. Add the leader as a `::before` on `.filebox`, immediately after the `.filebox` rule:

```css
  /* Task 250: trace a bubble back to its timestamp on the sticky gutter.
     `top: -2px` cancels the 2 px border so the line sits on the border-box top edge, which is
     `margin-top` = `--axis-px` = precisely the ruler tick for the bubble's first instant.
     `right: 100%` starts it at the bubble's left edge and it runs LEFTWARD past canvas x=0;
     `.ruler` is sticky at the scrollport's left edge, opaque and at z-index 8, so it paints over
     the excess and the leader appears to begin at the gutter's right edge at EVERY horizontal
     scroll position — no JS, no measurement, no re-render. Leftward overflow is unreachable in
     LTR, so `.timelines` gains no phantom scroll area, and abspos boxes are excluded from
     `min-width: max-content`, so the canvas is not widened. Native `zoom` scales it in step with
     everything else.
     ponytail: a fixed 100000px instead of the measured distance to the gutter — a bubble further
     right than that loses its leader; measure `offsetLeft` in JS only if the canvas ever gets
     that wide. */
  .filebox::before { content: ""; position: absolute; right: 100%; top: -2px;
    width: 100000px; border-top: 1px dashed var(--baseline); z-index: -1; }
```

5c. Accept, and note in the implementation notes: `.filebox`'s background is
`color-mix(in srgb, var(--surface) 88%, transparent)`, so a leader passing behind a bubble to
its left shows faintly through it. It never overprints text (it is behind the background). If
the user wants it fully hidden, the one-token fix is an opaque `.filebox` background.

---

## Step 6 — Verification (no test suites; the user runs those)

Run from `jfred/`:

1. `npx tsc --noEmit -p tsconfig.json` and the webapp's own tsconfig — both must be clean.
   Step 2 is the only TypeScript change, so a failure here is a real error, not noise.
2. `npm run build:webapp` — must emit `webapp/dist/layer1-page.js` containing
   `getPathBasename`.
3. Visual confirmation against a real project, since steps 3–5 are pure CSS and the happy-dom
   harness injects only `layer1.html`'s **body** markup (`setupLayer1Dom`), so no unit test can
   observe the stylesheet. Serve the page and check, at 100% zoom and at one zoomed-out level,
   with the canvas scrolled horizontally:
   - every bubble shows a basename inside its border, no text crossing a bubble edge (245);
   - no hash label overlapping the `N commits · on disk` line (247);
   - a dashed line from each bubble's top-left edge to the gutter, still starting at the
     gutter's right edge after horizontal scrolling (250).

Do not run `npm test`.

---

## Diff budget

| File | Change |
| --- | --- |
| `jfred/webapp/layer1.html` | `.fname` +3 declarations; `.filebox` padding-top `30px`→`50px`; `.canvas` +`isolation`; one new `.filebox::before` rule. |
| `jfred/webapp/layer1-page.ts` | one new 3-line helper; one changed `el()` call. |
| `jfred/tests/layer1-page.test.ts` | one changed assertion; one new test. |

No new files, no new dependencies, no JS measurement, no changes to the wire format, the
endpoint, or any offset arithmetic.
