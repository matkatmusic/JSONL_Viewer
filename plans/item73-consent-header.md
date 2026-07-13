# Item 73 — Script Execution Consent Header

TASKS.md item 73. Give the consent dialog a sticky header that holds the
"This reconstruction contains N recorded script execution(s)" message, the two
decision buttons, a `[Jump to top]` button, `[< Prev] [Next >]` script
navigation with a "Script n of N" counter, and an `[Expand All]` button — so
scrolling the script previews never hides any of them.

Target header layout (two lines, per the task's design block):

```
This reconstruction contains N recorded script execution(s)…
[Run scripts for this reconstruction] [Continue without running]  <gap>  [Jump to top] [< Prev] [Next >] Script n of N [Expand All]
```

## Constraints the implementer must know

- **Do NOT run any tests or the typecheck/build.** The user runs everything
  after the work is staged. Write the tests, write the code, stage, stop.
- **Comment out, don't delete** any existing code this plan replaces (user's
  standing preference). The commented-out block stays until the user confirms.
- All files use 4-space indent, verb-named functions, imperative style.
- Everything lands in three files: `webapp/app.ts`, `webapp/styles.css`,
  `tests/viewer-viewmodels.test.ts`. Nothing else changes.

## Current code (read these before editing)

- `webapp/app.ts:441-521` — `renderConsentDialog(container, project, scripts)`.
  `container` is the `#view` element (`.view-pane`, the scroll container —
  `overflow-y: auto`, styles.css:241) for all six call sites
  (views/timeline.ts:1107, views/project.ts:107, views/file-history.ts:171,
  views/raw-lines.ts:58, views/diff-vs-base.ts:285, archive ignored).
  It builds `.consent-box` containing: an `h2` message, a `.muted` explanation
  line, an optional "Show/hide Read-only scripts" button, one `.consent-script`
  row per modifying script, `<details class="consent-readonly-block">` blocks
  wrapping contiguous read-only rows (closed by default), and a bottom
  `.consent-actions` row with the two decide buttons. It ends with the item-72
  wiring that drives the static `#toggle-all` button (index.html:34, which
  lives in the non-scrolling `#timeline-pane-header` row).
- `webapp/app.ts:419-435` — `buildConsentScriptRow` builds each
  `.consent-script` row. Rows appear in `box` in the same order as the
  `scripts` array (grouping at app.ts:462-472 is contiguous and
  order-preserving), so `box.querySelectorAll(".consent-script")[i]`
  corresponds to `scripts[i]`.
- `webapp/app.ts:642` — `renderRoute()`; clears `#view` at its top.
- `webapp/styles.css:678-689` — consent CSS. `.consent-box` has
  `padding: 12px 16px`. Variables `--orange`, `--panel`, `--border`, `--bg`
  exist in both themes.
- `tests/viewer-viewmodels.test.ts:597-630` — the existing consent test
  section; new tests go directly after it, same style (node `test()` +
  `assert`, plain-English step comments, `test_<behavior>` names).

## Design decisions (the "why", so questions have answers)

- **Sticky header, not a second skeleton row.** The header is the first child
  of `.consent-box` with `position: sticky; top: 0`. Native CSS does the
  "never scrolls out of view" requirement; the header is created and destroyed
  with the consent box itself, so no route-change cleanup is needed. Negative
  horizontal margins make it span the box's full width despite the box's
  16px side padding.
- **The header gets its own Expand All button; the static `#toggle-all` is
  hidden during consent.** The task puts `[Expand All]` at the right end of
  the consent header row. Rewiring item-72's logic onto a header-owned button
  and hiding `#toggle-all` avoids two visible Expand All buttons.
  `renderRoute` un-hides `#toggle-all` on every navigation so every other
  route is untouched.
- **"Visible script preview" = a `.consent-script` row with no closed
  `<details>` ancestor.** Modifying rows are always visible; read-only rows
  are visible only while their block is open. This definition is a DOM query
  (`row.closest("details:not([open])") === null`), deterministic, and needs no
  layout measurement.
