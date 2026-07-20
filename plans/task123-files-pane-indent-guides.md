# Task 123 — Files pane: Fork-style nesting indicators and folder hierarchy

## Goal (what done looks like)

The FILES sidebar (and the details pane's "Files touched" tree, which shares the same
renderer) reads like Fork's file tree: every child row sits one clear indent step to the
RIGHT of its parent folder's name, a vertical guide line runs down each folder's children,
chevrons appear only on folder rows, and folder rows are at least as visually prominent as
file rows. The user approved this exact look in the mockup
`indent-guides-mockup.html` (left pane, "with vertical indent guides").

Current defect being fixed (verified in code, not just the screenshot): each nesting level
indents children by only 10px (`styles.css:198`) while the folder `<summary>`'s own
disclosure-triangle + 📁 prefix is ~30px wide, so a folder's NAME renders further right
than its children's names — containment reads inverted.

## Files touched (only these two)

1. `jfred/webapp/views/sidebar.ts` — wrap a folder's children in one `<div class="file-folder-kids">`.
2. `jfred/webapp/styles.css` — replace the Files-pane tree metrics (lines ~171-198).

No view-model changes: `webapp/views/timeline-file-tree.ts` already builds a correct
nested tree and its tests (`tests/timeline-file-tree*.test.ts`) stay untouched.

## Tests

No new test file. Rationale the implementer must not re-litigate: this change adds zero
pure logic — it is DOM grouping + CSS. `sidebar.ts` registers a `document`-level click
listener at module scope (`sidebar.ts:164`), so it cannot be imported under the project's
`node --test` runner (no DOM); that is why no DOM test of this module exists today. The
existing view-model tests already pin the tree SHAPE. Do not run any test suite — the
user runs tests afterward.

## Step 1 — sidebar.ts: group folder children in a kids wrapper

In `renderFileTreeNode` (sidebar.ts:106-117), the folder branch currently spreads children
directly into the `<details>`. Replace it so the children render inside ONE wrapper div —
the wrapper is what the CSS indents and draws the guide line on (a per-child border would
break into segments on the `.deleted` row's `opacity: 0.55`):

```ts
    if (node.kind === FOLDER_NODE_KIND) {
        // open: "" — el's attrs are Record<string, string | EventListener> (webapp/app.ts:31), so a
        // boolean will not typecheck; el forwards unknown keys to setAttribute, and a present `open`
        // attribute is what expands a <details>.
        return el("details", { class: "file-folder", open: "" }, [
            el("summary", { class: "file-folder-name", text: node.name }),
            // task 123: one wrapper per folder — the CSS indents it one step and draws the
            // vertical guide line on its left border.
            el("div", { class: "file-folder-kids" },
                node.children.map((child) => renderFileTreeNode(child, callbacks, selectionRoot, coverage))),
        ]);
    }
```

Keep everything else in the file unchanged. Two behaviors that must keep working, and do:
- `<details>` toggling hides every non-summary child — the single wrapper div is exactly
  that, so collapse still works with no JS.
- The coverage popover inserts with `item.after(popover)` (sidebar.ts:202) — it lands
  inside the same kids wrapper, under the row, as before.

## Step 2 — styles.css: Fork-style tree metrics

Replace lines 171-198 (`.file-item` through `.file-folder > *:not(summary)`). The
`.file-folder > *:not(summary)` rule is DELETED (its job moves to `.file-folder-kids`).
Per the user's "comment out, don't delete" rule, comment the replaced block out at the
bottom of the tree section with a `/* task 123: pre-Fork-style metrics */` header instead
of removing it.

New rules (exact starting values; Step 3 tunes them visually):

```css
/* Item 77: the Files pane is a tree. A folder is a native <details open> (no toggle JS).
   Task 123 (Fork-style): decorations live in fixed-width columns so names at one depth
   share a left edge; each .file-folder-kids wrapper indents one step and draws the
   vertical guide line; chevron only on folder rows; folders as prominent as files. */
.file-item {
    padding: 3px 10px;
    font-family: var(--mono);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    color: var(--text);
}
/* File icon in a fixed column, offset by an empty 13px chevron column so file names
   align with sibling folder names. */
.file-item::before {
    content: "📄";
    display: inline-block;
    width: 21px;
    margin-left: 13px;
}
.file-item:hover { background: var(--sel-hover); }
.file-item.selected { background: var(--sel); color: #fff; }
.file-item .revcount { color: var(--muted); margin-left: 6px; }
.file-item.selected .revcount { color: #bcd0ea; }
.file-folder > summary {
    padding: 3px 10px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    cursor: pointer;
    white-space: nowrap;
    list-style: none;
}
.file-folder > summary::-webkit-details-marker { display: none; }
/* Own chevron + folder icon in one fixed 34px column (native marker hidden above so the
   column width is deterministic across browsers). */
.file-folder > summary::before {
    content: "▸ 📁";
    display: inline-block;
    width: 34px;
    color: var(--muted);
}
.file-folder[open] > summary::before { content: "▾ 📁"; }
.file-folder > summary:hover { background: var(--sel-hover); }
/* One indent step per depth; the left border IS the vertical guide, sitting under the
   parent's chevron. */
.file-folder > .file-folder-kids {
    margin-left: 16px;
    border-left: 1px solid var(--border);
}
```

Why these numbers (so the implementer doesn't re-derive them): summary text starts at
`10px padding + 34px column = 44px`; a child file's text starts at
`16px kids margin + 10px padding + 13px + 21px = 60px`; a child folder's name at
`16 + 10 + 34 = 60px`. So every child name starts exactly 16px right of its parent's
name, uniformly for files and folders — that uniform step is the whole fix.

Untouched on purpose: `.file-item.deleted`, `.rename-badge` rules (lines 200-203),
`.covbar` rules (~1010), `.session-item`, `.pane-title`.

## Step 3 — typecheck and visual sanity

1. Typecheck only (no test suite): `cd jfred && npx tsc -p tsconfig.webapp.json --noEmit`
   (run `npm install` first if `node_modules` is absent — RevEng submodules ship without it).
2. Load the app against s87 (`npm run app` in jfred; note the RevEng-root `npm run app`
   points at a near-empty projects dir — use jfred's) and eyeball the FILES pane against
   the approved mockup: guide lines under each folder, plans/tests children indented
   right of their folder names, folder names bright and bold. If a column width is
   visibly off (emoji metrics vary by platform), tune ONLY the `width` values in the two
   `::before` rules and the `16px` step — keep the "child name = parent name + one step"
   equation from Step 2 true.
3. Both trees must look right: the FILES sidebar and the details pane's "Files touched"
   column (same classes, no extra work expected — just look).

## Step 4 — stage, do not commit

`git add` the two changed files in the `jfred` submodule. Do NOT commit anywhere. The
plan file and implementation notes stay in RevEng's `plans/`.
