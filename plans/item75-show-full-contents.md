# Item 75 — "Show full contents" toggle in the File Revision Panel diff view

## Goal (plain English)

Add a **"Show full contents"** toggle button to the details-pane diff header, placed to
the **LEFT** of the existing `Columns | Inline` buttons. When the toggle is **on**, the
diff shows the **entire file** (every line as context), not just the ±3-line hunks —
while keeping add/del/context coloring, column alignment, and line-number gutters. It
works in **both** Columns and Inline modes. The toggle **persists** across renders and
reloads, exactly like the Columns/Inline toggle.

## Decision already made (do not re-litigate)

Reuse the existing diff renderers (`computeSplitRows` / `computeInlineRows`) unchanged.
"Full contents" is produced by widening git's unified-diff context from `3` to a very
large number (`--unified=<large>`), so git emits one hunk covering the whole file with
all unchanged lines present as context. A full-context flag threads:

```
[Show full contents button]  (webapp/views/details.ts)
   → /api/diff?...&context=full            (src/viewer_server.ts handleDiffRequest)
      → renderRevisionDiff(doc, file, fullContext)   (src/viewer_api.ts)
         → renderDiffWithContext(revisions, fullContext)  (src/reconstruction_render.ts)
            → runGitUnifiedDiff(before, after, contextLines)  (src/render_git_diff.ts)
```

No third-party diff library. No client-side diff algorithm. No new webapp dependency.

## Coding-standard notes for the implementer

- Function names contain a verb; compare discriminants via enum members (project rule).
- No magic numbers: the two context widths are named constants exported from
  `src/render_git_diff.ts`.
- The full-contents flag is a genuine boolean → it stays a primitive (rule 1 allows
  booleans/`mode` strings to stay primitive).
- Each phase is strict RED→GREEN: write the failing test first, then the minimum code.

---

## Phase 1 — Widen git's context (src/render_git_diff.ts)

### 1a. RED — new test in `tests/render_git_diff.test.ts`

Add ONE test proving a large context width includes unchanged lines that the default
width (3) omits:

```ts
test("test_runGitUnifiedDiff_with_full_context_includes_lines_far_from_the_change", () => {
    // Scenario: a file whose ONLY change is on the last line, with >3 unchanged lines
    // above it. Default context (3) omits the top lines; full context includes ALL of
    // them as context rows (" " prefix), so the whole file is present in the hunk.
    const before = [
        "line 1", "line 2", "line 3", "line 4", "line 5",
        "line 6", "line 7", "line 8", "target",
    ];
    const after = [...before];
    after[8] = "target changed";
    // Default width omits the distant top line.
    assert.ok(!runGitUnifiedDiff(before, after).includes(" line 1"));
    // Full width carries every unchanged line as context.
    const full = runGitUnifiedDiff(before, after, FULL_FILE_CONTEXT_LINES);
    assert.ok(full.includes(" line 1"));
    assert.ok(full.includes(" line 8"));
    assert.ok(full.includes("-target"));
    assert.ok(full.includes("+target changed"));
});
```

Import `FULL_FILE_CONTEXT_LINES` from `../src/render_git_diff.ts` at the top of the test
file. Test is RED because the function takes no third argument and the constant does not
exist yet.

### 1b. GREEN — `src/render_git_diff.ts`

- Add two exported constants near the top:
  ```ts
  // The default unified-diff context width (git's own default) — the ±N context lines
  // around each change the webapp normally shows.
  export const DEFAULT_DIFF_CONTEXT_LINES = 3;
  // "Show full contents": a context width larger than any real file, so git emits the
  // whole file as one hunk (every unchanged line present as context). Item 75.
  export const FULL_FILE_CONTEXT_LINES = 1_000_000;
  ```
- Give `runGitUnifiedDiff` a third parameter and use it in the git args:
  ```ts
  export function runGitUnifiedDiff(
      beforeLines: string[],
      afterLines: string[],
      contextLines: number = DEFAULT_DIFF_CONTEXT_LINES,
  ): string {
      ...
      ["diff", "--no-index", "--no-color", `--unified=${contextLines}`, "--", beforePath, afterPath],
      ...
  }
  ```
- Nothing else in the function changes (preamble strip, no-newline handling untouched).

