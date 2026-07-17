# Task 114 — Timeline filter buttons for event types

All file paths below are relative to the **jfred submodule root**
(`/Users/matkatmusicllc/Desktop/claude code src/RevEng/jfred`) unless prefixed `RevEng/`.
Every edit in this plan happens inside the jfred submodule.

## Goal

A filter bar above the timeline rows with single-select buttons —
**All | Conversation | Tools | Scripts | Files | Git** — that shows only the timeline rows
matching the active button. "All" is the default and restores every row.

## Design constraints already settled (do not re-decide)

- **Single-select modes, not multi-select checkboxes** — matches the prior art
  (`RevEng/archive/diff/jfred-diff.html`'s Show All / File Only / Edits Only select).
- **Filtering = CSS hide, no rebuild.** `buildTimelineRows` builds each node's row exactly once
  into `#view`; `context.nodeRows` (see `webapp/views/timeline-render-context.ts`) maps node
  index → its `.tl-row` element. Filtering toggles a class on those existing elements.
  A row's expansion pane (`previewPane`) is a child of its `.tl-row`
  (`timeline-render-rows.ts:127-203`), so hiding the row hides its expansion too.
- **Logic/DOM split (task-92 pattern):** the predicate + mode vocabulary go in a new pure,
  DOM-free module `webapp/views/timeline-filter-model.ts` with tests; the DOM wiring goes in a
  new thin module `webapp/views/timeline-render-filterbar.ts` which is NOT tested (no DOM test
  harness exists — `timeline-render-*` modules have zero tests today; keep it that way).
- **Mode vocabulary lives in the view module, not `src/structures/vocabulary.ts`.** These modes
  are webapp-only view state, not wire vocabulary; the webapp cannot import TS enums
  (see the header comment of `webapp/views/timeline-types.ts`). Follow the existing
  `Object.freeze({...} as const)` precedent (`SplitRowKind` in `webapp/views/diff-vs-base-model.ts:6`).
- **Filter state is per-render** (module-local, resets to All on navigation). No persistence.

## Filter semantics — the exact truth table

A node is a `TimelineNode` (`webapp/views/timeline-types.ts:228`), one of 4 shapes with 5 kind
strings: `user-turn`, `agent-turn` (both `TurnNode`), `session-end`, `commit`, `tool-call`.

| Mode | A node matches when… |
|---|---|
| `all` | always |
| `conversation` | `kind` is `user-turn` or `agent-turn` |
| `tools` | `kind` is `tool-call` (a tool-call row carries both the call and its result summary — results are not separate rows) |
| `scripts` | `kind` is `tool-call` and `scriptRun !== undefined`; OR `kind` is `agent-turn` and its `fileChanges` contain an entry with `eventKind === SCRIPT_EXECUTION_EVENT_KIND` — the exact rule the "Script" role pill already uses (`computeRolePillLabel`, `webapp/views/timeline-labels.ts:189-197`) |
| `files` | node's `fileChanges` is non-empty (TurnNode / SessionEndNode carry it); OR `kind` is `tool-call` and `scriptRun.changedPaths` is non-empty |
| `git` | `kind` is `commit` |

**Universal override:** a `session-end` node matches EVERY mode. It is the structural
session terminator; hiding it makes a filtered timeline unreadable. This rule is applied before
the per-mode checks.

Session-start markers (`.tl-session-start` divs) are not nodes, are not in `nodeRows`, and stay
visible in every mode — no code needed for that; note it so nobody "fixes" it.

## Accepted non-goals (do not build)

- `files-prev`/`files-next` header buttons may scroll to a row the filter is hiding. Accepted.
- A picked (selectbar) row can be hidden by the filter; the selectbar keeps counting it. Accepted.
- No per-mode row counts on the buttons. Add only if the user asks.

## Testing ground rule for this plan

Write the test file FIRST (step 1) so the module is spec'd red-green style, **but do not
execute `npm test` or any test file** — the user runs the suite after implementation
(explicit instruction for this task). Verification during implementation =
`npx tsc --noEmit` + `npx tsc -p tsconfig.webapp.json` only.

Before writing any code, read `~/.claude/guides/coding-standards.md` and
`~/.claude/guides/single-condition-branching.md` and conform to both (the snippets below
already do — keep their style: 4-space indent, one condition per `if`, verb-named functions).

---

## Step 1 — RED: `tests/timeline-filter-model.test.ts` (new file)

Follow the house style of `tests/timeline-picks.test.ts`: `import { test } from "node:test"`,
`import assert from "node:assert/strict"`, snake_case test names as strings, plain-English
Scenario/Steps comments in each body.

Build fixture nodes as minimal object literals typed as the union members (the many
`?: undefined` fields in `timeline-types.ts` make literals with only required fields valid):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    TIMELINE_FILTER_MODES,
    TIMELINE_FILTER_BUTTONS,
    checkNodeMatchesFilterMode,
} from "../webapp/views/timeline-filter-model.ts";
import { SCRIPT_EXECUTION_EVENT_KIND } from "../webapp/views/timeline-labels.ts";
import {
    AGENT_TURN_NODE_KIND,
    COMMIT_NODE_KIND,
    EDIT_EVENT_KIND,
    SESSION_END_NODE_KIND,
    TOOL_CALL_NODE_KIND,
    USER_TURN_NODE_KIND,
    type CommitNode,
    type SessionEndNode,
    type TimelineNode,
    type ToolCallNode,
    type TurnNode,
} from "../webapp/views/timeline-types.ts";

