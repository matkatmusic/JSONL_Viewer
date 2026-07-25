# Task 237 — Layer 1 View webapp page

Spec: `specs/from-scratch-SPEC.md` S18. Signed-off layout: `plans/layer1-mockup.html`.
Wire contract (FROZEN, shipped by task 235): `jfred/src/viewer_api_layer1.ts`.

## What already exists (do not rebuild)

- `GET /api/layer1-view?dir=&repo=&ref=` returns
  `{ pairs: [{ path, commits: [{hash, instant, axisPx}], onDisk: {instant, axisPx} }],
     gitOrphans: [{path, instant, axisPx}], diskOrphans: [{path, instant, axisPx}],
     ruler: [{instant, axisPx}] }`.
  Every `axisPx` is **absolute** on one shared ruler. `ruler` is ascending by instant.
  Bucket rows are already sorted ascending, so `rows[0]` IS the earliest member.
- `GET /api/pick-folder?current=<path>` → `{ path: string }`; `""` means cancelled.
- `webapp/app-dom.ts` exports `el(tag, attrs, children)` and `getRequiredElementById(id)`.
- `src/viewer_server.ts` already serves `webapp/*` under `/app/*` and `webapp/dist/*.js`
  takes precedence (`resolveStaticFilePath`). **No new server route is needed** — the new
  page is reachable at `/app/layer1.html` and its compiled module at `/app/layer1-page.js`.
- `tsconfig.webapp.json` has `"include": ["webapp"]`, so a new `webapp/*.ts` compiles with
  no config change.

## Constraints

- The page performs exactly ONE arithmetic operation: subtracting a widget's own base
  `axisPx` from a node's `axisPx`. No timestamps → pixels anywhere in the browser.
- `gitOrphans` → the **"No on-disk match"** bucket. `diskOrphans` → the **"No repository
  match"** bucket. Never derive one from the other; bind each by its wire property name.
- Empty bucket → not rendered at all. Zero pairs → the `No git ↔ on-disk pairs.` message.
- Do NOT touch `tests/viewer_api_layer1.test.ts` or `src/viewer_api_layer1.ts` (task 240).

## Step 1 — `jfred/webapp/layer1.html` (new)

Copy `plans/layer1-mockup.html` and change only these things:

1. Keep the entire `<style>` block **verbatim** (tokens, header, `.sources`, `.legend`,
   `.timelines`, `.canvas`, `.ruler`, `.stage`, `.filebox`, `.lane`, `.node`, `.n-commit`,
   `.n-disk`, `.nlabel`, `.filebox.bucket`, `.bucket ul/li/em`, `.nopairs`). It stays inline
   in `<head>` — the mockup is one self-contained page and the user signed that file off.
2. `<title>` → `JFRED — Layer 1 View`.
3. Keep the `<header>` (h1, `#crumb`, `.layerbar` with the static 1/2/3 buttons), the
   `.sources` row and the `.legend` row exactly as in the mockup, except:
   - `#dir` and `#repo` `value` attributes become empty (no fake sample paths ship).
   - the two `button.pick` elements keep `data-for="dir"` / `data-for="repo"`.
4. Keep `<main class="timelines"><div class="canvas"><div class="ruler" id="ruler">
   <div class="rail"></div></div><div class="stage" id="stage"></div></div></main>`.
5. Delete the whole `<script>` block; replace with
   `<script type="module" src="/app/layer1-page.js"></script>` (mirrors `index.html`).

## Step 2 — `jfred/tests/webapp-dom-test-helpers.ts` (edit)

Add, following the existing `setupLayeredDom` / `setupDebugDom` pattern:

