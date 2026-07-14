// Fork-style project sidebar (item 66, plan phase 6): the "Sessions" and "Files" panes rendered
// into the static #drawer. The view-models come from webapp/views/timeline.ts
// (buildSessionsSidebarViewModel / buildFilesSidebarViewModel + buildFileTree) — this module only
// renders them and routes clicks back to the timeline through the callbacks.
// Item 77: the Files pane is a nested tree of <details>/basenames, not a flat list of full paths.

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
    // True only when the file's LAST revision is a delete (item 77) — the leaf renders struck-through.
    isDeleted: boolean;
    // The path a renamed file was born at (item 77); undefined when it was never renamed.
    originalPath: string | undefined;
};

// One Files-pane tree node (buildFileTree's shape). Mirrored, not imported: timeline.ts imports this
// module, so importing back would be a cycle — the same reason the entry types above are mirrored.
type FileTreeNode = {
    kind: string;
    name: string;
    children: FileTreeNode[];
    entry: FileSidebarEntry | undefined;
};

const FOLDER_NODE_KIND = "folder";

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
export function renderForkSidebar(drawer: HTMLElement, sessions: SessionSidebarEntry[], files: FileTreeNode[], callbacks: ForkSidebarCallbacks): void {
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
    for (const node of files) {
        drawer.append(renderFileTreeNode(node, callbacks));
    }
}

// A folder renders as a native <details open> (item 77: every folder starts expanded, so the pane
// needs no toggle JS and no collapse state); a file renders as the same .file-item the flat list
// used, so selection and clearSidebarFileSelection keep working unchanged.
function renderFileTreeNode(node: FileTreeNode, callbacks: ForkSidebarCallbacks): HTMLElement {
    if (node.kind === FOLDER_NODE_KIND) {
        // open: "" — el's attrs are Record<string, string | EventListener> (webapp/app.ts:31), so a
        // boolean will not typecheck; el forwards unknown keys to setAttribute, and a present `open`
        // attribute is what expands a <details>.
        return el("details", { class: "file-folder", open: "" }, [
            el("summary", { class: "file-folder-name", text: node.name }),
            ...node.children.map((child) => renderFileTreeNode(child, callbacks)),
        ]);
    }
    return renderFileTreeLeaf(node, node.entry!, callbacks);
}

// One file row: the basename only (item 77 — the full path was truncated to uselessness), with the
// full path in the tooltip, its revision count, and a badge naming where a rename moved it from.
function renderFileTreeLeaf(node: FileTreeNode, entry: FileSidebarEntry, callbacks: ForkSidebarCallbacks): HTMLElement {
    const item = el("div", {
        class: entry.isDeleted ? "file-item deleted" : "file-item",
        text: node.name,
        title: entry.isDeleted ? `${entry.target} (deleted)` : entry.target,
    }, []);
    item.append(el("span", { class: "revcount", text: `(${entry.revisionCount})` }));
    if (entry.originalPath !== undefined) {
        item.append(el("span", {
            class: "rename-badge",
            text: `← ${basenameOf(entry.originalPath)}`,
            title: `renamed from ${entry.originalPath}`,
        }));
    }
    item.addEventListener("click", () => {
        clearSidebarFileSelection();
        item.classList.add("selected");
        callbacks.onFileClick(entry.target);
    });
    return item;
}

function basenameOf(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
}
