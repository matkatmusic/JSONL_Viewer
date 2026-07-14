## 2026-07-13:17:42:00 — Item 80: console word-wrap via ResizeObserver re-fit
Chat title: tackle-tasks 78,80,79,77
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/ (session 016rGRfYFCz2TiLT3A1naM3t)

### References
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/item80-console-word-wrap.md
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/TASKS.md (item 80)
- /Users/matkatmusicllc/Desktop/claude code src/RevEng/webapp/app.ts (ensureProgressTerminal / fitProgressColumns)

### Design decisions
- Root cause is `cols` drift, not missing wrap: xterm autowraps at `cols` by
  default; `fitProgressColumns` only ran on window-resize + expand, so a width
  change with no resize event (sidebar splitter `#split-lr` drag, or a zero-width
  initial fit leaving xterm at its default 80 cols) left `cols` wider than the
  visible console → long lines overflowed and were clipped by `overflow: hidden`.
- Fix = a `ResizeObserver` on `#progress-console` re-fitting on every box change —
  the tightest trigger, covering all non-window width changes uniformly.
- Kept the existing `window` resize listener as a harmless safety net (a redundant
  re-fit on window resize is cheap); the observer specifically covers the splitter
  drag the listener misses.
- No CSS change: `overflow: hidden` is correct; fixing `cols` makes the clip moot.

### Deviations
- None. Single additive edit to `ensureProgressTerminal`.

### Tradeoffs
- Could have replaced the window listener with the observer alone (one mechanism),
  but kept both to avoid any regression from a ResizeObserver quirk — near-zero cost.
- No unit test: the change is pure browser observer wiring with no extractable pure
  logic (same category as the existing untested console DOM helpers). Per the TDD
  guide, trivial non-branching wiring carries no unit test.

### Open questions
- Confidence in the diagnosis is high (~90%) from code reading but not
  browser-confirmed: no viewer server was running and reproducing needs the large
  jot-backup project + a headless browser. The ResizeObserver fix is robust across
  every plausible stale-`cols` cause, so it should resolve the report regardless of
  which mechanism (splitter drag vs default-80 initial fit) is dominant. Please
  confirm at the repro: a long console line wraps, and re-wraps after dragging
  `#split-lr` to narrow the console. If long lines STILL overflow after this, the
  cause is elsewhere (e.g. a genuine CSS width bug) and I'll reopen with a live
  repro.
- typecheck (`tsconfig.webapp.json`) + `build:webapp` clean; suite not run (user runs).
