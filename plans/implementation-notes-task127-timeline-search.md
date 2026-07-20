## 2026-07-20:11:30:00 — Task 127: timeline keyword search + entry-time file names + details find widget
Chat title: tackle-tasks 127
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/52dc3331-c334-4fae-9bcc-d62847bcdc24.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task127-timeline-search-and-entry-time-names-plan.md

### Design decisions

- **Entry-time names are a real bug, not a prior decision.** `recordHistoryRevisions`
  (jfred/webapp/views/timeline-changes.ts) stamped every revision with `history.target` — the
  file's FINAL path. No plan or comment anywhere records a "show final name" choice, so it was
  corrected per the task's stated preference.
- **`displayPath` added instead of changing `path`.** `FileChange.path` is a lookup key
  everywhere (sidebar-entry maps, `chipLineLocations` keys, `/api/diff` fetches), so changing
  it would break navigation for pre-rename entries. `displayPath` (computed by a backward walk
  over each history's renames) is display-only; every fetch/map still keys on `path`.
- **Timeline search matches node DATA, not row `textContent`** — the pure predicate
  (`checkNodeMatchesSearchTerm`) covers turn text, tool name/summary, commit detail + hash,
  and every chip's final / entry-time / renamed-from names. This keeps it testable under
  `node --test` (project convention: DOM-free model + thin DOM wiring).
- **Search hides non-matching session-end rows** — the mode filter keeps them (they anchor
  sessions), but the task says "non-matching entries hidden" and a terminator has no text.
- **Details find widget uses the CSS Custom Highlight API** — no DOM mutation, so hljs spans
  and diff grids keep their markup. If `CSS.highlights` is absent the counter and scrolling
  still work; there is just no paint.
- Enter / Shift+Enter step next / previous in the find input, like editors.
- **Fork-style ✕ clear buttons (user addition, mid-task):** both search inputs get an explicit
  ✕ that appears once a term is entered, clears it, and refocuses the input. The native webkit
  search-cancel ✕ is suppressed so the inputs don't show two clear buttons.
- **Timeline search n/N + jump navigation (user revision):** the first counter shipped as
  "visible rows / all rows", which the user found confusing. Reworked to Fork's model:
  entering a term jumps to result #1 (scrolled into view, amber-outlined via
  `.tl-search-current`); n = the result currently landed on, N = results found; ▲/▼ buttons
  (left of the ✕, per the Fork screenshot) and Enter / Shift+Enter walk the results with
  wraparound. `countNodesPassingFilters` was replaced by the tested
  `computeMatchingNodeIndexes` (the ordered jump list); the cursor arithmetic and n/N label
  are reused from details-find-model.ts. Non-matching rows are still hidden while a term is
  entered (the original task requirement) — so ▲/▼ walk the visible rows in order.
- **Search results are SELECTED, not just scrolled to (user revisions):** every landing —
  result #1 on term entry AND each ▲/▼ / Enter step — routes through
  `context.selectTimelineRow`, so the details pane renders the landed row (message / commit /
  script-run mode) exactly as a click would. Guarded on the already-selected row: retyping a
  term that keeps landing on the same result doesn't re-render the pane per keystroke.

### Deviations

- **No test suite was executed by me** (per the task instruction "Don't run any tests or
  suites"). The repo's Stop hook auto-ran affected test files on each edit: it confirmed each
  RED failure and reported no failures after the GREEN implementations. `npx tsc --noEmit`
  passes clean. The user runs the full suite.
- details-revision-view.ts was at the 250-line cap; its 2-line header comment tail was merged
  into one line to fit the new `displayPath` field.

### Tradeoffs

- **Find-widget matches cannot span two text nodes** (e.g. a term split across hljs spans) —
  marked with a `ponytail:` comment in details-find-model.ts; the fix (concatenated values +
  node-offset map) can land if it ever matters in practice.
- Details "Files touched" tree entries now display the entry-time name; the tree is keyed by
  that name for clicks while diff fetches keep the final path. Two changes in one node whose
  displayPaths collide would merge — not reachable from real documents (paths dedupe by file).
- Highlight colors are hardcoded ambers (#7c6f2a / #c9a227); swap for theme variables if wanted.

### Open questions

- None blocking. Cosmetic: search-box width is 20ch and find-input 14ch per the "two 8-10
  letter words + 🔍" sizing — tweak in styles.css (`.timeline-search`, `#details-find input`)
  if the proportions feel off in the live layout.
