// Right-pane JSON inspector: the selected JSONL line pretty-printed as actual JSON text
// (curly braces and all), syntax-highlighted — the presentation the legacy JFReD diff viewer
// used (web-shared/json-inspector.js), rebuilt without innerHTML: the text is tokenized and
// appended as text nodes + spans, so page content can never inject markup.
// Prev/Next walk the transcript line by line; uuid and toolu_… string values are jump-links
// to the linked line (a uuid jumps to the record it names; a tool id jumps to its use/result
// counterpart). Navigation also notifies the calling view so it can scroll/highlight along.

import { checkRouteIsTimeline, el, parseRouteSegments, peekCachedDocument, routeToFileHistory } from "./app.js";
import { findRevisionForChangeId, renderFileHistoryView } from "./views/file-history.js";

// The legacy viewer's token pattern: strings (key vs value by trailing colon), booleans,
// null, and numbers. Everything between tokens (braces, brackets, commas, whitespace) is
// plain text.
const JSON_TOKEN_PATTERN = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

function classifyToken(token) {
    if (token.startsWith('"')) {
        return token.trimEnd().endsWith(":") ? "json-key" : "json-string";
    }
    if (token === "true" || token === "false") {
        return "json-bool";
    }
    if (token === "null") {
        return "json-null";
    }
    return "json-number";
}

// A string value longer than this is collapsed to its first 7 wrapped lines behind a […]
// toggle. 560 ≈ 7 lines × ~80 chars; the CSS line-clamp does the exact visual 7-line cut,
// this threshold only decides which values get the toggle at all.
const LONG_VALUE_CHAR_LIMIT = 560;

function checkValueIsLong(tokenClass, token) {
    if (tokenClass !== "json-string") {
        return false;
    }
    return token.length > LONG_VALUE_CHAR_LIMIT;
}

// Per-transcript link maps, computed once per rawLines array: each record uuid -> its own
// line, and each toolu_… id -> every line whose text carries it (tool_use + tool_result).
const linkMapsCache = new WeakMap();

function computeLinkMaps(rawLines) {
    if (linkMapsCache.has(rawLines)) {
        return linkMapsCache.get(rawLines);
    }
    const uuidToLine = new Map();
    const toolIdToLines = new Map();
    rawLines.forEach((text, index) => {
        try {
            const uuid = JSON.parse(text).uuid;
            if (uuid !== undefined) uuidToLine.set(uuid, index);
        } catch { /* a non-JSON line simply has no uuid */ }
        for (const match of text.matchAll(/toolu_[A-Za-z0-9_]+/g)) {
            if (!toolIdToLines.has(match[0])) toolIdToLines.set(match[0], []);
            const lines = toolIdToLines.get(match[0]);
            if (!lines.includes(index)) lines.push(index);
        }
    });
    const maps = { uuidToLine, toolIdToLines };
    linkMapsCache.set(rawLines, maps);
    return maps;
}

// The line a string value links to, or undefined: toolu ids link to their first OTHER
// carrier line; uuids link to the record they name (never the line being shown).
function findJumpTarget(value, currentLine, maps) {
    if (value.startsWith("toolu_")) {
        return maps.toolIdToLines.get(value)?.find((line) => line !== currentLine);
    }
    const line = maps.uuidToLine.get(value);
    return line !== undefined && line !== currentLine ? line : undefined;
}

// The backupTime of the snapshot entry whose backupFileName is `blobName`, or undefined when
// the record is no file-history snapshot or tracks no such backup. That time dates the file
// state the backup captured, so it resolves a blob version to a revision.
export function findBackupTimeForBlob(record, blobName) {
    const backups = record?.snapshot?.trackedFileBackups;
    if (backups === undefined) {
        return undefined;
    }
    for (const entry of Object.values(backups)) {
        if (entry.backupFileName === blobName) {
            return entry.backupTime;
        }
    }
    return undefined;
}

// The inspector pane's drawer chrome — collapse chevron + a fresh scrollable content column —
// shown; returns the content column for the caller to fill.
export function openInspectorPane() {
    const pane = document.getElementById("inspector");
    // The 50%-width file-preview modifier is opt-in per open; callers wanting it re-add it.
    pane.classList.remove("file-preview-drawer");
    const content = el("div", { class: "inspector-content" });
    pane.replaceChildren(
        el("button", { class: "row-btn inspector-close", text: "»", title: "Collapse inspector", onclick: () => pane.classList.add("hidden") }),
        content,
    );
    pane.classList.remove("hidden");
    return content;
}

// The project of the current #/project/* hash, or undefined on other routes.
function findCurrentProject() {
    const segments = parseRouteSegments();
    return segments[0] === "project" ? segments[1] : undefined;
}

