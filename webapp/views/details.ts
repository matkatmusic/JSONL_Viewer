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
    buildFileTree,
    buildFilesSidebarViewModel,
    computeRangeSummary,
    computeRevisionDiffFallbackText,
    deriveCommitChangedFiles,
    splitPatchByFile,
    type FileChange,
    type FileSidebarEntry,
    type TimelineNode,
    type WireTimelineDocument,
} from "./timeline.ts";
import { renderFileTreeNode, type FileTreeCallbacks } from "./sidebar.ts";
import { downloadText } from "./download.ts";
import { renderCodeInto } from "../highlight.ts";

// ── types (derived from timeline's wire/view-model types — one canonical home, no copies) ──

// One reconstructed file history off the wire document (target + its revision list).
type WireFileHistory = WireTimelineDocument["filesTouched"][number];

// Everything the render modes need from the owning timeline view: the loaded document, the
// node list, and the callbacks the timeline wires (its inspector openers, row selector, and
// range-patch fetcher).
export type DetailsContext = {
    project: string;
    document: WireTimelineDocument;
    nodes: TimelineNode[];
    openNodeInspector: (nodeIndex: number) => void;
    selectTimelineRow: (nodeIndex: number) => void;
    // item 84: open a revision's causing JSONL record in the right column (the rev-card { }
    // action). Only the timeline can resolve changeId → (jsonl, line), so it passes this in.
    openRecordForChangeId: (changeId: string) => void;
    // item 84: the multi-card range diff fetches the server's step-range patch. fetchRangePatch
    // is closure-local to the timeline (it owns the consent params and its cache), so it too
    // passes in rather than being rebuilt here.
    fetchRangePatch: (fromStepIndex: number, toStepIndex: number) => Promise<string>;
};

// One File-Revisions card: 1-based number, the revision kind as its op badge label, and the
// changeId the card's diff/jump actions resolve through.
export type RevisionCard = { revisionNumber: number; opLabel: string; timestamp: string; changeId: string };

// item 84: which right-column render the Revision View opens with. Local to the view layer —
// this is no wire vocabulary, so it lives beside its view (the same precedent DiffDisplayMode
// sets in views/diff-vs-base.ts), not in src/structures/vocabulary.ts.
export enum RevisionViewMode {
    diff = "diff",        // the revision's diff vs the previous revision — the card's own default
    content = "content",  // the revision's full file content
    record = "record",    // the JSONL record that caused the revision
}

// item 84: which revision the Revision View opens on, and how. Absent → revision #1 in diff
// mode, which is the Files-treeview entry's unchanged behavior.
export type RevisionFocus = { changeId: string; mode: RevisionViewMode };

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

// item 84: the 0-based card a focus selects. An absent focus, or a changeId no card carries
// (rewound / synthetic revisions), opens revision #1 — the view must always land somewhere.
export function computeFocusedCardIndex(cards: RevisionCard[], focus: RevisionFocus | undefined): number {
    if (focus === undefined) {
        return 0;
    }
    const focusedIndex = cards.findIndex((card) => card.changeId === focus.changeId);
    if (focusedIndex < 0) {
        return 0;
    }
    return focusedIndex;
}

// item 84: whether a set of toggled cards names ONE range — at least one card, and no gap
// between the lowest and highest. A gapped selection ("#1 and #4") names no single before→after
// pair, so the range mode refuses it rather than silently diffing across the gap. Click order
// does not matter; card order does.
export function checkCardRunIsContiguous(selectedIndexes: number[]): boolean {
    if (selectedIndexes.length === 0) {
        return false;
    }
    const sorted = [...selectedIndexes].sort((left, right) => left - right);
    const span = sorted[sorted.length - 1]! - sorted[0]!;
    return span === sorted.length - 1;
}