**Why the default keeps every existing caller correct:** the parameter defaults to `3`,
so `renderDiffVsBase`, `reconstruction_base_commit`, and every current call behave
byte-for-byte as before; only the new full-context path passes the large value.

---

## Phase 2 — Thread `fullContext` through the render layer

### 2a. RED — new test in `tests/reconstruction_render.test.ts`

Model it on the existing `renderDiffWithContext` tests in that file (reuse whatever
`FileRevision` fixture/builder those tests already use — do NOT invent a new one):

```ts
test("test_renderDiffWithContext_full_context_shows_lines_the_default_omits", () => {
    // Scenario: two revisions differing only on the last line, with >3 unchanged lines
    // above. Default block omits the distant top line; the full-context block includes it.
    const revisions = /* build via the same helper the sibling tests use:
        rev0 = 9 lines "line 1".."line 8","target"; rev1 = same but last line "target changed" */;
    const defaultText = renderDiffWithContext(revisions);
    const fullText = renderDiffWithContext(revisions, true);
    assert.ok(!defaultText.includes(" line 1"));
    assert.ok(fullText.includes(" line 1"));
});
```

RED because `renderDiffWithContext` currently takes one argument.

### 2b. GREEN — `src/reconstruction_render.ts`

- Give `renderDiffWithContext` a second parameter and pick the width from it:
  ```ts
  export function renderDiffWithContext(revisions: FileRevision[], fullContext: boolean = false): string {
      const contextLines = fullContext ? FULL_FILE_CONTEXT_LINES : DEFAULT_DIFF_CONTEXT_LINES;
      ...
      const hunks = runGitUnifiedDiff(beforeLines, afterLines, contextLines);
      ...
  }
  ```
- Import `DEFAULT_DIFF_CONTEXT_LINES, FULL_FILE_CONTEXT_LINES` from `./render_git_diff.ts`.
- The block-header + rename short-circuit logic is unchanged.

### 2c. GREEN — `src/viewer_api.ts`

- Give `renderRevisionDiff` a passthrough parameter:
  ```ts
  export function renderRevisionDiff(document: ReconstructionDocument, filePath: Path, fullContext: boolean = false): string {
      return renderDiffWithContext(findFileHistory(document, filePath).revisions, fullContext);
  }
  ```
- Leave `renderDiffVsBase` untouched (default context; it is a different view, out of
  scope for this button).

---

## Phase 3 — Read the `context` query param (src/viewer_server.ts)

In `handleDiffRequest`, read the flag the same trust-boundary way `allowScripts` is read,
and pass it to the revision-diff branch only:

```ts
const fullContext = query.get("context") === "full";
...
sendText(response, 200, renderRevisionDiff(document, filePath, fullContext));
```

The `vsbase` branch is unchanged. No dedicated route-level test: this handler builds a
full document (the existing `allowScripts` flag likewise has no unit test); Phase 2's
`renderRevisionDiff`/`renderDiffWithContext` tests cover the behavior the route selects.

---

## Phase 4 — The toggle button (webapp)

### 4a. Markup — `webapp/index.html`

Add the button as the FIRST child of `#diff-mode-toggle`, to the LEFT of `#dm-columns`:

```html
<span id="diff-mode-toggle" hidden>
    <button id="dm-full">Show full contents</button><button id="dm-columns">Columns</button><button id="dm-inline">Inline</button>
</span>
```

It sits inside `#diff-mode-toggle`, so it auto-hides/shows with the group — it never
appears in the plain-text / "Show content" panes (`showTextInDetails` /
`showContentInDetails` call `hideDiffModeToggle`).

### 4b. RED — new test in `tests/details-viewmodels.test.ts`

Add ONE test for the pure resolver (mirror the existing `mapStoredDiffModeToToggle`
tests in that file):

```ts
test("test_resolveInitialFullContentsChoice_reads_the_stored_flag", () => {
    // Scenario: "1" means the toggle was left on; anything else (absent, "0", garbage)
    // means off — full contents is opt-in, so an unset key reads as off.
    assert.equal(resolveInitialFullContentsChoice("1"), true);
    assert.equal(resolveInitialFullContentsChoice(undefined), false);
    assert.equal(resolveInitialFullContentsChoice("0"), false);
    assert.equal(resolveInitialFullContentsChoice("columns"), false);
});
```

