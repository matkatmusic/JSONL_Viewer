// Right-pane JSON inspector: the selected JSONL line pretty-printed as actual JSON text
// (curly braces and all), syntax-highlighted — the presentation the legacy JFReD diff viewer
// used (web-shared/json-inspector.js), rebuilt without innerHTML: the text is tokenized and
// appended as text nodes + spans, so page content can never inject markup.
// Prev/Next walk the transcript line by line; uuid and toolu_… string values are jump-links
// to the linked line (a uuid jumps to the record it names; a tool id jumps to its use/result
// counterpart). Navigation also notifies the calling view so it can scroll/highlight along.

import { el, parseRouteSegments, peekCachedDocument, routeToFileHistory } from "./app.js";
import { findRevisionForChangeId } from "./views/file-history.js";

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

// The file-history route a resolved revision link navigates to: anchored at /rev/<n> when the
// link names one revision, the file's plain history otherwise.
export function computeRevisionLinkRoute(project, { target, revisionNumber }) {
    const base = routeToFileHistory(project, target);
    return revisionNumber === undefined ? base : `${base}/rev/${revisionNumber}`;
}

// The tool_use identity of a shown record: its first tool_use block's id plus the record's own
// uuid; undefined when the record calls no tool.
function findToolUseIdentity(value) {
    if (value === null) {
        return undefined;
    }
    if (typeof value !== "object") {
        return undefined;
    }
    if (value.type !== "assistant") {
        return undefined;
    }
    const content = value.message?.content;
    if (!Array.isArray(content)) {
        return undefined;
    }
    const toolUse = content.find((block) => block.type === "tool_use");
    if (toolUse === undefined) {
        return undefined;
    }
    return { toolUseId: toolUse.id, recordUuid: value.uuid };
}

// The tool-flow jump targets of a shown record: the PreToolUse hook line (the FIRST record whose
// toolUseID names the tool_use id) and the tool-result line (sourceToolAssistantUUID names the
// assistant record; the tool_result block's tool_use_id is the fallback for older transcripts).
// Each is -1 when absent; undefined when the record calls no tool.
export function findToolNavigationTargets(rawLines, value) {
    const toolUse = findToolUseIdentity(value);
    if (toolUse === undefined) {
        return undefined;
    }
    const hookLine = rawLines.findIndex((text) => text.includes(`"toolUseID":"${toolUse.toolUseId}"`));
    let resultLine = rawLines.findIndex((text) => text.includes(`"sourceToolAssistantUUID":"${toolUse.recordUuid}"`));
    if (resultLine < 0) {
        resultLine = rawLines.findIndex((text) => text.includes(`"tool_use_id":"${toolUse.toolUseId}"`));
    }
    return { hookLine, resultLine };
}

// ── formatted-text mode (TASKS item 21) ─────────────────────────────────────

// A tool_use block's readable form: a name header plus each STRING input field verbatim under
// a per-field divider — a Write's `content` shows with real newlines instead of JSON escapes.
// Non-string inputs (numbers, arrays) stay in the JSON view; this mode is for reading text.
function extractToolUseText(block) {
    const lines = [`[tool_use: ${block.name}]`];
    for (const [key, value] of Object.entries(block.input ?? {})) {
        if (typeof value !== "string") {
            continue;
        }
        lines.push(`--- ${key} ---`, value);
    }
    return lines.join("\n");
}

// A tool_result block's readable form: its string content, or its nested text blocks joined
// by blank lines (placeholder for nested non-text blocks).
function extractToolResultText(block) {
    if (typeof block.content === "string") {
        return block.content;
    }
    if (!Array.isArray(block.content)) {
        return "[tool_result]";
    }
    return block.content
        .map((inner) => (inner.type === "text" ? inner.text : `[${inner.type}]`))
        .join("\n\n");
}

function extractBlockText(block) {
    if (block.type === "text") {
        return block.text;
    }
    if (block.type === "tool_result") {
        return extractToolResultText(block);
    }
    if (block.type === "tool_use") {
        return extractToolUseText(block);
    }
    return `[${block.type}]`;
}

// The human-readable text of one parsed JSONL record: message text and tool payloads with
// real newlines, blocks joined by blank lines, unknown block kinds as one-line placeholders.
// A non-JSON raw line is already readable and returns verbatim. undefined when the record
// carries no message content (e.g. file-history snapshots) — the caller hides the toggle.
export function extractReadableText(value) {
    if (typeof value === "string") {
        return value;
    }
    const content = value?.message?.content;
    if (content === undefined) {
        return undefined;
    }
    if (typeof content === "string") {
        return content;
    }
    if (!Array.isArray(content)) {
        return undefined;
    }
    return content.map((block) => extractBlockText(block)).join("\n\n");
}

// Whether the inspector body renders formatted text instead of highlighted JSON. Module-level
// so the choice sticks across lines and re-opens for the browser session (same pattern as
// diff-vs-base's diffDisplayMode). ponytail: session-only; localStorage if ever wanted.
let inspectorShowsFormattedText = false;

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
    // Revision links navigate: the router renders file history as a drawer over the timeline
    // (renderSubRouteDrawer) and the URL reflects it, so revision links are shareable.
    const openRevision = (revisionLink) => {
        location.hash = computeRevisionLinkRoute(project, revisionLink);
    };
    const showLine = (index) => {
        const clamped = Math.min(Math.max(index, 0), rawLines.length - 1);
        let value;
        try {
            value = JSON.parse(rawLines[clamped]);
        } catch {
            value = rawLines[clamped];
        }
        // Tool-flow jumps (shown only on assistant tool_use lines): hook + result of THIS call.
        const toolTargets = findToolNavigationTargets(rawLines, value);
        const toolButtons = [];
        if (toolTargets !== undefined) {
            if (toolTargets.hookLine >= 0) {
                toolButtons.push(el("button", { class: "row-btn", text: "Go to PreToolUse hook", onclick: () => showLine(toolTargets.hookLine) }));
            }
            if (toolTargets.resultLine >= 0) {
                toolButtons.push(el("button", { class: "row-btn", text: "Go to Tool Result", onclick: () => showLine(toolTargets.resultLine) }));
            }
        }
        const readableText = extractReadableText(value);
        if (readableText !== undefined) {
            toolButtons.push(el("button", {
                class: "row-btn",
                text: inspectorShowsFormattedText ? "Show raw JSON" : "Show as formatted text",
                onclick: () => {
                    inspectorShowsFormattedText = !inspectorShowsFormattedText;
                    showLine(clamped);
                },
            }));
        }
        let body;
        if (inspectorShowsFormattedText && readableText !== undefined) {
            body = el("pre", { class: "inspector-text", text: readableText });
        } else {
            body = renderHighlightedJson(JSON.stringify(value, null, 4), value, clamped, maps, showLine, filesTouched, openRevision);
        }
        openInspectorPane().append(
            el("div", { class: "inspector-nav" }, [
                el("button", { class: "row-btn", text: "◀ Prev", onclick: () => showLine(clamped - 1) }),
                el("span", { class: "muted", text: `line ${clamped} / ${rawLines.length - 1}` }),
                el("button", { class: "row-btn", text: "Next ▶", onclick: () => showLine(clamped + 1) }),
                ...toolButtons,
            ]),
            el("h2", { text: jsonlName }),
            body,
        );
        if (onJumpToLine !== undefined) onJumpToLine(clamped);
    };
    showLine(line);
}
