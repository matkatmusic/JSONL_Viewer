# Plan: TASKS.md items 47, 48, 49, 50, 51, 52 — webapp/viewer fixes

All six items verified still-real on 2026-07-09. User decisions already collected (recorded
per item below). Constraints binding the whole plan:

- Do NOT run the test suite or scenario sweeps — write/update tests only; the user runs them.
  Running `tsc` type-checks and `npm run build:webapp` is allowed (build, not test).
- Follow `plans/coding-requirements.md` (domain types, vocabulary enums, DRY, enum-member
  comparisons, verb-named functions).
- Replaced code is COMMENTED OUT with an `(item NN)` marker, never deleted (user preference).
- After implementation: stage everything (`git add`), do NOT commit.

Recommended order: 48 → 50 → 47 → 52 → 49 → 51 → TASKS.md → build → stage.
Items are independent; this order is smallest-first so a failure late in 51 leaves the
earlier finished items intact and stageable.

---

## Item 48 — file-history revision content forces horizontal scrollbars

**Fix (CSS only).** `webapp/styles.css` `.revision-content` (currently lines 229–232,
in the "File history view" section) uses `white-space: pre`, so long lines set the scroll
width. Apply the exact pattern item 39 used for `.diff-text`:

1. Comment out the current `white-space: pre;` declaration with an `/* (item 48) old: */`
   marker.
2. Add `white-space: pre-wrap; overflow-wrap: anywhere;` in its place.
3. Leave `overflow-x: auto` in place (harmless once nothing overflows) and leave
   `max-height: 300px; overflow-y: auto` untouched — the task is about fitting the
   assigned WIDTH; the vertical cap is deliberate.

No test (CSS-only, no view-model change).

---

## Item 50 — step click opens the Details drawer without keeping the clicked bubble in view

**Cause.** The USER_TURN handler (`webapp/views/timeline.ts:1193`) and AGENT_TURN handler
(`:1248`) call `openTurnInspector(node, previewPane)` and return. The drawer opening narrows
the timeline column and reflows every bubble; nothing re-scrolls. Item 37 fixed exactly this
for the `/at/<line>` anchor route by scrolling AFTER the drawer opens (`timeline.ts:1389`).

**Fix.** In BOTH click handlers, await the (async) inspector open, then center the row:

```ts
rowTop.addEventListener("click", async () => {
    if (selectedRow !== null) {
        selectedRow.classList.remove("selected");
    }
    selectedRow = row;
    row.classList.add("selected");
    drawRail();
    await openTurnInspector(node, previewPane);
    // (item 50) the drawer open narrows the timeline column and reflows every bubble;
    // center the clicked row against the post-drawer layout (same fix as item 37).
    row.scrollIntoView({ block: "center" });
});
```

Also apply the same `await …; row.scrollIntoView({ block: "center" })` tail to the
SESSION_END handler (`timeline.ts:1213`) — it opens the same drawer and suffers the same
reflow.

`block: "center"` (not `"nearest"`) — the task explicitly asks for the selected message to
stay centered. No test (DOM scroll behavior; view-model untouched).

---

## Item 47 — s84 Step 17: +/- shows nothing; { } lands on a different line than the bubble

Verified state: Step 17 is the `core_inventory.py` rename (changeId
`toolu_01PJHbTgmpX4p8XHYiZY7KTh`, revision index 3 of 5). Its `/api/diff?mode=revisions`
block is the single line `@@ renamed <old> → <new> @ <ts> @@` — `renderDiffWithContext`
deliberately emits no body for a rename (content unchanged), so the +/- drawer looks empty.
Separately, the chip's `{ }` opens the tool_result line (59) while the bubble's text record
is line 61.

### 47a — +/- on a body-less block renders an explanation

**TDD.** Add a pure helper to `webapp/views/timeline.ts` (near `computeUnattributedStepTag`)
and export it:

```ts
// A diff block with no hunk lines (a rename block is just its kind header) renders as an
// explanation instead of an empty pane; multi-line blocks return undefined (render as diff).
export function computeRevisionDiffFallbackText(block: string | undefined, change: FileChange): string | undefined {
    if (block === undefined) {
        return "(no diff block for this revision)";
    }
    if (block.trim().split("\n").length > 1) {
        return undefined;
    }
    if (change.renamedFrom !== undefined) {
        return `renamed ${change.renamedFrom} → ${change.path} (content unchanged)`;
    }
    return `${block.trim()}\n(no content change in this revision)`;
}
```