- **Navigation state refreshes via one capture-phase `toggle` listener on the
  box.** `toggle` events from `<details>` don't bubble but are observable in
  the capture phase, and they fire for programmatic `open` changes too — so
  the per-block triangles, the "Show/hide Read-only scripts" button, and
  Expand All all refresh nav state through this single listener.
- **Selection is an element reference, re-validated against the visible list
  on every refresh.** If the selected row's block closes, selection falls back
  to the first visible row. Default on load is the first modifying script
  (spec); when no modifying script exists every row starts hidden, so the nav
  buttons and counter start hidden and appear when a read-only block opens.
- **No auto-scroll on load.** The spec asks for default *selection* only;
  scrolling happens on Prev/Next clicks (`scrollIntoView block: "center"`).

## Step 1 — RED: tests for the two pure helpers

Append to the consent section of `tests/viewer-viewmodels.test.ts`
(after line ~630), importing the two new names from `../webapp/app.ts`
alongside the existing consent imports at line 19:

```ts
// -------------------- consent header script navigation (item 73) --------------------

test("test_findDefaultConsentSelectionIndex_picks_first_modifying_script", () => {
    // Scenario: the consent header's default selection is the first modifying script.
    // Steps:
    // a script list holds two read-only scripts followed by a modifying one.
    const scripts = [makeConsentScript(1, true), makeConsentScript(2, true), makeConsentScript(3, false)];
    // the default selection index is the modifying script's position in the full list.
    assert.equal(findDefaultConsentSelectionIndex(scripts), 2);
});

test("test_findDefaultConsentSelectionIndex_treats_missing_flag_as_modifying", () => {
    // Scenario: a script without a readOnly flag counts as modifying (same rule as
    // groupConsentScriptsIntoBlocks).
    // Steps:
    // a script list holds one read-only script followed by one with no flag at all.
    const scripts = [makeConsentScript(1, true), { timestamp: "2026-01-01T00:00:02Z", code: "print(2)" }];
    // the unflagged script is the default selection.
    assert.equal(findDefaultConsentSelectionIndex(scripts), 1);
});

test("test_findDefaultConsentSelectionIndex_returns_undefined_when_all_read_only", () => {
    // Scenario: with no modifying script there is no default selection.
    // Steps:
    // a script list holds only read-only scripts.
    const scripts = [makeConsentScript(1, true), makeConsentScript(2, true)];
    // no index is returned.
    assert.equal(findDefaultConsentSelectionIndex(scripts), undefined);
});

test("test_clampConsentSelectionStep_advances_within_bounds", () => {
    // Scenario: stepping forward from the middle of three visible scripts selects the next one.
    assert.equal(clampConsentSelectionStep(1, 1, 3), 2);
});

test("test_clampConsentSelectionStep_clamps_at_last_script", () => {
    // Scenario: stepping forward from the last visible script stays on the last script.
    assert.equal(clampConsentSelectionStep(2, 1, 3), 2);
});

test("test_clampConsentSelectionStep_clamps_at_first_script", () => {
    // Scenario: stepping backward from the first visible script stays on the first script.
    assert.equal(clampConsentSelectionStep(0, -1, 3), 0);
});

test("test_clampConsentSelectionStep_enters_list_from_no_selection", () => {
    // Scenario: with no current selection (index -1, e.g. every row was hidden),
    // stepping forward lands on the first visible script.
    assert.equal(clampConsentSelectionStep(-1, 1, 3), 0);
});
```

`makeConsentScript` already exists at tests/viewer-viewmodels.test.ts:600.
Do not run the tests.

## Step 2 — GREEN: the pure helpers in `webapp/app.ts`

Insert immediately before `renderConsentDialog` (after
`buildConsentScriptRow`, app.ts:435):

