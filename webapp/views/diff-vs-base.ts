// Diff-vs-Base view (#/project/<name>/file/<path>/vsbase): the file's first revision against a
// selected revision. Side-by-side/inline toggle, revision selector with URL sync, line-number gutters.

import {
    el as elFromApp,
    fetchDocument,
    fetchText,
    getConsentChoice,
    renderConsentDialog,
    routeToFileHistory,
} from "../app.ts";
import { buildFileHistoryViewModel, computeAnchoredRevisionIndex, type WireDocument as WireFileHistoryDocument } from "./file-history.ts";

// app.ts is typed in parallel; a precise local signature for `el` until then.
const el = elFromApp as (
    tag: string,
    attrs?: Record<string, string | EventListener>,
    children?: readonly HTMLElement[],
) => HTMLElement;

// Minimal wire shape of the revisions this view reads off the file-history view model.
type WireRevisionSummary = { kind: string };

// Discriminates split-view rows: full-width (hunk headers, preamble, non-diff text) vs
// left/right pairs inside a hunk.
export const SplitRowKind = Object.freeze({ full: "full", pair: "pair" } as const);

type SplitCell = { text: string; lineClass: string; lineNumber?: number };
type SplitRow =
    | { kind: typeof SplitRowKind.full; text: string; lineClass: string }
    | { kind: typeof SplitRowKind.pair; left: SplitCell | undefined; right: SplitCell | undefined };

// The unified-diff line prefixes that classify a line for inline/full-width coloring.
function computeFullRowLineClass(line: string): string {
    if (line.startsWith("@@")) {
        return "diff-line-hunk";
    }
    if (line.startsWith("+")) {
        return "diff-line-add";
    }
    if (line.startsWith("-")) {
        return "diff-line-del";
    }
    return "";
}

// The standard numeric hunk header the server's context renderer emits inside a revision
// block; groups 1/2 are the 1-based old/new start lines that seed the gutter counters.
// git omits ",count" when a side's count is 1, so each count is optional (item 51).
// const NUMERIC_HUNK_HEADER = /^@@ -(\d+),\d+ \+(\d+),\d+ @@/;  // item 51: pre-git mandatory counts
const NUMERIC_HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// A split-view cell; lineNumber is set only when a numeric hunk header has seeded that side.
function buildSplitCell(text: string, lineClass: string, lineNumber: number | undefined): SplitCell {
    const cell: SplitCell = { text, lineClass };
    if (lineNumber !== undefined) {
        cell.lineNumber = lineNumber;
    }
    return cell;
}

// Unified diff text -> rows for the two-column split view. Deletion/addition runs are zipped
// row-by-row; the one-char unified prefix is stripped inside hunk cells; "@@ -a,b +c,d @@"
// headers seed the per-side line-number counters shown in the gutters.
export function computeSplitRows(diffText: string): SplitRow[] {
    const rows: SplitRow[] = [];
    let pendingDeletions: SplitCell[] = [];
    let pendingAdditions: SplitCell[] = [];
    let insideHunk = false;
    let oldLineCounter: number | undefined = undefined;
    let newLineCounter: number | undefined = undefined;
    const takeOldLineNumber = () => {
        if (oldLineCounter === undefined) {
            return undefined;
        }
        return oldLineCounter++;
    };
    const takeNewLineNumber = () => {
        if (newLineCounter === undefined) {
            return undefined;
        }
        return newLineCounter++;
    };
    const flushPendingChanges = () => {
        const pairCount = Math.max(pendingDeletions.length, pendingAdditions.length);
        for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
            rows.push({
                kind: SplitRowKind.pair,
                left: pendingDeletions[pairIndex],
                right: pendingAdditions[pairIndex],
            });
        }
        pendingDeletions = [];
        pendingAdditions = [];
    };
    for (const line of diffText.split("\n")) {
        if (line.startsWith("@@")) {
            flushPendingChanges();
            insideHunk = true;
            const numericHeader = NUMERIC_HUNK_HEADER.exec(line);
            oldLineCounter = numericHeader === null ? undefined : Number(numericHeader[1]);
            newLineCounter = numericHeader === null ? undefined : Number(numericHeader[2]);
            rows.push({ kind: SplitRowKind.full, text: line, lineClass: "diff-line-hunk" });
            continue;
        }
        if (!insideHunk) {
            rows.push({ kind: SplitRowKind.full, text: line, lineClass: computeFullRowLineClass(line) });
            continue;
        }
        if (line.startsWith("-")) {
            pendingDeletions.push(buildSplitCell(line.slice(1), "diff-line-del", takeOldLineNumber()));
            continue;
        }
        if (line.startsWith("+")) {
            pendingAdditions.push(buildSplitCell(line.slice(1), "diff-line-add", takeNewLineNumber()));
            continue;
        }
        flushPendingChanges();
        const contextText = line.startsWith(" ") ? line.slice(1) : line;
        rows.push({
            kind: SplitRowKind.pair,
            left: buildSplitCell(contextText, "", takeOldLineNumber()),
            right: buildSplitCell(contextText, "", takeNewLineNumber()),
        });
    }
    flushPendingChanges();
    return rows;
}

