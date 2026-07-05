// Revision-timeline view (#/project/<name>/timeline): one node per reconstruction step across
// EVERY JSONL in the project, strictly chronological, with git-commit nodes as pick hard-stops.
// This half is the DOM-free view-model, tested against scenario ground truth
// (tests/timeline-viewmodels.test.ts); render wiring lives below it (phase 4).
// Wire-string discriminants mirror src/structures/vocabulary.ts — the webapp is a plain-JS
// browser runtime that cannot import the TS enums; the tests assert equivalence against the real
// enum members.

import {
    el,
    fetchDocument,
    fetchJson,
    fetchRawRecords,
    fetchText,
    getConsentChoice,
    renderConsentDialog,
    routeToConversation,
} from "../app.js";
import { openTranscriptInspector } from "../inspector.js";
import { findLineForChangeId } from "./file-history.js";
import { renderDiffText } from "./diff-vs-base.js";
import { downloadText } from "./download.js";

export const STEP_NODE_KIND = "step";
export const COMMIT_NODE_KIND = "commit";
const USER_ROLE = "user";
const EDIT_EVENT_KIND = "edit";

// changeId -> { path, eventKind, renamedFrom, isRewound } across surviving AND rewound histories,
// so a step's changeIds resolve to displayable file chips and orphan detection in one lookup.
// Surviving histories are indexed first and win duplicates (a changeId present in both branches
// counts as surviving).
export function indexRevisionsByChangeId(document) {
    const index = new Map();
    const addHistories = (histories, isRewound) => {
        for (const history of histories) {
            history.revisions.forEach((revision, position) => {
                if (index.has(revision.changeId)) {
                    return;
                }
                index.set(revision.changeId, {
                    path: revision.rename !== undefined ? revision.rename.to : history.target,
                    eventKind: revision.kind,
                    renamedFrom: revision.rename !== undefined ? revision.rename.from : undefined,
                    isFirstRevision: position === 0,
                    isRewound,
                });
            });
        }
    };
    addHistories(document.filesTouched, false);
    addHistories(document.rewoundFilesTouched, true);
    return index;
}

// A step's displayable file chips: each changeId resolved through the revision index, deduped by
// path; changeIds that resolve nowhere fall back to the step's changedPaths hint (kind: edit).
export function deriveFileChanges(step, revisionIndex) {
    const changes = [];
    const seenPaths = new Set();
    for (const changeId of step.changeIds) {
        const revision = revisionIndex.get(changeId);
        if (revision === undefined) {
            continue;
        }
        if (seenPaths.has(revision.path)) {
            continue;
        }
        seenPaths.add(revision.path);
        changes.push({
            path: revision.path,
            eventKind: revision.eventKind,
            renamedFrom: revision.renamedFrom,
            isFirstRevision: revision.isFirstRevision,
        });
    }
    for (const path of step.changedPaths) {
        if (seenPaths.has(path)) {
            continue;
        }
        seenPaths.add(path);
        changes.push({ path, eventKind: EDIT_EVENT_KIND, renamedFrom: undefined, isFirstRevision: false });
    }
    return changes;
}

// A step is orphaned when at least one of its changeIds matches a rewound-branch revision and
// none matches a surviving one — those are the dimmed, unpickable rows.
export function checkStepIsOrphaned(step, revisionIndex) {
    let matchesRewound = false;
    for (const changeId of step.changeIds) {
        const revision = revisionIndex.get(changeId);
        if (revision === undefined) {
            continue;
        }
        if (!revision.isRewound) {
            return false;
        }
        matchesRewound = true;
    }
    return matchesRewound;
}

// The latest user prompt OF THE NODE'S OWN SESSION at or before the node's timestamp; "" when
// none exists. ISO timestamps compare correctly as strings.
export function findPromptExcerpt(messages, sessionId, when) {
    let excerpt = "";
    let latestTimestamp = "";
    for (const message of messages) {
        if (message.role !== USER_ROLE) {
            continue;
        }
        if (message.sessionId !== sessionId) {
            continue;
        }
        if (message.timestamp === undefined) {
            continue;
        }
        if (message.timestamp > when) {
            continue;
        }
        if (message.timestamp < latestTimestamp) {
            continue;
        }
        latestTimestamp = message.timestamp;
        excerpt = message.text;
    }
    return excerpt;
}