const userTurn: TurnNode = { kind: USER_TURN_NODE_KIND, when: "t1", sessionId: "s", text: "hi", snapshots: [], gitOperations: [] };
const agentTurn: TurnNode = { kind: AGENT_TURN_NODE_KIND, when: "t2", sessionId: "s", text: "ok", snapshots: [], gitOperations: [] };
const agentTurnWithScriptChange: TurnNode = { ...agentTurn, fileChanges: [{ path: "a.py", eventKind: SCRIPT_EXECUTION_EVENT_KIND, renamedFrom: undefined, isFirstRevision: false, changeId: undefined, when: "t2" }] };
const agentTurnWithEditChange: TurnNode = { ...agentTurn, fileChanges: [{ path: "a.py", eventKind: EDIT_EVENT_KIND, renamedFrom: undefined, isFirstRevision: true, changeId: "c1", when: "t2" }] };
const sessionEnd: SessionEndNode = { kind: SESSION_END_NODE_KIND, when: "t9", sessionId: "s", snapshots: [] };
const commit: CommitNode = { kind: COMMIT_NODE_KIND, when: "t3", sessionId: "s" };
const plainToolCall: ToolCallNode = { kind: TOOL_CALL_NODE_KIND, when: "t4", sessionId: "s", uuid: "u1", toolName: "Grep", summary: "grep foo", toolUseId: "tu1" };
const scriptToolCall: ToolCallNode = { ...plainToolCall, uuid: "u2", toolUseId: "tu2", scriptRun: { timestamp: "t4", code: "print()", changedPaths: ["a.py"] } };
const readOnlyScriptToolCall: ToolCallNode = { ...plainToolCall, uuid: "u3", toolUseId: "tu3", scriptRun: { timestamp: "t4", code: "print()", changedPaths: [] } };
const EVERY_FIXTURE_NODE: TimelineNode[] = [userTurn, agentTurn, agentTurnWithScriptChange, agentTurnWithEditChange, sessionEnd, commit, plainToolCall, scriptToolCall, readOnlyScriptToolCall];
```

One test per behavior (each body: Scenario comment, Steps comments, asserts):

1. `test_all_mode_matches_every_node_kind` — every node in `EVERY_FIXTURE_NODE` matches `all`.
2. `test_conversation_mode_matches_user_and_agent_turns` — `userTurn` and `agentTurn` match `conversation`.
3. `test_conversation_mode_rejects_tool_call_and_commit_nodes` — `plainToolCall` and `commit` do not match `conversation`.
4. `test_tools_mode_matches_only_tool_call_nodes` — `plainToolCall` and `scriptToolCall` match `tools`; `userTurn`, `agentTurn`, `commit` do not.
5. `test_scripts_mode_matches_tool_call_with_script_run` — `scriptToolCall` and `readOnlyScriptToolCall` match `scripts`.
6. `test_scripts_mode_matches_agent_turn_with_script_execution_file_change` — `agentTurnWithScriptChange` matches `scripts`.
7. `test_scripts_mode_rejects_plain_tool_call_and_plain_agent_turn` — `plainToolCall`, `agentTurn`, `agentTurnWithEditChange` do not match `scripts`.
8. `test_files_mode_matches_node_with_file_changes` — `agentTurnWithEditChange` and `agentTurnWithScriptChange` match `files`.
9. `test_files_mode_matches_tool_call_whose_script_run_changed_files` — `scriptToolCall` matches `files`; `readOnlyScriptToolCall` does not.
10. `test_files_mode_rejects_nodes_without_file_changes` — `userTurn`, `agentTurn`, `plainToolCall`, `commit` do not match `files`.
11. `test_git_mode_matches_only_commit_nodes` — `commit` matches `git`; `userTurn`, `plainToolCall`, `scriptToolCall` do not.
12. `test_session_end_matches_every_mode` — `sessionEnd` matches all six modes (iterate `Object.values(TIMELINE_FILTER_MODES)`).
13. `test_filter_buttons_cover_every_mode_with_all_first` — `TIMELINE_FILTER_BUTTONS.map(([mode]) => mode)` deep-equals `[all, conversation, tools, scripts, files, git]` (locks button order and completeness).

Do NOT run the file. Move to step 2.

## Step 2 — GREEN: `webapp/views/timeline-filter-model.ts` (new file, ~75 lines)

```ts
// Timeline event-type filter (task 114) — pure model: mode vocabulary + the node predicate.
// DOM-free so tests exercise it directly (same split as timeline-picks.ts / details-model.ts);
// the DOM consumer is timeline-render-filterbar.ts.

