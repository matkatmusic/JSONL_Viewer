# Item 78 — Timeline build progress overlay for large sessions

## Problem (context for the implementer)

Opening a session with 500+ steps looks frozen for several seconds *after*
reconstruction finishes. Reconstruction itself already streams progress to the
xterm console (`/api/document`), so that phase is covered. The uncovered phase is
the **synchronous DOM build** in `renderTimelineView`
(`webapp/views/timeline.ts`): after `buildTurnTimelineViewModel` returns `nodes`,
the row loop at **timeline.ts:1651** (`nodes.forEach((node, index) => { … })`,
closing `});` at **timeline.ts:1753**) builds one `.tl-row` per node — each with
many child elements and event listeners — in a single blocking pass. During that
pass `#view` is empty and the main thread never yields, so the browser paints
nothing and the user sees a frozen blank screen.

## Goal

While the row loop runs on a large timeline, show a **centered progress overlay**
that (a) proves the app is alive and (b) reports how many timeline rows have been
built so far (`Building timeline… 250 / 1200 rows`) with a matching progress bar.
Small timelines keep today's behavior exactly (no overlay, no yielding).

The mechanism: chunk the row loop into batches; between batches, update the
overlay and yield one animation frame so the browser can paint the update.

## Design decisions (the "why", so the reader can question any line)

- **Gate on total `nodes.length`, not numbered steps.** The cost is per-row DOM
  work; every node (turns, tool-call rows, session-start markers, session-end
  rows) is a row. Threshold constant `LARGE_TIMELINE_ROW_COUNT = 500` names the
  task's ">500 steps" line; total-row count is the truer proxy for render cost.
- **Below threshold: run the loop synchronously, no overlay.** Avoids an
  overlay flash on fast timelines and keeps existing behavior/headless checks
  unchanged. The single `for` loop only `await`s (yields) when the overlay is
  active, so the small-timeline path stays a straight synchronous pass — identical
  to today's `forEach`.
- **`forEach` → `for (const [index, node] of nodes.entries())`.** `forEach`
  cannot pause; a `for…of` can `await` mid-loop. `.entries()` preserves the
  `(index, node)` pair with correct types under `noUncheckedIndexedAccess`. The
  loop body (1651–1753) contains **no `return` statement** (verified), so the
  conversion changes control flow only by allowing awaits — a `forEach` `return`
  hazard does not apply here.
- **Overlay is `position: fixed`, appended to `document.body`, removed in a
  `finally`.** Fixed positioning keeps it centered regardless of how many rows get
  appended to `#view`; `document.body` (not `container`) means appended rows never
  push it; `finally` guarantees cleanup even if a row build throws.
- **Yield via `requestAnimationFrame`, not `setTimeout(0)`.** rAF fires right
  before the browser paints, so each batch's progress update is guaranteed
  visible; it also naturally paces batches to frame cadence.
- **Batch size `TIMELINE_BUILD_BATCH_SIZE = 100`.** ~12 yields for a
  1200-row timeline: smooth bar movement without paying a paint per row.
- **Overlay uses existing palette CSS variables** (`--bg`, `--panel`, `--border`,
  `--text`, `--accent`, `--code-bg`) so it is theme-aware with no dark-mode CSS.
- **Progress covers the row build only, not `buildTurnTimelineViewModel`.** That
  helper is pure array work and must finish before row count (`nodes.length`) is
  known; instrumenting it is out of scope. If it ever dominates, that is a
  separate follow-up.

## Files touched

1. `webapp/views/timeline.ts` — 2 constants, 3 exported pure helpers, 1 internal
   async helper, and the row-loop wiring.
2. `webapp/styles.css` — overlay CSS.
3. `tests/timeline-viewmodels.test.ts` — tests for the 3 pure helpers.

No engine (`src/`) changes; no new dependencies.

---

## Step 1 (RED) — tests for the pure helpers