Import `resolveInitialFullContentsChoice` from the details view module. RED because it
does not exist.

### 4c. GREEN — `webapp/views/details.ts`

**Storage + resolver (module-level, near `readStoredDiffMode`):**

```ts
// "Show full contents" persists like the Columns/Inline toggle, under its own key. Item 75.
const FULL_CONTENTS_STORAGE_KEY = "reveng.diff.fullContents";

// The stored full-contents flag: "1" is on; absent / anything else is off (opt-in).
export function resolveInitialFullContentsChoice(stored: string | undefined): boolean {
    return stored === "1";
}

// localStorage is browser-only (same typeof-window guard as readStoredDiffMode).
function readStoredFullContents(): string | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }
    return localStorage.getItem(FULL_CONTENTS_STORAGE_KEY) ?? undefined;
}

function writeStoredFullContents(on: boolean): void {
    if (typeof window === "undefined") {
        return;
    }
    localStorage.setItem(FULL_CONTENTS_STORAGE_KEY, on ? "1" : "0");
}

function fullContentsIsOn(): boolean {
    return resolveInitialFullContentsChoice(readStoredFullContents());
}
```

**Fetch honors the flag — `fetchRevisionDiffBlocks` gains a `fullContents` param:**

```ts
async function fetchRevisionDiffBlocks(project: string, target: string, fullContents: boolean): Promise<string[]> {
    const params = new URLSearchParams({ project, file: target, mode: "revisions" });
    if (getConsentChoice(project) === "1") {
        params.set("allowScripts", "1");
    }
    if (fullContents) {
        params.set("context", "full");
    }
    return splitDiffBlocks(await fetchText(`/api/diff?${params}`));
}
```

**`showDiffInDetails` gains a `reload` thunk and wires the full button.** The Columns/
Inline buttons still only re-render the SAME `diffText` (no refetch). The full button
flips the stored flag and calls `reload`, which re-fetches (a full-context diff is a
DIFFERENT server response, so it cannot be re-rendered from the current text):

```ts
let shownDiff: { label: string; diffText: string; reload: () => void } | undefined;

function showDiffInDetails(label: string, diffText: string, reload: () => void): void {
    shownDiff = { label, diffText, reload };
    setRightPaneLabel(label);
    const mode = mapStoredDiffModeToToggle(readStoredDiffMode());
    const toggle = document.getElementById("diff-mode-toggle")!;
    toggle.hidden = false;
    const fullButton = document.getElementById("dm-full")!;
    const columnsButton = document.getElementById("dm-columns")!;
    const inlineButton = document.getElementById("dm-inline")!;
    fullButton.classList.toggle("active", fullContentsIsOn());
    columnsButton.classList.toggle("active", mode === "columns");
    inlineButton.classList.toggle("active", mode === "inline");
    const switchDiffMode = (label2: DiffToggleLabel) => {
        writeStoredDiffMode(label2);
        if (shownDiff !== undefined) {
            showDiffInDetails(shownDiff.label, shownDiff.diffText, shownDiff.reload);
        }
    };
    fullButton.onclick = () => {
        writeStoredFullContents(!fullContentsIsOn());
        reload();
    };
    columnsButton.onclick = () => switchDiffMode("columns");
    inlineButton.onclick = () => switchDiffMode("inline");
    const body = clearRightPaneBody();
    if (mode === "columns") {
        appendColumnsDiff(body, diffText);
        return;
    }
    appendInlineDiff(body, diffText);
}
```

**Callers supply their own `reload` (re-fetch with the CURRENT stored flag). Two paths:**

Message/commit mode — `appendFileList`. Extract the fetch+show into a re-callable local so
the reload thunk re-runs it:

```ts
function appendFileList(left: HTMLElement, changes: FileChange[], context: DetailsContext): HTMLElement[] {
    return changes.map((change) => {
        const item = el("div", { class: "dfile", text: change.path });
        const showThisFileDiff = async () => {
            const blocks = await fetchRevisionDiffBlocks(context.project, change.path, fullContentsIsOn());
            await showRevisionDiffInDetails(change, blocks, context.document.filesTouched, () => void showThisFileDiff());
        };
        item.onclick = async () => {
            left.querySelectorAll(".dfile").forEach((other) => other.classList.remove("selected"));
            item.classList.add("selected");
            await showThisFileDiff();
        };
        left.append(item);
        return item;
    });
}
```

