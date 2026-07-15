# Task 85 — Timeline header Prev/Next buttons that jump between file-touching messages

## Behavior (plain English)

The timeline pane header (`#timeline-pane-header` in `webapp/index.html`) gains two
buttons, `◀ Prev` and `Next ▶`. Clicking `Next ▶` scrolls the timeline to the nearest
agent-turn row *after* the current reference row whose bubble carries file chips
(`fileChanges` non-empty), expands that row (same effect as clicking its `▸` triangle,
so the chips are visible), and flashes it. `◀ Prev` does the same searching backwards.
The reference row is the last row the user selected or jumped to; before any
interaction it is "before the first row", so the first `Next ▶` click lands on the
first file-touching message. When no candidate exists in the requested direction the
click is a no-op.

Named things:
- `findAdjacentFileTouchedIndex` — pure view-model function: nearest candidate node index in a direction.
- `fileNavReferenceIndex` — render-half `let`: node index navigation is relative to.
- `jumpToAdjacentFileTouchedRow` — render-half handler shared by both buttons.
- Candidate predicate: `node.kind === AGENT_TURN_NODE_KIND && (node.fileChanges ?? []).length > 0` —
  file chips render only inside agent-turn bubbles (timeline.ts ~line 2005), so only
  those rows can "show File chips" after expansion.

## Step 1 — RED: tests for `findAdjacentFileTouchedIndex`

Append to `tests/timeline-viewmodels.test.ts` (it already imports exported pure
functions from `webapp/views/timeline.ts`; add `findAdjacentFileTouchedIndex` to that
import list). Build minimal `TimelineNode`-shaped literals the way the file's existing
tests do (wire shape; kinds via the vocabulary enum members already imported there —
match how neighboring tests construct agent/user turn nodes; a candidate node needs
`fileChanges: [{ path: "a.py", ... }]` shaped like the file's existing fixtures, a
non-candidate agent turn uses `fileChanges: []`).

Four tests, one behavior each (per `~/.claude/guides/tdd.md`):

1. `test_findAdjacentFileTouchedIndex_next_from_before_start_finds_first_candidate`
   — nodes `[userTurn, agentNoChips, agentWithChips]`, `fromIndex: -1`, `direction: 1`
   → returns `2`.
2. `test_findAdjacentFileTouchedIndex_next_skips_non_agent_and_chipless_rows`
   — nodes `[agentWithChips, userTurn, agentNoChips, agentWithChips]`, `fromIndex: 0`,
   `direction: 1` → returns `3`.
3. `test_findAdjacentFileTouchedIndex_prev_finds_nearest_earlier_candidate`
   — same 4-node list, `fromIndex: 3`, `direction: -1` → returns `0`.
4. `test_findAdjacentFileTouchedIndex_returns_undefined_when_no_candidate_in_direction`
   — nodes `[agentWithChips, userTurn]`, `fromIndex: 0`, `direction: 1` → `undefined`.

Do NOT run the test suite (user instruction: the user runs tests afterwards). RED is
established by the import failing to resolve until Step 2 exists.

## Step 2 — GREEN: the pure function

In `webapp/views/timeline.ts`, view-model half (place it next to
`checkRowIsExpandable`, ~line 1135):

```ts
// Nearest agent turn carrying file chips, walking from fromIndex in direction (task 85's
// header Prev/Next). fromIndex -1 means "before the first row".
export function findAdjacentFileTouchedIndex(
    nodes: TimelineNode[],
    fromIndex: number,
    direction: 1 | -1,
): number | undefined {
    for (let index = fromIndex + direction; index >= 0 && index < nodes.length; index += direction) {
        const node = nodes[index]!;
        if (node.kind === AGENT_TURN_NODE_KIND && (node.fileChanges ?? []).length > 0) {
            return index;
        }
    }
    return undefined;
}
```

## Step 3 — header buttons in `webapp/index.html`

Inside `#timeline-pane-header`, between `#timeline-summary` and `#toggle-all`:

```html
<button id="files-prev" title="Jump to the previous message that touched files">◀ Prev</button>
<button id="files-next" title="Jump to the next message that touched files">Next ▶</button>
```

Unclassed buttons already receive the shared header-button chrome
(`webapp/styles.css:86`) — no CSS change.

## Step 4 — wire the buttons in the render half

All in `renderTimelineView` in `webapp/views/timeline.ts`:

4a. Declare the reference index with the other selection state (next to
`let selectedRow` , ~line 1325):

```ts
let fileNavReferenceIndex = -1;                        // last selected/jumped row (task 85 Prev/Next)
```

4b. In `selectTimelineRow` (~line 1830), right after `selectedRow = row;`, keep the
reference in sync with manual row clicks:

```ts
fileNavReferenceIndex = nodeIndex;
```

4c. After the `#toggle-all` wiring block (~line 2041, so `updateToggleLabel`,
`nodeRows`, and `jumpToTimelineRow` are all in scope), wire both buttons with
`onclick` property assignment — same rationale as `#toggle-all`: re-renders must not
stack handlers:

```ts
// ── header Prev/Next over file-touching agent turns (task 85). Expanding IS the task's
// "click the triangle": the chips live in the bubble. onclick assignment, like #toggle-all,
// so re-renders never stack handlers. ──
const jumpToAdjacentFileTouchedRow = (direction: 1 | -1): void => {
    const target = findAdjacentFileTouchedIndex(nodes, fileNavReferenceIndex, direction);
    if (target === undefined) {
        return;
    }
    fileNavReferenceIndex = target;
    nodeRows.get(target)!.classList.add("expanded");
    updateToggleLabel();
    jumpToTimelineRow(target);
};
(document.getElementById("files-prev") as HTMLButtonElement).onclick = () => jumpToAdjacentFileTouchedRow(-1);
(document.getElementById("files-next") as HTMLButtonElement).onclick = () => jumpToAdjacentFileTouchedRow(1);
```

Notes pinning the choices:
- `jumpToTimelineRow` (scroll + flash) not `selectTimelineRow`: the task asks to
  *navigate and expand*, not to change selection/details; jump is the existing
  navigate primitive (sidebar session clicks use it).
- `classList.add("expanded")` not `toggle`: re-visiting an already-expanded row must
  leave it expanded.
- `updateToggleLabel()` keeps the Expand All/Collapse All label truthful after the
  programmatic expansion — exactly what the triangle's own click handler does.
- No disabled-state management: clicking past either end is a silent no-op
  (`findAdjacentFileTouchedIndex` returns `undefined`). ponytail: add disabled styling
  only if the user asks.

## Step 5 — verify (no test runs)

- `npm run typecheck` only (`tsc --noEmit`). Do NOT run `npm test` — the user runs tests.

## Step 6 — bookkeeping

- Move task 85's object from `tasks.json` to `completedTasks.json` with
  `completionDate: "2026-07-15"` and a `closureNote`; no `commitHashes` (work staged,
  not committed).
- Stage everything (`git add` the four touched files). Do not commit.
