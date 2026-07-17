# Plan: close TASKS.md items 13, 25, 19, 21

Four closures. Items 13 and 25 were settled by planning-time measurement/archaeology and are
TASKS.md close-outs with verification commands. Items 19 (timeline jump-to-snapshot button)
and 21 (inspector formatted-text mode) are webapp changes, done with strict red-green TDD.

Constraints for the implementer:

- Follow `plans/coding-requirements.md` and `~/.claude/guides/coding-standards.md`
  (4-space indent, imperative style, verb-named functions, guard-style single-condition
  branching).
- Webapp files are plain `.js` — no type annotations in `webapp/` files.
- Test runner is `npm test` (`node --import tsx --test tests/*.test.ts`) — NOT vitest.
- STAGE all work at the end; do NOT commit.
- `probe-item13-item25.ts` in the repo root is the planning probe — delete it during Task 4
  (final gates). Do not stage it.

---

## Task 1 — Item 13: close as YAGNI in TASKS.md

Planning-time measurement (probe over s84, the biggest scenario, 3 warm runs):
`JSON.stringify(document)` costs **0.4–0.5ms for 69KB**. The serialized-string cache would
save half a millisecond on a reload path whose cold cost is ~7.3s of python spawns + parse
(TASKS item 11 is the real lever). Nothing to build.

### Step 1.1 — spot-check the measurement

```bash
node --import tsx -e '
import { buildProjectDocument } from "./src/viewer_api.ts";
import { S84_JSONL_PATHS } from "./tests/fixtures.ts";
const document = buildProjectDocument(S84_JSONL_PATHS, undefined);
const startMs = performance.now();
const text = JSON.stringify(document);
console.log(`${(performance.now() - startMs).toFixed(1)}ms, ${(text.length / 1024).toFixed(0)}KB`);
' 2>&1 | tail -1
```

Expect single-digit milliseconds. (Any value under ~50ms confirms the close; the planning runs
measured 0.5ms.)

### Step 1.2 — mark item 13 done in TASKS.md

Change item 13's checkbox to `- [x]` and append (2-space continuation indent):

```markdown
  **Closed 2026-07-08 as YAGNI:** measured on s84 (the biggest scenario): `JSON.stringify`
  of the document is 0.5ms / 69KB. The reload path's real cost is python spawns + parse
  (item 11); a serialized-string cache saves half a millisecond. Nothing built.
```

---

## Task 2 — Item 25: close with the investigation verdict in TASKS.md

Planning-time investigation result (the write-up the item asked for):

- The symptom has MOVED since the 2026-07-07 handoff: on current code, s84 Step 17 resolves
  cleanly (rename chip for `core_inventory.py`). The zero-chip pickable turn is now **Step 23**
  (empty-text agent turn, 20:53:49.772Z, session `24b1753b`), snapshot index 8 = `steps[7]`.
- `steps[7]` carries ONE changeId — a random uuid (different on every build: `23e3c674…`,
  `43428f48…`, `4afa9da5…` across three probe runs) — with `changedPaths: []` and no
  resolvable session.
- Root cause: the step timeline (`reconstructStepTimeline`) and the per-file histories
  (`reconstructAll`/surviving) are SEPARATE replays. Both re-create the same synthetic
  script-execution event (the `apply_renames.py` run rewriting `core_inventory.py` at
  20:53:49.772Z) via `beaconlessScriptExecutions`, and EACH stamps its own
  `new Uuid(randomUUID())` (`src/reconstruction_script_stage.ts:303`; same pattern at
  `src/reconstruction_git_evidence.ts:377`). Two independent random ids can never join, so
  the step's changeId matches no revision → no chips, no session, empty changedPaths.
- This is DOCUMENTED best-effort behavior, not an unknown bug: the ponytail note at
  `src/reconstruction_json.ts:175-177` says re-stamped steps resolve to `[]`, and the NOTE at
  `src/reconstruction_json.ts:216-218` says evidence-spliced revisions carry random changeIds.
- Verdict: **engine data gap, known and documented; the turn itself is real and correctly
  pickable.** The candidate real fix — deterministic synthetic changeIds (derive from
  target + run timestamp) so both replays produce the same id — is a design change touching
  changeId-uniqueness assumptions, and needs a user decision; it is NOT part of this close.

