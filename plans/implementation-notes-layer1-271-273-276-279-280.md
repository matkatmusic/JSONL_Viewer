# Implementation notes — Layer 1 View fixes: tasks 271, 273, 276, 279, 280

- **Timestamp:** 2026-07-26T13:00:00-07:00 (started) → 2026-07-26T14:05:00-07:00 (complete)
- **Conversation:** tackle-tasks 273 254 276 280 272 279
- **Conversation JSONL:** `/Users/matkatmusicllc/.claude/projects/-Users-matkatmusicllc-Desktop-claude-code-src-RevEng/819b2fd0-0fc7-4353-8fd8-54db2f1d3e39.jsonl`

## References

- `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/tasks-271-273-276-279-280-layer1-fixes.md`
- `/Users/matkatmusicllc/Desktop/claude code src/RevEng/plans/coding-requirements.md`
- `/Users/matkatmusicllc/Desktop/claude code src/RevEng/tasks.json` (tasks 254, 271, 272, 273, 276, 279, 280)
- `/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred/tests/layer1-filter-jump.test.ts` (the task-253 repro staged before this batch)

## Scope changes made during the work

- **Task 272 dropped, task 271 taken in its place** (user direction, mid-implementation). 272 asked
  for the Enter-cycles hint to survive typing; 271's explicit next/previous buttons are a visible
  affordance that no tooltip has to explain, so the hint problem stops existing. The find box's
  `placeholder` was therefore left exactly as it was, and the readout element added for 273 carries
  no resting hint text — it is simply empty when there is nothing to report.
- **Task 254 closed without code** (user confirmed): re-clicking a selected folder already clears
  the filter. The user pointed out that the deselect capability they have in mind belongs to task
  255 (multi-select via shift-click), which is not in this batch.

## Design decisions

- **The find readout got its own element (`#find-status`) rather than a save/restore of `#crumb`.**
  The crumb also carries the stage's `N pairs · N repo-only · N disk-only` counts, so every search
  destroyed them. Saving the crumb's previous text and replaying it on clear would need a second
  piece of state that goes stale the moment the stage re-renders. A dedicated element makes "clear
  the readout" one empty string and makes the counts un-clobberable.
- **The bubble's full path moved from `title` to `data-path`.** Task 280's in-page hover reveal and
  a native `title` tooltip would both fire on hover, so the tooltip had to go — and the only way to
  suppress it is to not have the attribute. `data-path` is load-bearing (the find box matches on it,
  and the File Nav's exact-path jump identifies the bubble by it), so the three readers in
  `layer1-find-file.ts` moved with it in the same step.
- **File Nav rows KEEP their `title`.** Only the bubble's `.fname` moved. A nav row is not truncated
  by a 168 px box and has no hover reveal to make its tooltip redundant. This was a genuine error in
  the plan I wrote — it told the resize agent to retarget `findNavRow` in
  `tests/layer1-filter-jump.test.ts` to `data-path`, which broke that test; corrected in place, and
  the agent independently agreed with the correction.
- **One `--filenav-w` custom property on `.stagewrap` drives both `.filenav`'s width and
  `.minimap`'s `left`.** The duplicated `232px` literal those two rules shared is gone, which is what
  task 279 called out as the trap. Native `resize: horizontal` was rejected: it grabs at the
  bottom-right corner rather than along the right edge as asked, and a CSS resize writes the
  element's own width, which no other rule can read.
- **Ruler precision is hundredths, not milliseconds.** `slice(5, 22)` yields `MM-DD HH:MM:SS.hh`,
  matching the example the user gave in task 275 (`07-18 19:42:08.22`). The third millisecond digit
  is dropped rather than rounded — this is a label, not a value anything computes from.

## Deviations from the plan

- **`tests/layer1-find-file-helpers.ts` is new and was not in the plan.** Tasks 271 and 273 added
  three tests, which pushed `tests/layer1-find-file.test.ts` to 287 lines against the repo's 250-line
  cap. Only the SETUP moved out (DOM boot, scroll spy, bubble fixture, the two readouts, and two new
  one-line drivers for "submit with Enter" and "click a cycle button"); every test and every scenario
  comment stayed where it was. The test file is now 223 lines.
- **`openFoundPage` now empties the find box on every boot.** The module's cycle position and the
  term it belongs to are module scope, so a fresh DOM does not reset them — two tests searching
  `launch.json` had the second resume at the first's position, which is what made the new next/prev
  tests fail. The fix drives the page's own reset (an empty `input` event) rather than exporting a
  test-only hook. The old comment claiming a fresh boot reset the cycle was simply wrong.

## Tradeoffs

- **Four subagents partitioned by FILE, not by task.** Every one of the five tasks shares at least
  one file with another (all four groups touch `layer1-styles.css`), so a task-per-agent split would
  have had agents clobbering each other's edits. Ownership was: HTML + find-file module; page module;
  stylesheet; new resize module. The cost is that each agent saw a transient red suite while a
  sibling's half of a cross-file contract was still missing — six such failures showed up in hook
  output and all resolved on their own.
- **Cycle buttons are always enabled.** Disabling them when there is nothing to cycle would need the
  match count published out of the search, and clicking them with an empty box is already a no-op.

## Verification

- `npx tsx --test tests/layer1*.test.ts` → **110 tests, 110 pass, 0 fail.**
- `bun run build:webapp` → clean.
- No browser check was performed — visual verification is the user's.

## Open questions

1. **Ruler gutter width.** `--rail-x` went 80 px → 118 px and the tick label box 70 px → 108 px, sized
   from 17 characters at 10 px. That is arithmetic, not measurement; if the labels look cramped or the
   gutter looks wasteful on the real render, that pair of numbers is the only knob.
2. **File Nav drag limits.** The pane clamps to 120–640 px and the width is not persisted across
   reloads. Say so if either should change.
3. **Task 270** ("bubble file names are truncated and should be readable") was folded into 280 as the
   task text asked; it is left OPEN for you to close or re-scope after looking at the hover reveal.
