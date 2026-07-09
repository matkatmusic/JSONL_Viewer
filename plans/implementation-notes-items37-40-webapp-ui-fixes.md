## 2026-07-08:18:35:00 — TASKS.md items 37–40: four webapp UI fixes
Chat title: tackle-tasks 37, 38, 39, 40
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/85d2cade-cc7b-40ea-95f1-4ddc65752c42.jsonl

### References
/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/items37-40-webapp-ui-fixes.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md

### Design decisions
- Item 40's inline gutters use TWO number columns (old file, new file), not one, because a
  unified inline line can belong to either or both files; the split view's single-per-side
  gutter precedent (`computeSplitRows`) maps cleanly onto two columns here.
- `computeInlineRows` keeps each raw line's `-`/`+`/space prefix in the text cell — the inline
  view's rendering semantics are unchanged from before; only the gutters are new.
- Hunk-header rows in the inline grid emit two empty gutter cells + the header cell rather than
  a spanning full-row: the existing `.diff-line-hunk` dashed-separator rule (item 10e) collapses
  the text anyway, so no full-row special case was needed.
- Item 38 fixed with `outline-offset: -2px` on `.anchored` (one property) instead of adding
  left padding to every scroll container that might host an anchored element — the inset ring
  cannot be clipped by any ancestor, fixing all `.anchored` users at once.
- Item 37 fixed by moving the `scrollIntoView` call after `openTranscriptInspector` with no
  requestAnimationFrame wrapper: the drawer open is synchronous DOM/class work, and
  `scrollIntoView` forces layout, so plain statement order is sufficient.

### Deviations
- None from the plan. (The plan itself supersedes TASKS.md item 39's implied "shrink the
  content" reading: root cause was non-wrapping `white-space: pre`, so the fix is wrapping,
  not width clamping.)

### Tradeoffs
- Reusing `computeSplitRows` for the inline view was considered and rejected: its zipping
  reorders a `-`,`-`,`+`,`+` run into interleaved pairs, which would change inline line order.
  A separate ~35-line `computeInlineRows` keeps original order and shares the same
  `NUMERIC_HUNK_HEADER` / `computeFullRowLineClass` helpers.
- Per project preference, replaced code is commented out in place (old inline render loop,
  retired `.file-preview-drawer .diff-text` override, old scroll call) rather than deleted.

### Open questions
- Blank trailing line of a diff (from the final `\n` split) is numbered as context inside a
  hunk — identical to the split view's existing behavior; flagging only for symmetry awareness.
- Items 37–39 are DOM/CSS behavior with no unit-test surface in the node runner (precedent:
  items 10e/10g CSS-only closes); verify visually at the repro URL in TASKS.md item 37.
- Tests were written but NOT run (user runs the suite), per the task instructions.
