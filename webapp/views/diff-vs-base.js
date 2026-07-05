// Diff-vs-Base view (#/project/<name>/file/<path>/vsbase): the file's first revision against a
// selected revision, +/- colored. Debugging surface — plain, no polish (plan 3.7).

import {
    el,
    fetchDocument,
    fetchText,
    getConsentChoice,
    renderConsentDialog,
    routeToFileHistory,
} from "../app.js";
import { buildFileHistoryViewModel } from "./file-history.js";

export function renderDiffText(pane, diffText) {
    pane.replaceChildren();
    for (const line of diffText.split("\n")) {
        const lineClass = line.startsWith("@@") ? "diff-line-hunk"
            : line.startsWith("+") ? "diff-line-add"
            : line.startsWith("-") ? "diff-line-del" : "";
        pane.append(el("div", { class: lineClass, text: line }));
    }
}

export async function renderDiffVsBaseView(container, project, target) {
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
    revisionSelect.value = String(lastIndex);

    const diffPane = el("div", { class: "diff-text" });
    const loadDiff = async () => {
        const params = new URLSearchParams({ project, file: target, mode: "vsbase", rev: revisionSelect.value });
        if (getConsentChoice(project) === "1") params.set("allowScripts", "1");
        renderDiffText(diffPane, await fetchText(`/api/diff?${params}`));
    };
    revisionSelect.addEventListener("change", loadDiff);

    container.append(el("div", { class: "filter-bar" }, [
        el("div", { class: "pane-title", text: `${target} · vs base` }),
        el("span", { class: "muted", text: "base #1 →" }),
        revisionSelect,
        el("a", { href: routeToFileHistory(project, target), text: "← file history" }),
    ]));
    container.append(diffPane);
    await loadDiff();
}