// Chronological; ties keep step-before-commit order (a commit records the state steps built up).
function compareTimelineNodes(a, b) {
    if (a.when < b.when) {
        return -1;
    }
    if (a.when > b.when) {
        return 1;
    }
    if (a.kind === b.kind) {
        return 0;
    }
    return a.kind === STEP_NODE_KIND ? -1 : 1;
}

// One pick-segment id per node: commit nodes end their segment (hard stops) and, like orphaned
// nodes, belong to none (null). Picks are only legal inside a single segment.
export function computePickSegments(nodes) {
    const segments = [];
    let segment = 0;
    for (const node of nodes) {
        if (node.kind === COMMIT_NODE_KIND) {
            segments.push(null);
            segment += 1;
            continue;
        }
        if (node.isOrphaned) {
            segments.push(null);
            continue;
        }
        segments.push(segment);
    }
    return segments;
}

// A pick is legal when empty, or when every picked node shares ONE segment and the picked set is
// exactly the pickable nodes between its min and max index (orphans inside the span are skipped,
// not gaps; a commit inside the span always splits the segment, so it can never be crossed).
export function checkPickIsLegal(nodes, pickedNodeIndexes) {
    if (pickedNodeIndexes.length === 0) {
        return true;
    }
    const segments = computePickSegments(nodes);
    const pickedSegments = new Set(pickedNodeIndexes.map((index) => segments[index]));
    if (pickedSegments.size > 1) {
        return false;
    }
    const [segment] = pickedSegments;
    if (segment === null) {
        return false;
    }
    if (segment === undefined) {
        return false;
    }
    const min = Math.min(...pickedNodeIndexes);
    const max = Math.max(...pickedNodeIndexes);
    const picked = new Set(pickedNodeIndexes);
    for (let index = min; index <= max; index += 1) {
        if (segments[index] !== segment) {
            continue;
        }
        if (!picked.has(index)) {
            return false;
        }
    }
    return true;
}

// The selection bar's summary: picked step count, DISTINCT file paths across the picked nodes,
// and the 1-based step range for the /api/range-patch call.
export function computeRangeSummary(nodes, pickedNodeIndexes) {
    const pickedNodes = pickedNodeIndexes.map((index) => nodes[index]);
    const filePaths = [...new Set(pickedNodes.flatMap((node) => node.fileChanges.map((change) => change.path)))];
    const stepIndexes = pickedNodes.map((node) => node.stepIndex);
    return {
        stepCount: pickedNodes.length,
        filePaths,
        fromStepIndex: Math.min(...stepIndexes),
        toStepIndex: Math.max(...stepIndexes),
    };
}

// Split a multi-file range patch on its `diff --git ` headers into per-file blocks, each keyed by
// its patch-relative b/ path (the range-diff inspector shows one file's block at a time).
export function splitPatchByFile(patchText) {
    const blocks = [];
    let current = null;
    for (const line of patchText.split("\n")) {
        if (line.startsWith("diff --git ")) {
            if (current !== null) {
                blocks.push(current);
            }
            current = { path: line.slice(line.lastIndexOf(" b/") + 3), lines: [line] };
            continue;
        }
        if (current !== null) {
            current.lines.push(line);
        }
    }
    if (current !== null) {
        blocks.push(current);
    }
    return blocks.map((entry) => ({ path: entry.path, block: entry.lines.join("\n") }));
}

// The timeline's one strictly chronological node array: a step node per StepSnapshot plus a
// commit node per commit marker.
export function buildTimelineViewModel(document) {
    const revisionIndex = indexRevisionsByChangeId(document);
    const stepNodes = document.steps.map((step) => ({
        kind: STEP_NODE_KIND,
        stepIndex: step.index,
        when: step.when,
        sessionId: step.sessionId,
        fileChanges: deriveFileChanges(step, revisionIndex),
        isOrphaned: checkStepIsOrphaned(step, revisionIndex),
        promptExcerpt: findPromptExcerpt(document.messages, step.sessionId, step.when),
    }));
    const commitNodes = document.commitMarkers.map((marker) => ({
        kind: COMMIT_NODE_KIND,
        when: marker.timestamp,
        sessionId: marker.sessionId,
    }));
    const nodes = [...stepNodes, ...commitNodes].sort(compareTimelineNodes);
    return { nodes };
}

