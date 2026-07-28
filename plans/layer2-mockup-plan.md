# Layer 2 mockup plan (tasks #299–#307)

Built in `plans/layer1-mockup.html`, then split on 2026-07-27 (user) into three files under
`plans/layer2-mockup/` — `index.html` (markup + CSS), `fixture.js` (data), `app.js` (code).
The original is preserved at `plans/archived/layer1-mockup.html`. Nothing in `jfred/src` or
`jfred/webapp` was touched.

## Running it

    cd plans/layer2-mockup && python3 -m http.server 8000     # then open http://localhost:8000

A plain `file://` open no longer works: the page is ES modules now.

    cd jfred && npm run visual:mockup                          # 40 headless checks + screenshots
    cd jfred && node --import tsx --test tests/mockup.test.ts  # 6 capture-free unit tests

Design rule throughout: a snapshot is **just another node kind**. It rides the existing
`widget.nodes` pipeline, so instants, the capped-gap ladder, `(N)` counts, tie groups, ruler
rows, leaders and the minimap all pick it up for free. No parallel code path.

## Steps

1. **#299 — switcher chrome.** Drop `[3]`. Take `.uncomputed` off `[2]`, retitle it
   "Layer 2 adds file-history snapshots". Update the header comment block to say Layers 1 AND 2.
2. **#300 — fixture.** `SNAPSHOTS` beside `SESSIONS`: `{ path, version, at, session, line }`.
   `SESSIONS` gains `titles: [{ title, from, to }]` (line ranges) replacing the single `title`.
   Constraints: no snapshot before its DISK `born`; `src/util.ts` carries `@v2` from **two**
   sessions; `b21d84c5` carries **two** titles with a snapshot in each range; `src/index.ts @v1`
   pre-dates its first commit; `7ce50a19` carries **no** titles; `README.md` has **no** snapshots.
3. **#301 — nodes.** `buildModel` pushes a `kind: "snapshot"` node per snapshot, `text: "@vN 📸"`,
   `cls: "n-snap"`. New CSS `.n-snap` (solid `--c-snap` circle). Legend row added.
   Anchor/span follow S18 automatically — the earliest node wins.
4. **#302 — ruler rows.** `listEventsAtInstants` already reads `n.text` as the slug, so the row
   reads `util.ts @v2 📸` with no change to `buildTickFileList`. Carry `session` on the event.
5. **#303 — flash helper.** `FLASH_MS` + `flashSession(file)`: adds `.flash` to the nav row,
   animation colour `--c-echo` (never `--c-script`, the selection colour), removed on a timer.
   Duration lives in ONE constant, pushed into CSS as `--flash-ms`.
6. **#304 — switching.** `let layer = 1`. Snapshots join `buildModel` only at layer 2. Buttons
   set `layer`, clear `expandedInstant`, move `.current`, retitle `<h1>`, `render()`.
   Idempotent because `render()` rebuilds from the fixture every time.
7. **#305 — drawer.** Snapshot branch in `openDrawer`: header
   `<file> Snapshot - <titleAt(session, line)>`, then `flashSession`. `fakeContents` varies its
   body by version+session so the two `@v2` bytes differ visibly.
8. **#306 — nav rows.** `renderSessions` order: filename, deduped titles (omitted when none),
   `timestamp · N files`.
9. **#307 — verify.** Headless CDP over `file://…/plans/layer1-mockup.html` using
   `jfred/scripts/visual/cdp.ts`, then hand to the user. No screenshot-as-proof; the user signs off.
