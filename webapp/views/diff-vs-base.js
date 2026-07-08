// Diff-vs-Base view (#/project/<name>/file/<path>/vsbase): the file's first revision against a
// selected revision. Side-by-side/inline toggle, revision selector with URL sync, line-number gutters.

import {
    el,
    fetchDocument,
    fetchText,
    getConsentChoice,
    renderConsentDialog,
    routeToFileHistory,
} from "../app.js";
import { buildFileHistoryViewModel, computeAnchoredRevisionIndex } from "./file-history.js";

// Discriminates split-view rows: full-width (hunk headers, preamble, non-diff text) vs
// left/right pairs inside a hunk.
export const SplitRowKind = Object.freeze({ full: "full", pair: "pair" });

// The unified-diff line prefixes that classify a line for inline/full-width coloring.
function computeFullRowLineClass(line) {
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
const NUMERIC_HUNK_HEADER = /^@@ -(\d+),\d+ \+(\d+),\d+ @@/;

// A split-view cell; lineNumber is set only when a numeric hunk header has seeded that side.
function buildSplitCell(text, lineClass, lineNumber) {
    const cell = { text, lineClass };
    if (lineNumber !== undefined) {
        cell.lineNumber = lineNumber;
    }
    return cell;
}

// Unified diff text -> rows for the two-column split view. Deletion/addition runs are zipped
// row-by-row; the one-char unified prefix is stripped inside hunk cells; "@@ -a,b +c,d @@"
// headers seed the per-side line-number counters shown in the gutters.
export function computeSplitRows(diffText) {
    const rows = [];
    let pendingDeletions = [];
    let pendingAdditions = [];
    let insideHunk = false;
    let oldLineCounter = undefined;
    let newLineCounter = undefined;
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

// Which layout every diff pane uses. Module-level so the choice sticks across re-renders for
// the session. ponytail: session-only; add localStorage if reload-stickiness is ever wanted.
const DiffDisplayMode = Object.freeze({ split: "split", inline: "inline" });
let diffDisplayMode = DiffDisplayMode.split;

// Today's classic unified rendering: one colored div per raw line.
function renderInlineDiffLines(pane, diffText) {
    for (const line of diffText.split("\n")) {
        pane.append(el("div", { class: computeFullRowLineClass(line), text: line }));
    }
}

// The split grid: 4 columns (old number | old text | new number | new text). Full rows span
// all columns; pair rows emit a gutter + text cell per side (empty divs keep the grid aligned
// when one side is absent).
function renderSplitDiffGrid(pane, diffText) {
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

export function renderDiffText(pane, diffText) {
    pane.replaceChildren();
    const toggleButton = el("button", {
        class: "row-btn",
        text: diffDisplayMode === DiffDisplayMode.split ? "inline view" : "side by side",
        onclick: () => {
            diffDisplayMode = diffDisplayMode === DiffDisplayMode.split ? DiffDisplayMode.inline : DiffDisplayMode.split;
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
export async function renderDiffVsBaseView(container, project, target, anchorRev) {
    const result = await fetchDocument(project, undefined);
    if (result.consentRequired !== undefined) {
        renderConsentDialog(container, project, result.consentRequired);
        return;
    }
    const viewModel = buildFileHistoryViewModel(result.document, target);
    const lastIndex = Math.max(viewModel.revisions.length - 1, 0);

    const revisionSelect = el("select", {});
    viewModel.revisions.forEach((revision, index) => {
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
