# Plan: tasks 163 + 164 — progress-bar forward motion & pane-scoped overlay with Cancel

All work happens in the `jfred/` submodule (never in ~/Programming clones). Follow
`plans/coding-requirements.md`, 4-space indent, strict red-green TDD. Do not run the full
test suite or the app — the user runs them after. Run only the specific new/edited test
files (`node --test <file>`) plus `npx tsc --noEmit` for verification.

---

## Task 163 — incrementing counters inside the silent parts of "constructing branches"

**Behavior (plain English):** while the build sits on the "constructing branches" stage,
two currently-silent passes must announce counted progress through the existing
`reportReconstructionProgress` channel (which already reaches the UI bar):
1. the branch enumeration announces each abandoned-tip scan as `scanning branch tips` with
   `current/total` (the enumeration's real unit of work is the per-tip `findRewindPoint`
   ancestor walk — there is no single per-record loop to count; every record-level helper
   is a shared set-op walker used by many callers and instrumenting those would emit
   mislabeled progress from unrelated call sites);
2. the rewound-branch pass announces each branch as `reconstructing rewound branch` with
   `current/total` (the `reconstructing ` prefix is load-bearing: it is an existing
   phase-4 matcher needle in the webapp classifier).

Counted events already render as a determinate bar + `label — k / N` text via
`reportStreamProgress` (webapp/app-fetch.ts:32). No every-100 stride is needed: these
loops are branch-scale (dozens), not record-scale, matching the per-target precedent in
`reconstruction_renderable.ts:44`. (Deviation from the task text's "scanning records
k/N every ~100 records" — same visible outcome, smaller diff; note it in the summary.)

### Step 163.1 — RED: two tests in `jfred/tests/reconstruction_branches.test.ts`

Mirror the existing sink-capture pattern in that file (capture full `ProgressEvent`s,
not just labels — the assertions need `current`/`total`):

```ts
// task 163: the branch enumeration ran silently between the "constructing branches"
// stage label and the first per-target counter — each abandoned-tip scan now announces
// its position through the progress sink.
test("test_find_conversation_branches_announces_each_abandoned_tip_scan", () => {
    // Install a capturing progress sink around a branch-aware reconstruction of S19
    // (a conv-rewind transcript: it has at least one abandoned tip).
    const capturedEvents: ProgressEvent[] = [];
    setReconstructionProgressSink((event) => capturedEvents.push(event));
    try {
        reconstructBranches(loadRecords(S19_JSONL));
    } finally {
        setReconstructionProgressSink(undefined);
    }
    // The first tip scan announced itself as a counted event (current 1 of a positive total).
    // NOTE: do NOT compare totals against the captured-event count — the pipeline re-enters
    // findConversationBranches (e.g. per-branch accepted-edit passes, nested lineage replays),
    // so the same 1..N sequence can legitimately repeat.
    const tipScans = capturedEvents.filter((event) => event.label === "scanning branch tips");
    assert.ok(tipScans.length > 0);
    assert.equal(tipScans[0]!.current, 1);
    assert.ok(tipScans[0]!.total! >= 1);
});

// task 163: each rewound branch's reconstruction ran with NO progress emission — the
// rewound pass now announces each branch as a counted event before reconstructing it.
test("test_reconstruct_branches_announces_each_rewound_branch", () => {
    const capturedEvents: ProgressEvent[] = [];
    setReconstructionProgressSink((event) => capturedEvents.push(event));
    try {
        reconstructBranches(loadRecords(S19_JSONL));
    } finally {
        setReconstructionProgressSink(undefined);
    }
    // The first rewound branch announced its position out of a positive branch count.
    // (Same re-entrancy caveat as above: never compare total to the captured-event count.)
    const rewoundEvents = capturedEvents.filter((event) => event.label === "reconstructing rewound branch");
    assert.ok(rewoundEvents.length > 0);
    assert.equal(rewoundEvents[0]!.current, 1);
    assert.ok(rewoundEvents[0]!.total! >= 1);
});
```

Imports to add to the test file: `reconstructBranches` from `../src/reconstruction_engine.ts`,
`type ProgressEvent` from `../src/parse/loadTranscript.ts`.
Run `node --test tests/reconstruction_branches.test.ts` — both new tests must FAIL.

### Step 163.2 — GREEN (engine)

**`jfred/src/reconstruction_branch.ts`** — in `findConversationBranches` (line ~92), hold
the tips array and emit before each rewind-point walk. Import
`reportReconstructionProgress` from `./reconstruction_progress.ts`:

```ts
    const abandonedTips = collectAbandonedHeads(records, survivingSet);
    for (const [tipIndex, tip] of abandonedTips.entries()) {
        // task 163: the rewind-point walk per tip is the enumeration's real work — announce
        // it so the "constructing branches" stage shows motion before the first per-target line.
        reportReconstructionProgress("scanning branch tips", tipIndex + 1, abandonedTips.length);
        const rewindPoint = findRewindPoint(records, tip, survivingSet);
        branches.push({ tip, rewindPoint, isSurviving: false });
    }
```

**`jfred/src/reconstruction_engine.ts`** — in `reconstructBranches` (line ~219), announce
each rewound branch. Import `reportReconstructionProgress` from
`./reconstruction_progress.ts` (check it isn't already imported):

```ts
    const rewoundHistories = rewoundBranches.map((branch, branchIndex) => {
        // task 163: buildRewoundBranchHistory emitted nothing — a counted line per branch
        // keeps the bar moving through the rewound pass. The `reconstructing ` prefix keeps
        // the webapp classifier in phase 4 (Building document).
        reportReconstructionProgress("reconstructing rewound branch", branchIndex + 1, rewoundBranches.length);
        return buildRewoundBranchHistory(records, branch, reader);
    });
```

(The task text also wanted "— <m> records" on that label; skipped — it needs threading
index/total into the private `buildRewoundBranchHistory` for a cosmetic suffix, and the
counted k/N already delivers the motion. Note as a deviation.)

Re-run the two tests — GREEN.

### Step 163.3 — RED then GREEN (webapp classifier)

`"reconstructing rewound branch — 1 / 3"` already classifies to phase 4 via the existing
`"reconstructing "` needle. `"scanning branch tips — 1 / 12"` matches NO needle today.

RED — add to `jfred/tests/loading-progress.test.ts` next to the existing classifier tests
(section C1):

```ts
// task 163: the branch-enumeration counter must land in phase 4 (Building document),
// like every other deep-engine label of the build stage.
test("test_classifyLoadPhase_places_branch_tip_scanning_in_the_build_phase", () => {
    assert.equal(classifyLoadPhase("scanning branch tips — 3 / 12"), 4);
});
```

Run `node --test tests/loading-progress.test.ts` — the new test FAILS
(classifier returns `undefined`).

GREEN — `jfred/webapp/app-progress.ts`: add `"scanning branch tips"` to
`LOAD_PHASE_MATCHERS[3]` (the phase-4 row, alongside `"constructing branches"`). Re-run — GREEN.

---

## Task 164 — overlay scoped to the timeline pane + Cancel-with-confirm

**Behavior (plain English):** the loading overlay must cover ONLY the timeline pane
(`#timeline-pane`), leaving the console, inspector, and header usable. The progress box
gains a `Cancel` button; clicking it swaps in an in-DOM confirm row ("Cancel this
reconstruction?" + Yes/No — never `window.confirm`, the codebase bans native dialogs for
headless automation, see app-header.ts:25). Yes navigates to the project picker by
setting `location.hash = "#/"` — the overlay only ever exists during a project-route load
(`fetchDocument` and the timeline row build both run under `#/project/...`), so the hash
always changes, `hashchange` fires `renderRoute`, and `renderRoute` (app-router.ts:60)
already aborts the in-flight load. One code path, no app-router import, no module cycle.
The console's `#console-cancel` button is retired — one cancel affordance.

### Step 164.1 — RED: new file `jfred/tests/app-progress.test.ts`

Mirror `tests/app-header.test.ts`'s harness usage: `setupWebappDom()` from
`./webapp-dom-test-helpers.ts` BEFORE dynamically importing `../webapp/app-progress.ts`.
Reset the module's singleton between tests with `hideLoadingProgress()` in `finally`.

Tests (one behavior each, plain-English step comments per the TDD guide):

```ts
// task 164: the overlay must block ONLY the timeline pane, so the console and inspector
// stay usable during a load.
test("test_showLoadingProgress_mounts_the_overlay_inside_the_timeline_pane", ...)
    // showLoadingProgress("constructing branches", Number.NaN);
    // assert the .timeline-progress-overlay element's parent is the element with id "timeline-pane".

test("test_cancel_button_reveals_the_inline_confirm_row", ...)
    // showLoadingProgress(...); click the .timeline-progress-cancel button;
    // assert the confirm row (.timeline-progress-confirm) is no longer hidden
    // and location.hash is unchanged (no navigation before the user confirms).

test("test_confirm_no_restores_the_cancel_button", ...)
    // click Cancel, then click the "No" button;
    // assert the confirm row is hidden again and the Cancel button is visible.

test("test_confirm_yes_navigates_to_the_project_picker", ...)
    // set window.location.hash = "#/project/demo" first; showLoadingProgress(...);
    // click Cancel, then click "Yes, cancel";
    // assert window.location.hash === "#/".
```

Run `node --test tests/app-progress.test.ts` — all FAIL (no cancel elements, overlay
mounts on body).

### Step 164.2 — GREEN: `jfred/webapp/app-progress.ts`

In the creation branch of `showLoadingProgress` (lines 69–84):

1. Build the cancel/confirm UI and append it to the box after `stageTrack`:

```ts
        // task 164: cancel affordance ON the box (the overlay blocks the pane under it).
        // Confirm is in-DOM, never window.confirm — native dialogs block headless automation.
        const cancelButton = el("button", { class: "toolbar-btn timeline-progress-cancel", text: "Cancel" });
        const confirmYesButton = el("button", { class: "toolbar-btn", text: "Yes, cancel" });
        const confirmNoButton = el("button", { class: "toolbar-btn", text: "No" });
        const confirmRow = el("div", { class: "timeline-progress-confirm" }, [
            el("span", { text: "Cancel this reconstruction?" }),
            confirmYesButton,
            confirmNoButton,
        ]);
        confirmRow.hidden = true;
        cancelButton.addEventListener("click", () => {
            cancelButton.hidden = true;
            confirmRow.hidden = false;
        });
        confirmNoButton.addEventListener("click", () => {
            confirmRow.hidden = true;
            cancelButton.hidden = false;
        });
        confirmYesButton.addEventListener("click", () => {
            // The overlay only exists during a project-route load, so the hash always changes:
            // hashchange -> renderRoute -> inflightLoadController.abort() (app-router.ts) tears
            // the load down. No direct abort call — one cancellation path.
            window.location.hash = "#/";
        });
```

   (Verify `el`'s attribute handling supports `text` on buttons — it is used with
   `text` throughout timeline-render-rows.ts. Set `.hidden` via property as shown, not
   via `el` attrs, matching how `hidden` is toggled elsewhere.)

2. Mount into the pane instead of the body (line 101–103):

```ts
    if (!elements.overlay.isConnected) {
        // task 164: pane-scoped — the console/inspector stay interactive during a load.
        (document.getElementById("timeline-pane") ?? document.body).append(elements.overlay);
    }
```

3. Update the module header comment (body-level overlay → timeline-pane-scoped overlay).

Re-run `node --test tests/app-progress.test.ts` — GREEN.

### Step 164.3 — CSS: `jfred/webapp/styles.css`

1. `#timeline-pane` (line ~305): add `position: relative;` (the overlay's containing block).
2. `.timeline-progress-overlay` (line ~1001): change `position: fixed` → `position: absolute`
   (keep `inset: 0`, `z-index: 50`). Update the two explanatory comments: the overlay now
   covers only the timeline pane; clicks still pass through the backdrop
   (`pointer-events: none` stays) but the box itself becomes interactive.
3. `.timeline-progress-box`: add `pointer-events: auto;` (the Cancel button must be clickable
   under a pointer-events-none overlay).
4. New rules, next to the box rules:

```css
.timeline-progress-cancel { align-self: flex-end; }
.timeline-progress-confirm { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
```

### Step 164.4 — retire `#console-cancel`

1. `jfred/webapp/index.html:92` — delete the `#console-cancel` button line.
2. `jfred/webapp/app.ts:78-81` — delete the `console-cancel` click-listener block.
3. `jfred/webapp/app-fetch.ts` — delete `setCancelButtonVisible` (lines ~106-110) and its
   two call sites (after `inflightLoadController = controller;` and in the `finally`).
   KEEP `inflightLoadController` and its export — app-router.ts still aborts through it.
   Update the comment above `inflightLoadController` (the "console Cancel button" sentence
   → the progress box's Cancel navigates to `#/`, which aborts via renderRoute).
4. Do NOT hand-edit `webapp/dist/` — it is build output; the user's next build regenerates it.
5. Grep `console-cancel` across `webapp/` and `tests/` (excluding `dist/` and `.plate/`) to
   confirm zero remaining references.

### Step 164.5 — verify

- `node --test tests/app-progress.test.ts tests/reconstruction_branches.test.ts tests/loading-progress.test.ts`
- `npx tsc --noEmit` (repo's typecheck config — use `npm run typecheck` if that script exists).
- Do not run the full suite or launch the app.

Known limitation (pre-existing, unchanged): cancelling during the client-side row build
(item 78) navigates immediately but the superseded build drains into its detached pane
before its `finally` removes the overlay — same behavior the body-level overlay had.

---

## After both tasks

Stage everything in `jfred/` (`git add` the edited/new files; never `git add demo`-style
gitlinks — only the named files) and stage nothing in RevEng root except what tackle-tasks
already staged. Do not commit.
