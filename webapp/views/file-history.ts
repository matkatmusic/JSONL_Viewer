// File-history view (#/project/<name>/file/<path>): every revision of one file, newest last,
// with per-revision export/patch/jump actions and the Diff-vs-Base entry point.
// The view-model half is DOM-free and tested against scenario ground truth (viewer-viewmodels.test.ts).

import {
    el as elUntyped,
    fetchDocument,
    fetchJson,
    fetchRawRecords,
    fetchText,
    getConsentChoice,
    renderConsentDialog,
    routeToFileHistory,
    routeToTimeline,
} from "../app.ts";
import { downloadText } from "./download.ts";

// app.ts is being typed in parallel; typed view of its untyped `el` for this file's call sites.
const el = elUntyped as (
    tag: string,
    attrs?: Record<string, unknown>,
    children?: readonly (Node | string)[],
) => HTMLElement;

// Wire shapes (JSON off the server: ids/paths/dates are plain strings), minimal to this file's use.
type WireRename = { from: string; to: string };
type WireRevision = { kind: string; changeId: string; timestamp: string; rename?: WireRename };
type WireFileHistory = { target: string; revisions: WireRevision[] };
// The minimal shape the changeId lookup helpers read — callers (inspector.ts, tests) pass
// structurally smaller histories than the full view model; WireFileHistory satisfies it.
export type WireRevisionRef = { changeId: string; timestamp?: string };
export type WireFileHistoryRef = { target: string; revisions: WireRevisionRef[] };
type WireStep = { when: string; files: Record<string, string> };
export type WireDocument = { steps: WireStep[]; filesTouched: WireFileHistory[] };
type WireJsonlFile = { fileName: string };
type WireProjectListing = { name: string; jsonlFiles: WireJsonlFile[] };

// The last step-snapshot content of `path` at or before `timestamp`. Timestamps are the JSON
// document's ISO strings, which compare correctly as strings. undefined while no step carries
// the file yet (a revision older than the first snapshot that knows the path).
function computeContentAtTime(steps: WireStep[], path: string, timestamp: string): string | undefined {
    let content: string | undefined = undefined;
    for (const step of steps) {
        if (step.when > timestamp) {
            break;
        }
        if (Object.prototype.hasOwnProperty.call(step.files, path)) {
            content = step.files[path];
        }
    }
    return content;
}

// Build the view model: { path, revisions: [{ kind, changeId, timestamp, content, rename }] },
// oldest first (the document's own revision order). Unknown path -> empty revisions, never a throw.
export function buildFileHistoryViewModel(document: WireDocument, path: string) {
    const history = document.filesTouched.find((entry) => entry.target === path);
    if (history === undefined) {
        return { path, revisions: [] };
    }
    const revisions = history.revisions.map((revision) => ({
        kind: revision.kind,
        changeId: revision.changeId,
        timestamp: revision.timestamp,
        content: computeContentAtTime(document.steps, path, revision.timestamp),
        rename: revision.rename,
    }));
    return { path, revisions };
}

// The 0-based revision index named by a route's 1-based /rev/<n> segment, or undefined when the
// segment is absent, not an integer, or out of range for the revision list.
export function computeAnchoredRevisionIndex(anchorRev: string | undefined, revisionCount: number): number | undefined {
    const revisionIndex = Number(anchorRev) - 1;
    if (!Number.isInteger(revisionIndex)) {
        return undefined;
    }
    if (revisionIndex < 0) {
        return undefined;
    }
    if (revisionIndex >= revisionCount) {
        return undefined;
    }
    return revisionIndex;
}

// changeId -> 0-based raw JSONL line index: the first line whose text contains the changeId.
// A document's changeIds are tool_use ids ("toolu_…") or backup blob names ("…@vN") — each
// appears verbatim in exactly the raw line that caused the revision. (The plan expected
// lineVerdicts uuid matches; in reality changeIds are not record uuids.)
// ponytail: linear substring scan per changeId; fine at transcript scale (hundreds of lines).
export function findLineForChangeId(rawLines: string[], changeId: string): number {
    return rawLines.findIndex((line) => line.includes(changeId));
}

// The 1-based number of the last revision at or before `timestamp` (ISO strings compare
// correctly), or undefined when the timestamp is absent or precedes every revision.
function computeRevisionNumberAtTime(revisions: WireRevisionRef[], timestamp: string | undefined): number | undefined {
    if (timestamp === undefined) {
        return undefined;
    }
    let revisionNumber: number | undefined;
    revisions.forEach((revision, index) => {
        // A Ref without a timestamp never matches (same as the untyped `undefined <= t` → false).
        if (revision.timestamp !== undefined && revision.timestamp <= timestamp) {
            revisionNumber = index + 1;
        }
    });
    return revisionNumber;
}

// The file target and 1-based revision number of the revision whose changeId equals `changeId`
// (toolu id or backup blob name), or undefined when no surviving history carries it. The number
// feeds the /rev/<n> route, whose view anchors that revision. A backup blob name whose exact
// version matches no revision still names its FILE (the hex before @v is per-file): those
// resolve to the revision in effect at `backupTime` (the state that backup captured), or to
// { target, revisionNumber: undefined } — a file-history link with nothing anchored — without one.
export function findRevisionForChangeId(filesTouched: WireFileHistoryRef[], changeId: string, backupTime?: string) {
    for (const history of filesTouched) {
        const index = history.revisions.findIndex((revision) => revision.changeId === changeId);
        if (index >= 0) {
            return { target: history.target, revisionNumber: index + 1 };
        }
    }
    const blobMatch = /^(.+@)v\d+$/.exec(changeId);
    if (blobMatch === null) {
        return undefined;
    }
    for (const history of filesTouched) {
        if (history.revisions.some((revision) => revision.changeId.startsWith(blobMatch[1]!))) {
            return { target: history.target, revisionNumber: computeRevisionNumberAtTime(history.revisions, backupTime) };
        }
    }
    return undefined;
}