// One rendered inline-view line; number fields are set only when a numeric hunk header has
// seeded that side's counter (item 40).
export type InlineRow = { text: string; lineClass: string; oldLineNumber?: number; newLineNumber?: number };

// Unified diff text -> inline rows in original line order, raw prefixes kept. "@@ -a,b +c,d @@"
// headers seed the per-side counters; "-" advances old only, "+" advances new only, context
// inside a hunk advances both; preamble lines and headers carry no numbers.
export function computeInlineRows(diffText: string): InlineRow[] {
    const rows: InlineRow[] = [];
    let insideHunk = false;
    let oldLineCounter: number | undefined = undefined;
    let newLineCounter: number | undefined = undefined;
    for (const line of diffText.split("\n")) {
        if (line.startsWith("@@")) {
            insideHunk = true;
            const numericHeader = NUMERIC_HUNK_HEADER.exec(line);
            oldLineCounter = numericHeader === null ? undefined : Number(numericHeader[1]);
            newLineCounter = numericHeader === null ? undefined : Number(numericHeader[2]);
            rows.push({ text: line, lineClass: "diff-line-hunk" });
            continue;
        }
        const row: InlineRow = { text: line, lineClass: computeFullRowLineClass(line) };
        if (insideHunk && line.startsWith("-") && oldLineCounter !== undefined) {
            row.oldLineNumber = oldLineCounter++;
        }
        if (insideHunk && line.startsWith("+") && newLineCounter !== undefined) {
            row.newLineNumber = newLineCounter++;
        }
        if (insideHunk && !line.startsWith("-") && !line.startsWith("+")) {
            if (oldLineCounter !== undefined) {
                row.oldLineNumber = oldLineCounter++;
            }
            if (newLineCounter !== undefined) {
                row.newLineNumber = newLineCounter++;
            }
        }
        rows.push(row);
    }
    return rows;
}

// Which layout every diff pane uses. Module-level so the choice sticks across re-renders, and
// mirrored to localStorage so it survives reloads (item 10f).
export const DiffDisplayMode = Object.freeze({ split: "split", inline: "inline" } as const);
type DiffDisplayModeValue = (typeof DiffDisplayMode)[keyof typeof DiffDisplayMode];
const DIFF_MODE_STORAGE_KEY = "diffDisplayMode";

// A stored value resolves to a mode: only the exact "inline" wire string opts out of the
// split default (null / garbage / absent all mean split).
export function resolveInitialDiffDisplayMode(storedValue: string | null | undefined): DiffDisplayModeValue {
    if (storedValue === DiffDisplayMode.inline) {
        return DiffDisplayMode.inline;
    }
    return DiffDisplayMode.split;
}

// localStorage access is guarded: the node test runner imports this module with no DOM. The
// guard checks `window`, not `localStorage` — on Node 26 even `typeof localStorage` (and a
// try/catch around it) fires the ExperimentalWarning, because touching the global getter at
// all is what warns (item 36a).
function readStoredDiffMode(): string | null | undefined {
    // if (typeof localStorage === "undefined") {  // item 36a: typeof localStorage itself warns
    if (typeof window === "undefined") {
        return undefined;
    }
    return localStorage.getItem(DIFF_MODE_STORAGE_KEY);
}

function writeStoredDiffMode(mode: DiffDisplayModeValue): void {
    // if (typeof localStorage === "undefined") {  // item 36a: typeof localStorage itself warns
    if (typeof window === "undefined") {
        return;
    }
    localStorage.setItem(DIFF_MODE_STORAGE_KEY, mode);
}

let diffDisplayMode = resolveInitialDiffDisplayMode(readStoredDiffMode());

