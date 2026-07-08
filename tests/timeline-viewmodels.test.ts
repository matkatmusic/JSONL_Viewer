// Pure view-model tests for the revision-timeline view (webapp/views/timeline.js). Every test
// feeds the client's wire shape — JSON.parse(JSON.stringify(document)) — exactly what the browser
// sees after fetch. Role/kind assertions go through the vocabulary enum members (their values ARE
// the wire strings), never bare literals.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    buildTurnTimelineViewModel,
    computePickSegments,
    computeSnapshotJumpRoute,
    computeUnattributedStepTag,
    checkPickIsLegal,
    checkSelectionBlocksBackgroundClose,
    checkStepIsOrphaned,
    computeRangeSummary,
    findTimelineNodeIndexForRawLine,
    indexRevisionsByChangeId,
    splitPatchByFile,
    COMMIT_NODE_KIND,
    USER_TURN_NODE_KIND,
    AGENT_TURN_NODE_KIND,
    SESSION_END_NODE_KIND,
} from "../webapp/views/timeline.js";
import { routeToFileHistory } from "../webapp/app.js";
import { buildProjectDocument, renderRangePatch } from "../src/viewer_api.ts";
import { Path } from "../src/structures/domain.ts";
import { RecordType, EventKind, GitOperationKind } from "../src/structures/vocabulary.ts";
import { S2_JSONL, S45_JSONL, S40_JSONL_PATHS, S84_JSONL_PATHS, S85_JSONL_PATHS } from "./fixtures.ts";

// Built once per scenario — wire shape, shared read-only across tests.
const s84Document = JSON.parse(JSON.stringify(buildProjectDocument(S84_JSONL_PATHS, undefined)));
const s85Document = JSON.parse(JSON.stringify(buildProjectDocument(S85_JSONL_PATHS, undefined)));
const s2Document = JSON.parse(JSON.stringify(buildProjectDocument([new Path(S2_JSONL)], undefined)));
const s45Document = JSON.parse(JSON.stringify(buildProjectDocument([new Path(S45_JSONL)], undefined)));
const s40Document = JSON.parse(JSON.stringify(buildProjectDocument(S40_JSONL_PATHS, undefined)));

test("test_timeline_nodes_are_chronological_across_sessions", () => {
    // Scenario: a multi-agent project's nodes form ONE strictly chronological timeline, however
    // the sessions interleave (user-confirmed ordering decision).
    // Steps:
    // build the turn timeline for s84's unified document.
    // assert node timestamps are non-decreasing across the whole array.
    const { nodes } = buildTurnTimelineViewModel(s84Document);
    assert.ok(nodes.length > 0);
    for (let i = 1; i < nodes.length; i += 1) {
        assert.ok(nodes[i]!.when >= nodes[i - 1]!.when);
    }
});

test("test_timeline_nodes_carry_session_ids", () => {
    // Scenario: each turn node is attributed to the session whose message produced it.
    // Steps:
    // build s84's turn timeline; collect distinct sessionIds across agent turns.
    // assert at least 2 sessions appear (multi-agent scenario).
    const { nodes } = buildTurnTimelineViewModel(s84Document);
    const agentNodes = nodes.filter((node: { kind: string }) => node.kind === AGENT_TURN_NODE_KIND);
    const distinct = new Set(
        agentNodes.map((node: { sessionId?: string }) => node.sessionId).filter((id: string | undefined) => id !== undefined),
    );
    assert.ok(distinct.size >= 2);
});

test("test_s40_agent_turns_are_all_attributed_to_a_session", () => {
    // Scenario: every agent-turn node in the s40 timeline names the session whose
    // records produced it — no user-edit evidence step collapses into an
    // unattributed (sessionId === undefined) synthetic turn.
    // Steps:
    // build the turn timeline for s40's unified (two-session) document.
    const { nodes } = buildTurnTimelineViewModel(s40Document);
    // collect the agent-turn nodes.
    const agentTurns = nodes.filter((node: { kind: string }) => node.kind === AGENT_TURN_NODE_KIND);
    // assert none of them has an undefined sessionId.
    const unattributed = agentTurns.filter((node: { sessionId?: string }) => node.sessionId === undefined);
    assert.equal(unattributed.length, 0);
});

test("test_s40_each_session_key_forms_one_contiguous_run", () => {
    // Scenario: the s40 timeline lays each session out as ONE contiguous run of
    // nodes, so the render emits each session header exactly once and the rail
    // spine is unbroken. Walking nodes in order, the sequence of sessionId keys
    // (an undefined key counts as its own key, exactly as the header/rail render
    // keys off it) must have as many contiguous runs as there are distinct keys.
    // Steps:
    // build the turn timeline for s40's unified document.
    const { nodes } = buildTurnTimelineViewModel(s40Document);
    // reduce the node order to its sequence of session keys, then count contiguous
    // runs (a run boundary is where the key changes from the previous node).
    const sessionKeys = nodes.map((node: { sessionId?: string }) => node.sessionId ?? "undefined");
    let contiguousRuns = 0;
    let previousKey: string | undefined;
    for (const key of sessionKeys) {
        if (key !== previousKey) {
            contiguousRuns += 1;
            previousKey = key;
        }
    }
    // assert the number of runs equals the number of distinct keys (each key
    // appears in exactly one run — none is split by another).
    const distinctKeyCount = new Set(sessionKeys).size;
    assert.equal(contiguousRuns, distinctKeyCount);
});

