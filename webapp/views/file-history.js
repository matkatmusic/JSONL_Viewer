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
    routeToConversation,
    routeToFileHistory,
} from "../app.js";

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

// changeId -> 0-based raw JSONL line index: the first line whose text contains the changeId.
// A document's changeIds are tool_use ids ("toolu_…") or backup blob names ("…@vN") — each
// appears verbatim in exactly the raw line that caused the revision. (The plan expected
// lineVerdicts uuid matches; in reality changeIds are not record uuids.)
// ponytail: linear substring scan per changeId; fine at transcript scale (hundreds of lines).
export function findLineForChangeId(rawLines, changeId) {
    return rawLines.findIndex((line) => line.includes(changeId));
}

// Slice the revision-timeline diff text into per-revision blocks (renderDiff emits one block
// per revision, each starting with its "@@ … @@" header line).
export function splitDiffBlocks(diffText) {
    const blocks = [];
    let current = null;
    for (const line of diffText.split("\n")) {
        if (line.startsWith("@@")) {
            if (current !== null) blocks.push(current.join("\n"));
            current = [line];
        } else if (current !== null) {
            current.push(line);
        }
    }
    if (current !== null) blocks.push(current.join("\n"));
    return blocks;
}

function downloadText(fileName, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

export async function renderFileHistoryView(container, project, target) {
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

    // Jump: changeId -> the JSONL raw line containing it -> conversation anchored at that line.
    // ponytail: probes each of the project's transcripts in turn (raw text cached after first
    // fetch); fine for the usual 1-few JSONLs per project.
    const jumpToConversation = async (changeId) => {
        const listing = (await fetchJson("/api/projects")).find((entry) => entry.name === project);
        for (const file of listing?.jsonlFiles ?? []) {
            const rawLines = await fetchRawRecords(project, file.fileName);
            const line = findLineForChangeId(rawLines, changeId);
            if (line >= 0) {
                location.hash = routeToConversation(project, file.fileName, String(line));
                return;
            }
        }
        container.prepend(el("div", { class: "error-box", text: `no transcript line found for changeId ${changeId}` }));
    };

    viewModel.revisions.forEach((revision, index) => {
        const contentPane = el("pre", { class: "revision-content hidden", text: revision.content ?? "(no step snapshot carries this file yet)" });
        container.append(el("div", { class: "revision-row" }, [
            el("div", { class: "revision-head" }, [
                el("span", { class: "muted", text: `#${index + 1}` }),
                el("span", { class: "revision-kind", text: revision.kind }),
                el("span", { class: "muted", text: new Date(revision.timestamp).toLocaleString() }),
                el("button", { class: "row-btn", text: "Show content", onclick: () => contentPane.classList.toggle("hidden") }),
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
                el("button", { class: "row-btn", text: "Jump to conversation", onclick: () => jumpToConversation(revision.changeId) }),
            ]),
            contentPane,
        ]));
    });
}