// Inline view as a 3-column grid: old number | new number | raw unified line (item 40); the
// text column wraps instead of overflowing the pane (item 39). Hunk-header rows span all
// columns as muted "@@ -a,b +c,d @@" text, matching the split view (item 36c).
function renderInlineDiffLines(pane: HTMLElement, diffText: string): void {
    // item 40: the un-numbered per-line divs, replaced by the numbered grid below.
    // for (const line of diffText.split("\n")) {
    //     pane.append(el("div", { class: computeFullRowLineClass(line), text: line }));
    // }
    const grid = el("div", { class: "diff-inline" });
    for (const row of computeInlineRows(diffText)) {
        if (row.lineClass === "diff-line-hunk") {
            grid.append(el("div", { class: `diff-full ${row.lineClass}`, text: row.text }));
            continue;
        }
        grid.append(
            el("div", { class: "diff-line-num", text: row.oldLineNumber === undefined ? "" : String(row.oldLineNumber) }),
            el("div", { class: "diff-line-num", text: row.newLineNumber === undefined ? "" : String(row.newLineNumber) }),
            el("div", { class: row.lineClass, text: row.text }),
        );
    }
    pane.append(grid);
}

// The split grid: 4 columns (old number | old text | new number | new text). Full rows span
// all columns; pair rows emit a gutter + text cell per side (empty divs keep the grid aligned
// when one side is absent).
function renderSplitDiffGrid(pane: HTMLElement, diffText: string): void {
    const grid = el("div", { class: "diff-split" });
    for (const row of computeSplitRows(diffText)) {
        if (row.kind === SplitRowKind.full) {
            grid.append(el("div", { class: `diff-full ${row.lineClass}`.trim(), text: row.text }));
            continue;
        }
        for (const cell of [row.left, row.right]) {
            if (cell === undefined) {
                grid.append(el("div", { class: "diff-line-num" }), el("div", {}));
                continue;
            }
            grid.append(
                el("div", { class: "diff-line-num", text: cell.lineNumber === undefined ? "" : String(cell.lineNumber) }),
                el("div", { class: cell.lineClass, text: cell.text }),
            );
        }
    }
    pane.append(grid);
}

export function renderDiffText(pane: HTMLElement, diffText: string): void {
    pane.replaceChildren();
    const toggleButton = el("button", {
        class: "row-btn",
        text: diffDisplayMode === DiffDisplayMode.split ? "inline view" : "side by side",
        onclick: () => {
            diffDisplayMode = diffDisplayMode === DiffDisplayMode.split ? DiffDisplayMode.inline : DiffDisplayMode.split;
            writeStoredDiffMode(diffDisplayMode);
            renderDiffText(pane, diffText);
        },
    });
    pane.append(el("div", { class: "diff-view-toggle" }, [toggleButton]));
    if (diffDisplayMode === DiffDisplayMode.inline) {
        renderInlineDiffLines(pane, diffText);
        return;
    }
    renderSplitDiffGrid(pane, diffText);
}

// anchorRev (optional): 1-based revision to preselect instead of the last one.
export async function renderDiffVsBaseView(
    container: HTMLElement,
    project: string,
    target: string,
    anchorRev: string | undefined,
): Promise<void> {
    const result = await fetchDocument<WireFileHistoryDocument>(project, undefined);
    if (result.consentRequired !== undefined) {
        renderConsentDialog(container, project, result.consentRequired);
        return;
    }
    const viewModel = buildFileHistoryViewModel(result.document!, target);
    const lastIndex = Math.max(viewModel.revisions.length - 1, 0);

    const revisionSelect = el("select", {}) as HTMLSelectElement;
    viewModel.revisions.forEach((revision: WireRevisionSummary, index: number) => {
        revisionSelect.append(el("option", { value: String(index), text: `#${index + 1} · ${revision.kind}` }));
    });
    const anchoredRevisionIndex = computeAnchoredRevisionIndex(anchorRev, viewModel.revisions.length);
    revisionSelect.value = String(anchoredRevisionIndex ?? lastIndex);

    const diffPane = el("div", { class: "diff-text" });
    const loadDiff = async () => {
        const params = new URLSearchParams({ project, file: target, mode: "vsbase", rev: revisionSelect.value });
        if (getConsentChoice(project) === "1") params.set("allowScripts", "1");
        renderDiffText(diffPane, await fetchText(`/api/diff?${params}`));
    };
    // URL sync lives in the listener, not loadDiff, so the initial render never rewrites a bare
    // /vsbase URL.
    revisionSelect.addEventListener("change", async () => {
        await loadDiff();
        history.replaceState(null, "", `${routeToFileHistory(project, target)}/vsbase/${Number(revisionSelect.value) + 1}`);
    });

    container.append(el("div", { class: "filter-bar" }, [
        el("div", { class: "pane-title", text: `${target} · vs base` }),
        el("span", { class: "muted", text: "base #1 →" }),
        revisionSelect,
        el("a", { href: routeToFileHistory(project, target), text: "← file history" }),
    ]));
    container.append(diffPane);
    await loadDiff();
}
