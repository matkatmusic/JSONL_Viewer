# Task 319 — split-diff cells lead with their +/-/space marker

Scope: `jfred/webapp/diff-render.ts` + `jfred/tests/diff-render.test.ts` only.
Do NOT touch `diff-vs-base-model.ts` (tests pin stripped cell text) or
`webapp/views/diff-vs-base.ts` (different view, out of scope).

## Step 1 — test first (jfred/tests/diff-render.test.ts)

Update the two existing split-view expectations to include the marker, and add
a context-marker assertion:

- `.dc-body.dc-add` textContent: `"const added = 2;"` → `"+const added = 2;"`
  (both the hljs test ~line 44 area and the no-hljs test ~line 54).
- In the hljs split test, keep asserting the `span.hljs-keyword` textContent is
  `"const added = 2;"` — the marker must stay OUTSIDE the highlighted span.
- Add: a context cell (plain `.dc-body` with no dc-add/dc-del class) leads with
  a single space: textContent starts with `" "`.
- Empty filler cells (undefined side) stay empty — no marker.

## Step 2 — implement (jfred/webapp/diff-render.ts)

In `appendSplitCellPair` (line 68), replace

```ts
renderCellCode(cellBody, cell.text, language);
```

with a sign derived from the already-computed `cellClass` and rendered through
the existing `appendMarkedCode` helper (it appends the marker as plain text and
highlights only the code behind it):

```ts
const sign = cellClass === "dc-del" ? "-" : cellClass === "dc-add" ? "+" : " ";
appendMarkedCode(cellBody, sign + cell.text, language);
```

No other change. Hunk header rows and undefined filler cells keep their current
rendering.

## Step 3 — verify

1. `npm run typecheck` (or `tsc` per package scripts) in jfred.
2. Run only `node --test tests/diff-render.test.ts` to confirm the new
   expectations (full suite is the user's job).
3. `npm run build:webapp`, then visually verify with
   `jfred/scripts/visual/cdp.ts` against the mockup
   (`plans/archived/layer1-mockup.html` split mode): every split text cell
   leads with `+`/`-`/space; inline mode unchanged.
