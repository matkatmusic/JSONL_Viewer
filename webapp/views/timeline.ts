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
    routeToFileHistory,
} from "../app.ts";
import { openInspectorPane, openTranscriptInspector } from "../inspector.ts";
import { findLineForChangeId, findRevisionForChangeId, splitDiffBlocks } from "./file-history.ts";
import { renderDiffText } from "./diff-vs-base.ts";
import { downloadText } from "./download.ts";

export const COMMIT_NODE_KIND = "commit";
export const USER_TURN_NODE_KIND = "user-turn";
export const AGENT_TURN_NODE_KIND = "agent-turn";
export const SESSION_END_NODE_KIND = "session-end";
const USER_ROLE = "user";
const EDIT_EVENT_KIND = "edit";
const COMMIT_OPERATION_KIND = "commit";
const BRANCH_OPERATION_KIND = "branch";

// ── local wire + view-model types ────────────────────────────────────────────────────────────────
// The document arrives via fetch + JSON.parse, so ids/paths/dates are plain strings on the wire;
// these declare only the fields this view reads.

type WireRename = { from: string; to: string };
type WireRevision = { kind: string; changeId: string; timestamp: string; rename?: WireRename };
type WireFileHistory = { target: string; revisions: WireRevision[] };
type WireMessage = { role: string; timestamp: string; sessionId?: string; uuid: string; text: string };
type WireStepSnapshot = {
    index: number;
    when: string;
    sessionId?: string;
    changeIds: string[];
    changedPaths: string[];
    files: Record<string, string>;
};
type WireGitOperation = {
    kind: string;
    detail: string;
    command: string;
    timestamp: string;
    sessionId?: string;
    uuid?: string;
};
type WireCommitMarker = { timestamp: string; sessionId?: string };
type WireTimelineDocument = {
    filesTouched: WireFileHistory[];
    rewoundFilesTouched: WireFileHistory[];
    messages: WireMessage[];
    steps: WireStepSnapshot[];
    gitOperations?: WireGitOperation[];
    commitMarkers: WireCommitMarker[];
};
type WireJsonlFile = { fileName: string };
type WireProjectListing = { name: string; jsonlFiles: WireJsonlFile[] };

// indexRevisionsByChangeId's entries: one changeId resolved to its displayable revision facts.
type RevisionIndexEntry = {
    path: string;
    eventKind: string;
    renamedFrom: string | undefined;
    isFirstRevision: boolean;
    isRewound: boolean;
};
type RevisionIndex = Map<string, RevisionIndexEntry>;

// deriveFileChanges' chips: one displayable file change per distinct path.
type FileChange = {
    path: string;
    eventKind: string;
    renamedFrom: string | undefined;
    isFirstRevision: boolean;
    changeId: string | undefined;
};

// The (sessionId, when) instant snapshot ownership is decided on (checkNodeCanOwnSnapshot).
type SnapshotInstant = { sessionId?: string; when: string };

// A raw transcript position the inspector can open: (jsonl, its lines, 0-based line index).
type TranscriptLocation = { jsonlName: string; rawLines: string[]; line: number };

// One conversation turn (user prompt or agent reply); synthetic trailing agent turns carry no uuid.
// stepNumber / fileChanges / isOrphaned are stamped on after sorting (assignStepNumbers,
// deriveNodeFileChanges), hence optional.
type TurnNode = {
    kind: typeof USER_TURN_NODE_KIND | typeof AGENT_TURN_NODE_KIND;
    when: string;
    sessionId: string | undefined;
    uuid?: string;
    text: string;
    isSystem?: boolean;
    snapshots: WireStepSnapshot[];
    gitOperations: WireGitOperation[];
    stepNumber?: number;
    fileChanges?: FileChange[];
    isOrphaned?: boolean;
    detail?: undefined;
};

// One session-end terminator per session (appendSessionEndNodes).
type SessionEndNode = {
    kind: typeof SESSION_END_NODE_KIND;
    when: string;
    sessionId: string;
    snapshots: WireStepSnapshot[];
    stepNumber?: number;
    fileChanges?: FileChange[];
    isOrphaned?: boolean;
    uuid?: undefined;
    text?: undefined;
    isSystem?: undefined;
    gitOperations?: undefined;
    detail?: undefined;
};

// One git-commit hard stop (deriveCommitNodes); never numbered, never pickable.
type CommitNode = {
    kind: typeof COMMIT_NODE_KIND;
    when: string;
    sessionId: string | undefined;
    detail?: string;
    uuid?: undefined;
    text?: undefined;
    isSystem?: undefined;
    snapshots?: undefined;
    gitOperations?: undefined;
    stepNumber?: undefined;
    fileChanges?: undefined;
    isOrphaned?: undefined;
};

type TimelineNode = TurnNode | SessionEndNode | CommitNode;

// changeId -> { path, eventKind, renamedFrom, isRewound } across surviving AND rewound histories,
// so a step's changeIds resolve to displayable file chips and orphan detection in one lookup.
// Surviving histories are indexed first and win duplicates (a changeId present in both branches
// counts as surviving).
export function indexRevisionsByChangeId(document: WireTimelineDocument): RevisionIndex {
    const index: RevisionIndex = new Map();
    const addHistories = (histories: WireFileHistory[], isRewound: boolean): void => {
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
export function deriveFileChanges(step: WireStepSnapshot, revisionIndex: RevisionIndex): FileChange[] {
    const changes: FileChange[] = [];
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
            changeId,
        });
    }
    for (const path of step.changedPaths) {
        if (seenPaths.has(path)) {
            continue;
        }
        seenPaths.add(path);
        changes.push({ path, eventKind: EDIT_EVENT_KIND, renamedFrom: undefined, isFirstRevision: false, changeId: undefined });
    }
    return changes;
}