test("test_timeline_includes_commit_nodes", () => {
    // Scenario: git commits appear as their own nodes, positioned after every step whose
    // timestamp precedes them (they become pick hard-stops in 3.2).
    // Steps:
    // build s85's turn timeline; assert at least one commit node exists.
    // for the first commit node, assert every earlier node's timestamp is <= its own.
    const { nodes } = buildTurnTimelineViewModel(s85Document);
    const commitIndex = nodes.findIndex((node: { kind: string }) => node.kind === COMMIT_NODE_KIND);
    assert.ok(commitIndex >= 0);
    for (let i = 0; i < commitIndex; i += 1) {
        assert.ok(nodes[i]!.when <= nodes[commitIndex]!.when);
    }
});

test("test_timeline_file_changes_carry_event_kinds", () => {
    // Scenario: a rename step's file chip carries the rename event kind and where the file came
    // from. Uses s2-move-file: s85's "moves" are engine-modeled as destination creations with no
    // rename revisions (see implementation notes), so the assertion runs against a true rename.
    // Steps:
    // build s2's turn timeline; find a fileChange with the rename kind.
    // assert it names both the renamed-from and renamed-to paths.
    const { nodes } = buildTurnTimelineViewModel(s2Document);
    const fileChanges = nodes
        .filter((node: { kind: string }) => node.kind === AGENT_TURN_NODE_KIND)
        .flatMap((node: { fileChanges: { path: string; eventKind: string; renamedFrom?: string }[] }) => node.fileChanges);
    const renameChange = fileChanges.find((change: { eventKind: string }) => change.eventKind === EventKind.rename);
    assert.ok(renameChange !== undefined);
    assert.ok(renameChange.renamedFrom !== undefined);
    assert.ok(renameChange.renamedFrom.endsWith("s2_original.py"));
    assert.ok(renameChange.path.endsWith("s2_moved.py"));
});

test("test_pick_crossing_commit_is_illegal", () => {
    // Scenario: git commit nodes are hard stops — a pick range can never cross one.
    // Steps:
    // build s85's turn timeline; locate its first commit node.
    // pick the nearest pickable node on each side of it.
    // assert the pick is illegal (and that the commit node itself sits in no segment).
    const { nodes } = buildTurnTimelineViewModel(s85Document);
    const segments = computePickSegments(nodes);
    const commitIndex = nodes.findIndex((node: { kind: string }) => node.kind === COMMIT_NODE_KIND);
    assert.ok(commitIndex >= 0);
    assert.equal(segments[commitIndex], null);
    let before = -1;
    for (let index = commitIndex - 1; index >= 0; index -= 1) {
        if (segments[index] !== null) {
            before = index;
            break;
        }
    }
    const after = segments.findIndex(
        (segment: number | null, index: number) => index > commitIndex && segment !== null,
    );
    assert.ok(before >= 0);
    assert.ok(after > commitIndex);
    assert.equal(checkPickIsLegal(nodes, [before, after]), false);
});

test("test_pick_skipping_orphaned_node_is_legal", () => {
    // Scenario: orphaned (rewound-branch) nodes are unpickable and transparent to contiguity —
    // picking the surviving nodes around one is legal.
    // Steps:
    // build s45's turn timeline (its rewound step lands BETWEEN surviving turns chronologically).
    // locate the orphaned agent turn; assert it sits in no segment.
    // pick the nearest pickable neighbor on each side of it; assert the pick is legal.
    const { nodes } = buildTurnTimelineViewModel(s45Document);
    const segments = computePickSegments(nodes);
    const orphanIndex = nodes.findIndex((node: { isOrphaned?: boolean }) => node.isOrphaned === true);
    assert.ok(orphanIndex > 0);
    assert.equal(segments[orphanIndex], null);
    let before = -1;
    for (let index = orphanIndex - 1; index >= 0; index -= 1) {
        if (segments[index] !== null) {
            before = index;
            break;
        }
    }
    const after = segments.findIndex(
        (segment: number | null, index: number) => index > orphanIndex && segment !== null,
    );
    assert.ok(before >= 0);
    assert.ok(after > orphanIndex);
    assert.equal(checkPickIsLegal(nodes, [before, after]), true);
});

test("test_noncontiguous_pick_is_illegal", () => {
    // Scenario: a pick with an unpicked PICKABLE node inside its span is not contiguous.
    // Steps:
    // build s84's turn timeline; find a segment holding three or more pickable nodes.
    // pick the first and third only (skipping the second); assert illegal.
    const { nodes } = buildTurnTimelineViewModel(s84Document);
    const segments = computePickSegments(nodes);
    const pickablesBySegment = new Map<number, number[]>();
    segments.forEach((segment: number | null, index: number) => {
        if (segment === null) {
            return;
        }
        pickablesBySegment.set(segment, [...(pickablesBySegment.get(segment) ?? []), index]);
    });
    const trio = [...pickablesBySegment.values()].find((indexes) => indexes.length >= 3);
    assert.ok(trio !== undefined);
    assert.equal(checkPickIsLegal(nodes, [trio[0]!, trio[2]!]), false);
});