### Step 2.1 — verify the zero-chip step reproduces

```bash
node --import tsx -e '
import { buildTurnTimelineViewModel, indexRevisionsByChangeId, AGENT_TURN_NODE_KIND } from "./webapp/views/timeline.js";
import { buildProjectDocument } from "./src/viewer_api.ts";
import { S84_JSONL_PATHS } from "./tests/fixtures.ts";
const document = JSON.parse(JSON.stringify(buildProjectDocument(S84_JSONL_PATHS, undefined)));
const viewModel = buildTurnTimelineViewModel(document);
for (const node of viewModel.nodes) {
    if (node.kind !== AGENT_TURN_NODE_KIND) continue;
    if ((node.snapshots?.length ?? 0) === 0) continue;
    if (node.fileChanges.length > 0) continue;
    console.log("zero-chip step", node.stepNumber, "snapshot changeIds", JSON.stringify(node.snapshots.map((snapshot) => snapshot.changeIds)));
}
' 2>&1 | grep zero-chip
```

Expect exactly one line naming step 23 with a single uuid changeId. (If the step number
drifted again, one zero-chip step with a random-uuid changeId is still the confirming signal.)

### Step 2.2 — mark item 25 done in TASKS.md

Change item 25's checkbox to `- [x]` and append:

```markdown
  **Closed 2026-07-08 (investigated):** the zero-chip pickable turn (now Step 23; step
  numbering shifted since the handoff) is the `apply_renames.py` script run rewriting
  `core_inventory.py` at 20:53:49.772Z. The step timeline and the file histories are separate
  replays, and each stamps the synthetic script-execution event with its own `randomUUID()`
  (`reconstruction_script_stage.ts:303`), so the step's changeId can never join a revision —
  documented best-effort (`reconstruction_json.ts:175-177`, `:216-218`). Verdict: known,
  documented engine data gap; the turn is real and correctly pickable. A real fix
  (deterministic synthetic changeIds shared by both replays) is a design decision — raise as
  a new item if wanted.
```

---

## Task 3 — Item 19: per-revision "Jump to File History Snapshot" button (TDD)

### Behavior (plain English)