`showRevisionDiffInDetails` gains a `reload` param it forwards to `showDiffInDetails`:

```ts
async function showRevisionDiffInDetails(change: FileChange, blocks: string[], filesTouched: WireFileHistory[], reload: () => void): Promise<void> {
    const link = change.changeId === undefined ? undefined : findRevisionForChangeId(filesTouched, change.changeId, undefined);
    const block = link?.revisionNumber === undefined ? undefined : blocks[link.revisionNumber - 1];
    const fallbackText = computeRevisionDiffFallbackText(block, change);
    if (fallbackText !== undefined) {
        showTextInDetails(change.path, fallbackText);
        return;
    }
    showDiffInDetails(change.path, block!, reload);
}
```

File-revisions mode — `renderDetailsFileMode`. Memoize the fetched blocks per flag (so
switching cards does NOT re-fetch, but toggling full does), and give each card a reload
that re-reads the flag:

```ts
// Two memos: revision diffs at default vs full context, each fetched at most once.
let defaultBlocks: Promise<string[]> | undefined;
let fullBlocks: Promise<string[]> | undefined;
const getDiffBlocks = (full: boolean) => {
    if (full) {
        fullBlocks ??= fetchRevisionDiffBlocks(context.project, target, true);
        return fullBlocks;
    }
    defaultBlocks ??= fetchRevisionDiffBlocks(context.project, target, false);
    return defaultBlocks;
};
const showCardDiff = async (card: RevisionCard, index: number) => {
    const full = fullContentsIsOn();
    const block = (await getDiffBlocks(full))[index];
    const change: FileChange = { /* unchanged */ };
    const fallbackText = computeRevisionDiffFallbackText(block, change);
    const label = `${target} — revision #${card.revisionNumber}`;
    if (fallbackText !== undefined) {
        showTextInDetails(label, fallbackText);
        return;
    }
    showDiffInDetails(label, block!, () => void showCardDiff(card, index));
};
```

The rev-card "Copy patch" / "Export .patch" buttons currently call `getDiffBlocks()` with
no arg — update those call sites to `getDiffBlocks(fullContentsIsOn())` so the exported
patch matches what the user is viewing.

**Nothing else in `renderDetailsFileMode` / `renderDetailsCommitMode` changes** — they
already route through the functions above (`items[0]!.click()` still works).

### 4d. CSS — `webapp/styles.css`

The `.active` button style already exists (Columns/Inline use it), so the full button
needs no new rule. "Show full contents" is wider than the other two labels; if the header
row wraps awkwardly, that is a pure visual tweak the user's standing visual pass will
catch — do not pre-optimize.

---

## Out of scope (state explicitly, do not build)

- The FileViewer **Diff vs Base** view (`renderDiffVsBase` / `diff-vs-base.ts`) — task 75
  is the details-pane File Revision Panel only. `renderDiffWithContext`'s new param
  defaults to `false`, so that view is untouched.
- Virtualizing very large full-file diffs. `runGitUnifiedDiff` already sets a 64MB
  git buffer; DOM row count for a whole file is acceptable for this local viewer.
  Ponytail ceiling: add windowing only if a real file makes the pane janky.

---

## Verification (user runs the suite; implementer confirms wiring)

1. `tests/render_git_diff.test.ts` — full-context includes distant lines (Phase 1).
2. `tests/reconstruction_render.test.ts` — `renderDiffWithContext(revisions, true)` shows
   omitted lines (Phase 2).
3. `tests/details-viewmodels.test.ts` — `resolveInitialFullContentsChoice` (Phase 4).
4. Build the webapp (`webapp/dist`) so `details.js` / `index.html` changes serve.
5. Manual: open a file's revisions, click **Show full contents** → the pane shows the
   whole file with coloring; toggle Columns/Inline → still full; reload page → toggle
   stays on (persisted); click again → back to ±3-line hunks.