test("test_single_pick_is_legal", () => {
    // Scenario: one picked pickable node is always a legal (degenerate) range.
    // Steps:
    // build s85's turn timeline; pick its first pickable node; assert legal.
    const { nodes } = buildTurnTimelineViewModel(s85Document);
    const segments = computePickSegments(nodes);
    const first = segments.findIndex((segment: number | null) => segment !== null);
    assert.ok(first >= 0);
    assert.equal(checkPickIsLegal(nodes, [first]), true);
});

test("test_range_summary_counts_distinct_files", () => {
    // Scenario: the selection bar's "N steps picked · M files" counts DISTINCT file paths across
    // the picked turn nodes.
    // Steps:
    // build s85's turn timeline; pick the first two pickable nodes (their fileChanges overlap on
    // none or some paths — the count must equal the union size computed independently here).
    const { nodes } = buildTurnTimelineViewModel(s85Document);
    const segments = computePickSegments(nodes);
    const picked: number[] = [];
    segments.forEach((segment: number | null, index: number) => {
        if (segment !== null && picked.length < 2) picked.push(index);
    });
    assert.equal(picked.length, 2);
    const summary = computeRangeSummary(nodes, picked);
    const expectedPaths = new Set(
        picked.flatMap((index) => nodes[index]!.fileChanges.map((change: { path: string }) => change.path)),
    );
    assert.equal(summary.stepCount, 2);
    assert.deepEqual(new Set(summary.filePaths), expectedPaths);
});

test("test_range_summary_spans_underlying_snapshots_of_picked_turns", () => {
    // Scenario: /api/range-patch still speaks snapshot indexes — a picked turn range maps to the
    // min..max snapshot index across ALL snapshots the picked turns own.
    // Steps:
    // build s2's turn timeline; pick the first two pickable turn nodes.
    const { nodes } = buildTurnTimelineViewModel(s2Document);
    const segments = computePickSegments(nodes);
    const picked: number[] = [];
    segments.forEach((segment: number | null, index: number) => {
        if (segment !== null && picked.length < 2) picked.push(index);
    });
    assert.equal(picked.length, 2);
    const summary = computeRangeSummary(nodes, picked);
    // the range spans the min..max snapshot index across BOTH nodes' snapshots.
    const snapshotIndexes = picked.flatMap((index) =>
        nodes[index]!.snapshots.map((snapshot: { index: number }) => snapshot.index));
    assert.ok(snapshotIndexes.length >= 2);
    assert.equal(summary.fromStepIndex, Math.min(...snapshotIndexes));
    assert.equal(summary.toStepIndex, Math.max(...snapshotIndexes));
});

test("test_pick_segments_skip_user_turns_and_session_ends", () => {
    // Scenario: only agent turns that own surviving snapshots are pickable — user prompts,
    // session ends, commits, and snapshot-less agent replies all sit in no segment.
    // Steps:
    // build s85's turn timeline and compute its pick segments.
    const { nodes } = buildTurnTimelineViewModel(s85Document);
    const segments = computePickSegments(nodes);
    nodes.forEach((node: { kind: string; snapshots?: { length: number } }, index: number) => {
        // every user-turn, session-end, and commit node is unpickable.
        if (node.kind !== AGENT_TURN_NODE_KIND) {
            assert.equal(segments[index], null);
            return;
        }
        // an agent reply that produced no file change is unpickable too.
        if (node.snapshots!.length === 0) {
            assert.equal(segments[index], null);
        }
    });
    // the check is not vacuous: pickable agent turns exist.
    assert.ok(segments.some((segment: number | null) => segment !== null));
});

test("test_split_patch_by_file_returns_one_block_per_file", () => {
    // Scenario: the range-diff inspector shows only the clicked file — the full patch splits on
    // `diff --git ` headers into one block per file, each keyed by its b/ path.
    // Steps:
    // render a real multi-file patch for s85's first three steps.
    // split it; assert one block per `diff --git` header, keys unique, and re-joining loses nothing.
    const rawS85Document = buildProjectDocument(S85_JSONL_PATHS, undefined);
    const patch = renderRangePatch(rawS85Document, 1, 3);
    const blocks = splitPatchByFile(patch);
    const headerCount = patch.split("\n").filter((line) => line.startsWith("diff --git ")).length;
    assert.ok(headerCount >= 2);
    assert.equal(blocks.length, headerCount);
    const paths = new Set(blocks.map((block: { path: string }) => block.path));
    assert.equal(paths.size, blocks.length);
    for (const block of blocks) {
        assert.ok(block.block.startsWith(`diff --git a/${block.path} b/${block.path}`));
    }
});