// A revision-KIND header ("@@ changed @ … @@", "@@ renamed … @@", …) starts a new block; the
// standard numeric hunk headers ("@@ -a,b +c,d @@") the context renderer emits INSIDE a
// revision must not.
function startsRevisionBlock(line: string): boolean {
    if (line.startsWith("@@")) {
        if (!line.startsWith("@@ -")) {
            return true;
        }
    }
    return false;
}

// Slice the revision-timeline diff text into per-revision blocks (renderDiffWithContext emits
// one block per revision, each starting with its kind header line).
export function splitDiffBlocks(diffText: string): string[] {
    const blocks: string[] = [];
    let current: string[] | null = null;
    for (const line of diffText.split("\n")) {
        if (startsRevisionBlock(line)) {
            if (current !== null) blocks.push(current.join("\n"));
            current = [line];
        } else if (current !== null) {
            current.push(line);
        }
    }
    if (current !== null) blocks.push(current.join("\n"));
    return blocks;
}

// anchorRev (optional): 1-based revision to auto-expand and scroll to.
export async function renderFileHistoryView(container: HTMLElement, project: string, target: string, anchorRev?: string): Promise<void> {
    const result = await fetchDocument<WireDocument>(project, undefined);
    if (result.consentRequired !== undefined) {
        renderConsentDialog(container, project, result.consentRequired);
        return;
    }
    const viewModel = buildFileHistoryViewModel(result.document!, target);
    const baseName = target.slice(target.lastIndexOf("/") + 1);

    container.append(el("div", { class: "filter-bar" }, [
        el("div", { class: "pane-title", text: target }),
        el("button", {
            class: "row-btn",
            text: "Diff vs Base",
            onclick: () => { location.hash = `${routeToFileHistory(project, target)}/vsbase`; },
        }),
    ]));

    // The revision-timeline diff, fetched once on first patch action (not on view load).
    let diffBlocksPromise: Promise<string[]> | undefined;
    const getDiffBlocks = () => {
        if (diffBlocksPromise === undefined) {
            const params = new URLSearchParams({ project, file: target, mode: "revisions" });
            if (getConsentChoice(project) === "1") params.set("allowScripts", "1");
            diffBlocksPromise = fetchText(`/api/diff?${params}`).then(splitDiffBlocks);
        }
        return diffBlocksPromise;
    };

    // Jump: changeId -> the JSONL raw line containing it -> timeline anchored at the step
    // owning that line (which also opens the transcript inspector on the line).
    // ponytail: probes each of the project's transcripts in turn (raw text cached after first
    // fetch); fine for the usual 1-few JSONLs per project.
    const jumpToConversation = async (changeId: string) => {
        const listing: WireProjectListing | undefined = (await fetchJson<WireProjectListing[]>("/api/projects")).find((entry: WireProjectListing) => entry.name === project);
        for (const file of listing?.jsonlFiles ?? []) {
            const rawLines: string[] = await fetchRawRecords(project, file.fileName);
            const line = findLineForChangeId(rawLines, changeId);
            if (line >= 0) {
                location.hash = routeToTimeline(project, file.fileName, String(line));
                return;
            }
        }
        container.prepend(el("div", { class: "error-box", text: `no transcript line found for changeId ${changeId}` }));
    };

    const anchoredRevisionIndex = computeAnchoredRevisionIndex(anchorRev, viewModel.revisions.length);
    viewModel.revisions.forEach((revision, index) => {
        const contentPane = el("pre", { class: "revision-content hidden", text: revision.content ?? "(no step snapshot carries this file yet)" });
        const revisionRow = el("div", { class: "revision-row" }, [
            el("div", { class: "revision-head" }, [
                el("span", { class: "muted", text: `#${index + 1}` }),
                el("span", { class: "revision-kind", text: revision.kind }),
                el("span", { class: "muted", text: new Date(revision.timestamp).toLocaleString() }),
                el("button", {
                    class: "row-btn",
                    text: "Show content",
                    onclick: () => {
                        contentPane.classList.toggle("hidden");
                        let revisionRoute = routeToFileHistory(project, target);
                        // Rendered as a drawer over another view: the URL belongs to that view.
                        if (!location.hash.startsWith(revisionRoute)) {
                            return;
                        }
                        // Shareable address without a re-render: replaceState fires no hashchange.
                        if (!contentPane.classList.contains("hidden")) {
                            revisionRoute = `${revisionRoute}/rev/${index + 1}`;
                        }
                        history.replaceState(null, "", revisionRoute);
                    },
                }),
                el("button", {
                    class: "row-btn",
                    text: "Export this version",
                    onclick: () => downloadText(`${baseName}.rev${index + 1}`, revision.content ?? ""),
                }),
                el("button", {
                    class: "row-btn",
                    text: "Copy patch",
                    onclick: async () => navigator.clipboard.writeText((await getDiffBlocks())[index] ?? ""),
                }),
                el("button", {
                    class: "row-btn",
                    text: "Export .patch",
                    onclick: async () => downloadText(`${baseName}.rev${index + 1}.patch`, (await getDiffBlocks())[index] ?? ""),
                }),
                el("button", { class: "row-btn", text: "Jump to timeline step", onclick: () => jumpToConversation(revision.changeId) }),
            ]),
            contentPane,
        ]);
        container.append(revisionRow);
        if (anchoredRevisionIndex === index) {
            contentPane.classList.remove("hidden");
            revisionRow.classList.add("anchored");
            revisionRow.scrollIntoView({ block: "center" });
        }
    });
}