// ─── render half (DOM only — every computation lives in the view-model above) ───────────────────

// Fixed session-lane palette, assigned by first appearance; a session keeps its color for the
// whole list (never re-cycled mid-list).
const SESSION_LANE_VARIABLES = ["--accent", "--green", "--orange", "--lane-violet", "--lane-teal"];
const ORPHAN_LANE_COLOR = "var(--muted)";
const UNATTRIBUTED_SESSION_LABEL = "(unattributed)";

// The letter half of a chip's letter+color badge (color alone never carries the meaning).
function computeOpLetter(change) {
    if (change.eventKind === "rename") {
        return "R";
    }
    if (change.eventKind === "delete") {
        return "D";
    }
    if (change.eventKind === "copy") {
        return "A";
    }
    if (change.eventKind === "user-edit") {
        return "U";
    }
    if (change.eventKind === "script-execution") {
        return "S";
    }
    if (change.eventKind === "write" && change.isFirstRevision) {
        return "A";
    }
    return "M";
}

function computeBaseName(path) {
    return path.slice(path.lastIndexOf("/") + 1);
}

// One file chip: letter badge + name ("old → new" for renames).
function renderFileChip(change, onclick) {
    const letter = computeOpLetter(change);
    const label = change.renamedFrom !== undefined
        ? `${computeBaseName(change.renamedFrom)} → ${computeBaseName(change.path)}`
        : computeBaseName(change.path);
    return el("span", { class: "timeline-chip", title: change.path, onclick }, [
        el("span", { class: `op-badge op-${letter.toLowerCase()}`, text: letter }),
        el("span", { text: label }),
    ]);
}

