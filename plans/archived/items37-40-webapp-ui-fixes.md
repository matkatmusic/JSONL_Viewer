# Plan: TASKS.md items 37–40 — four webapp UI fixes

All four bugs verified live at HEAD `99e5b69`. No test suite runs — the user runs tests.
The only verification command allowed is `npm run build:webapp` (tsc compile, not a test).

Files touched: `webapp/views/diff-vs-base.ts`, `webapp/views/timeline.ts`,
`webapp/styles.css`, `tests/viewer-viewmodels.test.ts`, `TASKS.md`.

---

## Step 1 — Item 40: line numbers in the inline diff view (TDD)

**Behavior (plain English):** the inline diff view walks the unified diff text in original
order and shows two line-number gutters (old file, new file) beside each line. A hunk header
`@@ -a,b +c,d @@` seeds the counters at `a` and `c`. A deletion line gets only an old number;
an addition line gets only a new number; a context line inside a hunk gets both; preamble
lines before any hunk and the hunk headers themselves get neither.

### 1a. RED — tests first

Append to `tests/viewer-viewmodels.test.ts` (the existing home of `computeSplitRows` tests,
line ~371; copy their import/style). Import `computeInlineRows` from
`../webapp/views/diff-vs-base.ts` in the existing import at line 14.

The row type under test: `{ text: string; lineClass: string; oldLineNumber?: number; newLineNumber?: number }`,
one row per raw diff line, in original line order, `text` keeping its `-`/`+`/space prefix
(the inline view renders raw unified lines today — behavior unchanged except gutters).

Four tests, each with plain-English step comments per the TDD guide:

- `test_computeInlineRows_numbers_context_lines_on_both_sides` —
  input `"@@ -3,2 +7,2 @@\n keep"`; assert row 1 is
  `{ text: " keep", lineClass: "", oldLineNumber: 3, newLineNumber: 7 }`.
- `test_computeInlineRows_numbers_deletions_on_old_side_only` —
  input `"@@ -1,2 +1,1 @@\n-gone\n keep"`; assert the `-gone` row has
  `oldLineNumber: 1` and no `newLineNumber`, and the ` keep` row has `oldLineNumber: 2, newLineNumber: 1`
  (deletion advanced only the old counter).
- `test_computeInlineRows_numbers_additions_on_new_side_only` —
  input `"@@ -1,1 +1,2 @@\n+born\n keep"`; assert the `+born` row has
  `newLineNumber: 1` and no `oldLineNumber`, and ` keep` has `oldLineNumber: 1, newLineNumber: 2`.
- `test_computeInlineRows_leaves_preamble_and_hunk_headers_unnumbered` —
  input `"revision #2\n@@ -1,1 +1,1 @@\n same"`; assert the first two rows have neither
  number field, the preamble row has `lineClass: ""`, and the header row has
  `lineClass: "diff-line-hunk"`.

Do NOT run the tests (user runs the suite). RED is satisfied by the function not existing yet.

### 1b. GREEN — implement `computeInlineRows`

In `webapp/views/diff-vs-base.ts`, below `computeSplitRows` (so it reuses
`NUMERIC_HUNK_HEADER` and `computeFullRowLineClass`):

```ts
// One rendered inline-view line; number fields are set only when a numeric hunk header has
// seeded that side's counter (item 40).
export type InlineRow = { text: string; lineClass: string; oldLineNumber?: number; newLineNumber?: number };

// Unified diff text -> inline rows in original line order. "@@ -a,b +c,d @@" headers seed the
// per-side counters; "-" advances old only, "+" advances new only, context advances both.
export function computeInlineRows(diffText: string): InlineRow[] {
    const rows: InlineRow[] = [];
    let insideHunk = false;
    let oldLineCounter: number | undefined = undefined;
    let newLineCounter: number | undefined = undefined;
    for (const line of diffText.split("\n")) {
        if (line.startsWith("@@")) {
            insideHunk = true;
            const numericHeader = NUMERIC_HUNK_HEADER.exec(line);
            oldLineCounter = numericHeader === null ? undefined : Number(numericHeader[1]);
            newLineCounter = numericHeader === null ? undefined : Number(numericHeader[2]);
            rows.push({ text: line, lineClass: "diff-line-hunk" });
            continue;
        }
        const row: InlineRow = { text: line, lineClass: computeFullRowLineClass(line) };
        if (insideHunk && line.startsWith("-") && oldLineCounter !== undefined) {
            row.oldLineNumber = oldLineCounter++;
        }
        if (insideHunk && line.startsWith("+") && newLineCounter !== undefined) {
            row.newLineNumber = newLineCounter++;
        }
        if (insideHunk && !line.startsWith("-") && !line.startsWith("+")) {
            if (oldLineCounter !== undefined) {
                row.oldLineNumber = oldLineCounter++;
            }
            if (newLineCounter !== undefined) {
                row.newLineNumber = newLineCounter++;
            }
        }
        rows.push(row);
    }
    return rows;
}
```