import { SCRIPT_EXECUTION_EVENT_KIND } from "./timeline-labels.ts";
import {
    AGENT_TURN_NODE_KIND,
    COMMIT_NODE_KIND,
    SESSION_END_NODE_KIND,
    TOOL_CALL_NODE_KIND,
    USER_TURN_NODE_KIND,
    type TimelineNode,
} from "./timeline-types.ts";

// View-only vocabulary (not wire vocabulary — stays out of src/structures/vocabulary.ts;
// frozen-const pattern per SplitRowKind in diff-vs-base-model.ts).
export const TIMELINE_FILTER_MODES = Object.freeze({
    all: "all",
    conversation: "conversation",
    tools: "tools",
    scripts: "scripts",
    files: "files",
    git: "git",
} as const);
export type TimelineFilterMode = (typeof TIMELINE_FILTER_MODES)[keyof typeof TIMELINE_FILTER_MODES];

// Ordered [mode, button label] pairs the filter bar renders left-to-right; All leads because
// it is the default.
export const TIMELINE_FILTER_BUTTONS: readonly (readonly [TimelineFilterMode, string])[] = Object.freeze([
    [TIMELINE_FILTER_MODES.all, "All"],
    [TIMELINE_FILTER_MODES.conversation, "Conversation"],
    [TIMELINE_FILTER_MODES.tools, "Tools"],
    [TIMELINE_FILTER_MODES.scripts, "Scripts"],
    [TIMELINE_FILTER_MODES.files, "Files"],
    [TIMELINE_FILTER_MODES.git, "Git"],
]);

// A conversational row is a user or agent turn.
function checkNodeIsConversationTurn(node: TimelineNode): boolean {
    if (node.kind === USER_TURN_NODE_KIND) {
        return true;
    }
    if (node.kind === AGENT_TURN_NODE_KIND) {
        return true;
    }
    return false;
}

// Same script-detection rule as the "Script" role pill (computeRolePillLabel): a tool-call row
// that executed a script, or an agent turn whose file chips carry a script-made revision.
function checkNodeRanScript(node: TimelineNode): boolean {
    if (node.kind === TOOL_CALL_NODE_KIND) {
        if (node.scriptRun !== undefined) {
            return true;
        }
    }
    if (node.kind === AGENT_TURN_NODE_KIND) {
        const changes = node.fileChanges ?? [];
        return changes.some((change) => change.eventKind === SCRIPT_EXECUTION_EVENT_KIND);
    }
    return false;
}

// A file-modifying row carries file-change chips, or is a script run the sandbox proved
// modified files (scriptRun.changedPaths is [] on read-only/declined runs).
function checkNodeModifiesFiles(node: TimelineNode): boolean {
    const changes = node.fileChanges ?? [];
    if (changes.length > 0) {
        return true;
    }
    if (node.kind === TOOL_CALL_NODE_KIND) {
        if (node.scriptRun !== undefined) {
            return node.scriptRun.changedPaths.length > 0;
        }
    }
    return false;
}