test("test_findTimelineNodeIndexForRawLine_finds_step_owning_line", () => {
    // Scenario: a raw JSONL line carries a snapshot's changeId verbatim (the same substring
    // convention findLineForChangeId uses in the other direction) — it resolves to the agent
    // turn OWNING that snapshot.
    // Steps:
    // build s2's turn timeline; take the first agent turn that owns a snapshot.
    const { nodes } = buildTurnTimelineViewModel(s2Document);
    const agentNodeIndex = nodes.findIndex((node: { kind: string; snapshots?: { length: number } }) =>
        node.kind === AGENT_TURN_NODE_KIND && node.snapshots!.length > 0);
    assert.ok(agentNodeIndex >= 0);
    const changeId = nodes[agentNodeIndex]!.snapshots[0].changeIds[0];
    assert.ok(changeId !== undefined);
    // craft a raw line embedding that changeId and look up its owning node.
    const nodeIndex = findTimelineNodeIndexForRawLine(nodes, `{"id":"${changeId}"}`);
    // the lookup lands on the owning agent turn.
    assert.equal(nodeIndex, agentNodeIndex);
});

test("test_findTimelineNodeIndexForRawLine_prefers_changeId_over_message_uuid", () => {
    // Scenario: a file-history-snapshot line embeds BOTH a changeId and the uuid of the prompt
    // that triggered it (verified against s43 line 110) — the line is about the file change, so
    // the owning AGENT turn must win over the prompt's uuid match.
    // Steps:
    // build s2's turn timeline; take an agent turn's changeId and any user turn's uuid.
    const { nodes } = buildTurnTimelineViewModel(s2Document);
    const agentNodeIndex = nodes.findIndex((node: { kind: string; snapshots?: { length: number } }) =>
        node.kind === AGENT_TURN_NODE_KIND && node.snapshots!.length > 0);
    const userNode = nodes.find((node: { kind: string }) => node.kind === USER_TURN_NODE_KIND);
    const changeId = nodes[agentNodeIndex]!.snapshots[0].changeIds[0];
    // craft a raw line embedding BOTH identifiers and look it up.
    const nodeIndex = findTimelineNodeIndexForRawLine(
        nodes,
        `{"messageId":"${userNode!.uuid}","changeId":"${changeId}"}`,
    );
    // the agent turn owning the changeId wins.
    assert.equal(nodeIndex, agentNodeIndex);
});

test("test_findTimelineNodeIndexForRawLine_matches_user_turn_by_message_uuid", () => {
    // Scenario: an /at/<line> anchor on a prompt line must land on the prompt's own step — a raw
    // line containing a user turn's message uuid resolves to that user-turn node.
    // Steps:
    // build s2's turn timeline; take its first user turn.
    const { nodes } = buildTurnTimelineViewModel(s2Document);
    const userNodeIndex = nodes.findIndex((node: { kind: string }) => node.kind === USER_TURN_NODE_KIND);
    assert.ok(userNodeIndex >= 0);
    // craft a raw line embedding that message's uuid and look it up.
    const nodeIndex = findTimelineNodeIndexForRawLine(nodes, `{"uuid":"${nodes[userNodeIndex]!.uuid}"}`);
    // the lookup lands on the prompt's node.
    assert.equal(nodeIndex, userNodeIndex);
});

// ─── turn-based timeline (plan phase A1): one node per conversation turn ────────────────────────

test("test_turn_timeline_has_one_node_per_message_plus_session_ends", () => {
    // Scenario: a timeline step is a conversation turn — every user prompt and every agent reply
    // becomes exactly one turn node, and every session gains one closing session-end node
    // (user decision 2026-07-06). Commit nodes stay separate and unnumbered.
    // Steps:
    // build s2's turn timeline.
    const { nodes } = buildTurnTimelineViewModel(s2Document);
    // collect the non-commit nodes.
    const turnNodes = nodes.filter((node: { kind: string }) => node.kind !== COMMIT_NODE_KIND);
    // count s2's distinct sessions.
    const distinctSessions = new Set(s2Document.messages.map((message: { sessionId: string }) => message.sessionId));
    // assert one node per message plus one session-end per session (s2 needs no synthetic turns).
    assert.equal(turnNodes.length, s2Document.messages.length + distinctSessions.size);
    // assert every message yields a node of the matching kind carrying its text.
    for (const message of s2Document.messages) {
        const expectedKind = message.role === RecordType.user ? USER_TURN_NODE_KIND : AGENT_TURN_NODE_KIND;
        const owner = turnNodes.find((node: { uuid?: string }) => node.uuid === message.uuid);
        assert.ok(owner !== undefined);
        assert.equal(owner.kind, expectedKind);
        assert.equal(owner.text, message.text);
    }
    // assert the whole node array is chronological.
    for (let i = 1; i < nodes.length; i += 1) {
        assert.ok(nodes[i]!.when >= nodes[i - 1]!.when);
    }
});

test("test_turn_timeline_numbers_steps_continuously_across_sessions", () => {
    // Scenario: step numbers run 1..N continuously across interleaved sessions (numbering never
    // restarts per session); commit nodes carry no step number.
    // Steps:
    // build s84's turn timeline (multi-session scenario).
    const { nodes } = buildTurnTimelineViewModel(s84Document);
    // collect stepNumber over every numbered node kind, in node order.
    const numberedKinds = new Set([USER_TURN_NODE_KIND, AGENT_TURN_NODE_KIND, SESSION_END_NODE_KIND]);
    const stepNumbers = nodes
        .filter((node: { kind: string }) => numberedKinds.has(node.kind))
        .map((node: { stepNumber?: number }) => node.stepNumber);
    assert.ok(stepNumbers.length > 0);
    // assert they are exactly 1..N with no gaps.
    stepNumbers.forEach((stepNumber: number | undefined, position: number) => assert.equal(stepNumber, position + 1));
    // assert commit nodes are unnumbered.
    for (const node of nodes.filter((entry: { kind: string }) => entry.kind === COMMIT_NODE_KIND)) {
        assert.equal(node.stepNumber, undefined);
    }
});

