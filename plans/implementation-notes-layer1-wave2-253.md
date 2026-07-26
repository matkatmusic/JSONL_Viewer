## 2026-07-26:12:45:00 — Task 253: Layer 1 View folder filter
Chat title: layer 1 wave 2 253, 245 255
Path to JSONL log: /Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/542c059d-d404-4028-8f3e-d69fca6fbda4.jsonl

### References

/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/task253-folder-filter-plan.md
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1-ruler-axis.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1-filter.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/layer1-wire.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/views/sidebar.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/webapp/views/sidebar-coverage.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1-filter.test.ts
/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1-folder-filter.test.ts

### Design decisions

- **The ruler layout module moved from `src/` to `webapp/`.** `axisPx` is an accumulated gap offset,
  so a filtered view cannot reuse the offsets the endpoint shipped — dropping instants moves every
  later node. The page therefore has to re-run the layout. Rather than copy the gap arithmetic into
  `webapp/` (where it would drift from the server's ruler and let a filtered view stop lining up
  with the view it came from), `src/layer1_ruler_axis.ts` became
  `webapp/layer1-ruler-axis.ts` and `src/viewer_api_layer1.ts` / `src/viewer_api_layered.ts` import
  it back. This inverts the `src/ -> webapp/` dependency direction; it is the price of one
  implementation. It works because root `tsconfig.json` is `noEmit` over both trees and the server
  runs under `tsx`.
- **The moved module re-declares `type Instant = Date` locally** instead of importing it from
  `src/layered_types.ts`. `tsconfig.webapp.json` sets `rootDir: "webapp"`, and a `src/` import —
  even a type-only one — pulls a file outside that rootDir into the emitting program, which tsc
  rejects.
- **A folder reports its descendant LEAF paths, not its own path.** `buildFileTree` strips the
  common directory prefix and a folder node carries no path at all, so descendants' `entry.target`
  values are the only full paths the tree actually holds. This also removed any need for a
  prefix/`startsWith` match in the filter — membership is exact, which sidesteps the
  `src/keep/a.ts` vs `src/keep/a.ts.bak` class of bug (task 278's substring problem).
- **Clearing the filter is re-clicking the selected folder**, reported as an empty target list. The
  plan flagged this as unspecified; no new UI was added. Say the word if you want an explicit
  "clear filter" control.
- **The expand/collapse triangle is a real `<span>`, not the row's `::before` decoration** (user
  feedback, 2026-07-26): clicking it must open the folder without also filtering to it, and a
  pseudo-element cannot be an event target, so the handler had no way to tell the two clicks apart.
  The span is added only for owners that pass `onFolderClick`, so the Files sidebar and the details
  pane keep their CSS-only marker. `layer1-styles.css` gives the summary `display: flex` and the
  span `order: -1`, which keeps the rendered glyph order "▸ 📁" while the span stays the summary's
  first child.
- **The selected/unselected state lives on the DOM row**, not in a module variable — the summary's
  own `selected` class already is that state and `clearFileSelectionIn` wipes it in step with every
  other selection in the tree.
- **`renderLayer1View` split into `renderLayer1View` (nav + stage) and an exported
  `renderLayer1Stage`.** A filter redraws only the stage: re-rendering the File Nav from the
  filtered set would shrink the pane to the files it just filtered to, and wipe the folder's
  selection and expanded state. The page captures the unfiltered payload in the folder callback, so
  every click re-filters from the full view rather than from the last filtered one.
- **The crumb's counts stayed inside `renderLayer1Stage`**, so they now report the filtered counts.
  That is the only on-screen indication of how much the filter removed.

### Deviations

- **`webapp/views/sidebar.ts` crossed the 250-line cap** once the folder handler landed (257). Split
  rather than condensed: the task-119 coverage strip and its reason popover moved wholesale to a new
  `webapp/views/sidebar-coverage.ts` (61 lines), leaving `sidebar.ts` at 204. Behaviour unchanged —
  it is a straight move plus one import.
- **`clearFileSelectionIn`'s query selector widened** from `.file-item.selected` to `.selected`, so
  one call clears whichever kind of row held the selection. The two older callers
  (`views/timeline.ts:211`, `views/details.ts:130`) are unaffected: their trees mark nothing but file
  rows, and they pass no folder callback so their folders stay inert.
- **`tests/layer1_ruler_axis.test.ts` renamed to `tests/layer1-ruler-axis.test.ts`** to keep the
  Stop hook's `tests/<module>.test.ts` rule satisfied after the move. Five comments elsewhere that
  named the old path were updated too.
- **`tests/layer1-filenav.test.ts` gained a no-op third argument** at its one `renderFileNavInto`
  call site — the only change to that file.
- **`new MouseEvent(...)` had to become `new window.MouseEvent(...)`** in the new test.
  `setupLayer1Dom` publishes a hand-picked set of happy-dom constructors onto `globalThis` and
  `MouseEvent` is not among them.

### Tradeoffs

- **Move the layout module vs. duplicate it in `webapp/`.** Duplication keeps the dependency
  direction clean but leaves two copies of arithmetic whose entire job is to make the server and the
  page agree on where a node sits; a drift there produces a filtered view that silently disagrees
  with the unfiltered one. The move was chosen. The repo's existing `Wire*` mirroring precedent
  covers mirrored *types*, not a mirrored algorithm.
- **Re-fetch from the server under a filter** was rejected: `/api/layer1-view` takes roughly ten
  seconds (one `git log` per tracked path), so a folder click would stall the page.
- **The expected pixel values in `tests/layer1-filter.test.ts` are hand-computed**, not produced by
  calling `layOutNodeLadders` in the test — a test that recomputes with the code under test would
  pass whatever that code did. The fixture uses whole-hour instants precisely so the documented
  rules (2.5 px/hour, clamped to [16, 120], then raised to rows x 22) collapse to a predictable
  22 px or 44 px per gap.

### Open questions

- **Is re-clicking the folder a good enough "clear filter"?** It is the whole affordance today. A
  visible clear control is easy to add if it reads as hidden.
- **Should an orphan bucket be filtered per-row rather than per-bucket?** Right now a bucket
  disappears entirely when none of its rows survive, and keeps every surviving row otherwise —
  which is correct — but a bucket that keeps two of forty rows still renders as a full bucket
  widget. Fine at Layer 1's scale; flagging it in case it reads oddly on a real project.
- **Task 255 (shift-click multi-folder select) is untouched and still open.** The seams are ready:
  `onFolderClick` already hands over a *list* and `filterLayer1ViewByTargets` already takes one, so
  255 is a union in the sidebar handler plus the `MouseEvent` it will need.