// The filter predicate: does `node` stay visible under `mode`? Session-end terminators stay
// visible in every mode — they anchor each session's extent in a filtered timeline.
export function checkNodeMatchesFilterMode(node: TimelineNode, mode: TimelineFilterMode): boolean {
    if (mode === TIMELINE_FILTER_MODES.all) {
        return true;
    }
    if (node.kind === SESSION_END_NODE_KIND) {
        return true;
    }
    if (mode === TIMELINE_FILTER_MODES.conversation) {
        return checkNodeIsConversationTurn(node);
    }
    if (mode === TIMELINE_FILTER_MODES.tools) {
        return node.kind === TOOL_CALL_NODE_KIND;
    }
    if (mode === TIMELINE_FILTER_MODES.scripts) {
        return checkNodeRanScript(node);
    }
    if (mode === TIMELINE_FILTER_MODES.files) {
        return checkNodeModifiesFiles(node);
    }
    return node.kind === COMMIT_NODE_KIND;
}
```

Note: `SCRIPT_EXECUTION_EVENT_KIND` is exported from `webapp/views/timeline-labels.ts:157` —
import it from there (no re-export shims, requirement 2 of `RevEng/plans/coding-requirements.md`).

## Step 3 — `webapp/index.html`: the filter bar element

Insert one line between the pane-header `</div>` (line 37) and `<section id="view">` (line 38):

```html
<div id="timeline-filter-bar" class="filter-bar" hidden></div>
```

`hidden` because the bar is meaningless until a timeline renders (the same element is present on
project/list routes that never populate it). `.filter-bar` is the existing strip layout class
(`webapp/styles.css:821`).

## Step 4 — `webapp/views/timeline-render-filterbar.ts` (new file, ~45 lines)

Thin DOM layer; no logic beyond wiring. Reuse the same `el` helper `timeline-render-rows.ts`
imports (check its import line and import from the same module). Shape:

```ts
// Timeline event-type filter bar (task 114) — thin DOM wiring over timeline-filter-model.ts.
// Renders one .toolbar-btn per mode into #timeline-filter-bar; clicking a button hides every
// .tl-row whose node fails checkNodeMatchesFilterMode. State is per-render: navigation rebuilds
// the bar back at "All".

export function renderTimelineFilterBar(context: TimelineRenderContext, bar: HTMLElement): void
```

Behavior it must implement:

1. `bar.replaceChildren()` then append one `<button class="toolbar-btn">` per entry of
   `TIMELINE_FILTER_BUTTONS` (label = entry label). Remove the `hidden` attribute.
2. The All button starts with class `active`.
3. On click: mark only the clicked button `active`, then apply the filter:
   for each `[index, node]` of `context.nodes.entries()`, get `context.nodeRows.get(index)`;
   if the row element exists, `row.classList.toggle("tl-filtered-out", !checkNodeMatchesFilterMode(node, mode))`.
4. Extract the apply loop as a local `applyTimelineFilterMode(context, mode)` function inside
   this module (not exported — nothing else calls it).

## Step 5 — hook-up in `webapp/views/timeline.ts`

In `renderTimelineView` (line 62), immediately after the `await buildTimelineRows(context, container)`
call, add:

```ts
renderTimelineFilterBar(context, document.getElementById("timeline-filter-bar")!);
```

Also confirm the other views' render entry points do not unhide the bar; if switching to a
non-timeline route leaves a stale visible bar, re-add the `hidden` attribute where `#view` is
cleared for other routes (check `webapp/app-router.ts` for the route-switch reset point; only do
this if the stale-bar case actually exists there).

## Step 6 — `webapp/styles.css`

Append two rules (bottom of file, one comment):

```css
/* Timeline event-type filter (task 114) */
.tl-row.tl-filtered-out { display: none; }
#timeline-filter-bar .toolbar-btn.active { background: var(--control-hover); border-color: var(--accent); }
```

Before adding the `.active` rule, `grep -n "toolbar-btn.active\|btn.active" webapp/styles.css`;
if an equivalent active-button rule already exists, reuse its class instead of adding this one.

## Step 7 — verify (no test runs)

- `npx tsc --noEmit` (repo tsconfig — covers the new test file's types).
- `npx tsc -p tsconfig.webapp.json` (webapp build — covers both new view modules).
- Fix any type errors; do not run `npm test` (the user will).

## Step 8 — stage

`git add` inside the jfred submodule only: the two new `webapp/views/` files, the new test file,
`webapp/index.html`, `webapp/styles.css`, `webapp/views/timeline.ts`. Do not commit; do not
stage anything in the RevEng parent repo (its gitlink only moves after a jfred commit exists).
