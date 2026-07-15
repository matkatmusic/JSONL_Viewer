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
    hideLoadingProgress,
    renderConsentDialog,
    routeToFileHistory,
    showLoadingProgress,
} from "../app.ts";
import { openInspectorPane, openTranscriptInspector } from "../inspector.ts";
import { RevisionViewMode, renderDetailsCommitMode, renderDetailsFileMode, renderDetailsMessageMode, type DetailsContext } from "./details.ts";
import { clearFileSelectionIn, renderForkSidebar } from "./sidebar.ts";
import { findLineForChangeId, findRevisionForChangeId } from "./file-history.ts";
import { downloadText } from "./download.ts";
// (item 84) old: splitDiffBlocks (./file-history.ts), renderDiffText (./diff-vs-base.ts) and
// renderCodeInto (../highlight.ts) were imported for showFilePreview / showRevisionDiff. Both
// renderers are retired — the Revision View (details.ts) does this rendering now, and still
// imports all three itself.
// import { renderDiffText } from "./diff-vs-base.ts";
// import { renderCodeInto } from "../highlight.ts";

export const COMMIT_NODE_KIND = "commit";
export const USER_TURN_NODE_KIND = "user-turn";
export const AGENT_TURN_NODE_KIND = "agent-turn";
export const SESSION_END_NODE_KIND = "session-end";
export const TOOL_CALL_NODE_KIND = "tool-call";
const USER_ROLE = "user";
const EDIT_EVENT_KIND = "edit";
const COMMIT_OPERATION_KIND = "commit";
// Item 77: the two EventKind wire strings the Files tree reads (a delete dims the row, a rename
// gives it its origin badge). Mirrored as consts like the kinds above — the webapp cannot import
// the TS enums; tests assert equivalence against the real vocabulary.ts members.
const DELETE_EVENT_KIND = "delete";
const RENAME_EVENT_KIND = "rename";

// ── local wire + view-model types ────────────────────────────────────────────────────────────────
// The document arrives via fetch + JSON.parse, so ids/paths/dates are plain strings on the wire;
// these declare only the fields this view reads.

type WireRename = { from: string; to: string };
// A revision's per-line model (the engine's LineEntry); carried on the wire so the file-history view can
// render each revision's text from its own lines (no per-step file snapshot needed).
type WireLineEntry = { values: { line: string }[] };
type WireRevision = { kind: string; changeId: string; timestamp: string; rename?: WireRename; lines?: WireLineEntry[] };
export type WireFileHistory = { target: string; revisions: WireRevision[] };
// isOrphaned is the engine's per-record branch-membership stamp (true = rewound/abandoned
// branch); optional because an older cached document lacks the field (gitOperations convention).
type WireMessage = { role: string; timestamp: string; sessionId?: string; uuid: string; text: string; isOrphaned?: boolean };
// A skeleton step snapshot: no `files` map (the >512 MB wire-size fix) — a step's file text is fetched
// on demand from /api/step-files when a chip is clicked.
type WireStepSnapshot = {
    index: number;
    when: string;
    sessionId?: string;
    changeIds: string[];
    changedPaths: string[];
};
type WireGitOperation = {
    kind: string;
    detail: string;
    command: string;
    timestamp: string;
    sessionId?: string;
    uuid?: string;
    // The commit's short hash from its tool_result text (item 66); absent on non-commit
    // operations, older cached documents, and commits whose result echoed no hash.
    resultHash?: string;
};
type WireCommitMarker = { timestamp: string; sessionId?: string };
// One non-file-edit tool call (item 55): summary is its one-line command/path/pattern; uuid is
// the record the row's line label and { } button resolve through; toolUseId joins the call to
// its hook attachments and tool_result lines.
type WireToolCall = {
    toolName: string;
    summary: string;
    timestamp: string;
    sessionId?: string;
    uuid: string;
    toolUseId: string;
    // Engine-stamped branch membership (optional: older cached documents lack it).
    isOrphaned?: boolean;
};
export type WireTimelineDocument = {
    filesTouched: WireFileHistory[];
    rewoundFilesTouched: WireFileHistory[];
    messages: WireMessage[];
    steps: WireStepSnapshot[];
    gitOperations?: WireGitOperation[];
    commitMarkers: WireCommitMarker[];
    // Optional: an older cached document lacks the field (same convention as gitOperations).
    toolCalls?: WireToolCall[];
    // Optional (same convention): user-given session names from `custom-title` records.
    sessionTitles?: Record<string, string>;
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

// deriveFileChanges' chips: one displayable file change per distinct path; `when` is the owning
// snapshot's instant (the chip row's timestamp, item 55).
export type FileChange = {
    path: string;
    eventKind: string;
    renamedFrom: string | undefined;
    isFirstRevision: boolean;
    changeId: string | undefined;
    when: string;
};

// The (sessionId, when) instant snapshot ownership is decided on (checkNodeCanOwnSnapshot).
type SnapshotInstant = { sessionId?: string; when: string };

// A raw transcript position the inspector can open: (jsonl, its lines, 0-based line index).
type TranscriptLocation = { jsonlName: string; rawLines: string[]; line: number };

// One conversation turn (user prompt or agent reply); synthetic trailing agent turns carry no uuid.
// stepNumber / fileChanges are stamped on after sorting (assignStepNumbers, deriveNodeFileChanges),
// hence optional. isOrphaned is copied from the engine's per-record wire stamp at node
// construction (message.isOrphaned); synthetic turns carry none.
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
    // True on the synthetic turn holding gitBase: baseline steps (task 86) — the row renders as
    // a regular message whose role pill reads "git-derived baseline".
    isGitBaseline?: boolean;
    detail?: undefined;
    resultHash?: undefined;
    summary?: undefined;
    toolName?: undefined;
    toolUseId?: undefined;
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
    isGitBaseline?: undefined;
    uuid?: undefined;
    text?: undefined;
    isSystem?: undefined;
    gitOperations?: undefined;
    detail?: undefined;
    resultHash?: undefined;
    summary?: undefined;
    toolName?: undefined;
    toolUseId?: undefined;
};

// One git-commit hard stop (deriveCommitNodes); never numbered, never pickable.
type CommitNode = {
    kind: typeof COMMIT_NODE_KIND;
    when: string;
    sessionId: string | undefined;
    detail?: string;
    // The commit's short hash (item 66) — the fork layout's `GIT COMMIT [hash]` pill.
    resultHash?: string;
    uuid?: undefined;
    text?: undefined;
    isSystem?: undefined;
    snapshots?: undefined;
    gitOperations?: undefined;
    stepNumber?: undefined;
    fileChanges?: undefined;
    isOrphaned?: undefined;
    isGitBaseline?: undefined;
    summary?: undefined;
    toolName?: undefined;
    toolUseId?: undefined;
};

// One un-bubbled tool-call row (item 55; deriveToolCallNodes): `* <summary> * [{ }] <TS> L:n`.
// Never numbered, never pickable; sorts chronologically among the turns it ran between.
type ToolCallNode = {
    kind: typeof TOOL_CALL_NODE_KIND;
    when: string;
    sessionId: string | undefined;
    uuid: string;
    toolName: string;
    summary: string;
    toolUseId: string;
    // Copied from the engine's per-record wire stamp — a tool row on a rewound branch dims too.
    isOrphaned?: boolean;
    isGitBaseline?: undefined;
    text?: undefined;
    isSystem?: undefined;
    snapshots?: undefined;
    gitOperations?: undefined;
    stepNumber?: undefined;
    fileChanges?: undefined;
    detail?: undefined;
    resultHash?: undefined;
};