Write tests FIRST in `tests/timeline-viewmodels.test.ts` (3 cases: undefined block →
"(no diff block…)"; single-line block + `renamedFrom` set → "renamed … (content unchanged)";
multi-line block → `undefined`). Use hand-built `FileChange`-shaped objects like the existing
`computeUnattributedStepTag` tests.

Then wire it into `showRevisionDiff` (`timeline.ts:1035-1037`):

```ts
const blocks = splitDiffBlocks(await fetchText(`/api/diff?${params}`));
const diffPane = el("div", { class: "timeline-preview" });
const fallbackText = computeRevisionDiffFallbackText(blocks[revisionNumber], change);
if (fallbackText === undefined) {
    renderDiffText(diffPane, blocks[revisionNumber]!);
} else {
    diffPane.append(el("div", { class: "muted", text: fallbackText }));
}
```

(The old `renderDiffText(diffPane, blocks[revisionNumber] ?? "(no diff block for this
revision)")` line is commented out with an `(item 47)` marker.)

### 47b — retarget the chip's { } to the bubble's own message line (USER DECIDED)

In `renderFileButtonRow` (`timeline.ts:1056-1059`), the `{ }` chip's onclick currently calls
`showRevisionJson(change, previewPane)`. Replace the call with
`openTurnInspector(node, previewPane)` (`node` is already in scope) and update the chip's
`title` to `"Show this step's JSON in inspector"`. Comment out the old call with an
`(item 47)` marker.

`showRevisionJson` and its only helper `findRevisionResultLine` (`timeline.ts:961-992`)
become dead — comment both out entirely with an `(item 47)` marker (delete-later preference).
Verify with `npx tsc -p tsconfig.webapp.json --noEmit` that no other reference remains.

---

## Item 52 — visually differentiate tool-activity steps from agent replies (USER DECIDED: distinct bubble/border color + "tool call"/"tool result" tag)

Reference: s39 timeline Step 4 (text reply, no chips) vs Step 5 (empty-text agent turn
carrying 2 file chips + 2 git rows).

**TDD.** Add a pure exported helper to `webapp/views/timeline.ts` beside
`computeUnattributedStepTag`:

```ts
// An agent turn with no reply text is tool activity, not a reply: file chips mean the step
// shows tool RESULTS; git rows alone mean it shows the Bash tool CALLS that ran them.
// Replies (non-blank text) and chip-less/git-less turns return undefined.
export function computeToolActivityTag(node: TurnNode): string | undefined {
    if (node.kind !== AGENT_TURN_NODE_KIND) {
        return undefined;
    }
    if ((node.text ?? "").trim() !== "") {
        return undefined;
    }
    if ((node.fileChanges ?? []).length > 0) {
        return "tool result";
    }
    if (node.gitOperations.length > 0) {
        return "tool call";
    }
    return undefined;
}
```

Tests FIRST in `tests/timeline-viewmodels.test.ts`, hand-built nodes, 4 cases:
empty text + fileChanges → `"tool result"`; empty text + only gitOperations →
`"tool call"`; non-blank text + fileChanges → `undefined`; user-turn node → `undefined`.

**Render wiring** (AGENT_TURN branch, `timeline.ts:1220-1265`): compute
`const toolActivityTag = computeToolActivityTag(node);` and, when defined:

- `row.classList.add("tool-activity");` (the `row` element already carries
  `data-node-kind`).
- Insert `el("span", { class: "timeline-tag tool-activity-tag", text: toolActivityTag })`
  into `rowTop` right after the step label (same slot pattern as the `orphaned` /
  unattributed tags at `timeline.ts:1241-1244`).

**CSS** (`webapp/styles.css`, after the bubble rules at ~321-339): violet is unused by any
bubble today (`--lane-violet` exists as a session-lane extra), so it reads as a third
category next to the agent (code-bg) and user (accent-tint) bubbles:

```css
/* (item 52) tool-activity steps (tool calls/results, no reply text) read as a distinct
   category from agent replies: violet border + tint, plus their "tool call"/"tool result" tag */
.timeline-row.tool-activity[data-node-kind="agent-turn"]:not(.system) {
    border-color: var(--lane-violet);
    background: rgba(109, 58, 184, 0.07);
}
.timeline-tag.tool-activity-tag { color: var(--lane-violet); border: 1px solid var(--lane-violet); }
```

(The base `.timeline-tag` rule at `styles.css:367` already provides shape/size; mirror how
`.timeline-tag.commit` layers color on it.)

---

## Item 49 — syntax highlighting in Details-view file content (USER DECIDED: vendor highlight.js)

### 49.1 Vendor the library (same pattern as xterm.js)

Download pinned single-file builds into `webapp/vendor/` (network step; unpkg mirrors the
official cdn-assets package):

```
curl -fL -o webapp/vendor/highlight.min.js  https://unpkg.com/@highlightjs/cdn-assets@11.11.1/highlight.min.js
curl -fL -o webapp/vendor/highlight-github.min.css      https://unpkg.com/@highlightjs/cdn-assets@11.11.1/styles/github.min.css
curl -fL -o webapp/vendor/highlight-github-dark.min.css https://unpkg.com/@highlightjs/cdn-assets@11.11.1/styles/github-dark.min.css
```

If unpkg is unreachable, fall back to
`https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/…` equivalents. Sanity-check
each download starts with JS/CSS content, not an HTML error page.

`webapp/index.html` (next to the xterm includes at lines 27-29) — the app styles both light
and dark palettes, so gate each theme with the native `media` attribute (no JS):

```html
<link rel="stylesheet" href="/app/vendor/highlight-github.min.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="/app/vendor/highlight-github-dark.min.css" media="(prefers-color-scheme: dark)">
<script src="/app/vendor/highlight.min.js"></script>
```

Serving needs no server change: `resolveStaticFilePath` falls back to `webapp/` for anything
not in `webapp/dist/`, which is exactly how `vendor/xterm.js` is served today.

`webapp/styles.css`: add `.hljs { background: transparent; }` so the theme's own background
never fights the panes' `var(--code-bg)`.

### 49.2 The highlight module

New file `webapp/highlight.ts`:

```ts
// Syntax highlighting for Details-view file content (item 49). hljs is the vendored
// highlight.js script-tag global (webapp/vendor/highlight.min.js) — absent under node:test,
// so every touch is guarded and the fallback is plain text.
declare global {
    const hljs: {
        highlight(code: string, options: { language: string; ignoreIllegals: boolean }): { value: string };
        getLanguage(name: string): unknown;
    };
}

// File extension -> highlight.js language name; undefined = render as plain text.
const LANGUAGE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
    ["py", "python"], ["ts", "typescript"], ["tsx", "typescript"],
    ["js", "javascript"], ["mjs", "javascript"], ["cjs", "javascript"], ["jsx", "javascript"],
    ["json", "json"], ["md", "markdown"], ["css", "css"], ["html", "xml"],
    ["sh", "bash"], ["bash", "bash"], ["zsh", "bash"], ["yml", "yaml"], ["yaml", "yaml"],
]);

// The highlight.js language for a file path, from its extension; undefined for unknown
// extensions and extensionless paths.
export function computeLanguageForPath(path: string): string | undefined {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    if (dot <= 0) {
        return undefined;
    }
    return LANGUAGE_BY_EXTENSION.get(name.slice(dot + 1).toLowerCase());
}

// Fill a content element with file text, syntax-highlighted when the path names a known
// language and the vendored hljs global is present; plain text otherwise.
export function renderCodeInto(element: HTMLElement, content: string, path: string): void {
    const language = computeLanguageForPath(path);
    if (language === undefined || typeof hljs === "undefined" || hljs.getLanguage(language) === undefined) {
        element.textContent = content;
        return;
    }
    element.innerHTML = hljs.highlight(content, { language, ignoreIllegals: true }).value;
    element.classList.add("hljs");
}
```

`element.innerHTML` receives ONLY hljs output: hljs HTML-escapes the source text itself, so
this is not an injection surface for transcript content.

**TDD.** Tests FIRST for the pure half in a new `tests/highlight.test.ts`:
`computeLanguageForPath` cases — `a/b/orders.py` → `python`; `X.TS` → `typescript` (case
folding); `Makefile` → `undefined`; `.gitignore` (leading-dot name) → `undefined`;
`notes.txt` → `undefined`. (`renderCodeInto` needs a DOM — not unit-tested, same status as
the other render functions.)

