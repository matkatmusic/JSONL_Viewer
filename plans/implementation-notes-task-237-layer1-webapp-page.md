## 2026-07-25:00:00:00 — Task 237: Layer 1 View webapp page
Chat title: tackle-tasks 237 (Layer 1 View page) — subagent of the task-237/240 batch
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/b97bdfe7-d6f6-4031-ac4c-427012b322fc.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task-237-layer1-webapp-page.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/layer1-mockup.html
/Users/matkatmusicllc/Desktop/claude code src/RevEng/specs/from-scratch-SPEC.md (S18)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/src/viewer_api_layer1.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/implementation-notes-task-235-layer1-view-endpoint.md

### Files
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1.html (new)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1-page.ts (new)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1-page.test.ts (new)
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/webapp-dom-test-helpers.ts (edited — purely additive `setupLayer1Dom`)

### Design decisions
- **No new server route.** `viewer_server.ts` already serves `/app/*` from `webapp/dist` then
  `webapp/` (`resolveStaticFilePath`), and `tsconfig.webapp.json` includes all of `webapp/`, so
  the page is reachable at `/app/layer1.html` and its module at `/app/layer1-page.js` with zero
  server change. `viewer_server.ts` was left untouched.
- **CSS stays inline in `layer1.html`**, lifted verbatim from the signed-off
  `plans/layer1-mockup.html` rather than split into a stylesheet. The mockup is one self-contained
  page the user approved on 2026-07-25; copying it whole is the shortest diff and keeps a later
  mockup revision a straight re-copy.
- **The page does exactly one subtraction**, as locked: widget `--axis-px` = `commits[0].axisPx`;
  node `--axis-px` = `node.axisPx - commits[0].axisPx`; bucket `--axis-px` = `rows[0].axisPx` (no
  `Math.min` — the endpoint already sorts bucket rows ascending); ruler tick `--axis-px` =
  `tick.axisPx`. No instant is ever converted to a pixel in the browser.
- **Bucket direction is bound by name at the single call site**, with the two titles supplied
  alongside their wire arrays: `gitOrphans` → "No on-disk match", `diskOrphans` → "No repository
  match". The DOM test asserts which PATH lands in which titled bucket, never bucket sizes, so an
  invisible inversion fails.
- **Local 5-line `pickFolderInto`** instead of importing `webapp/app-header.ts`'s exported one:
  that module transitively pulls in `app-router.ts` → `views/timeline.ts` → the whole classic app,
  and its failure path writes the classic page's `#breadcrumb`, which this page does not have.
  Errors go to this page's `#crumb` instead. Marked with a `// ponytail:` comment.

### Deviations
- The mockup's `input` event handlers (re-render on every keystroke) were dropped: each keystroke
  would be a real `/api/layer1-view` request that walks a folder and shells out to git. Loading is
  driven by the **Load** button and by a folder pick, plus once at boot for a shared link.
- The mockup's `#dir`/`#repo` sample values ship empty — no fake paths in the real page.
- `?ref=` is omitted from the URL and the request when the ref box is blank, rather than sent as
  an empty param. The endpoint already reads blank as the active branch; this just keeps a shared
  link clean.
- A pair whose `commits` array is empty (only reachable on a truncated/shallow clone) pins its
  widget to the on-disk node instead of throwing. Marked `// ponytail:` with the upgrade path.

### Tradeoffs
- `bootLayer1Page()` still runs at module scope (matching `layered-app.ts`'s `bootLayeredApp()`),
  but it is also **exported** so the DOM test can re-boot against each fresh happy-dom document —
  node's module cache runs a module's top-level boot only on the first import, so relying on it
  would have left every test after the first rendering nothing.
- The tick-label collision skip (13 px) was ported from the mockup rather than dropped. It is the
  only page-side filtering of server data, and it has its own test so an accidental skip in
  another fixture cannot be mistaken for a page bug.
- Test fixtures read their expected offsets back off the fixture rows (`GIT_ORPHAN.axisPx`,
  `PAIR_ON_DISK.axisPx - WIDGET_BASE_PX`) rather than repeating literals. The widget-relative
  offsets are still written as visible subtraction, since that expression is the thing under test.

### Open questions
- **Nothing links to the page yet.** S18 defines it as a shareable link and no task asks for
  navigation into it, so `webapp/index.html` was left alone. Say the word if a "Layer 1 View" entry
  belongs in the layered page's header.
- **The S18 spec status line was not updated** to record #237 as done. A sibling agent is working
  task 240 in the same S18 section concurrently, so both edits would collide; recording #237 and
  #240 together after both land is safer.
