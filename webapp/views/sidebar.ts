// Fork-style project sidebar (item 66, plan phase 6): the "Sessions" and "Files" panes rendered
// into the static #drawer. The view-models come from webapp/views/timeline.ts
// (buildSessionsSidebarViewModel / buildFilesSidebarViewModel) — this module only renders them
// and routes clicks back to the timeline through the callbacks.

import { el } from "../app.ts";

// One Sessions-pane entry (buildSessionsSidebarViewModel's shape).
type SessionSidebarEntry = {
    sessionId: string;
    shortLabel: string;
    jsonlFileName: string | undefined;
    rowCount: number;
    firstNodeIndex: number;
};

// One Files-pane entry (buildFilesSidebarViewModel's shape).
type FileSidebarEntry = {
    target: string;
    revisionCount: number;
};

type ForkSidebarCallbacks = {
    onSessionClick: (firstNodeIndex: number) => void;
    onFileClick: (target: string) => void;
};

// Un-mark the active file — the details pane left file mode (a timeline row was selected).
export function clearSidebarFileSelection(): void {
    for (const item of document.querySelectorAll("#drawer .file-item.selected")) {
        item.classList.remove("selected");
    }
}

// Rebuild the drawer: a "Sessions" pane (`<short8>….jsonl` + `<short8> · N rows` meta, click
// flash-scrolls the session's first timeline row) and a "Files" pane (path + revision count,
// click enters the details pane's File Revisions mode and marks the item selected).
export function renderForkSidebar(drawer: HTMLElement, sessions: SessionSidebarEntry[], files: FileSidebarEntry[], callbacks: ForkSidebarCallbacks): void {
    drawer.replaceChildren();
    drawer.append(el("div", { class: "pane-title", text: "Sessions" }));
    for (const session of sessions) {
        const item = el("div", { class: "session-item", title: session.jsonlFileName ?? session.sessionId }, [
            el("div", { class: "sess-file", text: `${session.shortLabel}….jsonl` }),
            el("div", { class: "sess-meta" }, [
                el("span", { class: "sess-uuid", text: session.shortLabel }),
                ` · ${session.rowCount} rows`,
            ]),
        ]);
        item.addEventListener("click", () => callbacks.onSessionClick(session.firstNodeIndex));
        drawer.append(item);
    }
    drawer.append(el("div", { class: "pane-title", text: "Files" }));
    for (const file of files) {
        const item = el("div", { class: "file-item", text: file.target }, []);
        item.append(el("span", { class: "revcount", text: `(${file.revisionCount})` }));
        item.addEventListener("click", () => {
            clearSidebarFileSelection();
            item.classList.add("selected");
            callbacks.onFileClick(file.target);
        });
        drawer.append(item);
    }
}