```ts
// The Layer 1 View page's body markup (task 237, spec S18). `search` seeds the page URL's
// query string so ?dir=&repo=&ref= deep-link tests can read it.
export function setupLayer1Dom(search: string = ""): void {
    const browserWindow = new Window({ url: `http://localhost:7343/app/layer1.html${search}` });
    Object.assign(globalThis, {
        window: browserWindow,
        document: browserWindow.document,
        location: browserWindow.location,
        history: browserWindow.history,
        HTMLElement: browserWindow.HTMLElement,
        HTMLInputElement: browserWindow.HTMLInputElement,
        HTMLButtonElement: browserWindow.HTMLButtonElement,
    });
    browserWindow.document.body.innerHTML = readLayer1HtmlBodyMarkup();
}
```

plus its `readLayer1HtmlBodyMarkup()` twin of `readLayeredHtmlBodyMarkup()` reading
`../webapp/layer1.html`. `history` is included because Step 3 calls
`history.replaceState` when mirroring the boxes into the URL.

## Step 3 — `jfred/webapp/layer1-page.ts` (new)

Write it in this order. Every exported function carries a verb (coding-requirements §5).

### 3a. Wire types

These describe what `JSON.parse` yields, so `Path` is a plain `string` and `Instant` an ISO
`string` — mirror the naming in `webapp/layered-app.ts` (`Wire…` prefix):

```ts
interface WireInstant { instant: string; axisPx: number }
interface WireCommit extends WireInstant { hash: string }
interface WirePair { path: string; commits: WireCommit[]; onDisk: WireInstant }
interface WireOrphan extends WireInstant { path: string }
interface WireLayer1View {
    pairs: WirePair[];
    gitOrphans: WireOrphan[];
    diskOrphans: WireOrphan[];
    ruler: WireInstant[];
}
```

### 3b. Small local helpers

- `function setAxisPx(node: HTMLElement, axisPx: number): HTMLElement` —
  `node.style.setProperty("--axis-px", String(axisPx)); return node;`
- `function formatInstantLabel(instant: string): string` — the mockup's `MM-DD HH:MM`:
  `new Date(instant).toISOString().slice(5, 16).replace("T", " ")`.

Import `el` and `getRequiredElementById` from `./app-dom.ts` — do NOT re-declare a builder.

### 3c. Ruler

```ts
// Minimum vertical gap between two tick LABELS, in px — the mockup's collision skip. The
// endpoint returns `ruler` ascending, so a running "last drawn" position is enough.
const TICK_LABEL_MIN_GAP_PX = 13;

function renderRulerTicks(ruler: WireInstant[]): void { … }
```

Rebuild `#ruler` with `replaceChildren(el("div", { class: "rail" }), …ticks)`; a tick is
`setAxisPx(el("div", { class: "tick", text: formatInstantLabel(tick.instant) }), tick.axisPx)`.
Skip a tick whose `axisPx` is less than `TICK_LABEL_MIN_GAP_PX` beyond the last DRAWN tick;
seed the running value at `Number.NEGATIVE_INFINITY` so the first tick always draws.

### 3d. Pair widget

```ts
function appendAxisNode(lane: HTMLElement, axisPx: number, nodeClass: string, text: string): void {
    lane.append(
        setAxisPx(el("i", { class: `node ${nodeClass}` }), axisPx),
        setAxisPx(el("span", { class: "nlabel", text }), axisPx),
    );
}

function buildPairWidget(pair: WirePair): HTMLElement { … }
```

`buildPairWidget` rules:

- `const startPx = pair.commits[0]?.axisPx ?? pair.onDisk.axisPx;` — **the ONE subtraction
  base**. The `??` covers a pair whose history came back empty (only reachable on a
  truncated/shallow clone); such a widget pins to its on-disk node instead of throwing.
  Mark it: `// ponytail: empty-history pair pins to its on-disk node; revisit if shallow
  clones become a real input.`
- Widget element: `setAxisPx(el("div", { class: "filebox" }), startPx)`.
- Children in order: `el("div", { class: "fname", text: pair.path })`,
  `el("div", { class: "sub", text: `${pair.commits.length} commits · on disk` })`,
  then the lane.
- Lane: `setAxisPx(el("div", { class: "lane" }), 0)`, and
  `lane.style.setProperty("--span-px", String(pair.onDisk.axisPx - startPx))`,
  then `lane.append(el("div", { class: "lrail" }))`.
- One `appendAxisNode(lane, commit.axisPx - startPx, "n-commit", commit.hash)` per commit,
  in wire order (the endpoint emits them oldest-first).
