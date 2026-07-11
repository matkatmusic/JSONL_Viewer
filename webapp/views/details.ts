// Details pane (item 66): the fork layout's bottom pane in its three modes — message (files
// touched + transcript inspector), commit (changed files + first diff), and file revisions
// (rev-cards + per-revision diff/content/actions). The view-model half is DOM-free and tested
// (tests/details-viewmodels.test.ts); render helpers touch the static #details-* skeleton
// that index.html declares. Shared diff rendering reuses diff-vs-base's row view-models with
// the mockup's .diff / .diff-cols markup.

import { el, fetchText, getConsentChoice } from "../app.ts";
import { revealDetailsPane } from "../inspector.ts";
import { buildFileHistoryViewModel, findRevisionForChangeId, splitDiffBlocks } from "./file-history.ts";
import {
    DIFF_MODE_STORAGE_KEY,
    DiffDisplayMode,
    SplitRowKind,
    computeInlineRows,
    computeSplitRows,
    resolveInitialDiffDisplayMode,
} from "./diff-vs-base.ts";
import {
    COMMIT_NODE_KIND,
    computeRevisionDiffFallbackText,
    deriveCommitChangedFiles,
    type FileChange,
    type TimelineNode,
    type WireTimelineDocument,
} from "./timeline.ts";
import { downloadText } from "./download.ts";
import { renderCodeInto } from "../highlight.ts";

// ── types (derived from timeline's wire/view-model types — one canonical home, no copies) ──

// One reconstructed file history off the wire document (target + its revision list).
type WireFileHistory = WireTimelineDocument["filesTouched"][number];

// Everything the render modes need from the owning timeline view: the loaded document, the
// node list, and the two callbacks the timeline wires (its inspector opener and row selector).
export type DetailsContext = {
    project: string;
    document: WireTimelineDocument;
    nodes: TimelineNode[];
    openNodeInspector: (nodeIndex: number) => void;
    selectTimelineRow: (nodeIndex: number) => void;
};

// One File-Revisions card: 1-based number, the revision kind as its op badge label, and the
// changeId the card's diff/jump actions resolve through.
type RevisionCard = { revisionNumber: number; opLabel: string; timestamp: string; changeId: string };

// The two diff-toggle labels (#dm-columns / #dm-inline).
type DiffToggleLabel = "columns" | "inline";

// ── view-model half (DOM-free, tested) ─────────────────────────────────────────────────────

// A node kind's readable label: the wire kind with its dashes spaced ("agent-turn" → "agent turn").
function humanizeNodeKind(kind: string): string {
    return kind.replaceAll("-", " ");
}

// The pane header for a selected row: commits lead with their hash + message; every other node
// names its 1-based step position and kind. Timestamps use the timeline's row format.
export function computeDetailsHeaderText(node: TimelineNode, position: { index: number; total: number }): string {
    const timestamp = new Date(node.when).toLocaleString();
    if (node.kind === COMMIT_NODE_KIND) {
        // no hash → no hash segment; a placeholder dash reads broken (user report, s58)
        const hashSegment = node.resultHash === undefined ? "" : ` ${node.resultHash}`;
        return `git commit${hashSegment} — ${node.detail ?? "git commit"} — ${timestamp}`;
    }
    return `Step ${position.index + 1} of ${position.total} — ${humanizeNodeKind(node.kind)} — ${timestamp}`;
}

// A file history's revision cards, 1-based, each labeled with its wire event kind.
export function buildRevisionCards(history: WireFileHistory): RevisionCard[] {
    return history.revisions.map((revision, index) => ({
        revisionNumber: index + 1,
        opLabel: revision.kind,
        timestamp: revision.timestamp,
        changeId: revision.changeId,
    }));
}

// The stored diff-vs-base vocabulary mapped onto the fork toggle: "split" (and the absent /
// garbage default) reads Columns, "inline" reads Inline — one storage key, two vocabularies.
export function mapStoredDiffModeToToggle(stored: string | undefined): DiffToggleLabel {
    if (resolveInitialDiffDisplayMode(stored) === DiffDisplayMode.split) {
        return "columns";
    }
    return "inline";
}

// ── shared right-pane plumbing ──────────────────────────────────────────────────────────────

function setDetailsHeader(text: string): void {
    document.getElementById("details-header")!.textContent = text;
}

function setRightPaneLabel(text: string): void {
    document.getElementById("details-right-label")!.textContent = text;
}