Each timeline file chip row with a resolvable changeId gets a third action chip (after `{ }`
and `+/-`) that navigates to `#/project/<name>/file/<path>/rev/<n>` — the file-history view
anchored at that revision. The router already renders that route as a file-history drawer over
the timeline (`webapp/app.js` renderRoute; `computeAnchoredRevisionIndex` handles `/rev/<n>`).
A changeId that resolves to no surviving revision (item 25's re-stamped synthetic ids) gets no
button.

Named things:

- `computeSnapshotJumpRoute(project, filesTouched, change)` — exported pure function in
  `webapp/views/timeline.js`: the route string, or `undefined` when the change has no
  changeId or it resolves to no surviving revision number.

### Step 3.1 — RED: tests

In `tests/timeline-viewmodels.test.ts`: add `computeSnapshotJumpRoute` to the existing import
from `../webapp/views/timeline.js`, add `routeToFileHistory` via a new import from
`../webapp/app.js`, then append:

```ts
test("test_compute_snapshot_jump_route_targets_the_revisions_1_based_number", () => {
    // Scenario: a chip whose changeId is a surviving revision's changeId routes to the
    // file-history view anchored at that revision (1-based /rev/<n>, item 19).
    const history = s84Document.filesTouched[0]!;
    const change = { path: history.target, changeId: history.revisions[0]!.changeId };
    assert.equal(
        computeSnapshotJumpRoute("s84", s84Document.filesTouched, change),
        `${routeToFileHistory("s84", history.target)}/rev/1`,
    );
});

test("test_compute_snapshot_jump_route_returns_undefined_without_a_changeid", () => {
    // Scenario: a changedPaths-hint chip carries no changeId — no jump button.
    const change = { path: "whatever.py", changeId: undefined };
    assert.equal(computeSnapshotJumpRoute("s84", s84Document.filesTouched, change), undefined);
});

test("test_compute_snapshot_jump_route_returns_undefined_for_unresolvable_changeids", () => {
    // Scenario: a re-stamped synthetic changeId (item 25) matches no surviving revision —
    // no jump button rather than a dead link.
    const change = { path: "whatever.py", changeId: "00000000-0000-4000-8000-000000000000" };
    assert.equal(computeSnapshotJumpRoute("s84", s84Document.filesTouched, change), undefined);
});
```

Run `node --import tsx --test tests/timeline-viewmodels.test.ts` — MUST fail on the missing
export. Record the red.

### Step 3.2 — GREEN: the pure function

In `webapp/views/timeline.js`:

- extend the `./file-history.js` import with `findRevisionForChangeId`;
- extend the `../app.js` import with `routeToFileHistory`;
- add near `deriveFileChanges` (the other chip-level pure helpers):

```js
// The file-history route a chip's revision jumps to ("#/project/<p>/file/<path>/rev/<n>"),
// or undefined when the change carries no changeId or it resolves to no surviving revision
// number (re-stamped synthetic ids, blob names without an anchored revision) — those chips
// get no jump button rather than a dead link.
export function computeSnapshotJumpRoute(project, filesTouched, change) {
    if (change.changeId === undefined) {
        return undefined;
    }
    const revisionLink = findRevisionForChangeId(filesTouched, change.changeId, undefined);
    if (revisionLink === undefined) {
        return undefined;
    }
    if (revisionLink.revisionNumber === undefined) {
        return undefined;
    }
    return `${routeToFileHistory(project, revisionLink.target)}/rev/${revisionLink.revisionNumber}`;
}
```

Tests green.

### Step 3.3 — wire the button

In `renderFileButtonRow` (`webapp/views/timeline.js:851`), inside the existing
`if (change.changeId !== undefined)` block, after the `+/-` button push, add:

```js
            const jumpRoute = computeSnapshotJumpRoute(project, documentJson.filesTouched, change);
            if (jumpRoute !== undefined) {
                buttons.push(el("span", {
                    class: "timeline-chip timeline-chip-action",
                    title: "Jump to File History Snapshot",
                    text: "⤷",
                    onclick: (event) => {
                        event.stopPropagation();
                        location.hash = jumpRoute;
                    },
                }));
            }
```

`project` is the `renderTimelineView` parameter, in scope. `documentJson` here stands for the
fetched-document variable already in scope of the render section — the SAME variable the view
passes to `buildTurnTimelineViewModel`; verify its actual name at the edit site and use that
(do not introduce a new fetch).

### Step 3.4 — mark item 19 done in TASKS.md

Checkbox to `- [x]`, append:

```markdown
  **Closed 2026-07-08:** each chip row with a changeId resolvable to a surviving revision gets
  a `⤷` action chip ("Jump to File History Snapshot") routing to
  `#/project/<name>/file/<path>/rev/<n>` via the new `computeSnapshotJumpRoute`
  (`webapp/views/timeline.js`); unresolvable changeIds get no button. 3 tests in
  `tests/timeline-viewmodels.test.ts`.
```

---

## Task 4 — Item 21: inspector "Show as formatted text" mode (TDD)

### Behavior (plain English)

The JSON inspector (opened by clicking a raw-lines row, a timeline step, etc.) shows the
selected JSONL line as highlighted JSON. Add a toggle button in the inspector's nav bar that
re-renders the SAME line as human-readable text: the record's message text blocks and
tool-result text with real newlines, instead of JSON-escaped strings. The existing
`line <n> / <total>` label in the nav bar is the "line 123 of 234 lines" context the TASKS
item asks for. Records with no extractable text (e.g. file-history snapshots) show no toggle.
The chosen mode sticks for the browser session (module-level flag, same pattern as
`diffDisplayMode` in `webapp/views/diff-vs-base.js`).

Named things:

- `extractReadableText(value)` — exported pure function in `webapp/inspector.js`: the
  human-readable text of one parsed JSONL record, or `undefined` when it has none.
- `inspectorShowsFormattedText` — module-level boolean in `webapp/inspector.js`.

### Step 4.1 — RED: tests

Create `tests/inspector-viewmodels.test.ts`:

```ts
// Pure view-model tests for the JSON inspector's formatted-text mode (webapp/inspector.js).
// Records arrive exactly as the inspector sees them: JSON.parse of one raw JSONL line, or the
// raw string itself when the line is not JSON.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractReadableText } from "../webapp/inspector.js";

test("test_extract_readable_text_returns_string_message_content_verbatim", () => {
    // Scenario: a user record whose message.content is a plain string — the prompt text IS
    // the readable content.
    const record = { type: "user", message: { role: "user", content: "fix the bug" } };
    assert.equal(extractReadableText(record), "fix the bug");
});

test("test_extract_readable_text_joins_text_blocks_with_blank_lines", () => {
    // Scenario: an assistant record with two text blocks reads as two paragraphs.
    const record = { type: "assistant", message: { content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
    ] } };
    assert.equal(extractReadableText(record), "first\n\nsecond");
});