// Pretty JSON text -> a <pre> of text nodes and highlight spans; linkable string values
// become clickable jump-links.
function renderHighlightedJson(prettyText, record, currentLine, maps, showLine, filesTouched, openRevision) {
    const pre = el("pre", { class: "inspector-json" });
    let lastIndex = 0;
    for (const match of prettyText.matchAll(JSON_TOKEN_PATTERN)) {
        if (match.index > lastIndex) {
            pre.append(prettyText.slice(lastIndex, match.index));
        }
        const token = match[0];
        const tokenClass = classifyToken(token);
        let jumpTarget;
        let revisionLink;
        if (tokenClass === "json-string") {
            try {
                const value = JSON.parse(token);
                jumpTarget = findJumpTarget(value, currentLine, maps);
                if (jumpTarget === undefined) {
                    // A value that IS a revision changeId (e.g. a backupFileName blob name)
                    // links to that file's revision list, anchored on that revision. A blob
                    // version without its own revision anchors via the snapshot's backupTime.
                    revisionLink = findRevisionForChangeId(filesTouched, value, findBackupTimeForBlob(record, value));
                }
            } catch { /* not a lone string literal — no link */ }
        }
        if (jumpTarget !== undefined) {
            pre.append(el("span", {
                class: `${tokenClass} jump-link`,
                title: `Jump to line ${jumpTarget}`,
                onclick: () => showLine(jumpTarget),
                text: token,
            }));
        } else if (revisionLink !== undefined) {
            pre.append(el("span", {
                class: `${tokenClass} jump-link`,
                title: revisionLink.revisionNumber === undefined
                    ? `Open ${revisionLink.target} revisions`
                    : `Open ${revisionLink.target} at revision #${revisionLink.revisionNumber}`,
                onclick: () => openRevision(revisionLink),
                text: token,
            }));
        } else if (checkValueIsLong(tokenClass, token)) {
            // Long value: first 7 wrapped lines only (CSS line-clamp), […] toggles the rest.
            const valueSpan = el("span", { class: `${tokenClass} json-collapsed`, text: token });
            const expandToggle = el("button", {
                class: "row-btn json-expand",
                text: "[…]",
                title: "Show the full value",
                onclick: () => {
                    const collapsed = valueSpan.classList.toggle("json-collapsed");
                    expandToggle.textContent = collapsed ? "[…]" : "[hide]";
                },
            });
            pre.append(valueSpan, expandToggle);
        } else {
            pre.append(el("span", { class: tokenClass, text: token }));
        }
        lastIndex = match.index + token.length;
    }
    pre.append(prettyText.slice(lastIndex));
    return pre;
}

// Open the inspector on `line` of a transcript. onJumpToLine (optional) is called with every
// shown line so the calling view can scroll/highlight in step; it must not reopen the inspector.
export function openTranscriptInspector({ jsonlName, rawLines, line, onJumpToLine }) {
    const maps = computeLinkMaps(rawLines);
    // Revision links resolve through the project's already-cached unified document — never a
    // build. On routes with no cached document, changeId values simply render unlinked.
    const project = findCurrentProject();
    const filesTouched = project === undefined ? [] : peekCachedDocument(project)?.filesTouched ?? [];
    const openRevision = async ({ target, revisionNumber }) => {
        const base = routeToFileHistory(project, target);
        if (!checkRouteIsTimeline(parseRouteSegments())) {
            location.hash = revisionNumber === undefined ? base : `${base}/rev/${revisionNumber}`;
            return;
        }
        // On the timeline the file viewer opens as a drawer OVER it (user decision 2026-07-06):
        // the timeline and its URL stay put; this pane hosts the revision list instead.
        await renderFileHistoryView(openInspectorPane(), project, target, revisionNumber === undefined ? undefined : String(revisionNumber));
    };
    const showLine = (index) => {
        const clamped = Math.min(Math.max(index, 0), rawLines.length - 1);
        let value;
        try {
            value = JSON.parse(rawLines[clamped]);
        } catch {
            value = rawLines[clamped];
        }
        openInspectorPane().append(
            el("div", { class: "inspector-nav" }, [
                el("button", { class: "row-btn", text: "◀ Prev", onclick: () => showLine(clamped - 1) }),
                el("span", { class: "muted", text: `line ${clamped} / ${rawLines.length - 1}` }),
                el("button", { class: "row-btn", text: "Next ▶", onclick: () => showLine(clamped + 1) }),
            ]),
            el("h2", { text: jsonlName }),
            renderHighlightedJson(JSON.stringify(value, null, 4), value, clamped, maps, showLine, filesTouched, openRevision),
        );
        if (onJumpToLine !== undefined) onJumpToLine(clamped);
    };
    showLine(line);
}