function hideDiffModeToggle(): void {
    document.getElementById("diff-mode-toggle")!.hidden = true;
}

function clearRightPaneBody(): HTMLElement {
    const body = document.getElementById("details-right-body")!;
    body.replaceChildren();
    return body;
}

// localStorage is browser-only; the node test runner imports this module with no DOM (same
// typeof-window guard rationale as diff-vs-base, item 36a).
function readStoredDiffMode(): string | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }
    return localStorage.getItem(DIFF_MODE_STORAGE_KEY) ?? undefined;
}

function writeStoredDiffMode(label: DiffToggleLabel): void {
    if (typeof window === "undefined") {
        return;
    }
    localStorage.setItem(DIFF_MODE_STORAGE_KEY, label === "columns" ? DiffDisplayMode.split : DiffDisplayMode.inline);
}

// The diff the right pane currently shows, kept for toggle re-renders.
let shownDiff: { label: string; diffText: string } | undefined;

// Plain explanatory text in the right pane (rename-only revisions, missing blocks).
function showTextInDetails(label: string, text: string): void {
    shownDiff = undefined;
    setRightPaneLabel(label);
    hideDiffModeToggle();
    clearRightPaneBody().append(el("pre", { class: "diff-text", text }));
}

// The revision's full content in the right pane, syntax-highlighted (file-mode "Show content").
function showContentInDetails(target: string, revisionNumber: number, content: string | undefined): void {
    shownDiff = undefined;
    setRightPaneLabel(`${target} — revision #${revisionNumber} content`);
    hideDiffModeToggle();
    const pane = el("pre", { class: "inspector-text" });
    if (content === undefined) {
        pane.textContent = "(no step snapshot carries this file yet)";
    } else {
        renderCodeInto(pane, content, target);
    }
    clearRightPaneBody().append(pane);
}

// The mockup's inline diff: one .diff-line per unified line, gutter number + raw text.
// Numbers come from diff-vs-base's computeInlineRows (dels count the old side, everything
// else the new side; hunk headers show ⋯).
function appendInlineDiff(body: HTMLElement, diffText: string): void {
    const pane = el("div", { class: "diff" });
    for (const row of computeInlineRows(diffText)) {
        const line = el("div", { class: "diff-line" });
        let lineNumberText: number | undefined;
        if (row.lineClass === "diff-line-hunk") {
            line.classList.add("hunk");
        } else if (row.lineClass === "diff-line-add") {
            line.classList.add("add");
            lineNumberText = row.newLineNumber;
        } else if (row.lineClass === "diff-line-del") {
            line.classList.add("del");
            lineNumberText = row.oldLineNumber;
        } else {
            lineNumberText = row.newLineNumber;
        }
        const gutterText = row.lineClass === "diff-line-hunk" ? "⋯" : lineNumberText === undefined ? "" : String(lineNumberText);
        line.append(
            el("span", { class: "diff-ln", text: gutterText }),
            el("span", { class: "diff-body", text: row.text }),
        );
        pane.append(line);
    }
    body.append(pane);
}

// A split cell's mockup class: dc-del / dc-add / plain context.
function mapSplitCellClass(lineClass: string): string {
    if (lineClass === "diff-line-del") {
        return "dc-del";
    }
    if (lineClass === "diff-line-add") {
        return "dc-add";
    }
    return "";
}

// The mockup's two-column diff grid, driven by diff-vs-base's computeSplitRows: full rows span
// the grid as hunk headers; pair rows emit ln+body cells per side (empty cells keep alignment).
function appendColumnsDiff(body: HTMLElement, diffText: string): void {
    const grid = el("div", { class: "diff-cols" });
    for (const row of computeSplitRows(diffText)) {
        if (row.kind === SplitRowKind.full) {
            grid.append(el("span", { class: "dc-hunk", text: row.text }));
            continue;
        }
        [row.left, row.right].forEach((cell, side) => {
            const sideClass = side === 1 ? " dc-right" : "";
            if (cell === undefined) {
                grid.append(
                    el("span", { class: `dc-ln${sideClass}` }),
                    el("span", { class: "dc-body" }),
                );
                return;
            }
            const cellClass = mapSplitCellClass(cell.lineClass);
            grid.append(
                el("span", { class: `dc-ln${sideClass} ${cellClass}`.trim(), text: cell.lineNumber === undefined ? "" : String(cell.lineNumber) }),
                el("span", { class: `dc-body ${cellClass}`.trim(), text: cell.text }),
            );
        });
    }
    body.append(grid);
}