export type TimelineNode = TurnNode | SessionEndNode | CommitNode | ToolCallNode;

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
            when: step.when,
        });
    }
    for (const path of step.changedPaths) {
        if (seenPaths.has(path)) {
            continue;
        }
        seenPaths.add(path);
        changes.push({ path, eventKind: EDIT_EVENT_KIND, renamedFrom: undefined, isFirstRevision: false, changeId: undefined, when: step.when });
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

// old (pre engine-stamped isOrphaned): the per-step snapshot proxy — a step counted orphaned
// when its changeIds resolved only to rewound-branch revisions. Retired: the engine now stamps
// branch membership per record on the wire (message.isOrphaned / toolCall.isOrphaned).
// // A step is orphaned when at least one of its changeIds matches a rewound-branch revision and
// // none matches a surviving one — those are the dimmed, unpickable rows.
// export function checkStepIsOrphaned(step: WireStepSnapshot, revisionIndex: RevisionIndex): boolean {
//     let matchesRewound = false;
//     for (const changeId of step.changeIds) {
//         const revision = revisionIndex.get(changeId);
//         if (revision === undefined) {
//             continue;
//         }
//         if (!revision.isRewound) {
//             return false;
//         }
//         matchesRewound = true;
//     }
//     return matchesRewound;
// }

// Tie-break rank for nodes sharing a timestamp: turns first (a commit records the state the turn
// built up), then tool rows (they ran after the reply they follow, item 55), then commits, then
// session ends (they close the session after everything in it).
function computeNodeKindRank(kind: TimelineNode["kind"]): number {
    if (kind === SESSION_END_NODE_KIND) {
        return 3;
    }
    if (kind === COMMIT_NODE_KIND) {
        return 2;
    }
    if (kind === TOOL_CALL_NODE_KIND) {
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

// True when every changeId on the step is a base-commit beacon (task 86): the step carries the
// repo's pre-session state, evidenced by no session's record.
function checkSnapshotIsGitBaseline(snapshot: WireStepSnapshot): boolean {
    if (snapshot.changeIds.length === 0) {
        return false;
    }
    return snapshot.changeIds.every((changeId) => changeId.startsWith(GIT_BASE_CHANGE_ID_PREFIX));
}

// The baseline node's message text: the beacon changeId is gitBase:<hash>:<target>, so the
// commit hash is the second colon-separated field (hashes never contain colons).
function computeGitBaselineText(snapshot: WireStepSnapshot): string {
    const commitHash = snapshot.changeIds[0]!.split(":")[1] ?? "";
    return `Files seeded from git base commit ${commitHash}`;
}

// Per snapshot: the FIRST agent-turn node of its own session at or after it (turnNodes are in
// message order, chronological per session). Ownerless snapshots are always a trailing suffix of
// their session (steps are chronological), so they collect into ONE synthetic empty-text agent
// turn per session — no file change is ever silently dropped. gitBase-only steps split off
// FIRST into a dedicated baseline node (task 86).
function attachSnapshotsToAgentTurns(turnNodes: TurnNode[], steps: WireStepSnapshot[]): void {
    const syntheticTurns = new Map<string | undefined, TurnNode>();
    let baselineTurn: TurnNode | undefined;
    for (const snapshot of steps) {
        // (task 86) gitBase-only steps get their own baseline node — they must not mingle with
        // the generic unattributed synthetic turn below.
        if (checkSnapshotIsGitBaseline(snapshot)) {
            if (baselineTurn === undefined) {
                baselineTurn = {
                    kind: AGENT_TURN_NODE_KIND,
                    when: snapshot.when,
                    sessionId: snapshot.sessionId,
                    text: computeGitBaselineText(snapshot),
                    isGitBaseline: true,
                    snapshots: [],
                    gitOperations: [],
                };
                turnNodes.push(baselineTurn);
            }
            baselineTurn.snapshots.push(snapshot);
            continue;
        }
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

// (item 66) the item-55 dead git-row machinery (attachGitOperationsToAgentTurns,
// findLastAgentTurnOfSession, formatGitOperationLabel, renderGitOperationRow,
// showGitOperationJson) is deleted here per the plan — it lives on in
// webapp/archive/timeline-pre-item66.ts.

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
            resultHash: operation.resultHash,
        }));
}

// One session-end node per distinct session (insertion order), timestamped at the session's last
// turn OR tool call — the end node closes the session after everything in it (a trailing `git
// add` row must precede its session end, item 55); compareTimelineNodes ranks it after everything
// else sharing that timestamp. Unattributed turns (no sessionId — e.g. script executions) are not
// a session and get no end node.
function appendSessionEndNodes(turnNodes: (TurnNode | SessionEndNode)[], toolCallNodes: ToolCallNode[]): void {
    const lastTurnTimes = new Map<string, string>();
    const noteSessionInstant = (sessionId: string | undefined, when: string): void => {
        if (sessionId === undefined) {
            return;
        }
        const latest = lastTurnTimes.get(sessionId);
        if (latest === undefined) {
            lastTurnTimes.set(sessionId, when);
            return;
        }
        if (when > latest) {
            lastTurnTimes.set(sessionId, when);
        }
    };
    for (const node of turnNodes) {
        noteSessionInstant(node.sessionId, node.when);
    }
    for (const node of toolCallNodes) {
        noteSessionInstant(node.sessionId, node.when);
    }
    for (const [sessionId, when] of lastTurnTimes) {
        turnNodes.push({ kind: SESSION_END_NODE_KIND, when, sessionId, snapshots: [] });
    }
}

// Walk the sorted nodes: user turns, agent turns, and session ends get stepNumber 1..N
// continuously across sessions; commit nodes and tool-call rows stay unnumbered.
function assignStepNumbers(nodes: TimelineNode[]): void {
    let stepNumber = 0;
    for (const node of nodes) {
        if (node.kind === COMMIT_NODE_KIND) {
            continue;
        }
        if (node.kind === TOOL_CALL_NODE_KIND) {
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

// old (pre engine-stamped isOrphaned): the snapshot-proxy orphan check — retired alongside
// checkStepIsOrphaned; node.isOrphaned now copies the engine's per-record wire stamp.
// // Orphaned when the turn owns snapshots and EVERY one sits on a rewound branch; a turn with any
// // surviving snapshot — or none at all — stays on the spine.
// function checkTurnIsOrphaned(snapshots: WireStepSnapshot[], revisionIndex: RevisionIndex): boolean {
//     if (snapshots.length === 0) {
//         return false;
//     }
//     return snapshots.every((snapshot) => checkStepIsOrphaned(snapshot, revisionIndex));
// }

// fileChanges + isOrphaned on every turn/session-end node (user turns and session ends own no
// snapshots, so they resolve to no chips and never orphaned); commit and tool-call nodes carry
// no snapshots at all and are skipped.
function deriveNodeFileChanges(nodes: TimelineNode[], revisionIndex: RevisionIndex): void {
    for (const node of nodes) {
        if (node.kind === COMMIT_NODE_KIND) {
            continue;
        }
        if (node.kind === TOOL_CALL_NODE_KIND) {
            continue;
        }
        node.fileChanges = deriveMergedFileChanges(node.snapshots, revisionIndex);
        // old: isOrphaned was a snapshot proxy (all snapshots on a rewound branch) — it could
        // never flag user/tool rows. The engine now stamps per-record branch membership on the
        // wire (message.isOrphaned / toolCall.isOrphaned), copied at node construction.
        // node.isOrphaned = checkTurnIsOrphaned(node.snapshots, revisionIndex);
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
        isOrphaned: message.isOrphaned === true,
        snapshots: [],
        gitOperations: [],
    }));
    attachSnapshotsToAgentTurns(turnNodes, document.steps);
    // (item 55) old: attachGitOperationsToAgentTurns(turnNodes, document.gitOperations ?? []);
    // — git rows generalized into standalone tool-call nodes (every Bash call is a toolCall);
    // gitOperations still feed deriveCommitNodes' hard stops.
    const toolCallNodes = deriveToolCallNodes(document);
    appendSessionEndNodes(turnNodes, toolCallNodes);
    const commitNodes = deriveCommitNodes(document);
    const nodes = [...turnNodes, ...commitNodes, ...toolCallNodes].sort(compareTimelineNodes);
    assignStepNumbers(nodes);
    deriveNodeFileChanges(nodes, revisionIndex);
    return { nodes };
}

// One un-bubbled row per document tool call (item 55); the sort interleaves them chronologically
// with the turns they ran between.
function deriveToolCallNodes(document: WireTimelineDocument): ToolCallNode[] {
    return (document.toolCalls ?? []).map((call) => ({
        kind: TOOL_CALL_NODE_KIND,
        when: call.timestamp,
        sessionId: call.sessionId,
        uuid: call.uuid,
        toolName: call.toolName,
        summary: call.summary,
        toolUseId: call.toolUseId,
        isOrphaned: call.isOrphaned === true,
    }));
}

// A tool row's display text: first line only, capped at 50 chars, so the row's [{ }] button,
// timestamp, and L:n label always stay visible (item 55, user-specified cap).
const TOOL_CALL_SUMMARY_MAX_CHARS = 50;
export function truncateToolCallSummary(summary: string): string {
    const firstLine = summary.split("\n")[0]!;
    if (firstLine.length <= TOOL_CALL_SUMMARY_MAX_CHARS) {
        return firstLine;
    }
    return `${firstLine.slice(0, TOOL_CALL_SUMMARY_MAX_CHARS)}…`;
}

// True when an agent turn owns the raw line: one of its snapshots' changeIds appears verbatim in
// the line text (the inverse of findLineForChangeId's substring convention), or the line IS the
// turn's own message record (its "uuid":"…" field, item 55 — so stepping onto a reply's record
// line selects the reply's step).
function checkAgentTurnOwnsRawLine(node: TimelineNode, rawLineText: string): boolean {
    if (node.kind !== AGENT_TURN_NODE_KIND) {
        return false;
    }
    if (node.uuid !== undefined) {
        if (rawLineText.includes(`"uuid":"${node.uuid}"`)) {
            return true;
        }
    }
    return node.snapshots.some((snapshot) =>
        snapshot.changeIds.some((changeId) => rawLineText.includes(changeId)));
}

// True when a tool-call row's own record IS the raw line (its "uuid":"…" field) — the ls row and
// its rtk-rewrite row share a toolUseId, so each row's own line must resolve by record first.
function checkToolCallOwnsRawLineByRecord(node: TimelineNode, rawLineText: string): boolean {
    if (node.kind !== TOOL_CALL_NODE_KIND) {
        return false;
    }
    return rawLineText.includes(`"uuid":"${node.uuid}"`);
}

// True when the raw line references a tool-call row's toolUseId verbatim — hook attachments and
// tool_result records carry the toolu id, mapping those lines back to the call that ran (item 55).
function checkToolCallOwnsRawLineByToolUseId(node: TimelineNode, rawLineText: string): boolean {
    if (node.kind !== TOOL_CALL_NODE_KIND) {
        return false;
    }
    return rawLineText.includes(node.toolUseId!);
}

// True when a user turn owns the raw line: the line IS its message record — the uuid must appear
// as the record's own "uuid":"…" field. A bare-substring match would fire on lines that merely
// REFERENCE the prompt (a file-history-snapshot's inner snapshot.messageId, a parentUuid) and
// wrongly re-select an earlier step (the s39 lines-49/50 → Step 3 bug, item 55).
function checkUserTurnOwnsRawLine(node: TimelineNode, rawLineText: string): boolean {
    if (node.kind !== USER_TURN_NODE_KIND) {
        return false;
    }
    return rawLineText.includes(`"uuid":"${node.uuid!}"`);
}

// The index of the timeline node owning the raw JSONL line; -1 when no node matches (e.g. a
// summary line, or a snapshot line whose changeIds resolve to no node). Tiers, most specific
// first: (1) agent turns by changeId / own record line — a file-history-snapshot line embeds BOTH
// a changeId and the uuid of the prompt that triggered it, and such a line is about the file
// change, not the prompt; (2) tool-call rows by their own record line; (3) tool-call rows by
// toolUseId (hook attachments, tool_results); (4) user turns by their own record line.
export function findTimelineNodeIndexForRawLine(nodes: TimelineNode[], rawLineText: string): number {
    const agentTurnIndex = nodes.findIndex((node) => checkAgentTurnOwnsRawLine(node, rawLineText));
    if (agentTurnIndex >= 0) {
        return agentTurnIndex;
    }
    const toolCallRecordIndex = nodes.findIndex((node) => checkToolCallOwnsRawLineByRecord(node, rawLineText));
    if (toolCallRecordIndex >= 0) {
        return toolCallRecordIndex;
    }
    const toolCallReferenceIndex = nodes.findIndex((node) => checkToolCallOwnsRawLineByToolUseId(node, rawLineText));
    if (toolCallReferenceIndex >= 0) {
        return toolCallReferenceIndex;
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

// A diff block with no hunk lines (a rename block is just its kind header) renders as an
// explanation instead of an empty-looking pane (item 47); multi-line blocks return undefined
// (render as a diff).
export function computeRevisionDiffFallbackText(block: string | undefined, change: FileChange): string | undefined {
    if (block === undefined) {
        return "(no diff block for this revision)";
    }
    if (block.trim().split("\n").length > 1) {
        return undefined;
    }
    if (change.renamedFrom !== undefined) {
        return `renamed ${change.renamedFrom} → ${change.path} (content unchanged)`;
    }
    return `${block.trim()}\n(no content change in this revision)`;
}

// An agent turn with no reply text is tool activity, not a reply (item 52): file chips mean
// the step shows tool RESULTS. Replies (non-blank text) and chip-less turns return undefined.
// (item 55) the "tool call" branch is retired — git rows moved out of turn bubbles into
// standalone tool-call nodes, so a blank turn whose only content is gitOperations no longer
// exists; the parameter stays for wire-shape compatibility.
export function computeToolActivityTag(node: {
    kind: string;
    text: string;
    fileChanges?: FileChange[];
    gitOperations?: readonly unknown[];
}): string | undefined {
    if (node.kind !== AGENT_TURN_NODE_KIND) {
        return undefined;
    }
    if (node.text.trim() !== "") {
        return undefined;
    }
    if ((node.fileChanges ?? []).length > 0) {
        return "tool result";
    }
    // (item 55) old: if ((node.gitOperations ?? []).length > 0) { return "tool call"; }
    return undefined;
}

// A session id's 8-char short label — the fork layout's uuid column, sidebar entries, and
// session-end rows all shorten sessions the same way (item 66).
export function computeSessionShortLabel(sessionId: string): string {
    return sessionId.slice(0, 8);
}

// Wire event kind of a script-made revision (mirrors EventKind.scriptExecution).
const SCRIPT_EXECUTION_EVENT_KIND = "script-execution";

// Wire-string mirror of BASE_COMMIT_CHANGE_ID_PREFIX (src/reconstruction_base_commit.ts) — a
// changeId with this prefix is a base-commit baseline beacon, evidenced by no session's record.
export const GIT_BASE_CHANGE_ID_PREFIX = "gitBase:";

// The session-start marker's text: the session's user-given custom title when the document
// carries one ("Session <title> started: <id>"), else id-only ("Session started: <id>").
// sessionTitles is optional — older cached documents predate the field.
export function computeSessionStartLabel(sessionTitles: Record<string, string> | undefined, sessionId: string): string {
    const title = sessionTitles === undefined ? undefined : sessionTitles[sessionId];
    if (title === undefined) return `Session started: ${sessionId}`;
    return `Session ${title} started: ${sessionId}`;
}

// Where each session's FIRST node sits, in first-appearance order — the timeline inserts a
// session-start marker row before these indexes (item 66 follow-up; an interleaved
// multi-JSONL project otherwise never shows where a later session began). Unattributed
// nodes yield no marker, and interleave switches back to a started session add none.
export function findSessionStartIndexes(nodes: TimelineNode[]): { nodeIndex: number; sessionId: string }[] {
    const starts: { nodeIndex: number; sessionId: string }[] = [];
    const seenSessionIds = new Set<string>();
    for (const [nodeIndex, node] of nodes.entries()) {
        if (node.sessionId === undefined) continue;
        if (seenSessionIds.has(node.sessionId)) continue;
        seenSessionIds.add(node.sessionId);
        starts.push({ nodeIndex, sessionId: node.sessionId });
    }
    return starts;
}

// The pill-style role tag opening a row — "User" / "Agent" / "Tool" / "Script" /
// "git-derived baseline" (item 66 follow-up; task 86). An agent turn whose file chips carry a
// script-made revision is the script run's row, so it reads "Script"; the synthetic baseline
// node reads "git-derived baseline"; commit and session-end rows get none (their text names
// them).
export function computeRolePillLabel(node: TimelineNode): string | undefined {
    if (node.kind === USER_TURN_NODE_KIND) return "User";
    if (node.kind === TOOL_CALL_NODE_KIND) return "Tool";
    if (node.kind !== AGENT_TURN_NODE_KIND) return undefined;
    if (node.isGitBaseline === true) return "git-derived baseline";
    const ranScript = (node.fileChanges ?? []).some((change) => change.eventKind === SCRIPT_EXECUTION_EVENT_KIND);
    if (ranScript) return "Script";
    return "Agent";
}

// The pill's per-label CSS class token — multi-word labels ("git-derived baseline") hyphenate so
// the class stays a single token.
export function computeRolePillClass(label: string): string {
    return `role-pill-${label.toLowerCase().replaceAll(" ", "-")}`;
}

// A row's collapsed one-line text, per node kind (item 66): turns show their first text line
// (a blank synthetic agent turn reads "(tool activity)"); tool calls read like the mockup's
// `Bash(npx tsc --noEmit)`; commits show their message; session ends name their session.
export function computeRowSummaryText(node: TimelineNode): string {
    if (node.kind === COMMIT_NODE_KIND) {
        return node.detail ?? "git commit";
    }
    if (node.kind === SESSION_END_NODE_KIND) {
        return `end of session ${computeSessionShortLabel(node.sessionId)}`;
    }
    if (node.kind === TOOL_CALL_NODE_KIND) {
        return `${node.toolName}(${truncateToolCallSummary(node.summary)})`;
    }
    const firstLine = node.text.split("\n")[0]!;
    if (node.kind === AGENT_TURN_NODE_KIND && firstLine.trim() === "") {
        return "(tool activity)";
    }
    return firstLine;
}

// True when the chip is a base-commit baseline seed (tasks 86/87): baseline state is
// pre-session, never part of a commit's delta.
function checkChangeIsGitBaseline(change: FileChange): boolean {
    if (change.changeId === undefined) {
        return false;
    }
    return change.changeId.startsWith(GIT_BASE_CHANGE_ID_PREFIX);
}

// A commit's changed-file list (item 66, mockup logic): walk back from the commit to the
// previous commit EXCLUSIVE (or the timeline start), collecting every surviving row's file
// changes; each path is listed once, keeping the occurrence CLOSEST to the commit (its latest
// revision). Then walk FORWARD to the next commit EXCLUSIVE, absorbing only chips whose change
// instant is at-or-before the commit — pre-commit work whose owning reply bubble sorts after the
// commit row (task 87: the first commit otherwise shows "No files changed"). Baseline (gitBase)
// chips are never a commit's delta and are skipped in both directions.
export function deriveCommitChangedFiles(nodes: TimelineNode[], commitIndex: number): FileChange[] {
    const commitWhen = nodes[commitIndex]!.when;
    const changes: FileChange[] = [];
    const seenPaths = new Set<string>();
    const collectChange = (change: FileChange): void => {
        if (checkChangeIsGitBaseline(change)) {
            return;
        }
        if (seenPaths.has(change.path)) {
            return;
        }
        seenPaths.add(change.path);
        changes.push(change);
    };
    for (let index = commitIndex - 1; index >= 0; index -= 1) {
        const node = nodes[index]!;
        if (node.kind === COMMIT_NODE_KIND) {
            break;
        }
        if (node.isOrphaned === true) {
            continue;
        }
        for (const change of node.fileChanges ?? []) {
            collectChange(change);
        }
    }
    for (let index = commitIndex + 1; index < nodes.length; index += 1) {
        const node = nodes[index]!;
        if (node.kind === COMMIT_NODE_KIND) {
            break;
        }
        if (node.isOrphaned === true) {
            continue;
        }
        for (const change of node.fileChanges ?? []) {
            if (change.when > commitWhen) {
                continue;
            }
            collectChange(change);
        }
    }
    return changes;
}

// The rows a selected commit highlights (`.contrib`, item 66): the same two-direction walk as
// deriveCommitChangedFiles, including every surviving row whose qualifying file changes overlap
// the commit's changed paths. Indexes return ascending.
export function findContributingNodeIndexes(nodes: TimelineNode[], commitIndex: number): number[] {
    const commitWhen = nodes[commitIndex]!.when;
    const changedPaths = new Set(deriveCommitChangedFiles(nodes, commitIndex).map((change) => change.path));
    // A chip contributes when it is not a baseline seed, happened at-or-before the commit (always
    // true for backward rows — owners sit at-or-after their snapshots), and touches a changed path.
    const checkChangeContributes = (change: FileChange): boolean => {
        if (checkChangeIsGitBaseline(change)) {
            return false;
        }
        if (change.when > commitWhen) {
            return false;
        }
        return changedPaths.has(change.path);
    };
    const indexes: number[] = [];
    for (let index = commitIndex - 1; index >= 0; index -= 1) {
        const node = nodes[index]!;
        if (node.kind === COMMIT_NODE_KIND) {
            break;
        }
        if (node.isOrphaned === true) {
            continue;
        }
        if ((node.fileChanges ?? []).some(checkChangeContributes)) {
            indexes.push(index);
        }
    }
    indexes.reverse();
    for (let index = commitIndex + 1; index < nodes.length; index += 1) {
        const node = nodes[index]!;
        if (node.kind === COMMIT_NODE_KIND) {
            break;
        }
        if (node.isOrphaned === true) {
            continue;
        }
        if ((node.fileChanges ?? []).some(checkChangeContributes)) {
            indexes.push(index);
        }
    }
    return indexes;
}

// One Files-pane entry: the file plus the two facts the tree renders differently (item 77).
export type FileSidebarEntry = {
    target: string;
    revisionCount: number;
    // True only when the LAST revision is a delete: m4's write->delete->write recreate ends alive.
    isDeleted: boolean;
    // The path this file was born at, when a rename moved it. The engine keys a renamed file's
    // history at its FINAL path (src/reconstruction_lineage.ts), so the origin is only recoverable
    // from the rename revision. undefined when the file was never renamed.
    originalPath: string | undefined;
};

// The Files sidebar's entries (item 66): every surviving touched file with its revision count,
// plus its delete/rename facts (item 77).
export function buildFilesSidebarViewModel(document: WireTimelineDocument): FileSidebarEntry[] {
    return document.filesTouched.map((history) => ({
        target: history.target,
        revisionCount: history.revisions.length,
        isDeleted: findLastRevisionKind(history) === DELETE_EVENT_KIND,
        originalPath: findOriginalPath(history),
    }));
}

// The kind of the revision a file ends life at; undefined for an empty history.
function findLastRevisionKind(history: WireFileHistory): string | undefined {
    return history.revisions[history.revisions.length - 1]?.kind;
}

// The path a renamed file started at: the FIRST rename revision's `from`. A chained rename
// (a->b->c) leaves revisions from=a,to=b then from=b,to=c, so the earliest `from` is the origin.
function findOriginalPath(history: WireFileHistory): string | undefined {
    return history.revisions.find((revision) => revision.kind === RENAME_EVENT_KIND)?.rename?.from;
}

// A Files-pane tree node (item 77): a folder with children, or a file leaf carrying its entry.
// Mirrored (not imported) by webapp/views/sidebar.ts — this module imports sidebar.ts, so importing
// back would be a cycle; that file's other view-model types are mirrored the same way.
export const FOLDER_NODE_KIND = "folder";
export const FILE_NODE_KIND = "file";

export type FileTreeNode = {
    kind: typeof FOLDER_NODE_KIND | typeof FILE_NODE_KIND;
    name: string;
    children: FileTreeNode[];
    // Set only on a file leaf.
    entry: FileSidebarEntry | undefined;
};

// The directory segments every target shares, as a path (item 77). Real targets are absolute and
// deep (/private/var/folders/…/T/run-scenario.xxxx/alpha.py), so the tree strips this prefix —
// otherwise the pane is a chain of single-child folders before the first real file, which is the
// truncation item 77 is about. Segment-wise on purpose: a character-wise prefix of /foo/bar and
// /foo/barn wrongly yields /foo/bar.
export function findCommonDirectoryPrefix(targets: readonly string[]): string {
    const directories = targets.map(splitDirectorySegments);
    if (directories.length === 0) {
        return "";
    }
    return directories.reduce(intersectLeadingSegments).join("/");
}

// A target's directory, as segments — never its basename, so a lone file keeps its own name.
function splitDirectorySegments(target: string): string[] {
    return target.split("/").slice(0, -1);
}

// The leading segments two paths agree on.
function intersectLeadingSegments(left: readonly string[], right: readonly string[]): string[] {
    const shared: string[] = [];
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
        if (left[index] !== right[index]) {
            break;
        }
        shared.push(left[index]!);
    }
    return shared;
}

// Shape the flat Files entries into a nested tree, rooted below the directory prefix every target
// shares (item 77). Folders sort before files; each group sorts alphabetically.
export function buildFileTree(files: readonly FileSidebarEntry[]): FileTreeNode[] {
    const prefix = findCommonDirectoryPrefix(files.map((file) => file.target));
    const root = makeFolderNode("");
    for (const file of files) {
        insertFileIntoTree(root, file, prefix);
    }
    sortTreeNodes(root);
    collapseSingleChildFolderChains(root.children);
    return root.children;
}

function makeFolderNode(name: string): FileTreeNode {
    return { kind: FOLDER_NODE_KIND, name, children: [], entry: undefined };
}

// Walk (creating as needed) the folder chain below the stripped prefix, then hang the file leaf.
function insertFileIntoTree(root: FileTreeNode, file: FileSidebarEntry, prefix: string): void {
    const segments = stripPrefixSegments(file.target, prefix);
    const fileName = segments[segments.length - 1]!;
    let folder = root;
    for (const directory of segments.slice(0, -1)) {
        folder = findOrAddFolder(folder, directory);
    }
    folder.children.push({ kind: FILE_NODE_KIND, name: fileName, children: [], entry: file });
}

// A target's segments below the shared prefix. Splitting the REMAINDER (not the whole target) is
// what removes the deep absolute root; the filter drops the remainder's empty leading segment.
function stripPrefixSegments(target: string, prefix: string): string[] {
    return target.slice(prefix.length).split("/").filter((segment) => segment !== "");
}

function findOrAddFolder(parent: FileTreeNode, name: string): FileTreeNode {
    const existing = parent.children.find((child) => child.kind === FOLDER_NODE_KIND && child.name === name);
    if (existing !== undefined) {
        return existing;
    }
    const folder = makeFolderNode(name);
    parent.children.push(folder);
    return folder;
}

// Folders before files, then alphabetical — applied at every depth.
function sortTreeNodes(folder: FileTreeNode): void {
    folder.children.sort(compareTreeNodes);
    for (const child of folder.children) {
        sortTreeNodes(child);
    }
}

function compareTreeNodes(left: FileTreeNode, right: FileTreeNode): number {
    if (left.kind !== right.kind) {
        return left.kind === FOLDER_NODE_KIND ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
}

// Merge each folder holding exactly one folder child into a combined `a/b/c` node (task 90):
// in multi-root projects the shared prefix is shallow, so real single-child chains survive
// below it and cost one click per level. Only folder->folder merges — a lone FILE child keeps
// its own row. Runs after sorting on purpose: sibling order stays keyed to the original first
// segment. The root header itself never collapses (root-level collapsing was declined).
function collapseSingleChildFolderChains(nodes: FileTreeNode[]): void {
    for (const node of nodes) {
        while (nodeHoldsExactlyOneFolderChild(node)) {
            const onlyChild = node.children[0]!;
            node.name = `${node.name}/${onlyChild.name}`;
            node.children = onlyChild.children;
        }
        collapseSingleChildFolderChains(node.children);
    }
}

// True when the node is a folder whose single child is itself a folder — the collapsible link.
function nodeHoldsExactlyOneFolderChild(node: FileTreeNode): boolean {
    if (node.kind !== FOLDER_NODE_KIND || node.children.length !== 1) {
        return false;
    }
    return node.children[0]!.kind === FOLDER_NODE_KIND;
}

// The project JSONL whose file name starts with the session id (JSONLs are named after their
// session uuid); undefined when unattributed or when the listing has no match. Lifted out of
// renderTimelineView (item 66) so the Sessions sidebar view-model can resolve it too.
export function findJsonlForSession(listing: WireProjectListing | undefined, sessionId: string | undefined): string | undefined {
    if (sessionId === undefined) {
        return undefined;
    }
    return listing?.jsonlFiles.find((file) => file.fileName.startsWith(sessionId))?.fileName;
}

// One Sessions-sidebar entry per distinct attributed session, in first-appearance order.
type SessionSidebarEntry = {
    sessionId: string;
    shortLabel: string;
    jsonlFileName: string | undefined;
    rowCount: number;
    firstNodeIndex: number;
};

// The Sessions sidebar's entries (item 66): group the timeline rows by sessionId (unattributed
// rows belong to no session), counting rows and remembering the first row for flash-scroll.
export function buildSessionsSidebarViewModel(nodes: TimelineNode[], listing: WireProjectListing | undefined): SessionSidebarEntry[] {
    const entries: SessionSidebarEntry[] = [];
    const entriesBySessionId = new Map<string, SessionSidebarEntry>();
    nodes.forEach((node, index) => {
        if (node.sessionId === undefined) {
            return;
        }
        const existing = entriesBySessionId.get(node.sessionId);
        if (existing !== undefined) {
            existing.rowCount += 1;
            return;
        }
        const entry: SessionSidebarEntry = {
            sessionId: node.sessionId,
            shortLabel: computeSessionShortLabel(node.sessionId),
            jsonlFileName: findJsonlForSession(listing, node.sessionId),
            rowCount: 1,
            firstNodeIndex: index,
        };
        entriesBySessionId.set(node.sessionId, entry);
        entries.push(entry);
    });
    return entries;
}

// The fork gutter's lane-2 spans (item 66): one {startIndex, endIndex} per CONTIGUOUS run of
// orphaned rows — the run's first row draws the fork curve, its last the merge-back end.
export function computeGraphLaneRuns(nodes: TimelineNode[]): { startIndex: number; endIndex: number }[] {
    const runs: { startIndex: number; endIndex: number }[] = [];
    let currentRun: { startIndex: number; endIndex: number } | undefined;
    nodes.forEach((node, index) => {
        if (node.isOrphaned !== true) {
            currentRun = undefined;
            return;
        }
        if (currentRun !== undefined) {
            currentRun.endIndex = index;
            return;
        }
        currentRun = { startIndex: index, endIndex: index };
        runs.push(currentRun);
    });
    return runs;
}

// Whether a row gets a tri + bubble (item 66): commit and session-end rows are thin one-liners
// (locked decision 4); every turn and tool-call row expands.
export function checkRowIsExpandable(node: TimelineNode): boolean {
    if (node.kind === COMMIT_NODE_KIND) {
        return false;
    }
    return node.kind !== SESSION_END_NODE_KIND;
}

// Nearest agent turn carrying file chips, walking from fromIndex in direction (task 85's
// header Prev/Next). fromIndex -1 means "before the first row"; undefined means no
// candidate in that direction.
export function findAdjacentFileTouchedIndex(
    nodes: TimelineNode[],
    fromIndex: number,
    direction: 1 | -1,
): number | undefined {
    for (let index = fromIndex + direction; index >= 0 && index < nodes.length; index += direction) {
        const node = nodes[index]!;
        if (node.kind === AGENT_TURN_NODE_KIND && (node.fileChanges ?? []).length > 0) {
            return index;
        }
    }
    return undefined;
}

// ─── render half (DOM only — every computation lives in the view-model above) ───────────────────

// Fixed session-lane palette, assigned by first appearance; a session keeps its color for the
// whole list (never re-cycled mid-list).
const SESSION_LANE_VARIABLES = ["--accent", "--green", "--orange", "--lane-violet", "--lane-teal"];
const ORPHAN_LANE_COLOR = "var(--muted)";

// A timeline this many rows or larger gets the build-progress overlay + chunked
// rendering; smaller ones build synchronously (item 78). Exported so the boundary
// tests track this value instead of hardcoding it (it is tuned in place).
export const LARGE_TIMELINE_ROW_COUNT = 100;

// Rows built per animation frame during a chunked (large-timeline) build.
const TIMELINE_BUILD_BATCH_SIZE = 10;

// True when a timeline is large enough to build in yielding batches behind a
// progress overlay instead of one synchronous pass.
export function checkTimelineNeedsProgressOverlay(rowCount: number): boolean {
    return rowCount >= LARGE_TIMELINE_ROW_COUNT;
}

// The overlay's text line, e.g. "Building timeline… 250 / 1200 rows".
export function computeTimelineBuildProgressLabel(rowsBuilt: number, totalRows: number): string {
    return `Building timeline… ${rowsBuilt} / ${totalRows} rows`;
}

// The progress bar's fill fraction (0..1). A zero total counts as fully built (1)
// so an empty build never divides by zero.
export function computeTimelineProgressFraction(rowsBuilt: number, totalRows: number): number {
    if (totalRows === 0) {
        return 1;
    }
    return rowsBuilt / totalRows;
}

// Resolve on the next animation frame so a just-applied DOM update paints before
// the next batch of rows blocks the main thread again (item 78).
function waitForNextAnimationFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

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

// The mockup's role-* text/bubble class per node kind (agent turns are the assistant role).
function computeRoleClass(kind: TimelineNode["kind"]): string {
    if (kind === USER_TURN_NODE_KIND) {
        return "role-user";
    }
    if (kind === AGENT_TURN_NODE_KIND) {
        return "role-assistant";
    }
    if (kind === TOOL_CALL_NODE_KIND) {
        return "role-tool";
    }
    if (kind === COMMIT_NODE_KIND) {
        return "role-commit";
    }
    return "role-end";
}

// Commit and session-end dots render hollow (border ring) — both read as terminators (the old
// SVG rail's convention, now the .g-hollow class).
function checkDotIsHollow(kind: TimelineNode["kind"]): boolean {
    if (kind === COMMIT_NODE_KIND) {
        return true;
    }
    return kind === SESSION_END_NODE_KIND;
}

// The fork gutter cell (mockup buildGraphCell): the lane-1 rail tinted with the row's session
// color; rows inside a computeGraphLaneRuns run add the lane-2 rail (fork curve on the run's
// first row, cut-off on its last) and put their dot on lane 2 (CSS colors it).
function buildGraphCell(kind: TimelineNode["kind"], index: number, laneRuns: { startIndex: number; endIndex: number }[], sessionColor: string): HTMLElement {
    const cell = el("div", { class: "tl-graph" });
    cell.append(el("span", { class: "g-rail g-l1", style: `background:${sessionColor}` }));
    const run = laneRuns.find((candidate) => index >= candidate.startIndex && index <= candidate.endIndex);
    if (run !== undefined) {
        const lane2 = el("span", { class: "g-rail g-l2" });
        if (index === run.startIndex) {
            lane2.classList.add("g-start");
            cell.append(el("span", { class: "g-fork" }));
        }
        if (index === run.endIndex) {
            lane2.classList.add("g-end");
        }
        cell.append(lane2);
    }
    const dot = el("span", { class: `g-dot ${run === undefined ? "g-l1" : "g-l2"}` });
    if (checkDotIsHollow(kind)) {
        dot.classList.add("g-hollow");
        dot.style.color = sessionColor;                    // .g-hollow's ring is currentColor
    } else if (run === undefined) {
        dot.style.background = sessionColor;               // lane-2 dots keep the CSS lane color
    }
    cell.append(dot);
    return cell;
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
    // fetchDocument hid its indicator on resolve, but the synchronous view-model build below runs over
    // the whole (large) document — that is the unresponsive, blank gap the user sees between
    // "transferring document" and "Building timeline". Put an indeterminate indicator back up and yield
    // one frame so the browser paints it first; the shimmer is transform-based, so it keeps animating on
    // the compositor even while this thread is blocked building the view-model. (item 82)
    showLoadingProgress("preparing timeline…", Number.NaN);
    await waitForNextAnimationFrame();
    const { nodes } = buildTurnTimelineViewModel(reconstructionDocument);
    const listing = (await fetchJson<WireProjectListing[]>("/api/projects")).find((entry) => entry.name === project);
    // (item 66) old local closure, lifted into the exported view-model helper findJsonlForSession:
    // const findJsonlForSession = (sessionId: string | undefined) =>
    //     listing?.jsonlFiles.find((file) => file.fileName.startsWith(sessionId!))?.fileName;

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

    // The pane header's summary + expand-all button are STATIC skeleton elements outside
    // `container` (index.html); each render rewrites them.
    const numberedNodes = nodes.filter((node) => node.stepNumber !== undefined);
    const touchedCount = new Set(nodes.flatMap((node) => (node.fileChanges ?? []).map((change) => change.path))).size;
    document.getElementById("timeline-summary")!.textContent =
        `${sessionColors.size} session${sessionColors.size === 1 ? "" : "s"} · ${numberedNodes.length} steps · ${touchedCount} files`;

    // ── selection state + bar ──
    const pickBoxes = new Map<number, HTMLInputElement>();      // node index -> checkbox
    const nodeRows = new Map<number, HTMLElement>();       // node index -> row element
    const previewPanes = new Map<number, HTMLElement>();   // node index -> its fallback-message pane
    const expandableRows: HTMLElement[] = [];              // rows #toggle-all expands/collapses
    let selectedRow: HTMLElement | null = null;
    let fileNavReferenceIndex = -1;                        // last selected/jumped row (task 85 Prev/Next)
    let refreshFileNavButtons = (): void => {};            // no-op until the header buttons are wired below
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
    // The selectbar is the static #timeline-selectbar strip under the rows (fork layout);
    // visibility is the mockup's .visible class, driven by updateSelectbar.
    const selectbar = document.getElementById("timeline-selectbar")!;
    selectbar.hidden = false;
    selectbar.classList.remove("visible");

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

    // (item 84) old: fetchStepFiles — one step's { path: content } map, showFilePreview's only
    // data source ("state at step"). The Revision View reads a revision's content from the
    // file-history view model instead (buildFileHistoryViewModel, already in details.ts), so this
    // /api/step-files call has no caller left. The endpoint itself still serves the server.
    // const fetchStepFiles = async (stepNumber: number): Promise<Record<string, string>> => {
    //     const params = buildConsentParams();
    //     params.set("step", String(stepNumber));
    //     return fetchJson<Record<string, string>>(`/api/step-files?${params}`);
    // };

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
        selectbar.classList.toggle("visible", pickedIndexes.length > 0);
        if (pickedIndexes.length > 0) {
            const summary = computeRangeSummary(nodes, pickedIndexes);
            barText.textContent =
                `${summary.stepCount} step${summary.stepCount === 1 ? "" : "s"} picked · ` +
                `${summary.filePaths.length} file${summary.filePaths.length === 1 ? "" : "s"}`;
        }
    };

    // replaceChildren (not append): the selectbar is static, re-renders must not stack contents.
    selectbar.replaceChildren(barText, ruleHint, el("button", {
        class: "toolbar-btn",
        text: "Export .patch",
        onclick: async () => {
            const summary = computeRangeSummary(nodes, pickedIndexes);
            const patchText = await fetchRangePatch(summary.fromStepIndex, summary.toStepIndex);
            downloadText(`${project}-steps-${summary.fromStepIndex}-${summary.toStepIndex}.patch`, patchText);
        },
    }), el("button", {
        class: "toolbar-btn",
        text: "Clear",
        onclick: () => {
            for (const box of pickBoxes.values()) {
                box.checked = false;
            }
            updateSelectbar();
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

    // Item 43: keep the timeline's selected bubble on the step owning the inspector's shown
    // line, so Prev/Next (and in-inspector jumps) walk the selection along the timeline. A
    // line owned by no node (summary records, snapshot lines with re-stamped changeIds)
    // keeps the current selection.
    const syncSelectedRowToShownLine = (rawLines: string[], shownLine: number): void => {
        const nodeIndex = findTimelineNodeIndexForRawLine(nodes, rawLines[shownLine] ?? "");
        if (nodeIndex === -1) {
            return;
        }
        const row = nodeRows.get(nodeIndex);
        if (row === undefined) {
            return;
        }
        if (row === selectedRow) {
            return;
        }
        if (selectedRow !== null) {
            selectedRow.classList.remove("selected");
        }
        selectedRow = row;
        row.classList.add("selected");
        // Item 45: bring the newly selected row into view; "nearest" scrolls only when the
        // row is outside the pane, so in-view steps don't jump. Selection-swap + scroll ONLY —
        // the details pane already shows the inspector that drove this sync (item 66).
        row.scrollIntoView({ block: "nearest" });
    };

    // Every timeline transcript-inspector open routes through this wrapper so line changes
    // inside the inspector sync the timeline selection (item 43).
    const openTranscriptInspectorSynced = (options: { jsonlName: string; rawLines: string[]; line: number }): void => {
        openTranscriptInspector({
            ...options,
            onJumpToLine: (shownLine) => syncSelectedRowToShownLine(options.rawLines, shownLine),
        });
    };

    // ── inspector jump (requirement 6): turn -> first resolvable changeId -> (jsonl, line) ──
    const openStepInspector = async (node: TurnNode, previewPane: HTMLElement): Promise<void> => {
        for (const snapshot of node.snapshots) {
            for (const changeId of snapshot.changeIds) {
                const located = await findTranscriptLineForChangeId(changeId);
                if (located !== undefined) {
                    openTranscriptInspectorSynced(located);
                    return;
                }
            }
        }
        // Synthetic changeIds (user-edit / evidence splices) match no JSONL line — say so instead
        // of opening the inspector on nothing.
        previewPane.classList.remove("hidden");
        previewPane.replaceChildren(el("div", { class: "muted", text: "no transcript line for this step (synthetic change id)" }));
    };

    // Clicking a turn opens the transcript drawer on the message's OWN JSONL line (the record
    // embedding its uuid — findLineForChangeId is a generic substring scan, so it resolves uuids
    // too). Synthetic agent turns carry no uuid and fall back to the changeId scan above.
    const openTurnInspector = async (node: TurnNode, previewPane: HTMLElement): Promise<void> => {
        if (node.uuid === undefined) {
            openStepInspector(node, previewPane);
            return;
        }
        const jsonlName = findJsonlForSession(listing, node.sessionId);
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
        openTranscriptInspectorSynced({ jsonlName, rawLines, line });
    };

    // The chip whose file the Details pane is showing stays highlighted (item 84).
    const markChipActive = (chipElement: HTMLElement): void => {
        clearActiveChip();
        activeChip = chipElement;
        chipElement.classList.add("active");
    };

    // (item 84) old: toggleDrawerButton — click-again-to-close, shared by the two drawer-opening
    // file buttons. Retired with showFilePreview/showRevisionDiff: every chip button now opens the
    // Revision View, and the Files-treeview entry — which the chip now IS — never closed on a
    // second click. markChipActive above keeps the highlight half.
    // const toggleDrawerButton = (chipElement: HTMLElement): boolean => {
    //     const pane = document.getElementById("inspector")!;
    //     if (chipElement === activeChip) {
    //         if (!pane.classList.contains("hidden")) {
    //             pane.classList.add("hidden");
    //             clearActiveChip();
    //             return true;
    //         }
    //     }
    //     clearActiveChip();
    //     activeChip = chipElement;
    //     chipElement.classList.add("active");
    //     return false;
    // };

    // (item 84) old: showFilePreview — the chip's own file renderer. It painted #details-right-body
    // ONLY and left #details-left showing the previously-selected row's file list: stale, and
    // unrelated to the clicked chip. The chip now calls renderDetailsFileMode, which owns BOTH
    // columns, so the second renderer is gone rather than rebuilt as a lookalike. Its two branches
    // moved: state-at-step → the rev card's "Show content"; the picked-range diff → the Revision
    // View's contiguous multi-card selection (details.ts showRangeDiff).
    // NOTE: chip-click-while-steps-are-picked is NOT rebuilt — see plans/item84-unify-bottom-pane.md.
    // const showFilePreview = async (node: TurnNode, change: FileChange, chipElement: HTMLElement): Promise<void> => {
    //     if (toggleDrawerButton(chipElement)) {
    //         return;
    //     }
    //     const drawer = openInspectorPane();
    //     document.getElementById("inspector")!.classList.add("file-preview-drawer");
    //     if (pickedIndexes.length > 0) {
    //         const summary = computeRangeSummary(nodes, pickedIndexes);
    //         const patchText = await fetchRangePatch(summary.fromStepIndex, summary.toStepIndex);
    //         const block = splitPatchByFile(patchText).find((entry) =>
    //             change.path === entry.path || change.path.endsWith(`/${entry.path}`));
    //         const diffPane = el("div", { class: "timeline-preview" });
    //         renderDiffText(diffPane, block?.block ?? "(file unchanged across the picked range)");
    //         const pickedNumbers = pickedIndexes.map((picked) => nodes[picked]!.stepNumber!);
    //         drawer.append(
    //             el("div", { class: "timeline-preview-head", text: `${change.path} · diff before step ${Math.min(...pickedNumbers)} → at step ${Math.max(...pickedNumbers)}` }),
    //             diffPane,
    //         );
    //         return;
    //     }
    //     // The turn's state of the file at its representative step, fetched on demand (skeleton steps
    //     // carry no files). undefined when no file lives at that path at this step.
    //     const filesAtStep = await fetchStepFiles(node.stepNumber!);
    //     const content = filesAtStep[change.path];
    //     // (item 49) old: el("div", { class: "timeline-preview", text: content ?? "(no snapshot carries this file at this step)" })
    //     const contentPane = el("div", { class: "timeline-preview" });
    //     if (content === undefined) {
    //         contentPane.textContent = "(no snapshot carries this file at this step)";
    //     } else {
    //         renderCodeInto(contentPane, content, change.path);
    //     }
    //     drawer.append(
    //         el("div", { class: "timeline-preview-head" }, [
    //             el("span", { text: `${change.path} · state at step ${node.stepNumber}` }),
    //             el("button", {
    //                 class: "row-btn",
    //                 text: "Export file state",
    //                 onclick: () => downloadText(`${computeBaseName(change.path)}.step${node.stepNumber}`, content ?? ""),
    //             }),
    //         ]),
    //         contentPane,
    //     );
    // };

    // (item 66) the dead item-47 findRevisionResultLine/showRevisionJson comment block and the
    // dead item-55 showGitOperationJson helper are deleted here — see the archive copy.

    // { } button on a tool-call row (item 55): the tool_use record's line (or the hook attachment
    // that rewrote the command), matched by the record's OWN uuid field. The inspector's
    // line-sync then selects the row itself.
    const openToolCallLine = async (node: ToolCallNode, previewPane: HTMLElement): Promise<void> => {
        const jsonlName = node.sessionId === undefined ? undefined : findJsonlForSession(listing, node.sessionId);
        if (jsonlName === undefined) {
            previewPane.classList.remove("hidden");
            previewPane.replaceChildren(el("div", { class: "muted", text: "no transcript line for this tool call" }));
            return;
        }
        const rawLines = await fetchRawRecords(project, jsonlName);
        const line = findLineForChangeId(rawLines, `"uuid":"${node.uuid}"`);
        if (line < 0) {
            previewPane.classList.remove("hidden");
            previewPane.replaceChildren(el("div", { class: "muted", text: "no transcript line for this tool call" }));
            return;
        }
        openTranscriptInspectorSynced({ jsonlName, rawLines, line });
    };

    // (item 84) old: showRevisionDiff — the +/- button's own revision-diff renderer, and a second
    // implementation of details.ts's showRevisionDiffInDetails: same /api/diff?mode=revisions call,
    // same splitDiffBlocks, same computeRevisionDiffFallbackText, two hand-rolled changeId lookups,
    // two fetch caches. +/- now calls renderDetailsFileMode focused on its revision, whose card
    // default render IS this diff — the details.ts copy survives as the single implementation.
    // const showRevisionDiff = async (change: FileChange, chipElement: HTMLElement): Promise<void> => {
    //     if (toggleDrawerButton(chipElement)) {
    //         return;
    //     }
    //     const drawer = openInspectorPane();
    //     document.getElementById("inspector")!.classList.add("file-preview-drawer");
    //     const history = reconstructionDocument.filesTouched.find((entry) =>
    //         entry.revisions.some((revision) => revision.changeId === change.changeId));
    //     if (history === undefined) {
    //         drawer.append(el("div", { class: "muted", text: "no surviving revision for this change (rewound branch)" }));
    //         return;
    //     }
    //     const revisionNumber = history.revisions.findIndex((revision) => revision.changeId === change.changeId);
    //     const params = buildConsentParams();
    //     params.set("file", history.target);
    //     params.set("mode", "revisions");
    //     const blocks = splitDiffBlocks(await fetchText(`/api/diff?${params}`));
    //     const diffPane = el("div", { class: "timeline-preview" });
    //     // (item 47) old: renderDiffText(diffPane, blocks[revisionNumber] ?? "(no diff block for this revision)");
    //     const fallbackText = computeRevisionDiffFallbackText(blocks[revisionNumber], change);
    //     if (fallbackText === undefined) {
    //         renderDiffText(diffPane, blocks[revisionNumber]!);
    //     } else {
    //         diffPane.append(el("div", { class: "muted", text: fallbackText }));
    //     }
    //     drawer.append(
    //         el("div", { class: "timeline-preview-head", text: `${change.path} · diff for revision ${revisionNumber + 1} (vs previous)` }),
    //         diffPane,
    //     );
    // };

    // One file's button row: [ name ] [{ }] [+/-] [⤷] <TS> L:n — revision state, the file's OWN
    // causing line, the revision's computed diff, the snapshot jump, and the causing line's
    // timestamp + label (item 55). The action buttons need a resolvable changeId.
    // item 84: every button here is a deep-link into THE Revision View (details.ts's
    // renderDetailsFileMode) — button X ≡ `click the treeview entry → click this revision's card →
    // click the card's X`. They differ only in the right-column mode they ask for. ⤷ is the
    // exception and is deliberately untouched: it navigates to the File History route (a separate
    // surface), and its presence/absence is the signal that a revision HAS a snapshot.
    const renderFileButtonRow = (node: TurnNode, nodeIndex: number, change: FileChange, previewPane: HTMLElement): HTMLElement => {
        const causingLocation = chipLineLocations.get(`${nodeIndex}:${change.path}`);
        const buttons = [renderFileChip(change, (event: Event) => {
            event.stopPropagation();
            markChipActive(event.currentTarget as HTMLElement);
            // (item 84) old: showFilePreview(node, change, event.currentTarget as HTMLElement);
            // A chip with no changeId names no revision — open on #1, the treeview's own default.
            if (change.changeId === undefined) {
                renderDetailsFileMode(change.path, detailsContext);
                return;
            }
            renderDetailsFileMode(change.path, detailsContext, { changeId: change.changeId, mode: RevisionViewMode.content });
        })];
        if (change.changeId !== undefined) {
            // Narrowed once: TypeScript does not carry a property narrowing into the callbacks
            // below, and the project's style bans the non-null assertion that would paper over it.
            const changeId = change.changeId;
            buttons.push(el("span", {
                class: "timeline-chip timeline-chip-action",
                title: "Show this file's causing record in inspector",
                text: "{ }",
                onclick: (event: Event) => {
                    event.stopPropagation();
                    // (item 55, closing item 53) old: openTurnInspector(node, previewPane); —
                    // reverted item 47b: the chip opens its file's OWN causing line (e.g. the
                    // Write tool_use), user-decided; synthetic changeIds keep the turn fallback.
                    // (item 84) old: openTranscriptInspectorSynced(causingLocation); — the record
                    // now paints inside the Revision View, rev cards standing. The fallback stays
                    // HERE: it needs `node`, which the Revision View has no notion of.
                    if (causingLocation === undefined) {
                        openTurnInspector(node, previewPane);
                        return;
                    }
                    markChipActive(event.currentTarget as HTMLElement);
                    renderDetailsFileMode(change.path, detailsContext, { changeId, mode: RevisionViewMode.record });
                },
            }));
            buttons.push(el("span", {
                class: "timeline-chip timeline-chip-action",
                title: "Show Diff in Inspector",
                text: "+/-",
                onclick: (event: Event) => {
                    event.stopPropagation();
                    markChipActive(event.currentTarget as HTMLElement);
                    // (item 84) old: showRevisionDiff(change, event.currentTarget as HTMLElement);
                    // Clicking a card IS how you view its diff — diff is the card's own default.
                    renderDetailsFileMode(change.path, detailsContext, { changeId, mode: RevisionViewMode.diff });
                },
            }));
            // The route is computed as a PRESENCE TEST, not to navigate: it resolves to undefined
            // when this revision has no File History Snapshot, and the button's absence is how the
            // row says so (user-decided). Not every revision has one.
            const jumpRoute = computeSnapshotJumpRoute(project, reconstructionDocument.filesTouched, change);
            if (jumpRoute !== undefined) {
                buttons.push(el("span", {
                    class: "timeline-chip timeline-chip-action",
                    title: "Show this revision's File History Snapshot",
                    text: "⤷",
                    onclick: (event: Event) => {
                        event.stopPropagation();
                        markChipActive(event.currentTarget as HTMLElement);
                        // (item 84 follow-up) old: location.hash = jumpRoute; — navigating to the
                        // File History route reloaded the whole page (progress bar and all) just to
                        // show a revision the bottom pane can already show. Same destination as the
                        // chip name, in the pane, no page load.
                        renderDetailsFileMode(change.path, detailsContext, { changeId, mode: RevisionViewMode.content });
                    },
                }));
            }
        }
        // The chip row's meta (item 55): the snapshot's timestamp, plus the causing line's
        // L:n label when it resolved (same numbering as the details pane).
        buttons.push(el("span", { class: "timeline-time", text: new Date(change.when).toLocaleTimeString() }));
        if (causingLocation !== undefined) {
            buttons.push(el("span", {
                class: "timeline-time",
                text: `L:${causingLocation.line} (of ${causingLocation.rawLines.length - 1})`,
            }));
        }
        return el("div", { class: "timeline-chip-row" }, buttons);
    };

    // Each turn's own JSONL line label ("L:<n> (of <total>)", numbered like the details pane),
    // resolved up front — one cached raw fetch per session file.
    const lineLabels = new Map<number, string>();
    for (const [index, node] of nodes.entries()) {
        if (node.uuid === undefined) {
            continue;
        }
        const jsonlName = node.sessionId === undefined ? undefined : findJsonlForSession(listing, node.sessionId);
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

    // Per-chip causing-line locations (item 55): each chip's { } opens its file's OWN causing
    // record (the Write/Edit tool_use line — reverting item 47b, user-decided) and its row shows
    // that line's L:n label. Synthetic changeIds resolve to no entry; their chips fall back to
    // the turn's own message line. Keyed `${nodeIndex}:${path}` (chips are deduped by path).
    const chipLineLocations = new Map<string, TranscriptLocation>();
    for (const [index, node] of nodes.entries()) {
        for (const change of node.fileChanges ?? []) {
            if (change.changeId === undefined) {
                continue;
            }
            const located = await findTranscriptLineForChangeId(change.changeId);
            if (located === undefined) {
                continue;
            }
            chipLineLocations.set(`${index}:${change.path}`, located);
        }
    }

    // The session transcript at its LAST line — a session-end row's opener (the old session-
    // header link behavior, re-homed onto the row's { } button).
    const openSessionEndTranscript = async (node: TimelineNode, previewPane: HTMLElement): Promise<void> => {
        const jsonlName = findJsonlForSession(listing, node.sessionId);
        if (jsonlName === undefined) {
            previewPane.classList.remove("hidden");
            previewPane.replaceChildren(el("div", { class: "muted", text: "no transcript for this session" }));
            return;
        }
        const rawLines = await fetchRawRecords(project, jsonlName);
        openTranscriptInspectorSynced({ jsonlName, rawLines, line: rawLines.length - 1 });
    };

    // The per-kind inspector opener shared by the { } buttons and the details pane
    // (DetailsContext.openNodeInspector). Deliberately does NOT re-call selectTimelineRow —
    // the details pane calls this while rendering, and reopening the selection would loop.
    const openNodeInspector = (nodeIndex: number): void => {
        const node = nodes[nodeIndex]!;
        const previewPane = previewPanes.get(nodeIndex)!;
        if (node.kind === TOOL_CALL_NODE_KIND) {
            void openToolCallLine(node, previewPane);
            return;
        }
        if (node.kind === SESSION_END_NODE_KIND) {
            void openSessionEndTranscript(node, previewPane);
            return;
        }
        if (node.kind === COMMIT_NODE_KIND) {
            return;                                        // a commit is a repo event: no JSONL record
        }
        void openTurnInspector(node, previewPane);
    };

    // Restart the row-flash animation (mockup jumpToTimelineRow's remove/reflow/add dance).
    const flashRowElement = (row: HTMLElement): void => {
        row.classList.remove("flash");
        void row.offsetWidth;                              // restart the CSS animation
        row.classList.add("flash");
        setTimeout(() => row.classList.remove("flash"), 1300);
    };

    // Sidebar session clicks and the session-anchor route land here: scroll + flash the row.
    const jumpToTimelineRow = (nodeIndex: number): void => {
        const row = nodeRows.get(nodeIndex);
        if (row === undefined) {
            return;
        }
        row.scrollIntoView({ block: "start" });
        flashRowElement(row);
    };

    // Row selection (mockup selectRow): swap .selected, re-derive the commit-contribution
    // highlight, render the matching details mode, THEN center the row — the details render
    // reflows the panes, so centering must run against the post-render layout (item 50).
    async function selectTimelineRow(nodeIndex: number): Promise<void> {
        const row = nodeRows.get(nodeIndex);
        if (row === undefined) {
            return;
        }
        if (selectedRow !== null) {
            selectedRow.classList.remove("selected");
        }
        selectedRow = row;
        fileNavReferenceIndex = nodeIndex;                 // Prev/Next walk from the manual selection
        refreshFileNavButtons();
        row.classList.add("selected");
        for (const other of nodeRows.values()) {
            other.classList.remove("contrib");
        }
        // The details pane leaves file mode. Only the Files sidebar's tree is cleared — the
        // "Files touched" tree this row is about to render lives in #details-left and owns its own
        // selection (item 84).
        clearFileSelectionIn(document.getElementById("drawer")!);
        const node = nodes[nodeIndex]!;
        if (node.kind === COMMIT_NODE_KIND) {
            for (const contributingIndex of findContributingNodeIndexes(nodes, nodeIndex)) {
                nodeRows.get(contributingIndex)?.classList.add("contrib");
            }
            await renderDetailsCommitMode(node, nodeIndex, detailsContext);
        } else {
            await renderDetailsMessageMode(node, nodeIndex, detailsContext);
        }
        row.scrollIntoView({ block: "center" });
    }

    // Built once per render; the details pane drives the timeline back through these callbacks.
    const detailsContext: DetailsContext = {
        project,
        document: reconstructionDocument,
        nodes,
        openNodeInspector,
        selectTimelineRow: (nodeIndex: number) => {
            void selectTimelineRow(nodeIndex).then(() => {
                const row = nodeRows.get(nodeIndex);
                if (row !== undefined) {
                    flashRowElement(row);
                }
            });
        },
        // item 84: a rev card's { } opens its revision's causing record. openInspectorPane fills
        // the right column ONLY, so the rev cards on the left stay standing — that is exactly
        // the "revision cards still shown" the item asks for, at no cost.
        openRecordForChangeId: (changeId: string) => {
            void (async () => {
                const located = await findTranscriptLineForChangeId(changeId);
                // Synthetic changeIds (user-edit / evidence splices) match no JSONL line. Say so
                // in the right column rather than opening the inspector on nothing.
                if (located === undefined) {
                    openInspectorPane().append(
                        el("div", { class: "muted", text: "no transcript line for this revision (synthetic change id)" }),
                    );
                    return;
                }
                openTranscriptInspectorSynced(located);
            })();
        },
        fetchRangePatch,
    };

    // ── rows: one .tl-row per node (mockup renderTimeline) ──
    const laneRuns = computeGraphLaneRuns(nodes);
    // Session-start markers: an interleaved multi-JSONL project otherwise never shows where
    // a later session began (item 66 follow-up, user-reported on s58).
    const sessionStartsByIndex = new Map(
        findSessionStartIndexes(nodes).map((start) => [start.nodeIndex, start.sessionId]),
    );
    // Large timelines build in yielding batches behind a centered progress overlay so the
    // multi-second synchronous DOM build (500+ rows) no longer looks frozen (item 78). Small
    // timelines take neither overlay nor yield — the loop stays a straight synchronous pass.
    // Rows accumulate in a DETACHED fragment and are appended to `container` only once the whole
    // build finishes: the half-built timeline must never show behind the overlay — the progress
    // bar stands alone until the timeline is ready (item 78 follow-up, user-reported).
    const showBuildProgress = checkTimelineNeedsProgressOverlay(nodes.length);
    const rowFragment = document.createDocumentFragment();
    if (showBuildProgress) {
        showLoadingProgress(computeTimelineBuildProgressLabel(0, nodes.length), computeTimelineProgressFraction(0, nodes.length));
        // Yield once so the overlay paints before the (blocking) first batch.
        await waitForNextAnimationFrame();
    }
    try {
    for (const [index, node] of nodes.entries()) {
        const sessionColor = node.sessionId === undefined
            ? ORPHAN_LANE_COLOR
            : sessionColors.get(node.sessionId) ?? ORPHAN_LANE_COLOR;

        const startedSessionId = sessionStartsByIndex.get(index);
        if (startedSessionId !== undefined) {
            const marker = el("div", { class: "tl-session-start" });
            marker.style.color = sessionColor;
            marker.append(el("span", {
                class: "tl-session-start-label",
                text: computeSessionStartLabel(reconstructionDocument.sessionTitles, startedSessionId),
            }));
            rowFragment.append(marker);
        }

        const previewPane = el("div", { class: "hidden" });
        previewPanes.set(index, previewPane);
        const row = el("div", { class: `tl-row${node.isOrphaned === true ? " orphan" : ""}` });
        row.append(buildGraphCell(node.kind, index, laneRuns, sessionColor));
        const main = el("div", { class: "tl-main" });
        const line = el("div", { class: "tl-line" });

        // Pick cell (existing pick model: only surviving agent turns with snapshots).
        const pickCell = el("span", { class: "tl-pick" });
        if (checkNodeIsPickable(node)) {
            const pick = el("input", { type: "checkbox" }) as HTMLInputElement;
            pickBoxes.set(index, pick);
            pick.addEventListener("click", (event) => event.stopPropagation()); // picking must not change selection
            pick.addEventListener("change", () => {
                const candidate = [...pickBoxes.entries()].filter(([, box]) => box.checked).map(([i]) => i);
                if (!checkPickIsLegal(nodes, candidate)) {
                    pick.checked = !pick.checked;
                    flashRule();
                }
                updateSelectbar();
            });
            pickCell.append(pick);
        }
        line.append(pickCell);

        if (node.kind === COMMIT_NODE_KIND) {
            line.append(el("span", { class: "tl-tri", text: "" }));   // spacer keeps columns aligned
            line.append(el("span", { class: "commit-label", text: "git commit" }));
            if (node.resultHash !== undefined) {                       // no hash → no pill (a blank "—" reads broken)
                line.append(el("span", { class: "commit-pill", text: node.resultHash }));
            }
        } else if (checkRowIsExpandable(node)) {
            const tri = el("span", { class: "tl-tri", text: "▸" });
            tri.addEventListener("click", (event) => {
                event.stopPropagation();                   // expansion must not change selection
                row.classList.toggle("expanded");
                updateToggleLabel();
            });
            line.append(tri);
        } else {
            line.append(el("span", { class: "tl-tri", text: "" }));   // session ends stay thin
        }
        const rolePillLabel = computeRolePillLabel(node);
        if (rolePillLabel !== undefined) {
            line.append(el("span", { class: `role-pill ${computeRolePillClass(rolePillLabel)}`, text: rolePillLabel }));
        }
        line.append(el("span", {
            class: `tl-text ${computeRoleClass(node.kind)}${node.isSystem === true ? " system" : ""}`,
            text: computeRowSummaryText(node),
        }));
        line.append(el("span", { class: "tl-ts", text: new Date(node.when).toLocaleString() }));
        line.append(el("span", { class: "tl-pos", text: lineLabels.get(index) ?? "" }));
        line.append(el("span", { class: "tl-uuid", text: node.sessionId === undefined ? "" : computeSessionShortLabel(node.sessionId) }));
        if (node.kind !== COMMIT_NODE_KIND) {              // commits are repo events: no JSONL record
            line.append(el("button", {
                class: "tl-json",
                text: "{ }",
                title: "Show this row's JSONL record in the details pane",
                onclick: async (event: Event) => {
                    event.stopPropagation();
                    await selectTimelineRow(index);
                    openNodeInspector(index);
                },
            }));
        }
        line.addEventListener("click", () => {
            void selectTimelineRow(index);
        });
        main.append(line);

        // Expandable rows carry the mockup bubble: the full text, plus the file-chips block on
        // agent turns (the kept renderFileButtonRow machinery).
        if (checkRowIsExpandable(node)) {
            const bubble = el("div", { class: `tl-bubble ${computeRoleClass(node.kind)}` });
            bubble.append(node.kind === TOOL_CALL_NODE_KIND ? `${node.toolName}(${node.summary})` : node.text ?? "");
            if (node.kind === AGENT_TURN_NODE_KIND) {
                bubble.append(el("div", { class: "timeline-chips" },
                    node.fileChanges!.map((change) => renderFileButtonRow(node, index, change, previewPane))));
            }
            main.append(bubble);
            expandableRows.push(row);
        }
        main.append(previewPane);
        row.append(main);
        rowFragment.append(row);
        nodeRows.set(index, row);
        if (showBuildProgress && (index + 1) % TIMELINE_BUILD_BATCH_SIZE === 0) {
            showLoadingProgress(computeTimelineBuildProgressLabel(index + 1, nodes.length), computeTimelineProgressFraction(index + 1, nodes.length));
            await waitForNextAnimationFrame();
        }
    }
    // Reveal the finished timeline in one append — the first moment any row hits the live DOM.
    container.append(rowFragment);
    } finally {
        hideLoadingProgress();
    }
    // ── Expand All / Collapse All (mockup updateToggleLabel). #toggle-all is a static skeleton
    // element outside `container`; onclick property assignment (not addEventListener) so
    // re-renders never stack handlers. ──
    const toggleAllButton = document.getElementById("toggle-all") as HTMLButtonElement;
    const updateToggleLabel = (): void => {
        const anyCollapsed = expandableRows.some((expandable) => !expandable.classList.contains("expanded"));
        toggleAllButton.textContent = anyCollapsed ? "Expand All" : "Collapse All";
    };
    toggleAllButton.onclick = () => {
        const anyCollapsed = expandableRows.some((expandable) => !expandable.classList.contains("expanded"));
        for (const expandable of expandableRows) {
            expandable.classList.toggle("expanded", anyCollapsed);
        }
        updateToggleLabel();
    };
    updateToggleLabel();

    // ── header Prev/Next over file-touching agent turns (task 85). Expanding IS the task's
    // "click the triangle": the chips live in the bubble. onclick assignment, like #toggle-all,
    // so re-renders never stack handlers. A button disables when no candidate row exists in
    // its direction; selectTimelineRow re-enables/disables both on every selection. ──
    const filesPrevButton = document.getElementById("files-prev") as HTMLButtonElement;
    const filesNextButton = document.getElementById("files-next") as HTMLButtonElement;
    refreshFileNavButtons = () => {
        filesPrevButton.disabled = findAdjacentFileTouchedIndex(nodes, fileNavReferenceIndex, -1) === undefined;
        filesNextButton.disabled = findAdjacentFileTouchedIndex(nodes, fileNavReferenceIndex, 1) === undefined;
    };
    const jumpToAdjacentFileTouchedRow = (direction: 1 | -1): void => {
        const target = findAdjacentFileTouchedIndex(nodes, fileNavReferenceIndex, direction);
        if (target === undefined) {
            return;
        }
        nodeRows.get(target)!.classList.add("expanded");   // expand BEFORE selecting so centering sees the bubble
        updateToggleLabel();
        void selectTimelineRow(target);                    // selects + renders details + centers; also updates fileNavReferenceIndex + button states
    };
    filesPrevButton.onclick = () => jumpToAdjacentFileTouchedRow(-1);
    filesNextButton.onclick = () => jumpToAdjacentFileTouchedRow(1);
    refreshFileNavButtons();

    // ── fork sidebar (phase 6): the Sessions + Files panes in the static #drawer ──
    renderForkSidebar(
        document.getElementById("drawer")!,
        buildSessionsSidebarViewModel(nodes, listing),
        buildFileTree(buildFilesSidebarViewModel(reconstructionDocument)),
        {
            onSessionClick: jumpToTimelineRow,
            onFileClick: (target: string) => {
                void renderDetailsFileMode(target, detailsContext);
            },
        },
    );

    // (item 66) GONE with the fork port (see webapp/archive/timeline-pre-item66.ts): the
    // background click-to-close handler, the SVG drawRail + resize listener, the per-session
    // header rows, and the orphan divider — the CSS gutter and the details pane replace them.

    // ── session anchor (…/timeline/session/<jsonl>): flash-scroll the session's first row ──
    if (anchorJsonl !== undefined && anchorLine === undefined) {
        const firstNodeIndex = nodes.findIndex((candidate) =>
            candidate.sessionId !== undefined && anchorJsonl.startsWith(candidate.sessionId));
        if (firstNodeIndex >= 0) {
            jumpToTimelineRow(firstNodeIndex);
        }
    }

    // Line anchor (…/at/<n>): select the owning row, open the inspector on that exact line
    // (openStepInspector would re-derive first-matching changeId and could land elsewhere),
    // and only THEN center-scroll — the details open reflows the panes (item 37 ordering).
    if (anchorLine !== undefined) {
        const rawLines = await fetchRawRecords(project, anchorJsonl!);
        const rawLineIndex = Number(anchorLine);
        const nodeIndex = findTimelineNodeIndexForRawLine(nodes, rawLines[rawLineIndex] ?? "");
        if (nodeIndex >= 0) {
            await selectTimelineRow(nodeIndex);
        }
        openTranscriptInspectorSynced({ jsonlName: anchorJsonl!, rawLines, line: rawLineIndex });
        nodeRows.get(nodeIndex)?.scrollIntoView({ block: "center" });
    }
}