// The file-history route a chip's revision jumps to ("#/project/<p>/file/<path>/rev/<n>"),
// or undefined when the change carries no changeId or it resolves to no surviving revision
// number (re-stamped synthetic ids, blob names without an anchored revision) — those chips
// get no jump button rather than a dead link.
export function computeSnapshotJumpRoute(project: string, filesTouched: WireFileHistory[], change: { path: string; changeId?: string }): string | undefined {
    if (change.changeId === undefined) {
        return undefined;
    }
    const revisionLink = findRevisionForChangeId(filesTouched, change.changeId, undefined);
    if (revisionLink === undefined) {
        return undefined;
    }
    if (revisionLink.revisionNumber === undefined) {
        return undefined;
    }
    return `${routeToFileHistory(project, revisionLink.target)}/rev/${revisionLink.revisionNumber}`;
}

// A step is orphaned when at least one of its changeIds matches a rewound-branch revision and
// none matches a surviving one — those are the dimmed, unpickable rows.
export function checkStepIsOrphaned(step: WireStepSnapshot, revisionIndex: RevisionIndex): boolean {
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

// Tie-break rank for nodes sharing a timestamp: turns first (a commit records the state the turn
// built up), then commits, then session ends (they close the session after everything in it).
function computeNodeKindRank(kind: TimelineNode["kind"]): number {
    if (kind === SESSION_END_NODE_KIND) {
        return 2;
    }
    if (kind === COMMIT_NODE_KIND) {
        return 1;
    }
    return 0;
}

// Chronological; ties resolved by kind rank, insertion order otherwise (sort is stable).
function compareTimelineNodes(a: TimelineNode, b: TimelineNode): number {
    if (a.when < b.when) {
        return -1;
    }
    if (a.when > b.when) {
        return 1;
    }
    return computeNodeKindRank(a.kind) - computeNodeKindRank(b.kind);
}

// Only an agent turn that owns surviving snapshots can be picked — user prompts, session ends,
// snapshot-less replies, and orphaned turns all sit in no segment.
function checkNodeIsPickable(node: TimelineNode): boolean {
    if (node.kind !== AGENT_TURN_NODE_KIND) {
        return false;
    }
    if (node.isOrphaned) {
        return false;
    }
    return node.snapshots.length > 0;
}

// One pick-segment id per node: commit nodes end their segment (hard stops) and, like every
// unpickable node, belong to none (null). Picks are only legal inside a single segment.
export function computePickSegments(nodes: TimelineNode[]): (number | null)[] {
    const segments: (number | null)[] = [];
    let segment = 0;
    for (const node of nodes) {
        if (node.kind === COMMIT_NODE_KIND) {
            segments.push(null);
            segment += 1;
            continue;
        }
        if (checkNodeIsPickable(node)) {
            segments.push(segment);
            continue;
        }
        segments.push(null);
    }
    return segments;
}

// A pick is legal when empty, or when every picked node shares ONE segment and the picked set is
// exactly the pickable nodes between its min and max index (orphans inside the span are skipped,
// not gaps; a commit inside the span always splits the segment, so it can never be crossed).
export function checkPickIsLegal(nodes: TimelineNode[], pickedNodeIndexes: number[]): boolean {
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

// The selection bar's summary: picked turn count, DISTINCT file paths across the picked nodes,
// and the 1-based SNAPSHOT index range for the /api/range-patch call (the server still speaks
// snapshot indexes; a turn spans every snapshot it owns).
export function computeRangeSummary(nodes: TimelineNode[], pickedNodeIndexes: number[]) {
    const pickedNodes = pickedNodeIndexes.map((index) => nodes[index]!);
    const filePaths = [...new Set(pickedNodes.flatMap((node) => node.fileChanges!.map((change) => change.path)))];
    const stepIndexes = pickedNodes.flatMap((node) => node.snapshots!.map((snapshot) => snapshot.index));
    return {
        stepCount: pickedNodes.length,
        filePaths,
        fromStepIndex: Math.min(...stepIndexes),
        toStepIndex: Math.max(...stepIndexes),
    };
}

// Split a multi-file range patch on its `diff --git ` headers into per-file blocks, each keyed by
// its patch-relative b/ path (the range-diff inspector shows one file's block at a time).
export function splitPatchByFile(patchText: string): { path: string; block: string }[] {
    const blocks: { path: string; lines: string[] }[] = [];
    let current: { path: string; lines: string[] } | null = null;
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

// True when this agent-turn node is the snapshot's owner candidate: same session, at or after the
// snapshot (tool calls execute before the assistant's reply text is emitted).
function checkNodeCanOwnSnapshot(node: TurnNode, snapshot: SnapshotInstant): boolean {
    if (node.kind !== AGENT_TURN_NODE_KIND) {
        return false;
    }
    if (node.sessionId !== snapshot.sessionId) {
        return false;
    }
    return node.when >= snapshot.when;
}

// Per snapshot: the FIRST agent-turn node of its own session at or after it (turnNodes are in
// message order, chronological per session). Ownerless snapshots are always a trailing suffix of
// their session (steps are chronological), so they collect into ONE synthetic empty-text agent
// turn per session — no file change is ever silently dropped.
function attachSnapshotsToAgentTurns(turnNodes: TurnNode[], steps: WireStepSnapshot[]): void {
    const syntheticTurns = new Map<string | undefined, TurnNode>();
    for (const snapshot of steps) {
        const owner = turnNodes.find((node) => checkNodeCanOwnSnapshot(node, snapshot));
        if (owner !== undefined) {
            owner.snapshots.push(snapshot);
            continue;
        }
        const synthetic = syntheticTurns.get(snapshot.sessionId);
        if (synthetic !== undefined) {
            synthetic.snapshots.push(snapshot);
            synthetic.when = snapshot.when;
            continue;
        }
        const trailingTurn: TurnNode = {
            kind: AGENT_TURN_NODE_KIND,
            when: snapshot.when,
            sessionId: snapshot.sessionId,
            text: "",
            snapshots: [snapshot],
            gitOperations: [],
        };
        syntheticTurns.set(snapshot.sessionId, trailingTurn);
        turnNodes.push(trailingTurn);
    }
}

// The chronologically last agent turn of a session, or undefined when the session has none.
function findLastAgentTurnOfSession(turnNodes: TurnNode[], sessionId: string | undefined): TurnNode | undefined {
    let last: TurnNode | undefined;
    for (const node of turnNodes) {
        if (node.kind !== AGENT_TURN_NODE_KIND) {
            continue;
        }
        if (node.sessionId !== sessionId) {
            continue;
        }
        last = node;
    }
    return last;
}

// Per git operation: the FIRST agent-turn node of its own session at or after it — the snapshot
// attribution rule, reusing its owner check. An operation after the session's last reply (e.g. a
// final commit) falls back to that last turn so no recorded git command is silently dropped.
// Runs AFTER attachSnapshotsToAgentTurns so synthetic trailing turns are already candidates.
function attachGitOperationsToAgentTurns(turnNodes: TurnNode[], gitOperations: WireGitOperation[]): void {
    for (const operation of gitOperations) {
        const instant = { sessionId: operation.sessionId, when: operation.timestamp };
        const owner = turnNodes.find((node) => checkNodeCanOwnSnapshot(node, instant));
        if (owner !== undefined) {
            owner.gitOperations.push(operation);
            continue;
        }
        const trailing = findLastAgentTurnOfSession(turnNodes, operation.sessionId);
        if (trailing !== undefined) {
            trailing.gitOperations.push(operation);
        }
    }
}

// A git row's text inside the stars, matching the user's reference sketch: `git init`,
// `git add <paths>`, `git commit "<message>"`, `git branch: <name>`.
function formatGitOperationLabel(operation: WireGitOperation): string {
    if (operation.detail === "") {
        return `git ${operation.kind}`;
    }
    if (operation.kind === COMMIT_OPERATION_KIND) {
        return `git commit "${operation.detail}"`;
    }
    if (operation.kind === BRANCH_OPERATION_KIND) {
        return `git branch: ${operation.detail}`;
    }
    return `git ${operation.kind} ${operation.detail}`;
}

// Commit pick hard-stops: from the document's commit operations (which carry the message) when it
// ships gitOperations; an older cached document lacks the field and falls back to commitMarkers.
function deriveCommitNodes(document: WireTimelineDocument): CommitNode[] {
    if (document.gitOperations === undefined) {
        return document.commitMarkers.map((marker) => ({
            kind: COMMIT_NODE_KIND,
            when: marker.timestamp,
            sessionId: marker.sessionId,
        }));
    }
    return document.gitOperations
        .filter((operation) => operation.kind === COMMIT_OPERATION_KIND)
        .map((operation) => ({
            kind: COMMIT_NODE_KIND,
            when: operation.timestamp,
            sessionId: operation.sessionId,
            detail: operation.detail,
        }));
}

// One session-end node per distinct session (insertion order), timestamped at the session's last
// turn; compareTimelineNodes ranks it after everything else sharing that timestamp. Unattributed
// turns (no sessionId — e.g. script executions) are not a session and get no end node.
function appendSessionEndNodes(turnNodes: (TurnNode | SessionEndNode)[]): void {
    const lastTurnTimes = new Map<string, string>();
    for (const node of turnNodes) {
        if (node.sessionId === undefined) {
            continue;
        }
        const latest = lastTurnTimes.get(node.sessionId);
        if (latest === undefined) {
            lastTurnTimes.set(node.sessionId, node.when);
            continue;
        }
        if (node.when > latest) {
            lastTurnTimes.set(node.sessionId, node.when);
        }
    }
    for (const [sessionId, when] of lastTurnTimes) {
        turnNodes.push({ kind: SESSION_END_NODE_KIND, when, sessionId, snapshots: [] });
    }
}

// Walk the sorted nodes: user turns, agent turns, and session ends get stepNumber 1..N
// continuously across sessions; commit nodes stay unnumbered.
function assignStepNumbers(nodes: TimelineNode[]): void {
    let stepNumber = 0;
    for (const node of nodes) {
        if (node.kind === COMMIT_NODE_KIND) {
            continue;
        }
        stepNumber += 1;
        node.stepNumber = stepNumber;
    }
}

// A turn's file chips: deriveFileChanges merged over its snapshots, deduped by path (first kind
// wins, matching deriveFileChanges' own seenPaths convention).
function deriveMergedFileChanges(snapshots: WireStepSnapshot[], revisionIndex: RevisionIndex): FileChange[] {
    const changes: FileChange[] = [];
    const seenPaths = new Set();
    for (const snapshot of snapshots) {
        for (const change of deriveFileChanges(snapshot, revisionIndex)) {
            if (seenPaths.has(change.path)) {
                continue;
            }
            seenPaths.add(change.path);
            changes.push(change);
        }
    }
    return changes;
}

// Orphaned when the turn owns snapshots and EVERY one sits on a rewound branch; a turn with any
// surviving snapshot — or none at all — stays on the spine.
function checkTurnIsOrphaned(snapshots: WireStepSnapshot[], revisionIndex: RevisionIndex): boolean {
    if (snapshots.length === 0) {
        return false;
    }
    return snapshots.every((snapshot) => checkStepIsOrphaned(snapshot, revisionIndex));
}

// fileChanges + isOrphaned on every non-commit node (user turns and session ends own no
// snapshots, so they resolve to no chips and never orphaned).
function deriveNodeFileChanges(nodes: TimelineNode[], revisionIndex: RevisionIndex): void {
    for (const node of nodes) {
        if (node.kind === COMMIT_NODE_KIND) {
            continue;
        }
        node.fileChanges = deriveMergedFileChanges(node.snapshots, revisionIndex);
        node.isOrphaned = checkTurnIsOrphaned(node.snapshots, revisionIndex);
    }
}

// True when the message text is harness-generated rather than typed/authored: slash-command
// envelopes (<command-message>, <command-name>, <local-command-stdout>) and injected
// <system-reminder> blocks. These render dimmer than genuine user prompts and agent replies.
function checkMessageTextIsSystem(text: string): boolean {
    if (text.includes("<command-")) {
        return true;
    }
    if (text.includes("<local-command-")) {
        return true;
    }
    return text.includes("<system-reminder>");
}

// One timeline node per conversation turn: every user prompt and agent reply is a numbered step;
// a session-end step closes each session; git commits stay as unnumbered hard stops.
// StepSnapshots attach to the first agent reply of their own session at or after them (tool calls
// run before the reply's text is emitted); leftovers get a synthetic reply node so no file change
// is ever dropped.
export function buildTurnTimelineViewModel(document: WireTimelineDocument): { nodes: TimelineNode[] } {
    const revisionIndex = indexRevisionsByChangeId(document);
    const turnNodes: TurnNode[] = document.messages.map((message) => ({
        kind: message.role === USER_ROLE ? USER_TURN_NODE_KIND : AGENT_TURN_NODE_KIND,
        when: message.timestamp,
        sessionId: message.sessionId,
        uuid: message.uuid,
        text: message.text,
        isSystem: checkMessageTextIsSystem(message.text),
        snapshots: [],
        gitOperations: [],
    }));
    attachSnapshotsToAgentTurns(turnNodes, document.steps);
    attachGitOperationsToAgentTurns(turnNodes, document.gitOperations ?? []);
    appendSessionEndNodes(turnNodes);
    const commitNodes = deriveCommitNodes(document);
    const nodes = [...turnNodes, ...commitNodes].sort(compareTimelineNodes);
    assignStepNumbers(nodes);
    deriveNodeFileChanges(nodes, revisionIndex);
    return { nodes };
}

// True when an agent turn owns the raw line: one of its snapshots' changeIds appears verbatim in
// the line text (the inverse of findLineForChangeId's substring convention).
function checkAgentTurnOwnsRawLine(node: TimelineNode, rawLineText: string): boolean {
    if (node.kind !== AGENT_TURN_NODE_KIND) {
        return false;
    }
    return node.snapshots.some((snapshot) =>
        snapshot.changeIds.some((changeId) => rawLineText.includes(changeId)));
}

// True when a user turn owns the raw line: its message uuid appears verbatim in the line text.
function checkUserTurnOwnsRawLine(node: TimelineNode, rawLineText: string): boolean {
    if (node.kind !== USER_TURN_NODE_KIND) {
        return false;
    }
    return rawLineText.includes(node.uuid!);
}

// The index of the timeline node owning the raw JSONL line; -1 when no node matches (e.g. a
// summary line carrying neither a changeId nor a prompt uuid). ChangeId matches win over uuid
// matches: a file-history-snapshot line embeds BOTH a changeId and the uuid of the prompt that
// triggered it, and such a line is about the file change, not the prompt.
export function findTimelineNodeIndexForRawLine(nodes: TimelineNode[], rawLineText: string): number {
    const agentTurnIndex = nodes.findIndex((node) => checkAgentTurnOwnsRawLine(node, rawLineText));
    if (agentTurnIndex >= 0) {
        return agentTurnIndex;
    }
    return nodes.findIndex((node) => checkUserTurnOwnsRawLine(node, rawLineText));
}

// A click that ends with a non-collapsed text selection is a selection drag, not a close
// request — the background-close handler must ignore it (item 10b). Browsers may return
// null from window.getSelection(); that never blocks.
export function checkSelectionBlocksBackgroundClose(selection: { isCollapsed: boolean } | null): boolean {
    if (selection === null) {
        return false;
    }
    return selection.isCollapsed === false;
}

// The inline tag naming what an unattributed-lane step is (item 10d): its chips' event
// kinds, deduped in first-appearance order, humanized ("script-execution" → "script run",
// otherwise hyphens → spaces), joined with " · "; undefined when the step has no chips.
export function computeUnattributedStepTag(eventKinds: string[]): string | undefined {
    const humanizedKinds = [...new Set(eventKinds)].map((kind) => {
        if (kind === "script-execution") {
            return "script run";
        }
        return kind.replaceAll("-", " ");
    });
    if (humanizedKinds.length === 0) {
        return undefined;
    }
    return humanizedKinds.join(" · ");
}

// ─── render half (DOM only — every computation lives in the view-model above) ───────────────────

// Fixed session-lane palette, assigned by first appearance; a session keeps its color for the
// whole list (never re-cycled mid-list).
const SESSION_LANE_VARIABLES = ["--accent", "--green", "--orange", "--lane-violet", "--lane-teal"];
const ORPHAN_LANE_COLOR = "var(--muted)";
const UNATTRIBUTED_SESSION_LABEL = "(unattributed)";

// The letter half of a chip's letter+color badge (color alone never carries the meaning).
function computeOpLetter(change: FileChange): string {
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

function computeBaseName(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
}

// One file chip: letter badge + name ("old → new" for renames).
function renderFileChip(change: FileChange, onclick: EventListener): HTMLElement {
    const letter = computeOpLetter(change);
    const label = change.renamedFrom !== undefined
        ? `${computeBaseName(change.renamedFrom)} → ${computeBaseName(change.path)}`
        : computeBaseName(change.path);
    return el("span", { class: "timeline-chip", title: "Show revision in Inspector", onclick }, [
        el("span", { class: `op-badge op-${letter.toLowerCase()}`, text: letter }),
        el("span", { text: label }),
    ]);
}

// The project-wide revision timeline (#/project/<name>/timeline[/session/<jsonl>]) — the default
// view a drawer JSONL link opens. anchorJsonl scrolls to that session's first node.
// anchorLine (optional, 0-based raw line of anchorJsonl): scroll to the owning step, open the
// inspector on it.
export async function renderTimelineView(container: HTMLElement, project: string, anchorJsonl?: string, anchorLine?: string): Promise<void> {
    const result = await fetchDocument(project, undefined);
    if (result.consentRequired !== undefined) {
        renderConsentDialog(container, project, result.consentRequired);
        return;
    }
    // app.ts ships the streamed document as an opaque Record; this view reads the timeline fields.
    const reconstructionDocument = result.document as WireTimelineDocument;
    const { nodes } = buildTurnTimelineViewModel(reconstructionDocument);
    const listing = (await fetchJson<WireProjectListing[]>("/api/projects")).find((entry) => entry.name === project);
    const findJsonlForSession = (sessionId: string | undefined) =>
        listing?.jsonlFiles.find((file) => file.fileName.startsWith(sessionId!))?.fileName;

    const sessionColors = new Map<string, string>();
    for (const node of nodes) {
        if (node.sessionId === undefined) {
            continue;
        }
        if (sessionColors.has(node.sessionId)) {
            continue;
        }
        sessionColors.set(node.sessionId, `var(${SESSION_LANE_VARIABLES[sessionColors.size % SESSION_LANE_VARIABLES.length]})`);
    }

    const numberedNodes = nodes.filter((node) => node.stepNumber !== undefined);
    const touchedCount = new Set(nodes.flatMap((node) => (node.fileChanges ?? []).map((change) => change.path))).size;
    container.append(el("div", { class: "pane-title", text: `${project} · revision timeline` }));
    container.append(el("div", {
        class: "muted",
        text: `${sessionColors.size} session(s) · ${numberedNodes.length} steps · ${touchedCount} files touched · click a step for its JSONL line, a chip for the file state`,
    }));

    const body = el("div", { class: "timeline-body" });
    // SVG needs the SVG namespace, which el() (createElement) can't produce.
    const railSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    railSvg.setAttribute("class", "timeline-rail");
    body.append(railSvg);

    // ── selection state + bar ──
    const pickBoxes = new Map<number, HTMLInputElement>();      // node index -> checkbox
    const nodeRows = new Map<number, HTMLElement>();       // node index -> row element
    let pickedIndexes: number[] = [];
    let activeChip: HTMLElement | null = null;            // the chip whose file the preview drawer is showing
    const clearActiveChip = () => {
        if (activeChip === null) {
            return;
        }
        activeChip.classList.remove("active");
        activeChip = null;
    };
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
    const fetchRangePatch = async (fromStep: number, toStep: number): Promise<string> => {
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

    // The transcript line carrying a changeId, probed across the project's JSONLs (raw text is
    // cached after the first fetch); undefined for synthetic changeIds that match no line.
    const findTranscriptLineForChangeId = async (changeId: string): Promise<TranscriptLocation | undefined> => {
        for (const file of listing?.jsonlFiles ?? []) {
            const rawLines = await fetchRawRecords(project, file.fileName);
            const line = findLineForChangeId(rawLines, changeId);
            if (line >= 0) {
                return { jsonlName: file.fileName, rawLines, line };
            }
        }
        return undefined;
    };

    // ── inspector jump (requirement 6): turn -> first resolvable changeId -> (jsonl, line) ──
    const openStepInspector = async (node: TurnNode, previewPane: HTMLElement): Promise<void> => {
        for (const snapshot of node.snapshots) {
            for (const changeId of snapshot.changeIds) {
                const located = await findTranscriptLineForChangeId(changeId);
                if (located !== undefined) {
                    openTranscriptInspector(located);
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

    // Clicking a turn opens the transcript drawer on the message's OWN JSONL line (the record
    // embedding its uuid — findLineForChangeId is a generic substring scan, so it resolves uuids
    // too). Synthetic agent turns carry no uuid and fall back to the changeId scan above.
    const openTurnInspector = async (node: TurnNode, previewPane: HTMLElement): Promise<void> => {
        if (node.uuid === undefined) {
            openStepInspector(node, previewPane);
            return;
        }
        const jsonlName = findJsonlForSession(node.sessionId);
        if (jsonlName === undefined) {
            openStepInspector(node, previewPane);
            return;
        }
        const rawLines = await fetchRawRecords(project, jsonlName);
        // Prefer the record whose OWN uuid field matches — a bare-uuid scan would land on the
        // file-history-snapshot line that references the message as its messageId.
        let line = findLineForChangeId(rawLines, `"uuid":"${node.uuid}"`);
        if (line < 0) {
            line = findLineForChangeId(rawLines, node.uuid);
        }
        if (line < 0) {
            openStepInspector(node, previewPane);
            return;
        }
        openTranscriptInspector({ jsonlName, rawLines, line });
    };

    // Toggle shared by the drawer-opening file buttons: true when the click closed an already-open
    // drawer for the same button (the caller stops there); false to (re)open with this button active.
    const toggleDrawerButton = (chipElement: HTMLElement): boolean => {
        const pane = document.getElementById("inspector")!;
        if (chipElement === activeChip) {
            if (!pane.classList.contains("hidden")) {
                pane.classList.add("hidden");
                clearActiveChip();
                return true;
            }
        }
        clearActiveChip();
        activeChip = chipElement;
        chipElement.classList.add("active");
        return false;
    };

    // ── file preview (requirements 5 + 7): state at step, or per-file range diff when picked —
    // rendered into the details drawer (lines wrapped); the clicked chip stays highlighted while
    // its file is showing. ──
    const showFilePreview = async (node: TurnNode, change: FileChange, chipElement: HTMLElement): Promise<void> => {
        if (toggleDrawerButton(chipElement)) {
            return;
        }
        const drawer = openInspectorPane();
        document.getElementById("inspector")!.classList.add("file-preview-drawer");
        if (pickedIndexes.length > 0) {
            const summary = computeRangeSummary(nodes, pickedIndexes);
            const patchText = await fetchRangePatch(summary.fromStepIndex, summary.toStepIndex);
            const block = splitPatchByFile(patchText).find((entry) =>
                change.path === entry.path || change.path.endsWith(`/${entry.path}`));
            const diffPane = el("div", { class: "timeline-preview" });
            renderDiffText(diffPane, block?.block ?? "(file unchanged across the picked range)");
            const pickedNumbers = pickedIndexes.map((picked) => nodes[picked]!.stepNumber!);
            drawer.append(
                el("div", { class: "timeline-preview-head", text: `${change.path} · diff before step ${Math.min(...pickedNumbers)} → at step ${Math.max(...pickedNumbers)}` }),
                diffPane,
            );
            return;
        }
        // The turn's final state of the file: the LAST owned snapshot that carries it.
        const carrier = [...node.snapshots].reverse().find((snapshot) => snapshot.files[change.path] !== undefined);
        const content = carrier?.files[change.path];
        drawer.append(
            el("div", { class: "timeline-preview-head" }, [
                el("span", { text: `${change.path} · state at step ${node.stepNumber}` }),
                el("button", {
                    class: "row-btn",
                    text: "Export file state",
                    onclick: () => downloadText(`${computeBaseName(change.path)}.step${node.stepNumber}`, content ?? ""),
                }),
            ]),
            el("div", { class: "timeline-preview", text: content ?? "(no snapshot carries this file at this step)" }),
        );
    };

    // The revision's RESULT line: among the lines carrying the changeId, the tool result (the
    // record holding the toolUseResult/structuredPatch payload) beats the tool_use call that
    // merely requested it; first match is the fallback.
    const findRevisionResultLine = async (changeId: string): Promise<TranscriptLocation | undefined> => {
        for (const file of listing?.jsonlFiles ?? []) {
            const rawLines = await fetchRawRecords(project, file.fileName);
            const matches: number[] = [];
            rawLines.forEach((text, line) => {
                if (text.includes(changeId)) {
                    matches.push(line);
                }
            });
            if (matches.length === 0) {
                continue;
            }
            const resultLine = matches.find((line) => rawLines[line]!.includes('"toolUseResult"'));
            return { jsonlName: file.fileName, rawLines, line: resultLine ?? matches[0]! };
        }
        return undefined;
    };

    // { } button: the raw JSONL record that caused this revision (the structuredPatch line),
    // opened in the details pane — distinct from the turn click, which opens the MESSAGE's line.
    const showRevisionJson = async (change: FileChange, previewPane: HTMLElement): Promise<void> => {
        const located = await findRevisionResultLine(change.changeId!);
        if (located === undefined) {
            previewPane.classList.remove("hidden");
            previewPane.replaceChildren(el("div", { class: "muted", text: "no transcript line for this revision (synthetic change id)" }));
            return;
        }
        openTranscriptInspector(located);
    };

    // { } button on a git row: the Bash tool_use line that ran the command, matched by the
    // record's OWN uuid field (the turn-click convention — a bare-uuid scan could land on a line
    // that merely references it).
    const showGitOperationJson = async (operation: WireGitOperation, previewPane: HTMLElement): Promise<void> => {
        const jsonlName = operation.sessionId === undefined ? undefined : findJsonlForSession(operation.sessionId);
        if (jsonlName === undefined) {
            previewPane.classList.remove("hidden");
            previewPane.replaceChildren(el("div", { class: "muted", text: "no transcript line for this git command" }));
            return;
        }
        const rawLines = await fetchRawRecords(project, jsonlName);
        let line = findLineForChangeId(rawLines, `"uuid":"${operation.uuid}"`);
        if (line < 0) {
            line = findLineForChangeId(rawLines, operation.uuid!);
        }
        if (line < 0) {
            previewPane.classList.remove("hidden");
            previewPane.replaceChildren(el("div", { class: "muted", text: "no transcript line for this git command" }));
            return;
        }
        openTranscriptInspector({ jsonlName, rawLines, line });
    };

    // +/- button: this revision's computed diff vs the previous revision, from the server's
    // per-revision diff artifact (one @@ block per revision; splitDiffBlocks slices them).
    const showRevisionDiff = async (change: FileChange, chipElement: HTMLElement): Promise<void> => {
        if (toggleDrawerButton(chipElement)) {
            return;
        }
        const drawer = openInspectorPane();
        document.getElementById("inspector")!.classList.add("file-preview-drawer");
        const history = reconstructionDocument.filesTouched.find((entry) =>
            entry.revisions.some((revision) => revision.changeId === change.changeId));
        if (history === undefined) {
            drawer.append(el("div", { class: "muted", text: "no surviving revision for this change (rewound branch)" }));
            return;
        }
        const revisionNumber = history.revisions.findIndex((revision) => revision.changeId === change.changeId);
        const params = buildConsentParams();
        params.set("file", history.target);
        params.set("mode", "revisions");
        const blocks = splitDiffBlocks(await fetchText(`/api/diff?${params}`));
        const diffPane = el("div", { class: "timeline-preview" });
        renderDiffText(diffPane, blocks[revisionNumber] ?? "(no diff block for this revision)");
        drawer.append(
            el("div", { class: "timeline-preview-head", text: `${change.path} · diff for revision ${revisionNumber + 1} (vs previous)` }),
            diffPane,
        );
    };

    // One file's button row: [ name ] [{ }] [+/-] — revision state, the JSON that caused the
    // revision, and the revision's computed diff. The action buttons need a resolvable changeId.
    const renderFileButtonRow = (node: TurnNode, change: FileChange, previewPane: HTMLElement): HTMLElement => {
        const buttons = [renderFileChip(change, (event: Event) => {
            event.stopPropagation();
            showFilePreview(node, change, event.currentTarget as HTMLElement);
        })];
        if (change.changeId !== undefined) {
            buttons.push(el("span", {
                class: "timeline-chip timeline-chip-action",
                title: "Show JSON for revision in inspector",
                text: "{ }",
                onclick: (event: Event) => {
                    event.stopPropagation();
                    showRevisionJson(change, previewPane);
                },
            }));
            buttons.push(el("span", {
                class: "timeline-chip timeline-chip-action",
                title: "Show Diff in Inspector",
                text: "+/-",
                onclick: (event: Event) => {
                    event.stopPropagation();
                    showRevisionDiff(change, event.currentTarget as HTMLElement);
                },
            }));
            const jumpRoute = computeSnapshotJumpRoute(project, reconstructionDocument.filesTouched, change);
            if (jumpRoute !== undefined) {
                buttons.push(el("span", {
                    class: "timeline-chip timeline-chip-action",
                    title: "Jump to File History Snapshot",
                    text: "⤷",
                    onclick: (event: Event) => {
                        event.stopPropagation();
                        location.hash = jumpRoute;
                    },
                }));
            }
        }
        return el("div", { class: "timeline-chip-row" }, buttons);
    };

    // One git row: `* git <label> * (time)` plus a { } button opening the Bash tool_use line that
    // ran the command in the details pane (same button shape as the file rows').
    const renderGitOperationRow = (operation: WireGitOperation, previewPane: HTMLElement): HTMLElement => {
        const parts = [el("span", {
            class: "timeline-gitop",
            text: `* ${formatGitOperationLabel(operation)} * (${new Date(operation.timestamp).toLocaleTimeString()})`,
            title: operation.command,
        })];
        if (operation.uuid !== undefined) {
            parts.push(el("span", {
                class: "timeline-chip timeline-chip-action",
                title: "Show JSON for git command in inspector",
                text: "{ }",
                onclick: (event: Event) => {
                    event.stopPropagation();
                    showGitOperationJson(operation, previewPane);
                },
            }));
        }
        return el("div", { class: "timeline-chip-row" }, parts);
    };

    // Each turn's own JSONL line label ("L:<n> (of <total>)", numbered like the details pane),
    // resolved up front — one cached raw fetch per session file.
    const lineLabels = new Map<number, string>();
    for (const [index, node] of nodes.entries()) {
        if (node.uuid === undefined) {
            continue;
        }
        const jsonlName = node.sessionId === undefined ? undefined : findJsonlForSession(node.sessionId);
        if (jsonlName === undefined) {
            continue;
        }
        const rawLines = await fetchRawRecords(project, jsonlName);
        const line = findLineForChangeId(rawLines, `"uuid":"${node.uuid}"`);
        if (line < 0) {
            continue;
        }
        // Numbered exactly like the details pane's "line <n> / <max>" (0-based, max index).
        lineLabels.set(index, `L:${line} (of ${rawLines.length - 1})`);
    }

    // The row's right-edge meta column: the timestamp with the turn's JSONL line label under it.
    const renderRowMeta = (node: TimelineNode, index: number): HTMLElement => {
        const parts = [el("span", { class: "timeline-time", text: new Date(node.when).toLocaleTimeString() })];
        const lineLabel = lineLabels.get(index);
        if (lineLabel !== undefined) {
            parts.push(el("span", { class: "timeline-time", text: lineLabel }));
        }
        return el("span", { class: "timeline-meta" }, parts);
    };

    // ── rows ──
    let selectedRow: HTMLElement | null = null;
    let previousNode: TimelineNode | null = null;
    nodes.forEach((node, index) => {
        const sessionKey = node.sessionId ?? UNATTRIBUTED_SESSION_LABEL;
        if (previousNode === null || (previousNode.sessionId ?? UNATTRIBUTED_SESSION_LABEL) !== sessionKey) {
            const color = sessionColors.get(node.sessionId!) ?? ORPHAN_LANE_COLOR;
            const jsonlName = node.sessionId === undefined ? undefined : findJsonlForSession(node.sessionId);
            // The session link opens the transcript in the inspector drawer, keeping the
            // timeline visible — never navigates away from it.
            const openSessionTranscript = async (event: Event) => {
                event.preventDefault();
                const rawLines = await fetchRawRecords(project, jsonlName!);
                openTranscriptInspector({ jsonlName: jsonlName!, rawLines, line: 0 });
            };
            const header = el("div", { class: "timeline-session", "data-color": color, "data-session": sessionKey }, [
                el("span", { class: "swatch", style: `background:${color}` }),
                jsonlName !== undefined
                    ? el("a", { href: routeToConversation(project, jsonlName), text: sessionKey.slice(0, 8), onclick: openSessionTranscript })
                    : el("span", { text: sessionKey.slice(0, 8) }),
                el("span", { class: "muted", text: jsonlName ?? "", onclick: (jsonlName === undefined ? undefined : openSessionTranscript) as EventListener }),
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
            class: `timeline-row${node.isOrphaned ? " orphan" : ""}${node.isSystem ? " system" : ""}`,
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
                el("span", { class: "timeline-prompt", text: node.detail === undefined ? "" : `“${node.detail}”` }),
                el("span", { class: "timeline-time", text: new Date(node.when).toLocaleTimeString() }),
            ]));
        }
        if (node.kind === USER_TURN_NODE_KIND) {
            const rowTop = el("div", { class: "timeline-row-top" }, [
                el("span", { class: "timeline-step-label", text: `Step ${node.stepNumber}` }),
                el("span", { class: "timeline-prompt", text: `“${node.text}”` }),
                renderRowMeta(node, index),
            ]);
            rowTop.addEventListener("click", () => {
                if (selectedRow !== null) {
                    selectedRow.classList.remove("selected");
                }
                selectedRow = row;
                row.classList.add("selected");
                drawRail();
                openTurnInspector(node, previewPane);
            });
            row.append(rowTop);
        }
        if (node.kind === SESSION_END_NODE_KIND) {
            const jsonlName = node.sessionId === undefined ? undefined : findJsonlForSession(node.sessionId);
            const rowTop = el("div", { class: "timeline-row-top" }, [
                el("span", { class: "timeline-step-label", text: `Step ${node.stepNumber}` }),
                el("span", { class: "timeline-prompt timeline-session-end", text: `end of session ${jsonlName ?? node.sessionId}` }),
                el("span", { class: "timeline-time", text: new Date(node.when).toLocaleTimeString() }),
            ]);
            // Clicking the session-end step opens the session transcript at its LAST line.
            if (jsonlName !== undefined) {
                rowTop.addEventListener("click", async () => {
                    const rawLines = await fetchRawRecords(project, jsonlName);
                    openTranscriptInspector({ jsonlName, rawLines, line: rawLines.length - 1 });
                });
            }
            row.append(rowTop);
        }
        if (node.kind === AGENT_TURN_NODE_KIND) {
            if (checkNodeIsPickable(node)) {
                const pick = el("input", { class: "timeline-pick", type: "checkbox" }) as HTMLInputElement;
                pickBoxes.set(index, pick);
                pick.addEventListener("change", () => {
                    const candidate = [...pickBoxes.entries()].filter(([, box]) => box.checked).map(([i]) => i);
                    if (!checkPickIsLegal(nodes, candidate)) {
                        pick.checked = !pick.checked;
                        flashRule();
                    }
                    updateSelectbar();
                });
                row.append(pick);
            }
            // Unattributed-lane steps have no session context to explain them — tag each row
            // with what it is (its chips' event kinds, item 10d); the title is the tooltip.
            const unattributedTag = sessionKey === UNATTRIBUTED_SESSION_LABEL
                ? computeUnattributedStepTag(node.fileChanges!.map((change) => change.eventKind))
                : undefined;
            const rowTop = el("div", { class: "timeline-row-top" }, [
                el("span", { class: "timeline-step-label", text: `Step ${node.stepNumber}` }),
                ...(node.isOrphaned ? [el("span", { class: "timeline-tag", text: "orphaned" })] : []),
                ...(unattributedTag === undefined
                    ? []
                    : [el("span", { class: "timeline-tag", text: unattributedTag, title: `attributed to no session — ${unattributedTag}` })]),
                el("span", { class: "timeline-prompt", text: node.text }),
                renderRowMeta(node, index),
            ]);
            rowTop.addEventListener("click", () => {
                if (selectedRow !== null) {
                    selectedRow.classList.remove("selected");
                }
                selectedRow = row;
                row.classList.add("selected");
                drawRail();
                openTurnInspector(node, previewPane);
            });
            row.append(rowTop);
            if (node.gitOperations.length > 0) {
                row.append(el("div", { class: "timeline-gitops" },
                    node.gitOperations.map((operation) => renderGitOperationRow(operation, previewPane))));
            }
            row.append(el("div", { class: "timeline-chips" },
                node.fileChanges!.map((change) => renderFileButtonRow(node, change, previewPane))));
            row.append(previewPane);
        }
        body.append(row);
        nodeRows.set(index, row);
        previousNode = node;
    });
    body.append(selectbar);
    container.append(body);

    // Clicking empty timeline background (not a row, session header, or the pick/export
    // bar) closes the inspector overlay. Assigned as a property (not addEventListener) so
    // renderRoute can clear it with `view.onclick = null` before other routes render.
    container.onclick = (event) => {
        if (checkSelectionBlocksBackgroundClose(window.getSelection())) {
            return;
        }
        if ((event.target as Element).closest(".timeline-row, .timeline-session, .timeline-selectbar") !== null) {
            return;
        }
        document.getElementById("inspector")!.classList.add("hidden");
        clearActiveChip();
    };

    // ── graph rail, drawn from row geometry (port of the approved mockup's drawRail) ──
    // Session-end nodes reuse the commit's hollow-circle rendering — both read as terminators.
    function checkRailDotIsHollow(nodeKind: string): boolean {
        if (nodeKind === COMMIT_NODE_KIND) {
            return true;
        }
        return nodeKind === SESSION_END_NODE_KIND;
    }
    function drawRail() {
        const MAIN_X = 32;
        const ORPHAN_X = 68;
        railSvg.setAttribute("width", "96");
        railSvg.setAttribute("height", String(body.scrollHeight));
        const parts: string[] = [];
        let color = "var(--accent)";
        let prevMain: number | null = null;
        let orphans: number[] = [];
        let forkFrom: number | null = null;
        const flushOrphans = () => {
            if (orphans.length === 0) {
                return;
            }
            const first = orphans[0]!;
            const last = orphans[orphans.length - 1]!;
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
        for (const child of body.children as HTMLCollectionOf<HTMLElement>) {
            if (child.classList.contains("timeline-session")) {
                flushOrphans();
                color = child.dataset.color!;
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
            if (checkRailDotIsHollow(child.dataset.nodeKind)) {
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

    // Line anchor: scroll to the step owning the raw line and open the inspector on that exact
    // line (openStepInspector would re-derive first-matching changeId and could land elsewhere).
    if (anchorLine !== undefined) {
        const rawLines = await fetchRawRecords(project, anchorJsonl!);
        const rawLineIndex = Number(anchorLine);
        const nodeIndex = findTimelineNodeIndexForRawLine(nodes, rawLines[rawLineIndex] ?? "");
        const anchoredRow = nodeRows.get(nodeIndex);
        if (anchoredRow !== undefined) {
            anchoredRow.classList.add("anchored");
            // item 37: scroll moved below openTranscriptInspector — opening the drawer shrinks
            // the timeline column and reflows every bubble, so centering must run against the
            // post-drawer layout.
            // anchoredRow.scrollIntoView({ block: "center" });
        }
        openTranscriptInspector({ jsonlName: anchorJsonl!, rawLines, line: rawLineIndex });
        anchoredRow?.scrollIntoView({ block: "center" });
    }
}