Add to `tests/timeline-viewmodels.test.ts`. Add the three helper names to the
existing `import { … } from "../webapp/views/timeline.ts";` block. Write these
tests first and confirm they fail (helpers don't exist yet).

```ts
test("test_checkTimelineNeedsProgressOverlay_returns_true_at_or_above_threshold", () => {
    // Behavior: a row count at the large-timeline threshold triggers the overlay.
    // Steps:
    // Given a row count exactly equal to LARGE_TIMELINE_ROW_COUNT (500),
    // checkTimelineNeedsProgressOverlay should report true (overlay needed).
    assert.equal(checkTimelineNeedsProgressOverlay(500), true);
    // And a count well above the threshold is also true.
    assert.equal(checkTimelineNeedsProgressOverlay(1200), true);
});

test("test_checkTimelineNeedsProgressOverlay_returns_false_below_threshold", () => {
    // Behavior: a small timeline needs no overlay and no yielding.
    // Steps:
    // Given a row count below LARGE_TIMELINE_ROW_COUNT,
    // checkTimelineNeedsProgressOverlay should report false.
    assert.equal(checkTimelineNeedsProgressOverlay(499), false);
    assert.equal(checkTimelineNeedsProgressOverlay(0), false);
});

test("test_computeTimelineBuildProgressLabel_reports_built_over_total_rows", () => {
    // Behavior: the overlay label reads "Building timeline… <built> / <total> rows".
    // Steps:
    // Given 250 rows built of 1200 total,
    // the label states both counts in that exact format.
    assert.equal(
        computeTimelineBuildProgressLabel(250, 1200),
        "Building timeline… 250 / 1200 rows",
    );
});

test("test_computeTimelineProgressFraction_is_ratio_of_built_to_total", () => {
    // Behavior: the bar fill fraction is built/total.
    // Steps:
    // Given 300 built of 1200, the fraction is 0.25.
    assert.equal(computeTimelineProgressFraction(300, 1200), 0.25);
});

test("test_computeTimelineProgressFraction_guards_against_zero_total", () => {
    // Behavior: a zero total must not divide by zero; treat as fully built.
    // Steps:
    // Given 0 built of 0 total, the fraction is 1 (a complete/empty build).
    assert.equal(computeTimelineProgressFraction(0, 0), 1);
});
```

## Step 2 (GREEN) — add constants + pure helpers to `timeline.ts`

Place near the other module-level constants at the top of `timeline.ts` (e.g.
beside `ORPHAN_LANE_COLOR` / `SESSION_LANE_VARIABLES`). Export the three helpers.

```ts
// A timeline this many rows or larger gets the build-progress overlay + chunked
// rendering; smaller ones build synchronously (item 78).
const LARGE_TIMELINE_ROW_COUNT = 500;

// Rows built per animation frame during a chunked (large-timeline) build.
const TIMELINE_BUILD_BATCH_SIZE = 100;

// True when a timeline is large enough to build in yielding batches behind a
// progress overlay instead of one synchronous pass.
export function checkTimelineNeedsProgressOverlay(rowCount: number): boolean {
    return rowCount >= LARGE_TIMELINE_ROW_COUNT;
}

// The overlay's text line, e.g. "Building timeline… 250 / 1200 rows".
export function computeTimelineBuildProgressLabel(rowsBuilt: number, totalRows: number): string {
    return `Building timeline… ${rowsBuilt} / ${totalRows} rows`;
}

// The progress bar's fill fraction (0..1). A zero total counts as fully built (1)
// so an empty build never divides by zero.
export function computeTimelineProgressFraction(rowsBuilt: number, totalRows: number): number {
    if (totalRows === 0) {
        return 1;
    }
    return rowsBuilt / totalRows;
}
```

Confirm Step 1's tests now pass.

## Step 3 — internal frame-yield helper + overlay builder in `timeline.ts`

Add these near the top of the module (not exported; browser-only, DOM/rAF —
verified headlessly, not unit-tested). `el` is already imported from `../app.ts`.

```ts
// Resolve on the next animation frame so a just-applied DOM update paints before
// the next batch of rows blocks the main thread again (item 78).
function waitForNextAnimationFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// The centered build-progress overlay: a label + a bar track/fill. Returned so the
// caller can update the fill/label per batch and remove the whole overlay when done.
interface TimelineBuildProgressOverlay {
    element: HTMLElement;
    update: (rowsBuilt: number, totalRows: number) => void;
}

function createTimelineBuildProgressOverlay(): TimelineBuildProgressOverlay {
    const label = el("div", { class: "timeline-progress-label" });
    const fill = el("div", { class: "timeline-progress-fill" });
    const track = el("div", { class: "timeline-progress-track" }, [fill]);
    const box = el("div", { class: "timeline-progress-box" }, [label, track]);
    const element = el("div", { class: "timeline-progress-overlay" }, [box]);
    const update = (rowsBuilt: number, totalRows: number) => {
        label.textContent = computeTimelineBuildProgressLabel(rowsBuilt, totalRows);
        fill.style.width = `${computeTimelineProgressFraction(rowsBuilt, totalRows) * 100}%`;
    };
    update(0, 1);   // start empty (0%) before the first paint
    return { element, update };
}
```

## Step 4 — wire the overlay + chunk the row loop in `renderTimelineView`

Just before the row loop (currently `nodes.forEach(...)` at timeline.ts:1651,
after the `sessionStartsByIndex` map is built at ~1648):

```ts
const showBuildProgress = checkTimelineNeedsProgressOverlay(nodes.length);
let buildProgressOverlay: TimelineBuildProgressOverlay | null = null;
if (showBuildProgress) {
    buildProgressOverlay = createTimelineBuildProgressOverlay();
    document.body.append(buildProgressOverlay.element);
    // Yield once so the overlay paints before the (blocking) first batch.
    await waitForNextAnimationFrame();
}
try {
```

Change the loop header from:

```ts
    nodes.forEach((node, index) => {
```

to:

```ts
    for (const [index, node] of nodes.entries()) {
```

Immediately **before** the loop's closing brace — that is, after the existing
`container.append(row);` (timeline.ts:1751) and before the `});` at
timeline.ts:1753 — insert the batch boundary:

```ts
        if (showBuildProgress && (index + 1) % TIMELINE_BUILD_BATCH_SIZE === 0) {
            buildProgressOverlay!.update(index + 1, nodes.length);
            await waitForNextAnimationFrame();
        }
```

Change the loop's closing `});` (timeline.ts:1753) to a bare `}` and, right after
it, close the `try` with a `finally` that removes the overlay:

```ts
    }
    } finally {
        buildProgressOverlay?.element.remove();
    }
```

Result: small timelines (`showBuildProgress === false`) run the `for` loop with no
`await` and no overlay — behavior identical to today's `forEach`. Large timelines
show the overlay, update it every 100 rows, and remove it when the loop finishes
(or throws).

### Indentation note
The row-loop body currently sits at `forEach` arrow-function depth. Converting to
a `for` inside a new `try` keeps the same brace depth, so **existing body lines do
not need re-indenting** — only the header line, the closing line, and the
surrounding `try`/`finally` change. Verify with `tsc -p tsconfig.webapp.json
--noEmit` that no scope/indent breakage was introduced.

## Step 5 — overlay CSS in `webapp/styles.css`

Append (uses existing palette vars → theme-aware, no dark override needed):

```css
/* Item 78: build-progress overlay for large timelines. */
.timeline-progress-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
}
.timeline-progress-box {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 300px;
    padding: 20px 24px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    color: var(--text);
    font: 13px var(--ui);
}
.timeline-progress-track {
    height: 6px;
    border-radius: 3px;
    background: var(--code-bg);
    overflow: hidden;
}
.timeline-progress-fill {
    height: 100%;
    width: 0;
    background: var(--accent);
    transition: width 0.1s linear;
}
```

## Step 6 — build + headless verification (user runs the full suite)

- `npm run build:webapp` and `tsc -p tsconfig.webapp.json --noEmit` clean.
- Headless check on a large project (the task's repro,
  `#/project/-Users-matkatmusicllc-Programming-jot-backup/timeline`): the
  centered overlay appears after reconstruction, its `N / total rows` count and
  bar advance, and it is gone once rows are visible.
- Headless check on a small scenario (e.g. `#/project/s39-git-baseline-seed/timeline`):
  no overlay appears; timeline renders as before.
- Do **not** run the test suite — the user runs it.

## Success criteria

- The 3 pure helpers pass their unit tests (Step 1).
- Large timelines show a centered, counting progress overlay during row build and
  remove it afterward; the main thread yields so the overlay actually paints.
- Small timelines are visually and behaviorally unchanged.
- Typecheck + webapp build are clean; no engine or dependency changes.