### 49.3 Apply to the three file-content surfaces

1. **Timeline file preview** — `webapp/views/timeline.ts:957` (`showFilePreview`). Replace
   the `text:` shortcut with an element filled by `renderCodeInto`:
   ```ts
   const contentPane = el("div", { class: "timeline-preview" });
   if (content === undefined) {
       contentPane.textContent = "(no snapshot carries this file at this step)";
   } else {
       renderCodeInto(contentPane, content, change.path);
   }
   ```
   (old `el("div", { class: "timeline-preview", text: … })` commented out, `(item 49)`.)
2. **File-history revision content** — `webapp/views/file-history.ts:215`. Same pattern:
   build the `pre.revision-content.hidden` element without `text:`, then `renderCodeInto`
   with `revision.content` and `target` when content is defined, else the existing
   placeholder string as `textContent`.
3. **Inspector snapshot drawer** — `webapp/inspector.ts:519` (`openSnapshotDrawer`'s
   `pre.inspector-text`). Same pattern with `result.content ?? ""` and `entry.relativePath`.

All three keep their existing wrapping/scroll CSS; only text-node vs highlighted-spans
changes.

---

## Item 51 — real `git diff` produces the Details-view diff content (USER DECIDED: shell out)

Goal: hunk headers gain git's function context (`@@ -863,7 +896,7 @@ export async function
renderTimelineView(…)`) on both `/api/diff` modes (revisions + vsbase). The revision-KIND
block headers (`@@ changed @ <ts> @@`, `@@ renamed … @@`) MUST survive unchanged — the
webapp's `splitDiffBlocks` splits on them (`startsRevisionBlock`, `file-history.ts:140`,
already excludes any line starting `@@ -`, so git's numeric headers — with or without
trailing function context — never start a new block).

### 51.1 New module `src/render_git_diff.ts`

```ts
// Real-git unified diff between two in-memory line arrays (item 51): git's hunk headers
// carry function context ("@@ -a,b +c,d @@ def reorder(...)"), which the pure-TS renderer
// cannot produce. Used by renderDiffWithContext for the viewer's /api/diff surfaces only.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Serialize one side for git: exact lines, always newline-terminated so git never emits
// "\ No newline at end of file" markers into the webapp's row renderers.
function writeSideFile(directory: string, name: string, lines: string[]): string {
    const path = join(directory, name);
    writeFileSync(path, lines.length === 0 ? "" : lines.join("\n") + "\n");
    return path;
}