// The project-wide revision timeline (#/project/<name>/timeline[/session/<jsonl>]) — the default
// view a drawer JSONL link opens. anchorJsonl scrolls to that session's first node.
export async function renderTimelineView(container, project, anchorJsonl) {
    const result = await fetchDocument(project, undefined);
    if (result.consentRequired !== undefined) {
        renderConsentDialog(container, project, result.consentRequired);
        return;
    }
    const reconstructionDocument = result.document;
    const { nodes } = buildTimelineViewModel(reconstructionDocument);
    const listing = (await fetchJson("/api/projects")).find((entry) => entry.name === project);
    const findJsonlForSession = (sessionId) =>
        listing?.jsonlFiles.find((file) => file.fileName.startsWith(sessionId))?.fileName;

    const sessionColors = new Map();
    for (const node of nodes) {
        if (node.sessionId === undefined) {
            continue;
        }
        if (sessionColors.has(node.sessionId)) {
            continue;
        }
        sessionColors.set(node.sessionId, `var(${SESSION_LANE_VARIABLES[sessionColors.size % SESSION_LANE_VARIABLES.length]})`);
    }

    const stepNodes = nodes.filter((node) => node.kind === STEP_NODE_KIND);
    const touchedCount = new Set(stepNodes.flatMap((node) => node.fileChanges.map((change) => change.path))).size;
    container.append(el("div", { class: "pane-title", text: `${project} · revision timeline` }));
    container.append(el("div", {
        class: "muted",
        text: `${sessionColors.size} session(s) · ${stepNodes.length} steps · ${touchedCount} files touched · click a step for its JSONL line, a chip for the file state`,
    }));

    const body = el("div", { class: "timeline-body" });
    // SVG needs the SVG namespace, which el() (createElement) can't produce.
    const railSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    railSvg.setAttribute("class", "timeline-rail");
    body.append(railSvg);

    // ── selection state + bar ──
    const pickBoxes = new Map();      // node index -> checkbox
    const nodeRows = new Map();       // node index -> row element
    let pickedIndexes = [];
    const barText = el("span", {});
    const ruleHint = el("span", { class: "timeline-rule", text: "picks must be contiguous — commits are hard stops" });
    const selectbar = el("div", { class: "timeline-selectbar hidden" });

    const buildConsentParams = () => {
        const params = new URLSearchParams({ project });
        const choice = getConsentChoice(project);
        if (choice === "1") {
            params.set("allowScripts", "1");
        }
        if (choice === "0") {
            params.set("declined", "1");
        }
        return params;
    };

    let cachedPatch = { key: "", text: "" };
    const fetchRangePatch = async (fromStep, toStep) => {
        const key = `${fromStep}-${toStep}`;
        if (cachedPatch.key !== key) {
            const params = buildConsentParams();
            params.set("fromStep", String(fromStep));
            params.set("toStep", String(toStep));
            cachedPatch = { key, text: await fetchText(`/api/range-patch?${params}`) };
        }
        return cachedPatch.text;
    };

    const flashRule = () => {
        ruleHint.classList.add("show");
        setTimeout(() => ruleHint.classList.remove("show"), 1600);
    };

    const updateSelectbar = () => {
        pickedIndexes = [...pickBoxes.entries()]
            .filter(([, box]) => box.checked)
            .map(([index]) => index)
            .sort((a, b) => a - b);
        for (const [index, row] of nodeRows) {
            row.classList.toggle("picked", pickBoxes.get(index)?.checked === true);
        }
        selectbar.classList.toggle("hidden", pickedIndexes.length === 0);
        if (pickedIndexes.length > 0) {
            const summary = computeRangeSummary(nodes, pickedIndexes);
            barText.textContent =
                `${summary.stepCount} step${summary.stepCount === 1 ? "" : "s"} picked · ` +
                `${summary.filePaths.length} file${summary.filePaths.length === 1 ? "" : "s"}`;
        }
        drawRail();
    };

    selectbar.append(barText, ruleHint, el("span", { class: "spacer" }), el("button", {
        class: "toolbar-btn",
        text: "Export .patch",
        onclick: async () => {
            const summary = computeRangeSummary(nodes, pickedIndexes);
            const patchText = await fetchRangePatch(summary.fromStepIndex, summary.toStepIndex);
            downloadText(`${project}-steps-${summary.fromStepIndex}-${summary.toStepIndex}.patch`, patchText);
        },
    }));

    // ── inspector jump (requirement 6): step -> first resolvable changeId -> (jsonl, line) ──
    const openStepInspector = async (node, previewPane) => {
        const step = reconstructionDocument.steps[node.stepIndex - 1];
        for (const changeId of step.changeIds) {
            for (const file of listing?.jsonlFiles ?? []) {
                const rawLines = await fetchRawRecords(project, file.fileName);
                const line = findLineForChangeId(rawLines, changeId);
                if (line >= 0) {
                    openTranscriptInspector({ jsonlName: file.fileName, rawLines, line });
                    return;
                }
            }
        }
        // Synthetic changeIds (user-edit / evidence splices) match no JSONL line — say so instead
        // of opening the inspector on nothing.
        previewPane.classList.remove("hidden");
        previewPane.replaceChildren(el("div", { class: "muted", text: "no transcript line for this step (synthetic change id)" }));
        drawRail();
    };

    // ── file preview (requirements 5 + 7): state at step, or per-file range diff when picked ──
    const showFilePreview = async (node, change, previewPane) => {
        if (previewPane.dataset.showing === change.path) {
            previewPane.classList.add("hidden");
            previewPane.dataset.showing = "";
            drawRail();
            return;
        }
        previewPane.dataset.showing = change.path;
        previewPane.classList.remove("hidden");
        if (pickedIndexes.length > 0) {
            const summary = computeRangeSummary(nodes, pickedIndexes);
            const patchText = await fetchRangePatch(summary.fromStepIndex, summary.toStepIndex);
            const block = splitPatchByFile(patchText).find((entry) =>
                change.path === entry.path || change.path.endsWith(`/${entry.path}`));
            const diffPane = el("div", { class: "timeline-preview" });
            renderDiffText(diffPane, block?.block ?? "(file unchanged across the picked range)");
            previewPane.replaceChildren(
                el("div", { class: "timeline-preview-head", text: `${change.path} · diff before step ${summary.fromStepIndex} → at step ${summary.toStepIndex}` }),
                diffPane,
            );
            drawRail();
            return;
        }
        const content = reconstructionDocument.steps[node.stepIndex - 1].files[change.path];
        previewPane.replaceChildren(
            el("div", { class: "timeline-preview-head" }, [
                el("span", { text: `${change.path} · state at step ${node.stepIndex}` }),
                el("button", {
                    class: "row-btn",
                    text: "Export file state",
                    onclick: () => downloadText(`${computeBaseName(change.path)}.step${node.stepIndex}`, content ?? ""),
                }),
            ]),
            el("div", { class: "timeline-preview", text: content ?? "(no snapshot carries this file at this step)" }),
        );
        drawRail();
    };

    // ── rows ──
    let selectedRow = null;
    let previousNode = null;
    nodes.forEach((node, index) => {
        const sessionKey = node.sessionId ?? UNATTRIBUTED_SESSION_LABEL;
        if (previousNode === null || (previousNode.sessionId ?? UNATTRIBUTED_SESSION_LABEL) !== sessionKey) {
            const color = sessionColors.get(node.sessionId) ?? ORPHAN_LANE_COLOR;
            const jsonlName = node.sessionId === undefined ? undefined : findJsonlForSession(node.sessionId);
            const header = el("div", { class: "timeline-session", "data-color": color, "data-session": sessionKey }, [
                el("span", { class: "swatch", style: `background:${color}` }),
                jsonlName !== undefined
                    ? el("a", { href: routeToConversation(project, jsonlName), text: sessionKey.slice(0, 8) })
                    : el("span", { text: sessionKey.slice(0, 8) }),
                el("span", { class: "muted", text: jsonlName ?? "" }),
                el("span", { class: "line" }),
            ]);
            body.append(header);
        }
        if (previousNode !== null && previousNode.isOrphaned === true && node.isOrphaned !== true) {
            body.append(el("div", { class: "timeline-divider" }, [
                el("span", { text: "↺ rewound — steps above are orphaned" }),
                el("span", { class: "line" }),
            ]));
        }

        const previewPane = el("div", { class: "hidden" });
        const row = el("div", {
            class: `timeline-row${node.isOrphaned ? " orphan" : ""}`,
            "data-node-kind": node.kind,
            "data-session": sessionKey,
        });
        if (node.isOrphaned) {
            row.setAttribute("data-branch", "orphan");
        }
        if (node.kind === COMMIT_NODE_KIND) {
            row.append(el("div", { class: "timeline-row-top" }, [
                el("span", { class: "timeline-step-label", text: "git commit" }),
                el("span", { class: "timeline-tag commit", text: "commit" }),
                el("span", { class: "timeline-prompt", text: "" }),
                el("span", { class: "timeline-time", text: new Date(node.when).toLocaleTimeString() }),
            ]));
        } else {
            const pick = el("input", { class: "timeline-pick", type: "checkbox" });
            if (node.isOrphaned) {
                pick.disabled = true;
                pick.title = "orphaned — not on the active path";
            } else {
                pickBoxes.set(index, pick);
                pick.addEventListener("change", () => {
                    const candidate = [...pickBoxes.entries()].filter(([, box]) => box.checked).map(([i]) => i);
                    if (!checkPickIsLegal(nodes, candidate)) {
                        pick.checked = !pick.checked;
                        flashRule();
                    }
                    updateSelectbar();
                });
            }
            row.append(pick);
            const rowTop = el("div", { class: "timeline-row-top" }, [
                el("span", { class: "timeline-step-label", text: `Step ${node.stepIndex}` }),
                ...(node.isOrphaned ? [el("span", { class: "timeline-tag", text: "orphaned" })] : []),
                el("span", { class: "timeline-prompt", text: node.promptExcerpt === "" ? "" : `“${node.promptExcerpt}”` }),
                el("span", { class: "timeline-time", text: new Date(node.when).toLocaleTimeString() }),
            ]);
            rowTop.addEventListener("click", () => {
                if (selectedRow !== null) {
                    selectedRow.classList.remove("selected");
                }
                selectedRow = row;
                row.classList.add("selected");
                drawRail();
                openStepInspector(node, previewPane);
            });
            row.append(rowTop);
            row.append(el("div", { class: "timeline-chips" },
                node.fileChanges.map((change) => renderFileChip(change, (event) => {
                    event.stopPropagation();
                    showFilePreview(node, change, previewPane);
                }))));
            row.append(previewPane);
        }
        body.append(row);
        nodeRows.set(index, row);
        previousNode = node;
    });
    body.append(selectbar);
    container.append(body);

    // ── graph rail, drawn from row geometry (port of the approved mockup's drawRail) ──
    function drawRail() {
        const MAIN_X = 32;
        const ORPHAN_X = 68;
        railSvg.setAttribute("width", "96");
        railSvg.setAttribute("height", String(body.scrollHeight));
        const parts = [];
        let color = "var(--accent)";
        let prevMain = null;
        let orphans = [];
        let forkFrom = null;
        const flushOrphans = () => {
            if (orphans.length === 0) {
                return;
            }
            const first = orphans[0];
            const last = orphans[orphans.length - 1];
            if (forkFrom !== null) {
                parts.push(`<path d="M ${MAIN_X} ${forkFrom} C ${MAIN_X} ${forkFrom + 40}, ${ORPHAN_X} ${first - 40}, ${ORPHAN_X} ${first}" fill="none" stroke="${ORPHAN_LANE_COLOR}" stroke-width="2" stroke-dasharray="5 4"/>`);
            }
            if (last > first) {
                parts.push(`<line x1="${ORPHAN_X}" y1="${first}" x2="${ORPHAN_X}" y2="${last}" stroke="${ORPHAN_LANE_COLOR}" stroke-width="2" stroke-dasharray="5 4"/>`);
            }
            parts.push(`<line x1="${ORPHAN_X}" y1="${last}" x2="${ORPHAN_X}" y2="${last + 26}" stroke="${ORPHAN_LANE_COLOR}" stroke-width="2" stroke-dasharray="5 4"/>`);
            parts.push(`<line x1="${ORPHAN_X - 5}" y1="${last + 21}" x2="${ORPHAN_X + 5}" y2="${last + 31}" stroke="${ORPHAN_LANE_COLOR}" stroke-width="2"/>`);
            parts.push(`<line x1="${ORPHAN_X + 5}" y1="${last + 21}" x2="${ORPHAN_X - 5}" y2="${last + 31}" stroke="${ORPHAN_LANE_COLOR}" stroke-width="2"/>`);
            for (const y of orphans) {
                parts.push(`<circle cx="${ORPHAN_X}" cy="${y}" r="5" fill="var(--panel)" stroke="${ORPHAN_LANE_COLOR}" stroke-width="2"/>`);
            }
            orphans = [];
        };
        for (const child of body.children) {
            if (child.classList.contains("timeline-session")) {
                flushOrphans();
                color = child.dataset.color;
                prevMain = null;               // the spine breaks between sessions
                continue;
            }
            if (child.dataset.nodeKind === undefined) {
                continue;
            }
            const cy = child.offsetTop + 18;   // dot on the row's first line (rows grow with previews)
            if (child.dataset.branch === "orphan") {
                if (orphans.length === 0) {
                    forkFrom = prevMain;
                }
                orphans.push(cy);
                continue;
            }
            if (prevMain !== null) {
                parts.push(`<line x1="${MAIN_X}" y1="${prevMain}" x2="${MAIN_X}" y2="${cy}" stroke="${color}" stroke-width="2"/>`);
            }
            if (child.dataset.nodeKind === COMMIT_NODE_KIND) {
                parts.push(`<circle cx="${MAIN_X}" cy="${cy}" r="7" fill="var(--panel)" stroke="${color}" stroke-width="2"/>`);
                parts.push(`<circle cx="${MAIN_X}" cy="${cy}" r="2.5" fill="${color}"/>`);
            } else {
                if (child.classList.contains("selected")) {
                    parts.push(`<circle cx="${MAIN_X}" cy="${cy}" r="9" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>`);
                }
                parts.push(`<circle cx="${MAIN_X}" cy="${cy}" r="6" fill="${color}" stroke="var(--panel)" stroke-width="2"/>`);
            }
            prevMain = cy;
        }
        flushOrphans();
        // innerHTML is safe here: every part is code-generated geometry — no page/user content.
        railSvg.innerHTML = parts.join("");
    }
    drawRail();
    window.addEventListener("resize", drawRail);

    // ── session anchor: scroll to and highlight the session's first node ──
    if (anchorJsonl !== undefined) {
        const anchorSession = anchorJsonl.replace(/\.jsonl$/, "");
        const target = body.querySelector(`.timeline-session[data-session="${anchorSession}"]`);
        if (target !== null) {
            target.scrollIntoView({ block: "start" });
            target.classList.add("anchored");
        }
    }
}
