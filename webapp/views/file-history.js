// File-history view (#/project/<name>/file/<path>): every revision of one file, newest last,
// with per-revision export/patch/jump actions and the Diff-vs-Base entry point.
// The view-model half is DOM-free and tested against scenario ground truth (viewer-viewmodels.test.ts).

import {
    el,
    fetchDocument,
    fetchJson,
    fetchRawRecords,
    fetchText,
    getConsentChoice,
    renderConsentDialog,
    routeToFileHistory,
    routeToTimeline,
} from "../app.js";
import { downloadText } from "./download.js";

// The last step-snapshot content of `path` at or before `timestamp`. Timestamps are the JSON
// document's ISO strings, which compare correctly as strings. undefined while no step carries
// the file yet (a revision older than the first snapshot that knows the path).
function computeContentAtTime(steps, path, timestamp) {
    let content = undefined;
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
export function buildFileHistoryViewModel(document, path) {
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
export function computeAnchoredRevisionIndex(anchorRev, revisionCount) {
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
export function findLineForChangeId(rawLines, changeId) {
    return rawLines.findIndex((line) => line.includes(changeId));
}

// The 1-based number of the last revision at or before `timestamp` (ISO strings compare
// correctly), or undefined when the timestamp is absent or precedes every revision.
function computeRevisionNumberAtTime(revisions, timestamp) {
    if (timestamp === undefined) {
        return undefined;
    }
    let revisionNumber;
    revisions.forEach((revision, index) => {
        if (revision.timestamp <= timestamp) {
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
export function findRevisionForChangeId(filesTouched, changeId, backupTime) {
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
        if (history.revisions.some((revision) => revision.changeId.startsWith(blobMatch[1]))) {
            return { target: history.target, revisionNumber: computeRevisionNumberAtTime(history.revisions, backupTime) };
        }
    }
    return undefined;
}

// A revision-KIND header ("@@ changed @ … @@", "@@ renamed … @@", …) starts a new block; the
// standard numeric hunk headers ("@@ -a,b +c,d @@") the context renderer emits INSIDE a
// revision must not.
function startsRevisionBlock(line) {
    if (line.startsWith("@@")) {
        if (!line.startsWith("@@ -")) {
            return true;
        }
    }
    return false;
}

// Slice the revision-timeline diff text into per-revision blocks (renderDiffWithContext emits
// one block per revision, each starting with its kind header line).
export function splitDiffBlocks(diffText) {
    const blocks = [];
    let current = null;
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
export async function renderFileHistoryView(container, project, target, anchorRev) {
    const result = await fetchDocument(project, undefined);
    if (result.consentRequired !== undefined) {
        renderConsentDialog(container, project, result.consentRequired);
        return;
    }
    const viewModel = buildFileHistoryViewModel(result.document, target);
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
    let diffBlocksPromise;
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
    const jumpToConversation = async (changeId) => {
        const listing = (await fetchJson("/api/projects")).find((entry) => entry.name === project);
        for (const file of listing?.jsonlFiles ?? []) {
            const rawLines = await fetchRawRecords(project, file.fileName);
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