test("test_agent_turn_owns_snapshots_between_prompts", () => {
    // Scenario: a StepSnapshot belongs to the FIRST agent reply of its own session at or after
    // it — tool calls execute before the reply's text is emitted (user-approved attribution rule).
    // Steps:
    // build s2's turn timeline.
    const { nodes } = buildTurnTimelineViewModel(s2Document);
    const agentNodes = nodes.filter((node: { kind: string }) => node.kind === AGENT_TURN_NODE_KIND);
    // for every snapshot: exactly one agent-turn node owns it.
    for (const step of s2Document.steps) {
        const owners = agentNodes.filter((node: { snapshots: { index: number }[] }) =>
            node.snapshots.some((snapshot: { index: number }) => snapshot.index === step.index));
        assert.equal(owners.length, 1);
        // the owner is in the snapshot's own session, at or after the snapshot.
        assert.equal(owners[0]!.sessionId, step.sessionId);
        assert.ok(owners[0]!.when >= step.when);
    }
});

test("test_agent_turn_carries_no_snapshot_of_other_sessions", () => {
    // Scenario: attribution never crosses sessions — an agent turn owns only snapshots produced
    // by its own session's tool calls, however the sessions interleave.
    // Steps:
    // build s84's turn timeline (multi-session scenario).
    const { nodes } = buildTurnTimelineViewModel(s84Document);
    // assert every owned snapshot's sessionId equals its node's sessionId.
    for (const node of nodes.filter((entry: { kind: string }) => entry.kind === AGENT_TURN_NODE_KIND)) {
        for (const snapshot of node.snapshots) {
            assert.equal(snapshot.sessionId, node.sessionId);
        }
    }
});

test("test_trailing_snapshots_get_a_synthetic_agent_turn", () => {
    // Scenario: a snapshot with no later agent reply in its session must never be dropped — it
    // attaches to a synthetic empty-text agent turn placed before the session-end node.
    // Steps:
    // build a minimal document: one user prompt, TWO snapshots AFTER it, no assistant message.
    const document = {
        messages: [{
            uuid: "prompt-1",
            role: RecordType.user,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:00.000Z",
            text: "write two files",
        }],
        steps: [{
            index: 1,
            when: "2026-01-01T00:00:05.000Z",
            sessionId: "session-a",
            changeIds: ["change-1"],
            changedPaths: ["notes.txt"],
            files: {},
        }, {
            index: 2,
            when: "2026-01-01T00:00:09.000Z",
            sessionId: "session-a",
            changeIds: ["change-2"],
            changedPaths: ["extra.txt"],
            files: {},
        }],
        filesTouched: [],
        rewoundFilesTouched: [],
        commitMarkers: [],
    };
    const { nodes } = buildTurnTimelineViewModel(document);
    // assert exactly ONE synthetic agent turn exists, empty-texted, owning BOTH snapshots.
    const syntheticIndexes = nodes.flatMap((node: { kind: string }, index: number) =>
        node.kind === AGENT_TURN_NODE_KIND ? [index] : []);
    assert.equal(syntheticIndexes.length, 1);
    const synthetic = nodes[syntheticIndexes[0]!]!;
    assert.equal(synthetic.text, "");
    assert.equal(synthetic.snapshots.length, 2);
    // assert it sits after the prompt and before the session-end node.
    const promptIndex = nodes.findIndex((node: { kind: string }) => node.kind === USER_TURN_NODE_KIND);
    const endIndex = nodes.findIndex((node: { kind: string }) => node.kind === SESSION_END_NODE_KIND);
    assert.ok(promptIndex < syntheticIndexes[0]!);
    assert.ok(syntheticIndexes[0]! < endIndex);
});

test("test_file_changes_carry_their_change_id", () => {
    // Scenario: each file chip needs the changeId of the revision it displays, so the per-file
    // { } button can resolve the JSONL line that caused the revision and the +/- button can
    // resolve the revision's diff block.
    // Steps:
    // build s2's turn timeline.
    const { nodes } = buildTurnTimelineViewModel(s2Document);
    const revisionIndex = indexRevisionsByChangeId(s2Document);
    let checked = 0;
    for (const node of nodes.filter((entry: { kind: string }) => entry.kind === AGENT_TURN_NODE_KIND)) {
        for (const change of node.fileChanges) {
            if (change.changeId === undefined) {
                continue;
            }
            // the changeId belongs to one of the node's own snapshots...
            assert.ok(node.snapshots.some((snapshot: { changeIds: string[] }) =>
                snapshot.changeIds.includes(change.changeId)));
            // ...and resolves to this chip's path.
            assert.equal(revisionIndex.get(change.changeId)!.path, change.path);
            checked += 1;
        }
    }
    // the check is not vacuous.
    assert.ok(checked >= 1);
});