- Finally `appendAxisNode(lane, pair.onDisk.axisPx - startPx, "n-disk", "on disk")`.

### 3e. Orphan bucket

```ts
// One orphan bucket. `title` and `rows` are passed together by the ONE caller below so the
// direction can never be inferred from the data: gitOrphans and diskOrphans are mirror
// images (spec S18 "Output contract"). Empty buckets are omitted entirely.
function buildOrphanBucket(title: string, rows: WireOrphan[]): HTMLElement | undefined
```

- `if (rows.length === 0) { return undefined; }`
- Box: `setAxisPx(el("div", { class: "filebox bucket" }), rows[0]!.axisPx)` — rows arrive
  ascending from the endpoint, so `rows[0]` is the earliest member; **no `Math.min` here.**
- `el("div", { class: "fname", text: title })`, `el("div", { class: "sub", text:
  `${rows.length} files` })`, then a `ul` of `li`s, each
  `el("li", {}, [el("span", { text: row.path }), el("em", { text: formatInstantLabel(row.instant) })])`.

### 3f. Whole-view render

```ts
export function renderLayer1View(view: WireLayer1View): void { … }
```

1. `getRequiredElementById("crumb").textContent =
   `${view.pairs.length} pairs · ${view.gitOrphans.length} repo-only · ${view.diskOrphans.length} disk-only``
2. `renderRulerTicks(view.ruler)`
3. Build the stage children array:
   - `view.pairs.map(buildPairWidget)`, or, when `view.pairs.length === 0`, the single
     `el("div", { class: "nopairs", text: "No git ↔ on-disk pairs." })`.
   - then the two buckets, in this exact order and binding, dropping `undefined`:
     ```ts
     buildOrphanBucket("No on-disk match", view.gitOrphans),      // repo paths, absent from disk
     buildOrphanBucket("No repository match", view.diskOrphans),  // disk paths, absent from repo
     ```
4. `getRequiredElementById("stage").replaceChildren(...children)`

### 3g. Inputs, URL mirroring, fetch

```ts
// The three header boxes, in URL-param order. Ids match layer1.html.
const SOURCE_PARAM_IDS = ["dir", "repo", "ref"] as const;

function readSourceParams(): URLSearchParams
function fillSourceBoxesFromUrl(): void
export async function loadLayer1View(): Promise<void>
```

- `readSourceParams()` reads each box (`getInputById` from `./app-dom.ts`), trims it, and
  appends it to a fresh `URLSearchParams` only when non-empty — a blank ref box must not
  pin the endpoint to `?ref=` noise, and the endpoint already treats blank as the active
  branch.
- `fillSourceBoxesFromUrl()` copies `new URLSearchParams(location.search)` values into the
  three boxes for whichever params are present. Called once at boot so `?dir=&repo=&ref=`
  is a working shareable link.
- `loadLayer1View()`:
  1. `const params = readSourceParams();`
  2. `history.replaceState(null, "", `?${params}`)` — the boxes ARE the URL (S18: one
     shareable link). `replaceState`, not `pushState`: re-loading the same page is not a
     navigation.
  3. If either `dir` or `repo` is missing, set `#crumb` to
     `"pick a project folder and a git repo"` and return without fetching — the endpoint
     would 400 on a missing param and there is nothing to show yet.
  4. `const response = await fetch(`/api/layer1-view?${params}`);`
  5. `if (!response.ok) { getRequiredElementById("crumb").textContent = await response.text(); return; }`
     — the route's failures are already 400-with-message (no stack), so the crumb is the
     whole error surface. No `alert()` (it blocks headless automation, per app-header.ts).
  6. `renderLayer1View(await response.json() as WireLayer1View);`

### 3h. Folder picker + boot

```ts
// GET /api/pick-folder (task 236); "" = cancelled, leave the box alone. A LOCAL 5-liner
// rather than importing app-header.ts's pickFolderInto — that module pulls in app-router →
// views/timeline → the whole classic app, and its error path writes the classic page's
// #breadcrumb, which this page does not have.
async function pickFolderInto(target: HTMLInputElement): Promise<void>

export function bootLayer1Page(): void
```