```ts
// Default consent-header selection (item 73): the first modifying script, matching the
// missing-flag rule used by groupConsentScriptsIntoBlocks. undefined when every script is
// read-only — read-only rows start hidden inside closed <details>, so nothing is selectable.
export function findDefaultConsentSelectionIndex(scripts: WireConsentScript[]): number | undefined {
    const firstModifyingIndex = scripts.findIndex((script) => script.readOnly !== true);
    return firstModifyingIndex === -1 ? undefined : firstModifyingIndex;
}

// Prev/Next stepping over the currently visible consent rows (item 73): clamps at both ends
// instead of wrapping; a currentIndex of -1 (no selection yet) enters the list at row 0.
export function clampConsentSelectionStep(currentIndex: number, delta: number, visibleRowCount: number): number {
    return Math.min(visibleRowCount - 1, Math.max(0, currentIndex + delta));
}
```

## Step 3 — restructure `renderConsentDialog` (app.ts:441-521)

Rewrite the function body in this order. Keep `decide`, the read-only
Show/hide button, the block loop, and the expand-all logic — they only move
or change their attachment target.

1. **Build the header buttons** (all `class: "toolbar-btn"` except where noted):
   - `runButton` — `class: "toolbar-btn consent-run"`, text
     `"Run scripts for this reconstruction"`, `onclick: () => decide("1")`.
   - `continueButton` — text `"Continue without running"`,
     `onclick: () => decide("0")`.
   - `jumpToTopButton` — `class: "toolbar-btn consent-jump-top"`, text
     `"Jump to top"`, `onclick: () => container.scrollTo({ top: 0, behavior: "smooth" })`
     (`container` is the `#view` scroll pane).
   - `prevButton` — text `"< Prev"`; `nextButton` — text `"Next >"`.
   - `navCounter` — `el("span", { class: "muted consent-nav-counter" })`.
   - `expandAllButton` — text `"Expand All"` (wired in step 4).
2. **Build the header** and make it the box's first child:
   ```ts
   const header = el("div", { class: "consent-header" }, [
       el("h2", { text: `This reconstruction contains ${scripts.length} recorded script execution(s)${countSplit}` }),
       el("div", { class: "consent-header-row" }, [
           runButton, continueButton, jumpToTopButton, prevButton, nextButton, navCounter, expandAllButton,
       ]),
   ]);
   ```
   The `.consent-box` children become: `header`, then the existing `.muted`
   explanation line, then everything the current code appends. Comment out
   (do not delete) the old bottom `box.append(el("div", { class: "consent-actions" }, …))`
   block (app.ts:477-480) and the old standalone `h2` — both are replaced by
   the header.
3. **Script navigation state.** After the block loop, add:
   ```ts
   // item 73: Prev/Next walk the VISIBLE script rows — modifying rows always, read-only rows
   // only while their <details> block is open. Rows are in scripts[] order (grouping is
   // contiguous and order-preserving), so allConsentRows()[i] corresponds to scripts[i].
   const allConsentRows = () => [...box.querySelectorAll<HTMLElement>(".consent-script")];
   const collectVisibleConsentRows = () => allConsentRows()
       .filter((row) => row.closest("details:not([open])") === null);
   const defaultIndex = findDefaultConsentSelectionIndex(scripts);
   let selectedRow: HTMLElement | undefined = defaultIndex === undefined ? undefined : allConsentRows()[defaultIndex];
   const updateScriptNavState = () => {
       const visibleRows = collectVisibleConsentRows();
       if (selectedRow === undefined || !visibleRows.includes(selectedRow)) {
           // The selected row's block closed (or nothing was selectable yet): fall back to
           // the first visible row so the rectangle never sits on a hidden script.
           selectedRow = visibleRows[0];
       }
       for (const row of allConsentRows()) {
           row.classList.toggle("consent-selected", row === selectedRow);
       }
       const nothingNavigable = visibleRows.length === 0;
       prevButton.hidden = nothingNavigable;
       nextButton.hidden = nothingNavigable;
       navCounter.hidden = nothingNavigable;
       if (selectedRow !== undefined) {
           const selectedIndex = visibleRows.indexOf(selectedRow);
           prevButton.disabled = selectedIndex <= 0;
           nextButton.disabled = selectedIndex >= visibleRows.length - 1;
           navCounter.textContent = `Script ${selectedIndex + 1} of ${visibleRows.length}`;
       }
   };
   const navigateConsentScript = (delta: number) => {
       const visibleRows = collectVisibleConsentRows();
       if (visibleRows.length === 0) {
           return;
       }
       const currentIndex = selectedRow === undefined ? -1 : visibleRows.indexOf(selectedRow);
       selectedRow = visibleRows[clampConsentSelectionStep(currentIndex, delta, visibleRows.length)];
       updateScriptNavState();
       selectedRow!.scrollIntoView({ block: "center", behavior: "smooth" });
   };
   prevButton.onclick = () => navigateConsentScript(-1);
   nextButton.onclick = () => navigateConsentScript(1);
   // <details> toggle events don't bubble but ARE observable in the capture phase, and they
   // fire for programmatic open changes too — one listener covers the per-block triangles,
   // the Show/hide button, and Expand All.
   box.addEventListener("toggle", () => updateScriptNavState(), true);
   updateScriptNavState();
   ```