test("test_command_message_turns_are_marked_system", () => {
    // Scenario: harness-generated turns (command-message prompts like /ponytail, system
    // reminders) are SYSTEM messages — the timeline renders them dimmer than genuine user
    // prompts and agent replies, so the view-model must flag them.
    // Steps:
    // build a minimal document: a /command prompt, a genuine prompt, and an agent reply.
    const document = {
        messages: [{
            uuid: "command-1",
            role: RecordType.user,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:00.000Z",
            text: "<command-message>ponytail:ponytail</command-message>\n<command-name>/ponytail</command-name>",
        }, {
            uuid: "prompt-1",
            role: RecordType.user,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:10.000Z",
            text: "write a file",
        }, {
            uuid: "reply-1",
            role: RecordType.assistant,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:20.000Z",
            text: "done",
        }],
        steps: [],
        filesTouched: [],
        rewoundFilesTouched: [],
        commitMarkers: [],
    };
    const { nodes } = buildTurnTimelineViewModel(document);
    const byUuid = (uuid: string) => nodes.find((node: { uuid?: string }) => node.uuid === uuid);
    // assert the command-message prompt is flagged system.
    assert.equal(byUuid("command-1")!.isSystem, true);
    // assert the genuine prompt and the agent reply are not.
    assert.equal(byUuid("prompt-1")!.isSystem, false);
    assert.equal(byUuid("reply-1")!.isSystem, false);
});

test("test_unattributed_snapshots_get_no_session_end_node", () => {
    // Scenario: snapshots with NO sessionId (e.g. unattributed script executions) still surface
    // on a synthetic agent turn, but they are not a session — no "end of session undefined" step.
    // Steps:
    // build a minimal document: one prompt in session-a, one unattributed snapshot after it.
    const document = {
        messages: [{
            uuid: "prompt-1",
            role: RecordType.user,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:00.000Z",
            text: "run the script",
        }],
        steps: [{
            index: 1,
            when: "2026-01-01T00:00:05.000Z",
            changeIds: ["change-1"],
            changedPaths: ["output.txt"],
            files: {},
        }],
        filesTouched: [],
        rewoundFilesTouched: [],
        commitMarkers: [],
    };
    const { nodes } = buildTurnTimelineViewModel(document);
    // assert the unattributed snapshot still lands on a synthetic agent turn.
    const synthetic = nodes.find((node: { kind: string }) => node.kind === AGENT_TURN_NODE_KIND);
    assert.ok(synthetic !== undefined);
    assert.equal(synthetic.snapshots.length, 1);
    // assert exactly one session-end node exists — session-a's — and none for undefined.
    const sessionEnds = nodes.filter((node: { kind: string }) => node.kind === SESSION_END_NODE_KIND);
    assert.equal(sessionEnds.length, 1);
    assert.equal(sessionEnds[0]!.sessionId, "session-a");
});

test("test_session_end_node_closes_every_session", () => {
    // Scenario: every session ends with exactly one session-end step, positioned after every
    // conversation turn of that session and timestamped at the session's last turn. Unattributed
    // turns (no sessionId) are not a session and get none.
    // Steps:
    // build s84's turn timeline.
    const { nodes } = buildTurnTimelineViewModel(s84Document);
    const turnKinds = new Set([USER_TURN_NODE_KIND, AGENT_TURN_NODE_KIND]);
    const sessionIds = new Set(
        nodes
            .filter((node: { kind: string }) => turnKinds.has(node.kind))
            .map((node: { sessionId?: string }) => node.sessionId)
            .filter((sessionId: string | undefined) => sessionId !== undefined),
    );
    for (const sessionId of sessionIds) {
        // exactly one session-end node per session.
        const endIndexes = nodes.flatMap((node: { kind: string; sessionId?: string }, index: number) =>
            node.kind === SESSION_END_NODE_KIND && node.sessionId === sessionId ? [index] : []);
        assert.equal(endIndexes.length, 1);
        // positioned after every conversation turn of its session.
        const turnIndexes = nodes.flatMap((node: { kind: string; sessionId?: string }, index: number) =>
            turnKinds.has(node.kind) && node.sessionId === sessionId ? [index] : []);
        assert.ok(endIndexes[0]! > Math.max(...turnIndexes));
        // timestamped at the session's last turn.
        const lastTurnWhen = turnIndexes.map((index: number) => nodes[index]!.when).sort().at(-1);
        assert.equal(nodes[endIndexes[0]!]!.when, lastTurnWhen);
    }
});