test("test_extract_readable_text_unwraps_tool_result_content", () => {
    // Scenario: a tool_result block carries the file/tool output — string form and nested
    // text-block form both read as their text.
    const stringForm = { message: { content: [{ type: "tool_result", content: "line a\nline b" }] } };
    assert.equal(extractReadableText(stringForm), "line a\nline b");
    const nestedForm = { message: { content: [{ type: "tool_result", content: [{ type: "text", text: "inner" }] }] } };
    assert.equal(extractReadableText(nestedForm), "inner");
});

test("test_extract_readable_text_renders_tool_use_string_inputs_verbatim", () => {
    // Scenario: a tool_use block (e.g. a Write) holds the real payload in its string input
    // fields — show them with real newlines under a per-field divider, not JSON-escaped.
    const record = { message: { content: [
        { type: "tool_use", name: "Write", input: { file_path: "a.py", content: "x = 1\ny = 2", count: 3 } },
    ] } };
    assert.equal(
        extractReadableText(record),
        "[tool_use: Write]\n--- file_path ---\na.py\n--- content ---\nx = 1\ny = 2",
    );
});

test("test_extract_readable_text_marks_unknown_blocks_instead_of_dropping_them", () => {
    // Scenario: a block kind the extractor does not model becomes a one-line placeholder so
    // nothing silently vanishes.
    const record = { message: { content: [{ type: "thinking", thinking: "hmm" }] } };
    assert.equal(extractReadableText(record), "[thinking]");
});

test("test_extract_readable_text_returns_undefined_without_message_content", () => {
    // Scenario: a file-history snapshot record has no message — the inspector hides the
    // formatted-text toggle for it.
    assert.equal(extractReadableText({ type: "file-history-snapshot", snapshot: {} }), undefined);
});

test("test_extract_readable_text_returns_non_json_lines_verbatim", () => {
    // Scenario: the inspector falls back to the raw string when a line fails JSON.parse;
    // that string is already the readable content.
    assert.equal(extractReadableText("not json at all"), "not json at all");
});
```

Run `node --import tsx --test tests/inspector-viewmodels.test.ts` — MUST fail on the missing
export. Record the red.

### Step 4.2 — GREEN: the extractor

In `webapp/inspector.js`, above `openInspectorPane`, add:

```js
// ── formatted-text mode (TASKS item 21) ─────────────────────────────────────

// A tool_use block's readable form: a name header plus each STRING input field verbatim under
// a per-field divider — a Write's `content` shows with real newlines instead of JSON escapes.
// Non-string inputs (numbers, arrays) stay in the JSON view; this mode is for reading text.
function extractToolUseText(block) {
    const lines = [`[tool_use: ${block.name}]`];
    for (const [key, value] of Object.entries(block.input ?? {})) {
        if (typeof value !== "string") {
            continue;
        }
        lines.push(`--- ${key} ---`, value);
    }
    return lines.join("\n");
}

// A tool_result block's readable form: its string content, or its nested text blocks joined
// by blank lines (placeholder for nested non-text blocks).
function extractToolResultText(block) {
    if (typeof block.content === "string") {
        return block.content;
    }
    if (!Array.isArray(block.content)) {
        return "[tool_result]";
    }
    return block.content
        .map((inner) => (inner.type === "text" ? inner.text : `[${inner.type}]`))
        .join("\n\n");
}