// One diff in the right pane, in whichever layout the persisted toggle selects. #dm-columns /
// #dm-inline re-render the SAME diff and persist through diff-vs-base's storage vocabulary.
function showDiffInDetails(label: string, diffText: string): void {
    shownDiff = { label, diffText };
    setRightPaneLabel(label);
    const mode = mapStoredDiffModeToToggle(readStoredDiffMode());
    const toggle = document.getElementById("diff-mode-toggle")!;
    toggle.hidden = false;
    const columnsButton = document.getElementById("dm-columns")!;
    const inlineButton = document.getElementById("dm-inline")!;
    columnsButton.classList.toggle("active", mode === "columns");
    inlineButton.classList.toggle("active", mode === "inline");
    const switchDiffMode = (label2: DiffToggleLabel) => {
        writeStoredDiffMode(label2);
        if (shownDiff !== undefined) {
            showDiffInDetails(shownDiff.label, shownDiff.diffText);
        }
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

// The revision-timeline diff blocks of one file, freshly fetched (same /api/diff request the
// file-history view issues, consent flag included).
async function fetchRevisionDiffBlocks(project: string, target: string): Promise<string[]> {
    const params = new URLSearchParams({ project, file: target, mode: "revisions" });
    if (getConsentChoice(project) === "1") {
        params.set("allowScripts", "1");
    }
    return splitDiffBlocks(await fetchText(`/api/diff?${params}`));
}

// One file change's revision diff in the right pane: its changeId resolves to a 1-based
// revision through the document's histories, that revision's block renders as a diff, and the
// no-hunk cases (renames, missing blocks) render their fallback explanation instead.
async function showRevisionDiffInDetails(change: FileChange, blocks: string[], filesTouched: WireFileHistory[]): Promise<void> {
    const link = change.changeId === undefined ? undefined : findRevisionForChangeId(filesTouched, change.changeId, undefined);
    const block = link?.revisionNumber === undefined ? undefined : blocks[link.revisionNumber - 1];
    const fallbackText = computeRevisionDiffFallbackText(block, change);
    if (fallbackText !== undefined) {
        showTextInDetails(change.path, fallbackText);
        return;
    }
    showDiffInDetails(change.path, block!);
}

// The left pane's clickable file list (message + commit modes): clicking a file marks it
// selected and swaps the right pane to its revision diff.
function appendFileList(left: HTMLElement, changes: FileChange[], context: DetailsContext): HTMLElement[] {
    return changes.map((change) => {
        const item = el("div", { class: "dfile", text: change.path });
        item.onclick = async () => {
            left.querySelectorAll(".dfile").forEach((other) => other.classList.remove("selected"));
            item.classList.add("selected");
            const blocks = await fetchRevisionDiffBlocks(context.project, change.path);
            await showRevisionDiffInDetails(change, blocks, context.document.filesTouched);
        };
        left.append(item);
        return item;
    });
}

// ── the three modes ─────────────────────────────────────────────────────────────────────────

// Message mode: header + "Files touched" on the left, the transcript inspector (the node's own
// line) on the right by default; clicking a file swaps the right pane to its revision diff.
export function renderDetailsMessageMode(node: TimelineNode, nodeIndex: number, context: DetailsContext): void {
    revealDetailsPane();
    setDetailsHeader(computeDetailsHeaderText(node, { index: nodeIndex, total: context.nodes.length }));
    const left = document.getElementById("details-left")!;
    left.replaceChildren(el("div", { class: "pane-title", text: "Files touched" }));
    const changes = node.fileChanges ?? [];
    if (changes.length === 0) {
        left.append(el("div", { class: "dempty", text: "No files touched" }));
    } else {
        appendFileList(left, changes, context);
    }
    context.openNodeInspector(nodeIndex);
}

// Commit mode: header + "Changed files" (everything touched since the previous commit) on the
// left, the FIRST file's diff auto-shown on the right (mockup behavior).
export function renderDetailsCommitMode(node: TimelineNode, nodeIndex: number, context: DetailsContext): void {
    revealDetailsPane();
    setDetailsHeader(computeDetailsHeaderText(node, { index: nodeIndex, total: context.nodes.length }));
    const left = document.getElementById("details-left")!;
    left.replaceChildren(el("div", { class: "pane-title", text: "Changed files" }));
    const changes = deriveCommitChangedFiles(context.nodes, nodeIndex);
    if (changes.length === 0) {
        left.append(el("div", { class: "dempty", text: "No files changed" }));
        setRightPaneLabel("—");
        hideDiffModeToggle();
        clearRightPaneBody();
        return;
    }
    const items = appendFileList(left, changes, context);
    items[0]!.click();
}

// File-Revisions mode (entered from the Files sidebar): rev-cards on the left, the selected
// card's diff (or content / exports via its action buttons) on the right.
export function renderDetailsFileMode(target: string, context: DetailsContext): void {
    revealDetailsPane();
    setDetailsHeader(`File Revisions — ${target}`);
    const left = document.getElementById("details-left")!;
    left.replaceChildren(el("div", { class: "pane-title", text: "Revisions" }));
    const history = context.document.filesTouched.find((entry) => entry.target === target);
    if (history === undefined || history.revisions.length === 0) {
        left.append(el("div", { class: "dempty", text: "No revisions" }));
        return;
    }
    const cards = buildRevisionCards(history);
    // Revision contents come from the file-history view model (step snapshots at each
    // revision's timestamp) — the same mechanism the file-history view's Show content uses.
    const revisionContents = buildFileHistoryViewModel(context.document, target).revisions;
    const baseName = target.slice(target.lastIndexOf("/") + 1);
    // The revision-timeline diff, fetched once per file-mode entry, on first need.
    let diffBlocksPromise: Promise<string[]> | undefined;
    const getDiffBlocks = () => {
        diffBlocksPromise ??= fetchRevisionDiffBlocks(context.project, target);
        return diffBlocksPromise;
    };
    const showCardDiff = async (card: RevisionCard, index: number) => {
        const block = (await getDiffBlocks())[index];
        const change: FileChange = {
            path: target,
            eventKind: card.opLabel,
            renamedFrom: history.revisions[index]!.rename?.from,
            isFirstRevision: index === 0,
            changeId: card.changeId,
            when: card.timestamp,
        };
        const fallbackText = computeRevisionDiffFallbackText(block, change);
        const label = `${target} — revision #${card.revisionNumber}`;
        if (fallbackText !== undefined) {
            showTextInDetails(label, fallbackText);
            return;
        }
        showDiffInDetails(label, block!);
    };
    const selectCard = (cardElement: HTMLElement) => {
        left.querySelectorAll(".rev-card").forEach((other) => other.classList.remove("selected"));
        cardElement.classList.add("selected");
    };
    // An action button's click must not re-trigger the card's own diff swap.
    const buildActionButton = (text: string, onActivate: () => unknown) => el("button", {
        text,
        onclick: ((event: Event) => {
            event.stopPropagation();
            onActivate();
        }) as EventListener,
    });
    cards.forEach((card, index) => {
        const cardElement = el("div", { class: "rev-card" }, [
            el("div", { class: "rev-head" }, [
                el("span", { text: `#${card.revisionNumber}` }),
                el("span", { class: `op-badge op-${card.opLabel}`, text: card.opLabel }),
                el("span", { class: "rev-ts", text: new Date(card.timestamp).toLocaleString() }),
            ]),
            el("div", { class: "rev-actions" }, [
                buildActionButton("Show content", () => showContentInDetails(target, card.revisionNumber, revisionContents[index]?.content)),
                buildActionButton("Export this version", () => downloadText(`${baseName}.rev${card.revisionNumber}`, revisionContents[index]?.content ?? "")),
                buildActionButton("Copy patch", async () => navigator.clipboard.writeText((await getDiffBlocks())[index] ?? "")),
                buildActionButton("Export .patch", async () => downloadText(`${baseName}.rev${card.revisionNumber}.patch`, (await getDiffBlocks())[index] ?? "")),
                buildActionButton("Jump to timeline step", () => {
                    const ownerIndex = context.nodes.findIndex(
                        (candidate) => (candidate.fileChanges ?? []).some((change) => change.changeId === card.changeId),
                    );
                    // No owning row (rewound / synthetic revisions): the button is a no-op.
                    if (ownerIndex >= 0) {
                        context.selectTimelineRow(ownerIndex);
                    }
                }),
            ]),
        ]);
        cardElement.onclick = () => {
            selectCard(cardElement);
            void showCardDiff(card, index);
        };
        left.append(cardElement);
        if (index === 0) {
            selectCard(cardElement);
            void showCardDiff(card, index);
        }
    });
}