test("test_orphaned_snapshots_dim_their_agent_turn", () => {
    // Scenario: an agent turn whose snapshots ALL sit on a rewound branch is orphaned (dimmed,
    // unpickable); a turn owning at least one surviving snapshot — or none at all — is not.
    // Steps:
    // build s45's turn timeline (s45 has a genuinely rewound step).
    const { nodes } = buildTurnTimelineViewModel(s45Document);
    const revisionIndex = indexRevisionsByChangeId(s45Document);
    let orphanedCount = 0;
    for (const node of nodes.filter((entry: { kind: string }) => entry.kind === AGENT_TURN_NODE_KIND)) {
        // a snapshot-less agent turn is never orphaned.
        if (node.snapshots.length === 0) {
            assert.equal(node.isOrphaned, false);
            continue;
        }
        // otherwise orphaned exactly when EVERY owned snapshot is on the rewound branch.
        const expected = node.snapshots.every((snapshot: { changeIds: string[] }) =>
            checkStepIsOrphaned(snapshot, revisionIndex));
        assert.equal(node.isOrphaned, expected);
        if (expected) {
            orphanedCount += 1;
        }
    }
    // s45 has a rewound step, so the check is not vacuous.
    assert.ok(orphanedCount >= 1);
});

test("test_findTimelineNodeIndexForRawLine_returns_minus_one_when_no_step_matches", () => {
    // Scenario: a raw line containing no changeId and no message uuid owns no step; commit and
    // session-end nodes are never matched (s85's timeline contains commit nodes the scan must skip).
    // Steps:
    // build s85's turn timeline and look up an anchor-free line.
    const { nodes } = buildTurnTimelineViewModel(s85Document);
    const nodeIndex = findTimelineNodeIndexForRawLine(nodes, '{"type":"summary","message":"hello"}');
    // no node owns the line.
    assert.equal(nodeIndex, -1);
});

test("test_agent_turns_own_every_git_operation_of_their_session", () => {
    // Scenario: each of s85's five recorded git operations renders inside exactly one agent turn
    // of its own session — the timeline's `* git <kind> <detail> *` rows.
    // Steps:
    // build s85's turn timeline.
    const { nodes } = buildTurnTimelineViewModel(s85Document);
    const agentNodes = nodes.filter((node: { kind: string }) => node.kind === AGENT_TURN_NODE_KIND);
    // assert the turns collectively own the document's operations, in document order.
    const owned = agentNodes.flatMap((node: { gitOperations: { command: string }[] }) => node.gitOperations);
    assert.deepEqual(
        owned.map((operation: { command: string }) => operation.command),
        s85Document.gitOperations.map((operation: { command: string }) => operation.command),
    );
    // assert no operation crossed into another session's turn.
    for (const node of agentNodes) {
        for (const operation of node.gitOperations) {
            assert.equal(operation.sessionId, node.sessionId);
        }
    }
});

test("test_git_operations_attach_by_the_snapshot_attribution_rule", () => {
    // Scenario: a git operation belongs to the FIRST agent reply of its own session at or after
    // it (the snapshot rule); an operation AFTER the session's last reply falls back to that last
    // reply so no recorded git command is silently dropped.
    // Steps:
    // build a minimal document: prompt, one reply, one operation before the reply, one after it.
    const document = {
        messages: [{
            uuid: "prompt-1",
            role: RecordType.user,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:00.000Z",
            text: "make a repo and commit",
        }, {
            uuid: "reply-1",
            role: RecordType.assistant,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:10.000Z",
            text: "done",
        }],
        steps: [],
        filesTouched: [],
        rewoundFilesTouched: [],
        commitMarkers: [],
        gitOperations: [{
            kind: GitOperationKind.init,
            detail: "",
            command: "git init",
            timestamp: "2026-01-01T00:00:05.000Z",
            sessionId: "session-a",
        }, {
            kind: GitOperationKind.commit,
            detail: "baseline",
            command: 'git commit -m "baseline"',
            timestamp: "2026-01-01T00:00:20.000Z",
            sessionId: "session-a",
        }],
    };
    const { nodes } = buildTurnTimelineViewModel(document);
    // assert the reply turn owns BOTH operations, in order (init by the rule, commit by fallback).
    const reply = nodes.find((node: { kind: string }) => node.kind === AGENT_TURN_NODE_KIND)!;
    assert.deepEqual(
        reply.gitOperations.map((operation: { kind: string }) => operation.kind),
        [GitOperationKind.init, GitOperationKind.commit],
    );
});

test("test_commit_nodes_derive_from_git_operations", () => {
    // Scenario: when the document ships gitOperations, the pick hard-stops come from its commit
    // operations — carrying the commit message — not from commitMarkers.
    // Steps:
    // build a minimal document whose ONLY commit signal is a gitOperations entry.
    const document = {
        messages: [{
            uuid: "prompt-1",
            role: RecordType.user,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:00.000Z",
            text: "commit it",
        }, {
            uuid: "reply-1",
            role: RecordType.assistant,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:10.000Z",
            text: "committed",
        }],
        steps: [],
        filesTouched: [],
        rewoundFilesTouched: [],
        commitMarkers: [],
        gitOperations: [{
            kind: GitOperationKind.commit,
            detail: "baseline",
            command: 'git commit -m "baseline"',
            timestamp: "2026-01-01T00:00:05.000Z",
            sessionId: "session-a",
        }],
    };
    const { nodes } = buildTurnTimelineViewModel(document);
    // assert exactly one commit node exists, at the operation's instant, with its message.
    const commitNodes = nodes.filter((node: { kind: string }) => node.kind === COMMIT_NODE_KIND);
    assert.equal(commitNodes.length, 1);
    assert.equal(commitNodes[0]!.when, "2026-01-01T00:00:05.000Z");
    assert.equal(commitNodes[0]!.detail, "baseline");
});