function extractBlockText(block) {
    if (block.type === "text") {
        return block.text;
    }
    if (block.type === "tool_result") {
        return extractToolResultText(block);
    }
    if (block.type === "tool_use") {
        return extractToolUseText(block);
    }
    return `[${block.type}]`;
}

// The human-readable text of one parsed JSONL record: message text and tool payloads with
// real newlines, blocks joined by blank lines, unknown block kinds as one-line placeholders.
// A non-JSON raw line is already readable and returns verbatim. undefined when the record
// carries no message content (e.g. file-history snapshots) — the caller hides the toggle.
export function extractReadableText(value) {
    if (typeof value === "string") {
        return value;
    }
    const content = value?.message?.content;
    if (content === undefined) {
        return undefined;
    }
    if (typeof content === "string") {
        return content;
    }
    if (!Array.isArray(content)) {
        return undefined;
    }
    return content.map((block) => extractBlockText(block)).join("\n\n");
}

// Whether the inspector body renders formatted text instead of highlighted JSON. Module-level
// so the choice sticks across lines and re-opens for the browser session (same pattern as
// diff-vs-base's diffDisplayMode). ponytail: session-only; localStorage if ever wanted.
let inspectorShowsFormattedText = false;
```

Tests green.

### Step 4.3 — wire the toggle into showLine

In `openTranscriptInspector`'s `showLine` (`webapp/inspector.js:236-266`), between the
`toolButtons` assembly and `openInspectorPane().append(...)`, derive the readable text and
the body; replace the current unconditional `renderHighlightedJson(...)` argument:

```js
        const readableText = extractReadableText(value);
        if (readableText !== undefined) {
            toolButtons.push(el("button", {
                class: "row-btn",
                text: inspectorShowsFormattedText ? "Show raw JSON" : "Show as formatted text",
                onclick: () => {
                    inspectorShowsFormattedText = !inspectorShowsFormattedText;
                    showLine(clamped);
                },
            }));
        }
        let body;
        if (inspectorShowsFormattedText && readableText !== undefined) {
            body = el("pre", { class: "inspector-text", text: readableText });
        } else {
            body = renderHighlightedJson(JSON.stringify(value, null, 4), value, clamped, maps, showLine, filesTouched, openRevision);
        }
        openInspectorPane().append(
            el("div", { class: "inspector-nav" }, [
                el("button", { class: "row-btn", text: "◀ Prev", onclick: () => showLine(clamped - 1) }),
                el("span", { class: "muted", text: `line ${clamped} / ${rawLines.length - 1}` }),
                el("button", { class: "row-btn", text: "Next ▶", onclick: () => showLine(clamped + 1) }),
                ...toolButtons,
            ]),
            el("h2", { text: jsonlName }),
            body,
        );
```

(Appending the toggle to `toolButtons` keeps it in the nav bar next to the tool-flow jumps;
the nav bar's existing `line <n> / <total>` label provides the context the TASKS item asks
for.)

### Step 4.4 — CSS

In `webapp/styles.css`, next to the `.inspector-json` rule (line ~239), add:

```css
.inspector-text { white-space: pre-wrap; word-break: break-word; overflow-x: auto; font-size: 12px; line-height: 1.5; }
```

### Step 4.5 — mark item 21 done in TASKS.md

Checkbox to `- [x]`, append:

```markdown
  **Closed 2026-07-08:** the JSON inspector's nav bar gains a "Show as formatted text" toggle
  (`extractReadableText`, `webapp/inspector.js`): message text, tool_result output, and
  tool_use string inputs render with real newlines; unknown blocks become placeholders;
  records with no message content show no toggle. The nav's existing `line n / total` label
  is the context readout. Session-sticky mode; 7 tests in
  `tests/inspector-viewmodels.test.ts`.
```

---

## Final gates

1. `npm test` — full suite green (baseline 497 passing; expect +10: 3 timeline + 7 inspector).
2. `rm probe-item13-item25.ts` (the planning probe; never staged).
3. `git add` all touched files: `TASKS.md`, `webapp/views/timeline.js`, `webapp/inspector.js`,
   `webapp/styles.css`, `tests/timeline-viewmodels.test.ts`, `tests/inspector-viewmodels.test.ts`,
   this plan file, and the implementation-notes file. Do NOT commit.
