# Task 325 — File Nav file click selects the on-disk node and opens the Detail view

Files: `jfred/webapp/layer1-filenav.ts`, one test file.

## Step 1 — test first

In `jfred/tests/layer1-filenav.test.ts` (existing harness: `setupLayer1Dom` +
rendered stage fixture; follow the file's current fixture pattern), add: click a
nav leaf whose path has a bubble on the stage, then assert
1. `#drawer` has class `open`,
2. `#dpath` text contains "Current on-disk state",
3. the bubble's `.node.n-disk` carries `.found`.
If the file lacks a stage+drawer fixture, put the test in
`jfred/tests/layer1-drawer.test.ts` instead, where both already exist.
The drawer's fetch may reject in happy-dom — the three assertions above are all
set synchronously before the fetch, so stub `fetch` only if the runner reports
an unhandled rejection.

## Step 2 — implement (jfred/webapp/layer1-filenav.ts)

Replace `onFileClick: jumpToBubbleAtPath` in `renderFileNavInto` with a wrapper:

```ts
function openDiskNodeForPath(path: string): void {
    jumpToBubbleAtPath(path)?.querySelector<HTMLElement>(".node.n-disk")?.click();
}
```

The synthetic click routes through the stage's delegated handler
(`wireNodeDrawer` → `openNodeDrawer`), which already clears the diff pair,
re-highlights (deselecting the previous selection), opens the drawer, and
fetches the bytes. Orphan paths return `undefined` from `jumpToBubbleAtPath`
and keep their existing status-crumb message.

## Step 3 — verify

Typecheck, build:webapp, then CDP: drive a nav leaf click headlessly and assert
the same three conditions, plus screenshot.