// The unified hunks (headers + bodies, preamble stripped) git produces between before and
// after; "" when the sides are identical. Throws on a real git failure (exit >= 2).
export function runGitUnifiedDiff(beforeLines: string[], afterLines: string[]): string {
    const directory = mkdtempSync(join(tmpdir(), "reveng-diff-"));
    try {
        const beforePath = writeSideFile(directory, "before", beforeLines);
        const afterPath = writeSideFile(directory, "after", afterLines);
        // ponytail: one spawn per revision per request; memoize on (before, after) content
        // hashes if diff-route latency ever matters.
        const result = spawnSync(
            "git",
            ["diff", "--no-index", "--no-color", "--unified=3", "--", beforePath, afterPath],
            { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
        );
        if (result.status !== 0 && result.status !== 1) {
            throw new Error(`git diff --no-index failed (${result.status}): ${result.stderr}`);
        }
        const lines = result.stdout.split("\n");
        const firstHunkIndex = lines.findIndex((line) => line.startsWith("@@ -"));
        if (firstHunkIndex < 0) {
            return "";
        }
        return lines.slice(firstHunkIndex).join("\n").replace(/\n+$/, "");
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}
```

Notes the implementer should not "improve" away:
- exit 1 is git's "differences found" success; only ≥2 is an error.
- Preamble stripping is "everything before the first `@@ -` line" — covers `diff --git`,
  `index`, mode lines, `---`, `+++` in one rule.
- `--unified=3` matches the old renderer's `DIFF_CONTEXT_LINE_COUNT = 3`.
- No consent gating: `git diff --no-index` on our own temp files is a read-only rendering
  concern, not scenario script execution (`setImpureExecutionAllowed` does not apply).

**TDD.** Tests FIRST in new `tests/render_git_diff.test.ts` (node:test + assert, like
siblings): (1) identical sides → `""`; (2) created file (empty before) → single hunk
starting `@@ -0,0 +1,`; (3) an edit INSIDE a `def reorder():` python function body, with
the def more than 3 context lines above the change → the hunk header line matches
`/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@ .*def reorder/` (this asserts the function context that
motivated the whole item); (4) output never contains `"\\ No newline"` (trailing-newline
serialization) and never contains a `diff --git` preamble line.

### 51.2 Integrate into `renderDiffWithContext` (`src/reconstruction_render.ts:~244`)

Inside the revision loop, replace the pure-TS hunk generation (the
`computeAlignedDiffLines` / `computeHunkRanges` / `renderHunk` block) with:

```ts
const blockLines = [computeDiffBlockHeader(previous, revision)];
if (!isRenameRevision(revision)) {
    const beforeLines = previous === undefined ? [] : previous.lines.map(currentText);
    const afterLines = revision.lines.map(currentText);
    const hunks = runGitUnifiedDiff(beforeLines, afterLines);
    if (hunks !== "") {
        blockLines.push(hunks);
    }
}
```

Comment out the old call lines with an `(item 51)` marker. If `tsc` then reports
`computeAlignedDiffLines`/`computeHunkRanges`/`renderHunk`/`AlignedDiffLine`/
`DIFF_CONTEXT_LINE_COUNT` as unused, comment those declarations out too (same marker) —
do NOT delete them. The CLI's `renderDiff` (changes-only human view) is untouched.

### 51.3 Webapp numeric-header regex must accept git's short form

git omits `,count` when a side's count is 1 (`@@ -5 +5,2 @@`). Two consumers parse numeric
headers:

1. `NUMERIC_HUNK_HEADER` (`webapp/views/diff-vs-base.ts:49`) → change to
   `/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/` (old regex commented out, `(item 51)`).
2. Grep the webapp for any other `@@ -` parsing (`grep -n '@@ -' webapp -r`) and align
   anything found the same way (`splitPatchByFile` keys on `diff --git ` lines and is
   unaffected).

`startsRevisionBlock` needs NO change (verified above). The split/inline renderers treat any
`@@`-prefixed line as a hunk row and display its full text — function context appears
automatically (exactly the behavior item 36c's notes predicted).

**TDD.** Extend the `computeSplitRows`/`computeInlineRows` tests in
`tests/viewer-viewmodels.test.ts` with one case each feeding a git-shaped header
(`@@ -5 +5,2 @@ def reorder():`) and asserting the line counters seed correctly (old side 5,
new side 5) and the header renders as a hunk row.

### 51.4 Reconcile existing renderer tests

Read `tests/viewer-api.test.ts:355-380` (`test_renderRevisionDiff_shows_consecutive_changes_
for_a_file`, `test_renderDiffVsBase_diffs_first_revision_against_selected`) and adjust any
assertion that binds to the OLD hunk shape (e.g. exact `@@ -a,b +c,d @@` strings with both
counts, or exact context-line windows). Keep the assertions structural: block count per
revision, presence of expected `+`/`-` payload lines, block headers still `@@ <kind> @ <ts>
@@`. The artifact-cache equality tests (`tests/viewer-artifact-cache.test.ts:201-203`)
compare two calls' outputs for equality and need no change.

---

## Close-out steps (after all six land)

1. **TASKS.md** — mark items 47, 48, 49, 50, 51, 52 `[x]` with a one-paragraph
   "Closed 2026-07-09" note each (what changed, file anchors, "tests written, not run —
   user runs the suite" where applicable), following the existing entry style.
2. **Type-check + build**: `npx tsc --noEmit` (src/tests config) and
   `npm run build:webapp` (refreshes `webapp/dist/`; also proves the webapp tsconfig is
   clean). Fix any reported errors. Do NOT run `npm test`.
3. **Stage**: `git add` all touched files (source, tests, styles, vendor files, index.html,
   TASKS.md, this plan + implementation notes). Do NOT commit.
4. Remind the user: restart any long-running viewer server to see the changes, and the
   4 new/updated test files await their standing suite run.
