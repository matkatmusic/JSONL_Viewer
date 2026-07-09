# Item 43 — Inspector Prev/Next moves the timeline's selected step bubble

## Behavior (plain English)

When the transcript JSON inspector (the Details view) shows a JSONL line, the timeline's
selected message bubble must be the step that owns that line. Pressing `Next ▶` / `◀ Prev`
(or any in-inspector jump: tool-result jump, PreToolUse-hook jump, clickable line link)
moves the shown line; if the newly shown line is owned by a DIFFERENT step, that step's
bubble takes the `selected` highlight (and the rail redraws to match). A line owned by no
step (summary records, file-history snapshot lines whose changeId matches no node) leaves
the current selection untouched.

Repro being fixed: `#/project/s84-multiagent-scripts-git-baseline/timeline`, click Step 3
(inspector opens on line 29/138), press `Next ▶` to line 32 → Step 4's bubble must become
selected; today Step 3 stays selected.

## Existing pieces (all already shipped — this plan only wires them together)

- `openTranscriptInspector` (`webapp/inspector.ts:475`) accepts an optional
  `onJumpToLine?: (line: number) => void` and calls it with the clamped line at the end of
  EVERY `showLine` (`inspector.ts:594`) — including the initial open and every nav-button
  jump. **No call site currently passes it.** No inspector.ts change is needed.
- `findTimelineNodeIndexForRawLine(nodes, rawLineText)` (`webapp/views/timeline.ts:615`)
  maps a raw JSONL line's text to the owning node index, `-1` when nothing owns it.
  Already covered by 4 tests in `tests/timeline-viewmodels.test.ts` (lines 302, 320, 340,
  638 — including the `-1` case), so the pure mapping needs no new tests (TDD note below).
- Inside `renderTimelineView` (`webapp/views/timeline.ts:700`): `nodes` (line 708),
  `nodeRows: Map<number, HTMLElement>` (line 740), `let selectedRow` (line 1103), and
  `drawRail()` (function declaration ~line 1259, hoisted through the whole closure).
  The `selected`-class swap pattern to replicate is the rowTop click handler at
  lines 1157–1163.

## Step 1 — closure helpers in `renderTimelineView`

In `webapp/views/timeline.ts`, immediately BEFORE the `openStepInspector` helper
(the `// ── inspector jump (requirement 6) …` comment, ~line 824), add two closure consts:

```ts
// Item 43: keep the timeline's selected bubble on the step owning the inspector's shown
// line, so Prev/Next (and in-inspector jumps) walk the selection along the timeline. A
// line owned by no node (summary records, snapshot lines with re-stamped changeIds)
// keeps the current selection.
const syncSelectedRowToShownLine = (rawLines: string[], shownLine: number): void => {
    const nodeIndex = findTimelineNodeIndexForRawLine(nodes, rawLines[shownLine] ?? "");
    if (nodeIndex === -1) {
        return;
    }
    const row = nodeRows.get(nodeIndex);
    if (row === undefined) {
        return;
    }
    if (row === selectedRow) {
        return;
    }
    if (selectedRow !== null) {
        selectedRow.classList.remove("selected");
    }
    selectedRow = row;
    row.classList.add("selected");
    drawRail();
};

// Every timeline transcript-inspector open routes through this wrapper so line changes
// inside the inspector sync the timeline selection (item 43).
const openTranscriptInspectorSynced = (options: { jsonlName: string; rawLines: string[]; line: number }): void => {
    openTranscriptInspector({
        ...options,
        onJumpToLine: (shownLine) => syncSelectedRowToShownLine(options.rawLines, shownLine),
    });
};
```

Why this placement: the wrapper must sit in the same closure as `nodes`/`nodeRows`/
`selectedRow`/`drawRail`, and before the first helper that calls it in source order for
readability. `let selectedRow` (1103) and `drawRail` (1259) are declared later in the
closure — safe, because the arrows only dereference them at click/nav time, after
`renderTimelineView` has fully executed.

Why guards, not one compound `if`: single-condition branching
(`~/.claude/guides/single-condition-branching.md`) — each early `return` tests exactly one
precondition (`no owning node`, `no rendered row`, `already selected`).

Why `rawLines[shownLine] ?? ""`: `noUncheckedIndexedAccess` is on for webapp code; the
inspector clamps the line, but the type is `string | undefined` and
`findTimelineNodeIndexForRawLine` already treats `""` as match-nothing.

## Step 2 — route all 7 timeline call sites through the wrapper

Replace every direct `openTranscriptInspector(...)` call in `webapp/views/timeline.ts`
with `openTranscriptInspectorSynced(...)` (arguments unchanged — each already passes
`{ jsonlName, rawLines, line }` or a `located` object of that exact shape):

| line (pre-edit) | site |
|---|---|
| 830 | `openStepInspector` — changeId-located line |
| 866 | `openTurnInspector` — message's own uuid line |
| 955 | `showRevisionJson` — `{ }` chip's structuredPatch line |
| 978 | `showGitOperationJson` — git row's `{ }` Bash tool_use line |
| 1115 | session-header click — line 0 of that session |
| 1179 | session-end step click — last line of the session |
| 1352 | anchor block (`/at/<line>` route) — the anchored line |

Leave the `import { openInspectorPane, openTranscriptInspector } from "../inspector.ts"`
line as-is (the wrapper calls it). Do NOT touch `openTranscriptInspector` call sites in
other files (`webapp/views/file-history.ts` renders no timeline rows — nothing to sync).

Site 1352 gains behavior deliberately: opening the timeline anchored via
`Jump to timeline step` now also SELECTS the anchored step's bubble (today it only gets
the `.anchored` outline). That matches item 43's expectation — the Details view's item and
the selected bubble agree from the first paint, not only after the first Next press.

## Step 3 — TDD accounting (no new tests)

The one pure decision (`raw line → owning node index, -1 when unowned`) is
`findTimelineNodeIndexForRawLine`, already red-green covered including the `-1` case
(`tests/timeline-viewmodels.test.ts:302/320/340/638`). The new code is DOM wiring
(classList swaps + rail redraw) in the same style as the existing untested rowTop click
handlers — no new pure function is introduced, so no new view-model test is possible
without a DOM shim the test suite deliberately doesn't have. State this in the
implementation notes.

**Do NOT run any tests, builds, or suites — the user runs them.** (`npx tsc -p
tsconfig.webapp.json --noEmit` is also left to the user.)

## Step 4 — close the task

Mark item 43 done in `TASKS.md` with a one-line summary (wired the existing
`onJumpToLine` hook through a `renderTimelineView` closure helper; all 7 timeline
inspector-open sites now sync selection).

## Skipped (deliberate)

- No auto-scroll of the newly selected bubble into view — item 43's Expected says
  "selected", not "centered"; add `row.scrollIntoView({ block: "nearest" })` later if the
  user asks.
- No URL update per Next press — the inspector's line position was never route-reflected;
  out of scope.