4. **Re-target the item-72 expand-all wiring** (app.ts:481-519): keep
   `collectExpandables`, `updateToggleAllLabel`, and the onclick body exactly
   as they are, but make `toggleAllButton` the new header `expandAllButton`
   instead of `document.getElementById("toggle-all")` (comment out the
   getElementById line; simplest is `const toggleAllButton = expandAllButton;`
   so the existing lines below it are untouched). Update the item-72 comment:
   the static `#toggle-all` is now hidden during consent and the header owns
   Expand All. Then hide the skeleton button:
   ```ts
   // item 73: the header row owns Expand All during consent; hide the skeleton button so two
   // Expand All buttons never show at once. renderRoute un-hides it on every navigation.
   (document.getElementById("toggle-all") as HTMLButtonElement).hidden = true;
   ```

## Step 4 — `renderRoute` un-hides the skeleton button

At the top of `renderRoute` (app.ts:642-646, right after
`view.replaceChildren()`):

```ts
// item 73: the consent dialog hides #toggle-all while its header owns Expand All; every
// navigation restores the skeleton button before the next view wires or ignores it.
(document.getElementById("toggle-all") as HTMLButtonElement).hidden = false;
```

## Step 5 — CSS (`webapp/styles.css`, consent section at 678-689)

```css
/* item 73: sticky consent header — the message, decision buttons, and script navigation stay
   visible while the previews scroll. Negative margins span the box's 12px/16px padding. */
.consent-header {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--panel);
    margin: -12px -16px 8px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
}
.consent-header-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
/* The gap in the header design: decision buttons left, navigation cluster right. */
.consent-jump-top { margin-left: auto; }
.consent-nav-counter { font-size: 11px; }
/* item 73: selection rectangle on the script row Prev/Next navigated to. */
.consent-script.consent-selected { outline: 2px solid var(--orange); outline-offset: 2px; }
```

Comment out the now-unused `.consent-actions` rule (styles.css:688) — keep
`.consent-run` (still used by the header's run button).

## Step 6 — TASKS.md and staging

- Mark item 73 `[x]` in TASKS.md with a short DONE note in the same style as
  items 70-72 above it (sticky header inside the consent box; header-owned
  Expand All with `#toggle-all` hidden during consent; Prev/Next over visible
  rows with clamp stepping and `scrollIntoView` centering; default selection =
  first modifying script).
- `git add` the four touched files (`webapp/app.ts`, `webapp/styles.css`,
  `tests/viewer-viewmodels.test.ts`, `TASKS.md`, this plan file). **Do not
  commit. Do not run tests, typecheck, or build:webapp.**

## Success criteria (user-verified after staging)

- `npm test` green, `npm run typecheck` clean, `npm run build:webapp` clean
  (user runs these).
- On a project with recorded scripts: header sticks while previews scroll;
  first modifying script outlined on load; Prev/Next scroll-center and
  re-outline; counter reads `Script n of N` over visible rows only; nav
  cluster hides when every row is inside closed read-only blocks and appears
  when one opens; Jump to top scrolls the pane to 0; header Expand All keeps
  item-72 behavior; the skeleton `#toggle-all` is hidden during consent and
  back on the timeline afterward.
