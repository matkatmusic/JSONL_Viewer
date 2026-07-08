## 2026-07-07:22:55:00 — Diff context lines + line-number gutters (server + client)
Chat title: proud-gosling
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/2b12148a-1596-49d2-93a9-902fd62f76bf.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/src/reconstruction_render.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/src/viewer_api.ts

### Design decisions

- Root cause of "no context, no line numbers": `/api/diff` served `renderDiff`'s
  human-oriented text (kind header + bare -/+ lines) — position info was discarded
  server-side. Fixed at the source: new `renderDiffWithContext` in reconstruction_render.ts
  keeps the per-revision kind headers (the client's block delimiters) and adds standard
  `@@ -a,b +c,d @@` hunks with 3 context lines, computed from LineEntry back-pointers (sound
  because the engine carries kept lines forward unchanged — reconstruction_replay_edit.ts).
- `renderDiff` (CLI --diff view) untouched; the kind-header logic was extracted into a shared
  `computeDiffBlockHeader` so both renderers emit identical headers.
- Client `splitDiffBlocks` now splits only on kind headers ("@@ " not followed by "-"), so
  numeric hunks stay inside their revision block; `computeSplitRows` seeds old/new gutter
  counters from the numeric headers; the split grid grew to 4 columns
  (old № | old text | new № | new text).
- Within a change region removals are emitted before additions (unified-diff order).

### Deviations

- None from the request. Line numbers appear in the split view's gutters; the inline toggle
  view keeps the raw unified text (numbers live in its `@@` headers).

### Tradeoffs

- Hunk range convention matches git (`-0,0` / `+0,0` for an absent side); pure-add/pure-del
  hunks at file boundaries carry no context because none exists.
- 3 context lines fixed (DIFF_CONTEXT_LINE_COUNT) — make it a query param only if someone
  asks for more.

### Open questions

- The `@@ -a,b +c,d @@` hunk rows are rendered visibly (git-style) between hunks; hide them
  if they read as noise?

### Verification evidence

- `npm test`: 491/491 pass (6 new renderDiffWithContext tests, 1 splitDiffBlocks test,
  updated + 1 new computeSplitRows tests). User independently confirmed 85/85 scenarios
  reconstruct and all tests pass.
- Viewer server restarted (same flags) to load the new renderer.
- Integration check (real `/api/diff` response through the real client functions in node,
  s74 core_alpha.py revision 2 — the screenshot's exact case): 5 revision blocks, numeric
  hunk header present, 3 context rows (e.g. `def a_two(x):` old 9/new 9), 8/8 pair rows
  numbered.
- gstack browse daemon was unstable this session (died between and within invocations,
  3 attempts) — DOM-level spot check of the new gutters not captured; the rendering delta vs
  the already-DOM-verified grid is mechanical (two extra cells per row).

## 2026-07-07:16:56:00 — Side-by-side diffs (default) with inline toggle
Chat title: proud-gosling
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src/2b12148a-1596-49d2-93a9-902fd62f76bf.jsonl

### References

/Users/matkatmusicllc/.claude/plans/every-time-a-diff-proud-gosling.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/handoff-develop-20260707-1805.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md

### Design decisions

- All three webapp diff surfaces (Diff-vs-Base view, timeline picked-range file preview,
  timeline per-revision `+/-` drawer) route through the single `renderDiffText` in
  `webapp/views/diff-vs-base.js`, so the feature is one function rewrite; the call sites in
  `webapp/views/timeline.js` were not touched.
- The unified one-char prefix (` `, `-`, `+`) is stripped inside split-view hunk cells — the
  columns themselves signal add/del. Full-width rows (hunk headers, preamble) keep raw text
  and today's inline color classes (`--- a/f` red, `+++ b/f` green — rendering parity).
- The toggle button renders inside the diff pane itself (first child, `.diff-view-toggle`),
  so every surface gets it with zero call-site changes.
- Row kinds and display modes are frozen const objects (`SplitRowKind`, `DiffDisplayMode`)
  so comparisons use members, not scattered bare strings (coding-requirements §4 in spirit;
  webapp is plain JS so no TS enum).
- A missing side in an unequal `-`/`+` run renders as an empty `div` to keep the 2-column
  grid aligned.

### Deviations

- Plan expected the suite at baseline 466/467 with the pre-existing s85 scenario_coverage
  failure. Reality: **483/483 pass** — the concurrent engine session fixed s85 and grew the
  suite; nothing in this change touched it.
- None from the spec's behavior: all 5 planned RED tests were written first, failed on the
  missing export, then passed after implementation.

### Tradeoffs

- No line-number gutters and no word-level intra-line highlighting — the previous inline
  renderer had neither, so parity kept the diff small; `@@` headers still carry the numbers.
- Toggle persistence is a module-level variable (sticks for the session across re-renders and
  routes, resets to side-by-side on reload). localStorage was deliberately skipped — it would
  be the webapp's first persisted preference; two lines if ever wanted.
- Deletion/addition runs are zipped positionally (row i left = deletion i), not
  similarity-matched — standard split-diff behavior, no library needed.

### Open questions

- Should the inline/side-by-side choice survive page reloads (localStorage)? Currently
  session-only per the planning answer.
- The drawer surfaces are narrow (~40% column); if side-by-side feels cramped there, the
  per-surface default could differ (e.g. drawer inline, full view split) — not built.

### Verification evidence

- `npm test`: 483/483 pass (5 new `computeSplitRows` tests included).
- Headless DOM (server 127.0.0.1:7343, consent pre-seeded, single browse invocations):
  - vsbase route (s43 inventory.py): default `{splitGrids:1, gridCells:216, fullRows:2}`;
    after toggle `{splitGrids:0, inlineLineDivs:110}`; after second toggle `{splitGrids:1}`.
  - timeline `+/-` drawer: `{drawerSplitGrids:1, drawerToggleButtons:1}`.
  - picked-range file preview (2 steps picked, inventory.py chip):
    `{drawerSplitGrids:1, drawerToggleButtons:1}`.