`bootLayer1Page`:
- `fillSourceBoxesFromUrl()`
- for each `button.pick`: click → `await pickFolderInto(getInputById(button.dataset.for!))`
  then `void loadLayer1View()`.
- `#load` click → `void loadLayer1View()`.
- `void loadLayer1View()` once at the end, so a shared `?dir=&repo=` link renders on open.

Last line of the module: `bootLayer1Page();` (matches `layered-app.ts`'s `bootLayeredApp()`).

## Step 4 — `jfred/tests/layer1-page.test.ts` (new)

`node --test` + `assert/strict`, importing `setupLayer1Dom`, `stubFetchRoutes` and
`flushAsyncWork` from `./webapp-dom-test-helpers.ts`, and importing
`../webapp/layer1-page.ts` **dynamically inside each test** (the module boots on import, so
the DOM must exist first) — the same shape as `tests/layered-app-widgets.test.ts`.

One fixture builder with STATED axisPx values (never re-derived from timestamps):

```
pairs: [{
  path: "src/index.ts",
  commits: [ { hash: "a1b2c3d", instant: "2026-06-01T09:00:00.000Z", axisPx: 10 },
             { hash: "e4f5a6b", instant: "2026-06-01T14:30:00.000Z", axisPx: 22.5 } ],
  onDisk: { instant: "2026-07-24T08:15:00.000Z", axisPx: 46.5 },
}]
gitOrphans:  [{ path: "docs/old-api.md", instant: "2026-07-20T16:00:00.000Z", axisPx: 34.5 }]
diskOrphans: [{ path: "notes.txt",       instant: "2026-07-23T19:40:00.000Z", axisPx: 40   }]
ruler: [ {…10}, {…22.5}, {…34.5}, {…40}, {…46.5} ]   // ascending, gaps ≥ 13 px apart
```

Tests (three; all assert CONTENT, never counts alone):

1. `test_pair_widget_and_nodes_render_at_the_endpoints_axis_pixels`
   - Widget `--axis-px` is `10` (the first commit's ABSOLUTE axisPx).
   - `.n-commit` nodes read `[0, 12.5]` and their `.nlabel` text is `["a1b2c3d", "e4f5a6b"]`
     (asserting the hashes proves node order came from `commits`, not from sorting).
   - The `.n-disk` node reads `36.5` and its label is `"on disk"`.
   - The lane's `--span-px` is `36.5`.
   - Ruler ticks read `[10, 22.5, 34.5, 40, 46.5]`.

2. `test_orphan_buckets_bind_each_wire_property_to_its_own_title`
   - Exactly two `.filebox.bucket` elements.
   - The bucket titled `No on-disk match` lists `docs/old-api.md` (the `gitOrphans` path)
     and carries `--axis-px` `34.5`.
   - The bucket titled `No repository match` lists `notes.txt` (the `diskOrphans` path)
     and carries `--axis-px` `40`.
   - This is the swap guard demanded by S18: it fails if the two arrays are exchanged.

3. `test_empty_buckets_are_omitted_and_zero_pairs_shows_the_message`
   - Fixture with `pairs: []`, `gitOrphans: []` and one `diskOrphans` row.
   - `.filebox:not(.bucket)` count is `0`; `.nopairs` text is `"No git ↔ on-disk pairs."`.
   - Exactly ONE `.filebox.bucket`, and its `.fname` is `No repository match` — proving the
     surviving bucket is the non-empty *direction*, not merely "a bucket".

## Step 5 — verification

Do NOT run tests or suites (the user runs them). Do NOT `git add`, do NOT commit.

## Out of scope (deliberate)

- No link to `/app/layer1.html` from `index.html` — S18 defines the page as a shareable
  link, and no task asks for navigation into it.
- Layer buttons 2 and 3 stay inert `.uncomputed` markup, exactly as in the mockup.
- No `structuredPatch` / node-click detail — spec-deferred to layer 4+.