test("test_commit_nodes_fall_back_to_commit_markers", () => {
    // Scenario: an older cached document has NO gitOperations field; its commitMarkers must
    // still produce the commit hard-stops (and agent turns still expose an empty operations list).
    // Steps:
    // build a minimal document with a commitMarker and no gitOperations key.
    const document = {
        messages: [{
            uuid: "prompt-1",
            role: RecordType.user,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:00.000Z",
            text: "commit it",
        }, {
            uuid: "reply-1",
            role: RecordType.assistant,
            sessionId: "session-a",
            timestamp: "2026-01-01T00:00:10.000Z",
            text: "committed",
        }],
        steps: [],
        filesTouched: [],
        rewoundFilesTouched: [],
        commitMarkers: [{ timestamp: "2026-01-01T00:00:05.000Z", sessionId: "session-a" }],
    };
    const { nodes } = buildTurnTimelineViewModel(document);
    // assert the marker still yields its commit node.
    const commitNodes = nodes.filter((node: { kind: string }) => node.kind === COMMIT_NODE_KIND);
    assert.equal(commitNodes.length, 1);
    assert.equal(commitNodes[0]!.when, "2026-01-01T00:00:05.000Z");
    // assert the reply turn carries an (empty) operations list, so the render half can map it.
    const reply = nodes.find((node: { kind: string }) => node.kind === AGENT_TURN_NODE_KIND)!;
    assert.deepEqual(reply.gitOperations, []);
});

test("test_compute_snapshot_jump_route_targets_the_revisions_1_based_number", () => {
    // Scenario: a chip whose changeId is a surviving revision's changeId routes to the
    // file-history view anchored at that revision (1-based /rev/<n>, item 19).
    const history = s84Document.filesTouched[0]!;
    const change = { path: history.target, changeId: history.revisions[0]!.changeId };
    assert.equal(
        computeSnapshotJumpRoute("s84", s84Document.filesTouched, change),
        `${routeToFileHistory("s84", history.target)}/rev/1`,
    );
});

test("test_compute_snapshot_jump_route_returns_undefined_without_a_changeid", () => {
    // Scenario: a changedPaths-hint chip carries no changeId — no jump button.
    const change = { path: "whatever.py", changeId: undefined };
    assert.equal(computeSnapshotJumpRoute("s84", s84Document.filesTouched, change), undefined);
});

test("test_compute_snapshot_jump_route_returns_undefined_for_unresolvable_changeids", () => {
    // Scenario: a re-stamped synthetic changeId (item 25) matches no surviving revision —
    // no jump button rather than a dead link.
    const change = { path: "whatever.py", changeId: "00000000-0000-4000-8000-000000000000" };
    assert.equal(computeSnapshotJumpRoute("s84", s84Document.filesTouched, change), undefined);
});

test("test_checkSelectionBlocksBackgroundClose_blocks_when_selection_is_active", () => {
    // Scenario: finishing a text-selection drag over empty timeline background fires a click on
    // the container; a non-collapsed selection means the user was selecting text, not asking
    // to close the inspector (item 10b).
    // Steps:
    // feed a fake Selection whose isCollapsed is false.
    // assert the predicate blocks the background close.
    assert.equal(checkSelectionBlocksBackgroundClose({ isCollapsed: false }), true);
});

test("test_checkSelectionBlocksBackgroundClose_allows_plain_clicks", () => {
    // Scenario: an ordinary background click (collapsed selection, or the null selection some
    // browsers return) must still close the inspector.
    // Steps:
    // assert a collapsed selection does not block the close.
    assert.equal(checkSelectionBlocksBackgroundClose({ isCollapsed: true }), false);
    // assert a null selection does not block the close.
    assert.equal(checkSelectionBlocksBackgroundClose(null), false);
});

test("test_computeUnattributedStepTag_names_a_single_event_kind", () => {
    // Scenario: an unattributed-lane step with one kind of chip gets a tag naming that kind,
    // humanized (item 10d).
    // Steps:
    // assert "user-edit" humanizes to "user edit" (hyphen becomes a space).
    assert.equal(computeUnattributedStepTag(["user-edit"]), "user edit");
    // assert "script-execution" gets its dedicated "script run" wording.
    assert.equal(computeUnattributedStepTag(["script-execution"]), "script run");
});

test("test_computeUnattributedStepTag_joins_distinct_kinds", () => {
    // Scenario: repeated kinds dedupe and distinct kinds join in first-appearance order.
    // Steps:
    // feed two user-edit chips and one write chip.
    // assert the tag names each kind once, joined with a middle dot.
    assert.equal(computeUnattributedStepTag(["user-edit", "user-edit", "write"]), "user edit · write");
});

test("test_computeUnattributedStepTag_returns_undefined_for_no_kinds", () => {
    // Scenario: a step with no chips gets no tag at all (undefined, never an empty span).
    // Steps:
    // assert an empty kind list yields undefined.
    assert.equal(computeUnattributedStepTag([]), undefined);
});