(`noUncheckedIndexedAccess` is on: keep the `Number(numericHeader[1])` pattern exactly as
`computeSplitRows` line 99 already does — regex groups type as `string | undefined` and
`Number(undefined)` is avoided by the null check on the whole match, matching the existing
precedent.)

### 1c. Rewire `renderInlineDiffLines` to a numbered grid

Replace the body of `renderInlineDiffLines` (diff-vs-base.ts:161-165). Per the user's
"comment out, don't delete" preference, comment out the old loop and add:

```ts
// Inline view as a 3-column grid: old number | new number | raw unified line (item 40); the
// text column wraps instead of overflowing the pane (item 39).
function renderInlineDiffLines(pane: HTMLElement, diffText: string): void {
    const grid = el("div", { class: "diff-inline" });
    for (const row of computeInlineRows(diffText)) {
        grid.append(
            el("div", { class: "diff-line-num", text: row.oldLineNumber === undefined ? "" : String(row.oldLineNumber) }),
            el("div", { class: "diff-line-num", text: row.newLineNumber === undefined ? "" : String(row.newLineNumber) }),
            el("div", { class: row.lineClass, text: row.text }),
        );
    }
    pane.append(grid);
}
```

Note: hunk-header rows also emit two empty gutter cells + the text cell — the
`.diff-line-hunk` rule collapses the text to a dashed separator (styles.css:246) and the
empty gutters are invisible, so no special full-row casing is needed.

## Step 2 — Item 39: diff pane must not overflow its pane (CSS only)

In `webapp/styles.css`:

- Line 240: change `.diff-text { white-space: pre; font-size: 12px; }` to
  `.diff-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }`.
  (Root cause: `pre` forbids wrapping, so long diff lines set the pane's scroll width.
  `.diff-split > div` at line 250 already uses exactly this wrapping pair — this makes the
  container consistent.)
- Add the inline grid rules next to the `.diff-split` block (line 249), mirroring it:

```css
/* Inline view grid: old number | new number | raw line (items 39/40). */
.diff-inline { display: grid; grid-template-columns: max-content max-content 1fr; column-gap: 8px; font-size: 12px; }
.diff-inline > div { white-space: pre-wrap; overflow-wrap: anywhere; }
.diff-inline .diff-line-num { color: var(--muted); text-align: right; user-select: none; }
```

- Lines 143-145: the `.inspector-pane.file-preview-drawer .diff-text` override is now
  redundant (base rule wraps). Comment it out with a note
  (`/* item 39: base .diff-text now wraps — override retired */`), per the
  comment-out-don't-delete preference.

CSS has no unit-test surface here; precedent is item 10e (CSS-only, view-model untouched).

## Step 3 — Item 38: anchored outline clipped on the left (CSS only)

`webapp/styles.css:214`: change
`.anchored { outline: 2px solid var(--anchor); }` to
`.anchored { outline: 2px solid var(--anchor); outline-offset: -2px; }`.

Why: `outline` paints OUTSIDE the border box; inside a scroll container with no left padding
(`.inspector-content`, styles.css:124) the left 2px falls outside the scrollable content box
and is clipped. `outline-offset: -2px` draws the ring fully inside the element's own box, so
no ancestor can occlude it. Applies to both users of `.anchored` (file-history revision rows
and timeline rows/sessions) — same fix everywhere, no per-caller patching.

## Step 4 — Item 37: center the anchored timeline row AFTER the drawer opens

`webapp/views/timeline.ts:1340-1350`. The bug: `anchoredRow.scrollIntoView({ block: "center" })`
(line 1347) runs before `openTranscriptInspector(...)` (line 1349) expands the Details pane;
the pane expansion shrinks the timeline column (`.layout.timeline-route .inspector-pane`,
styles.css:129), every bubble reflows to the new width, and the previously-centered row lands
elsewhere.

Fix: `openTranscriptInspector` is synchronous (inspector.ts:475), so move the scroll after it —
`scrollIntoView` forces layout against the post-expansion widths. Comment out the old call
in place (comment-out-don't-delete):

```ts
        const anchoredRow = nodeRows.get(nodeIndex);
        if (anchoredRow !== undefined) {
            anchoredRow.classList.add("anchored");
            // item 37: scroll moved below openTranscriptInspector — the drawer expansion
            // reflows every bubble, so centering must run against the post-drawer layout.
            // anchoredRow.scrollIntoView({ block: "center" });
        }
        openTranscriptInspector({ jsonlName: anchorJsonl!, rawLines, line: rawLineIndex });
        anchoredRow?.scrollIntoView({ block: "center" });
```

DOM-order behavior has no unit-test surface in the node test runner (no DOM); precedent:
prior timeline scroll/anchor work shipped without DOM tests.

## Step 5 — Verify compile + close the tasks

1. Run `npm run build:webapp` — must exit clean (this is a compile, not a test run).
2. `TASKS.md`: mark items 37, 38, 39, 40 `[x]` with one-line closing summaries naming the
   fix location (timeline.ts scroll reorder; `.anchored` outline-offset; `.diff-text`
   pre-wrap + retired drawer override; `computeInlineRows` + `.diff-inline` grid, tests
   written not run).
3. `git add` all touched files (stage only — NO commit).
