# Plan — Tasks 147 + 148 (jfred webapp)

All work happens in `jfred/` (the RevEng submodule — never a `~/Programming` clone).
Do NOT run tests or suites; the user runs them after the work is staged. Run only
`npm run typecheck` (in `jfred/`) as the compile gate. Respect the 250-line file cap
(`filesize_check.py` is the oracle).

---

## Task 147 — pin the inspector nav row above the scrolling JSON

**Behavior:** the `[◀ Prev] [n/N] [Next ▶] [hook/result/format buttons]` row that
`buildInspectorNavigationRow` (`jfred/webapp/inspector.ts:134`) builds is appended as the
first child of `#details-right-body` (`inspector.ts:225`). `#details-right-body` is the
scroll container (`styles.css:640` — `flex: 1 1 auto; overflow: auto;`), so the row
scrolls away with the JSON. It must stay visible while the JSON scrolls.

**How:** CSS-only — make the row sticky inside its scroll container. No TS changes, no
markup changes. (`position: sticky` on a direct child of the `overflow: auto` element is
the native platform feature for exactly this; restructuring the row into the static
`#details-right-header` was rejected because that header is built once per route while
the nav row is rebuilt on every `showLine`, and `app-drawer.ts` shares the same body.)

### Step 147.1 — edit `jfred/webapp/styles.css:930`

Replace:

```css
.inspector-nav { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
```

with:

```css
/* task 147: sticky inside #details-right-body so Prev/Next stay visible while the JSON
   scrolls. Opaque --bg (the pane background, .details-pane:567) hides text passing under;
   the old margin-bottom gap becomes padding so scrolled text can't peek through it. */
.inspector-nav { display: flex; gap: 8px; align-items: center; position: sticky; top: 0; z-index: 1; background: var(--bg); padding-bottom: 6px; }
```

Notes for the implementer:
- `margin-bottom: 6px` MUST become `padding-bottom: 6px` — a margin is transparent, so
  scrolled JSON would show through the 6px strip under the sticky row.
- `z-index: 1` is required: `.snapshot-history-btn` and other inline buttons in the JSON
  body create stacking contexts that would otherwise paint over the row.
- No test: this is a CSS declaration; the node test runner (happy-dom) does not compute
  sticky layout, so there is nothing meaningful to assert.

### Step 147.2 — verify

`cd jfred && npm run typecheck` (CSS untouched by tsc — this is the gate for the whole
batch, run once after Task 148 too).

---

## Task 148 — session custom titles searchable in the timeline search

**Behavior (shape 1 from the task):** typing a session's user-given custom title (e.g.
"tackle 121") into the task-127 timeline search box matches that session's FIRST timeline
node, so the search jumps to (and keeps visible) the row directly under that session's
header marker — the marker row itself is inserted immediately before that node by
`findSessionStartIndexes` (`timeline-labels.ts:176`) and is not a `TimelineNode`, so the
first node is the jump anchor.

**Data already present:** `document.sessionTitles?: Record<string, string>`
(`timeline-types.ts:95`); the filter bar has `context.nodes` and
`context.reconstructionDocument` (`timeline-render-context.ts:19`).

**Design:** one new pure function + an optional session-title argument threaded through
the existing predicates. All model logic stays in `timeline-filter-model.ts` (DOM-free,
tested directly); `timeline-render-filterbar.ts` only computes the map once and passes it.

### Step 148.1 — RED: author the tests (do not run them)

The existing `tests/timeline-filter-model.test.ts` is at 237 lines — the new tests do not
fit under the 250 cap. Create `tests/timeline-filter-model-session-titles.test.ts`
(the `timeline-labels-<topic>.test.ts` split precedent). Use the same conventions as
`tests/timeline-filter-model.test.ts`: `node:test` + `assert/strict`, literal node
fixtures cast `as never` where the full `TimelineNode` shape is not needed, one behavior
per test, plain-English step comments.

Fixture shape: a user-turn node is
`{ kind: USER_TURN_NODE_KIND, text: "...", sessionId: "sess-a" }`; import the kind
constants from `../webapp/views/timeline-types.ts`.

Tests to write:

1. `test_computeSessionTitleByNodeIndex_maps_each_titled_sessions_first_node`
   - three nodes: sess-a, sess-a, sess-b; titles `{ "sess-a": "tackle 121" }`
   - expect a Map with exactly one entry: index 0 → "tackle 121" (sess-b has no title;
     sess-a's second node is not a session start).
2. `test_computeSessionTitleByNodeIndex_returns_empty_map_when_document_has_no_titles`
   - same nodes, `sessionTitles` argument `undefined` → empty Map.
3. `test_checkNodeMatchesSearchTerm_matches_the_sessions_title_case_insensitively`
   - a node whose own text does NOT contain the term; term `"TACKLE 121"`, sessionTitle
     `"tackle 121"` → true. Same call without the sessionTitle argument → false.
4. `test_checkNodePassesFilters_still_requires_the_mode_predicate_for_title_matches`
   - a user-turn first node, mode `TIMELINE_FILTER_MODES.git`, term matching the title →
     false (title match never overrides the mode filter).
5. `test_computeMatchingNodeIndexes_includes_the_titled_sessions_first_node`
   - nodes [user-turn "hello" sess-a, user-turn "hello" sess-a], titles map index 0 →
     "tackle 121", mode `all`, term `"tackle"` → `[0]` (only the first node matches; the
     second node of the same session does not inherit the title).

### Step 148.2 — GREEN: extend `jfred/webapp/views/timeline-filter-model.ts`

(158 lines now; ~+28 keeps it under the cap.)

Add the import (the file already imports from `timeline-labels.ts`):

```ts
import { SCRIPT_EXECUTION_EVENT_KIND, findSessionStartIndexes } from "./timeline-labels.ts";
```

Append, in the `── keyword search (task 127)` section:

```ts
// task 148: session titles are searchable. Each titled session contributes ONE extra
// haystack — on its FIRST node — so typing a custom title jumps to the row directly
// under that session's header marker (findSessionStartIndexes inserts the marker before
// that node). Only the first node: every row of a session matching its title would turn
// the search into a session filter, which is not shape (1).
export function computeSessionTitleByNodeIndex(nodes: TimelineNode[], sessionTitles: Record<string, string> | undefined): Map<number, string> {
    const titleByNodeIndex = new Map<number, string>();
    if (sessionTitles === undefined) {
        return titleByNodeIndex;
    }
    for (const sessionStart of findSessionStartIndexes(nodes)) {
        const sessionTitle = sessionTitles[sessionStart.sessionId];
        if (sessionTitle === undefined) {
            continue;
        }
        titleByNodeIndex.set(sessionStart.nodeIndex, sessionTitle);
    }
    return titleByNodeIndex;
}
```

Extend the three existing predicates with a trailing OPTIONAL parameter (existing callers
and tests stay valid unchanged):

```ts
export function checkNodeMatchesSearchTerm(node: TimelineNode, term: string, sessionTitle?: string): boolean {
    const normalizedTerm = term.trim().toLowerCase();
    if (normalizedTerm === "") {
        return true;
    }
    if (sessionTitle !== undefined && sessionTitle.toLowerCase().includes(normalizedTerm)) {
        return true;
    }
    return computeNodeSearchHaystack(node).includes(normalizedTerm);
}

export function checkNodePassesFilters(node: TimelineNode, mode: TimelineFilterMode, term: string, sessionTitle?: string): boolean {
    if (!checkNodeMatchesFilterMode(node, mode)) {
        return false;
    }
    return checkNodeMatchesSearchTerm(node, term, sessionTitle);
}

export function computeMatchingNodeIndexes(nodes: TimelineNode[], mode: TimelineFilterMode, term: string, sessionTitleByNodeIndex?: Map<number, string>): number[] {
    const matchingIndexes: number[] = [];
    for (const [index, node] of nodes.entries()) {
        if (checkNodePassesFilters(node, mode, term, sessionTitleByNodeIndex?.get(index))) {
            matchingIndexes.push(index);
        }
    }
    return matchingIndexes;
}
```

(Keep each function's existing doc comment; extend it with one line noting the task-148
sessionTitle parameter.)

### Step 148.3 — wire `jfred/webapp/views/timeline-render-filterbar.ts`

(142 lines now; +~6.)

1. Add `computeSessionTitleByNodeIndex` to the existing import from
   `./timeline-filter-model.ts`.
2. `applyTimelineFilters` gains the map parameter and passes the per-index title:

```ts
function applyTimelineFilters(context: TimelineRenderContext, mode: TimelineFilterMode, term: string, sessionTitleByNodeIndex: Map<number, string>): void {
    for (const [index, node] of context.nodes.entries()) {
        const row = context.nodeRows.get(index);
        if (row === undefined) {
            continue;
        }
        row.classList.toggle(FILTERED_OUT_ROW_CLASS, !checkNodePassesFilters(node, mode, term, sessionTitleByNodeIndex.get(index)));
    }
}
```

3. In `renderTimelineFilterBar`, compute the map ONCE (nodes and titles are fixed for the
   bar's lifetime — navigation rebuilds the bar), just before `refreshFilteredRows` is
   defined:

```ts
// task 148: session titles join the search — computed once, the node list is fixed
// for this render.
const sessionTitleByNodeIndex = computeSessionTitleByNodeIndex(context.nodes, context.reconstructionDocument.sessionTitles);
```

4. Thread it through the two call sites inside `refreshFilteredRows`:
   - `applyTimelineFilters(context, activeMode, searchTerm, sessionTitleByNodeIndex);`
   - `matchNodeIndexes = hasTerm ? computeMatchingNodeIndexes(context.nodes, activeMode, searchTerm, sessionTitleByNodeIndex) : [];`

### Step 148.4 — verify

`cd jfred && npm run typecheck`. Do NOT run the test suite — authored-RED is the stopping
point; the user runs the tests.

---

## Close-out

1. Stage (do not commit): in `jfred/` — `git add webapp/styles.css
   webapp/views/timeline-filter-model.ts webapp/views/timeline-render-filterbar.ts
   tests/timeline-filter-model-session-titles.test.ts`; in RevEng root — `git add jfred
   plans/tasks-147-148-plan.md` (plus the jot implementation-notes file).
2. Close tasks 147 and 148 via the `taskTools:close-tasks` skill (stage those JSON edits
   too, no commit).
3. Sonnet-subagent one-sentence summary (≤40 words) for the user's commit message.
