// The drawer overlay for a project's jsonl/file sub-routes, plus the details-pane reset that
// every route change runs first.

import { openInspectorPane } from "./inspector.ts";
import { peekCachedDocument } from "./app-fetch.ts";
import { renderConversationView } from "./views/conversation.ts";
import { renderDiffVsBaseView } from "./views/diff-vs-base.ts";
import { renderFileHistoryView } from "./views/file-history.ts";
import { renderRawLinesView } from "./views/raw-lines.ts";

// The drawer overlay for a project's jsonl/file sub-routes: the route's view renders into the
// inspector pane over the timeline. No drawer while the consent dialog or a build error still
// owns the view (no document is cached yet — the sub-views would only re-show the dialog).
export async function renderSubRouteDrawer(project: string, segments: string[]): Promise<void> {
    if (peekCachedDocument(project) === undefined) {
        return;
    }
    let renderContent: ((content: HTMLElement) => unknown) | undefined;
    // item 66: the Details pane header names the sub-route the drawer shows.
    let headerText: string | undefined;
    if (segments[2] === "jsonl") {
        const jsonl = segments[3]!;
        if (segments[4] === "lines") {
            headerText = `Raw lines — ${jsonl}`;
            renderContent = (content: HTMLElement) => renderRawLinesView(content, project, jsonl);
        } else {
            headerText = `Conversation — ${jsonl}`;
            renderContent = (content: HTMLElement) => renderConversationView(content, project, jsonl, segments[4] === "at" ? segments[5] : undefined);
        }
    } else if (segments[2] === "file") {
        const target = segments[3]!;
        if (segments[4] === "vsbase") {
            headerText = `Diff vs base — ${target}`;
            renderContent = (content: HTMLElement) => renderDiffVsBaseView(content, project, target, segments[5]);
        } else {
            headerText = `File history — ${target}`;
            renderContent = (content: HTMLElement) => renderFileHistoryView(content, project, target, segments[4] === "rev" ? segments[5] : undefined);
        }
    }
    if (renderContent === undefined) {
        return;
    }
    const content = openInspectorPane();
    document.getElementById("details-header")!.textContent = headerText!;
    await renderContent(content);
}

// item 66: the details pane (#inspector) is now a STATIC skeleton (index.html) — a route
// change hides it and clears only its content columns instead of wiping it wholesale.
// Null-safe on the inner ids because the pre-phase-5 openInspectorPane still rebuilds the
// pane's children wholesale in the interim.
export function resetDetailsPane(): void {
    document.getElementById("inspector")!.classList.add("hidden");
    document.getElementById("details-left")?.replaceChildren();
    document.getElementById("details-right-body")?.replaceChildren();
    const header = document.getElementById("details-header");
    if (header !== null) {
        header.textContent = "No selection";
    }
}