// item 84: the timeline node indexes owning a run of cards — each card's changeId names the node
// whose fileChanges carry it, the same resolution the "Jump to timeline step" action uses. Two
// kinds of card contribute nothing: one no node owns (rewound / synthetic revisions), and one
// whose owner carries an EMPTY snapshots array — computeRangeSummary maps snapshots to step
// indexes and Math.min()s them (timeline.ts:416-421), so an empty-snapshot owner would yield
// fromStepIndex = Infinity and send a garbage /api/range-patch request. (A snapshot-LESS owner
// is unreachable: only TurnNode/SessionEndNode carry fileChanges, and both require snapshots.)
export function computeOwningNodeIndexes(cards: RevisionCard[], nodes: TimelineNode[], selectedIndexes: number[]): number[] {
    const ownerIndexes: number[] = [];
    for (const cardIndex of selectedIndexes) {
        const card = cards[cardIndex];
        if (card === undefined) {
            continue;
        }
        const ownerIndex = nodes.findIndex(
            (candidate) => (candidate.fileChanges ?? []).some((change) => change.changeId === card.changeId),
        );
        if (ownerIndex < 0) {
            continue;
        }
        if ((nodes[ownerIndex]!.snapshots ?? []).length === 0) {
            continue;
        }
        ownerIndexes.push(ownerIndex);
    }
    return ownerIndexes;
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

// item 75: "Show full contents" persists like the Columns/Inline toggle, under its own key.
const FULL_CONTENTS_STORAGE_KEY = "reveng.diff.fullContents";

// The stored full-contents flag: "1" is on; absent / anything else is off (opt-in — the
// default view is the ±3-line hunk diff).
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

// The diff the right pane currently shows, kept for toggle re-renders. `reload` re-fetches
// (a full-context diff is a DIFFERENT server response, so the full-contents toggle cannot
// re-render from the current text — item 75).
let shownDiff: { label: string; diffText: string; reload: () => void } | undefined;

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
    // Full contents changes the fetched diff (wider git context), so it re-fetches via
    // reload rather than re-rendering the current text.
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

// The revision-timeline diff blocks of one file, freshly fetched (same /api/diff request the
// file-history view issues, consent flag included).
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

// One file change's revision diff in the right pane: its changeId resolves to a 1-based
// revision through the document's histories, that revision's block renders as a diff, and the
// no-hunk cases (renames, missing blocks) render their fallback explanation instead.
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

// This node's touched files as file-tree entries — ONLY the paths it changed, never the whole
// project. Revision count / deleted / renamed-from come from the document's own histories via
// buildFilesSidebarViewModel (the same source the Files sidebar reads, so the two trees agree
// about a file); a changed path with no surviving history still gets a leaf, from the change
// itself. Deduped by path: a turn that edits one file twice shows ONE leaf, carrying its LAST
// change — the file's end state for this node.
function buildTouchedFileEntries(changes: FileChange[], wireDocument: WireTimelineDocument): FileSidebarEntry[] {
    const sidebarEntriesByTarget = new Map(
        buildFilesSidebarViewModel(wireDocument).map((entry) => [entry.target, entry]),
    );
    const entriesByTarget = new Map<string, FileSidebarEntry>();
    for (const change of changes) {
        const known = sidebarEntriesByTarget.get(change.path);
        if (known !== undefined) {
            entriesByTarget.set(change.path, known);
            continue;
        }
        entriesByTarget.set(change.path, {
            target: change.path,
            revisionCount: 0,
            isDeleted: false,
            originalPath: change.renamedFrom,
        });
    }
    return [...entriesByTarget.values()];
}

// The left pane's clickable file list (message + commit modes): clicking a file marks it
// selected and swaps the right pane to its revision diff.
// (item 84 follow-up) The flat `.dfile` list of ellipsis-truncated FULL paths is replaced by the
// Files sidebar's own tree component (item 77's renderFileTreeNode): basenames, folder grouping,
// rename badges, struck-through deletes. Returned in DOM order, so renderDetailsCommitMode's
// `items[0]!.click()` still opens the first file the user actually sees. The tree covers ONLY the
// node's own changed paths — never the whole project.
// old:
// function appendFileList(left: HTMLElement, changes: FileChange[], context: DetailsContext): HTMLElement[] {
//     return changes.map((change) => {
//         const item = el("div", { class: "dfile", text: change.path });
//         // Re-callable so the full-contents toggle can re-fetch this file's diff at the
//         // current stored context width (item 75).
//         const showThisFileDiff = async () => {
//             const blocks = await fetchRevisionDiffBlocks(context.project, change.path, fullContentsIsOn());
//             await showRevisionDiffInDetails(change, blocks, context.document.filesTouched, () => void showThisFileDiff());
//         };
//         item.onclick = async () => {
//             left.querySelectorAll(".dfile").forEach((other) => other.classList.remove("selected"));
//             item.classList.add("selected");
//             await showThisFileDiff();
//         };
//         left.append(item);
//         return item;
//     });
// }
function appendFileList(left: HTMLElement, changes: FileChange[], context: DetailsContext): HTMLElement[] {
    // A leaf click knows only its path; the diff needs the FileChange (its changeId resolves the
    // revision, its eventKind picks the rename/no-hunk fallback text). Last change per path wins,
    // matching buildTouchedFileEntries' dedup.
    const changeByPath = new Map(changes.map((change) => [change.path, change]));
    // Re-callable so the full-contents toggle can re-fetch this file's diff at the current stored
    // context width (item 75).
    const showFileDiff = async (change: FileChange) => {
        const blocks = await fetchRevisionDiffBlocks(context.project, change.path, fullContentsIsOn());
        await showRevisionDiffInDetails(change, blocks, context.document.filesTouched, () => void showFileDiff(change));
    };
    const callbacks: FileTreeCallbacks = {
        onFileClick: (target: string) => {
            const change = changeByPath.get(target);
            if (change === undefined) {
                return;
            }
            void showFileDiff(change);
        },
    };
    for (const node of buildFileTree(buildTouchedFileEntries(changes, context.document))) {
        left.append(renderFileTreeNode(node, callbacks, left));
    }
    return [...left.querySelectorAll(".file-item")] as HTMLElement[];
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

// File-Revisions mode — THE Revision View (item 84). Every route to a file's content lands here:
// the Files sidebar (no focus → revision #1, diff), and every timeline chip-row button (focused
// on its own revision, in the mode its button names). Rev-cards on the left, the selected card's
// diff / content / causing record on the right.
export function renderDetailsFileMode(target: string, context: DetailsContext, focus?: RevisionFocus): void {
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
    const focusedIndex = computeFocusedCardIndex(cards, focus);
    const focusedMode = focus?.mode ?? RevisionViewMode.diff;
    // Revision contents come from the file-history view model (step snapshots at each
    // revision's timestamp) — the same mechanism the file-history view's Show content uses.
    const revisionContents = buildFileHistoryViewModel(context.document, target).revisions;
    const baseName = target.slice(target.lastIndexOf("/") + 1);
    // The revision-timeline diff at each context width, fetched at most once each on first
    // need: switching rev-cards never re-fetches, but toggling full contents fetches the
    // wider diff separately (item 75).
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
        const block = (await getDiffBlocks(fullContentsIsOn()))[index];
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
        showDiffInDetails(label, block!, () => void showCardDiff(card, index));
    };
    // item 84: one card's right-column render in a chosen mode. A card's OWN click always means
    // diff — only an incoming focus can ask for content or record.
    const showCardInMode = (card: RevisionCard, index: number, mode: RevisionViewMode) => {
        if (mode === RevisionViewMode.content) {
            showContentInDetails(target, card.revisionNumber, revisionContents[index]?.content);
            return;
        }
        if (mode === RevisionViewMode.record) {
            context.openRecordForChangeId(card.changeId);
            return;
        }
        void showCardDiff(card, index);
    };
    // item 84: which cards are toggled for a range diff (0-based). Empty → single-card mode.
    const rangeSelection = new Set<number>();
    // Each card's range toggle, pushed in card order by the forEach below — so rangeToggles[i]
    // is always card i's own toggle.
    const rangeToggles: HTMLElement[] = [];
    // Every glyph re-reads the set: one click changes one card's membership, but the whole run's
    // glyphs must agree with it.
    const refreshRangeToggleGlyphs = () => {
        rangeToggles.forEach((toggle, toggleIndex) => {
            toggle.textContent = rangeSelection.has(toggleIndex) ? "☑" : "☐";
        });
    };
    // item 84: the picked run's diff for THIS file — card run → owning nodes → step range → the
    // server's range patch → this file's block. The same path showFilePreview's range branch
    // took before item 84 moved it here; computeRangeSummary still speaks node indexes.
    const showRangeDiff = async () => {
        const selectedIndexes = [...rangeSelection].sort((left2, right2) => left2 - right2);
        if (!checkCardRunIsContiguous(selectedIndexes)) {
            showTextInDetails(target, "(pick a contiguous run of revisions)");
            return;
        }
        const ownerIndexes = computeOwningNodeIndexes(cards, context.nodes, selectedIndexes);
        if (ownerIndexes.length === 0) {
            showTextInDetails(target, "(no timeline steps own the picked revisions)");
            return;
        }
        const summary = computeRangeSummary(context.nodes, ownerIndexes);
        const patchText = await context.fetchRangePatch(summary.fromStepIndex, summary.toStepIndex);
        const block = splitPatchByFile(patchText).find((entry) =>
            target === entry.path || target.endsWith(`/${entry.path}`));
        const firstNumber = selectedIndexes[0]! + 1;
        const lastNumber = selectedIndexes[selectedIndexes.length - 1]! + 1;
        const label = `${target} — revisions #${firstNumber}→#${lastNumber}`;
        if (block === undefined) {
            showTextInDetails(label, "(file unchanged across the picked revisions)");
            return;
        }
        showDiffInDetails(label, block.block, () => void showRangeDiff());
    };
    // Never re-enter renderDetailsFileMode to repaint: it would rebuild the cards and drop both
    // the selection and the focus. Flip the glyphs in place, then re-decide the right column.
    const toggleRangeCard = (index: number) => {
        if (rangeSelection.has(index)) {
            rangeSelection.delete(index);
        } else {
            rangeSelection.add(index);
        }
        refreshRangeToggleGlyphs();
        // Emptying the run returns the right column to the focused card's own render.
        if (rangeSelection.size === 0) {
            showCardInMode(cards[focusedIndex]!, focusedIndex, focusedMode);
            return;
        }
        void showRangeDiff();
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
        // item 84: the range toggle. buildActionButton stops propagation for us — toggling a card
        // into the range must not also fire the card's own diff swap.
        const rangeToggle = buildActionButton("☐", () => toggleRangeCard(index));
        rangeToggles.push(rangeToggle);
        const cardElement = el("div", { class: "rev-card" }, [
            el("div", { class: "rev-head" }, [
                rangeToggle,
                el("span", { text: `#${card.revisionNumber}` }),
                el("span", { class: `op-badge op-${card.opLabel}`, text: card.opLabel }),
                el("span", { class: "rev-ts", text: new Date(card.timestamp).toLocaleString() }),
            ]),
            el("div", { class: "rev-actions" }, [
                buildActionButton("Show content", () => showContentInDetails(target, card.revisionNumber, revisionContents[index]?.content)),
                buildActionButton("Export this version", () => downloadText(`${baseName}.rev${card.revisionNumber}`, revisionContents[index]?.content ?? "")),
                buildActionButton("Copy patch", async () => navigator.clipboard.writeText((await getDiffBlocks(fullContentsIsOn()))[index] ?? "")),
                buildActionButton("Export .patch", async () => downloadText(`${baseName}.rev${card.revisionNumber}.patch`, (await getDiffBlocks(fullContentsIsOn()))[index] ?? "")),
                buildActionButton("Jump to timeline step", () => {
                    const ownerIndex = context.nodes.findIndex(
                        (candidate) => (candidate.fileChanges ?? []).some((change) => change.changeId === card.changeId),
                    );
                    // No owning row (rewound / synthetic revisions): the button is a no-op.
                    if (ownerIndex >= 0) {
                        context.selectTimelineRow(ownerIndex);
                    }
                }),
                // item 84: the ONLY route to a file-modifying event's JSON. The timeline chip's
                // { } delegates here, so this is load-bearing for the unification rule, not a
                // nicety — without it the Revision View has no JSON route at all.
                buildActionButton("{ }", () => context.openRecordForChangeId(card.changeId)),
            ]),
        ]);
        cardElement.onclick = () => {
            selectCard(cardElement);
            void showCardDiff(card, index);
        };
        left.append(cardElement);
        // item 84: was `if (index === 0)` — the focused card is now whichever revision the
        // caller asked for, in the mode it asked for. No focus still means #1 in diff mode.
        if (index === focusedIndex) {
            selectCard(cardElement);
            showCardInMode(card, index, focusedMode);
        }
    });
}
