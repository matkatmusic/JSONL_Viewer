// task 93: RETIRED — the #/project/<p>/file/<path> route now lands in THE Revision View
// (renderDetailsFileMode, webapp/views/details-revision-view.ts). Preserved per archive policy.
// File-history view (#/project/<name>/file/<path>): every revision of one file, newest last,
// with per-revision export/patch/jump actions and the Diff-vs-Base entry point.
// The DOM-free view-model half lives in file-history-model.ts.

import {
    buildFileHistoryViewModel,
    computeAnchoredRevisionIndex,
    findLineForChangeId,
    splitDiffBlocks,
    type WireDocument,
} from "./file-history-model.ts";
import { el as elUntyped } from "../app-dom.ts";
import {
    fetchDocument,
    fetchJson,
    fetchRawRecords,
    fetchText,
    getConsentChoice,
} from "../app-fetch.ts";
import { renderConsentDialog } from "../app-consent.ts";
import { routeToFileHistory, routeToTimeline } from "../app-routes.ts";
import { downloadText } from "./download.ts";
import { renderCodeInto } from "../highlight.ts";

// app.ts is being typed in parallel; typed view of its untyped `el` for this file's call sites.
const el = elUntyped as (
    tag: string,
    attrs?: Record<string, unknown>,
    children?: readonly (Node | string)[],
) => HTMLElement;

// Wire shapes (JSON off the server: ids/paths/dates are plain strings), minimal to this file's use.
type WireJsonlFile = { fileName: string };
type WireProjectListing = { name: string; jsonlFiles: WireJsonlFile[] };

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
        // const contentPane = el("pre", { class: "revision-content hidden", text: revision.content ?? "(no step snapshot carries this file yet)" }); // (item 49)
        const contentPane = el("pre", { class: "revision-content hidden" });
        if (revision.content === undefined) {
            contentPane.textContent = "(no step snapshot carries this file yet)";
        } else {
            renderCodeInto(contentPane, revision.content, target);
        }
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

