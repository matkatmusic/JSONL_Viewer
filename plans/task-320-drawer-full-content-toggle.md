# Task 320 — drawer "full content" is a toggle around the diff

"Full content" must toggle full-file context AROUND the visible diff (decorations
kept, current side/inline layout kept), exactly like the Revision Viewer's full
button (`webapp/views/details-diff.ts:115-118` → refetch with wider context).
The single-node click view (`renderFileContentInto` via layer1-page) is untouched.

Files: `jfred/src/viewer_api_layer1_diff.ts`, `jfred/webapp/layer1-drawer-diff.ts`,
`jfred/webapp/layer1.html`, `jfred/tests/viewer_api_layer1_diff.test.ts`.

## Step 1 — server test first (jfred/tests/viewer_api_layer1_diff.test.ts)

Add one test: build a second fixture file with ~10 identical lines, one changed
line in the middle, committed twice (reuse `runGit`/`writeFileSync` pattern).
Via `requestLayer1Diff`, assert the default request OMITS a far-away shared
line (outside git's 3-line context) while the same request plus
`context: "full"` INCLUDES it as a context line.

## Step 2 — server (jfred/src/viewer_api_layer1_diff.ts)

```ts
import { FULL_FILE_CONTEXT_LINES, runGitUnifiedDiff } from "./render_git_diff.ts";
...
const contextLines = query.get("context") === "full" ? FULL_FILE_CONTEXT_LINES : undefined;
sendJson(response, 200, { diff: runGitUnifiedDiff(baseLines, targetLines, contextLines) });
```

(`runGitUnifiedDiff` defaults its third param, so pass it only when full —
`undefined` keeps the default via the existing default-parameter.)

## Step 3 — client (jfred/webapp/layer1-drawer-diff.ts + layer1.html)

1. `DrawerDiffMode` drops `full` → `{ side, inline }`. Add module-level
   `let fullContents = false;`.
2. `layer1.html:183`: change `<button data-mode="full">full content</button>`
   to `<button id="dfull">full content</button>` so the mode loop no longer
   captures it.
3. Extract the fetch in `openDiffDrawer` into `loadDiffText(pair)` which
   appends `context=full` to `buildDiffParams(pair)`'s params when
   `fullContents` is on, sets `shownDiffText`, and is awaited by both
   `openDiffDrawer` and the toggle.
4. `wireDiffTools`: wire `#dfull` click → flip `fullContents`, and when a pair
   is shown re-fetch (`loadDiffText`) then `renderDiffBody()`.
5. `paintModeButtons`: also paint `#dfull`'s `.current` from `fullContents`,
   independent of `mode`.
6. Delete `renderTargetContent` and the `mode === DrawerDiffMode.full` branch
   in `renderDiffBody` (now unreachable).
7. Reset `fullContents = false` is NOT needed per pair — like the Revision
   Viewer the preference may persist for the session; leave it module-scope.

## Step 4 — verify

1. Typecheck; run only `node --test tests/viewer_api_layer1_diff.test.ts` and
   any drawer test that referenced the old full mode (grep first; none known).
2. `npm run build:webapp`; headless CDP smoke via `jfred/scripts/visual/cdp.ts`:
   open a diff pair, click "full content", assert the body still contains
   `.diff-cols` (or `.diff` in inline) rows AND more rows than before the
   toggle; click again to restore.
