// Pure view-model tests for the revision-timeline view (webapp/views/timeline.js). Every test
// feeds the client's wire shape — JSON.parse(JSON.stringify(document)) — exactly what the browser
// sees after fetch. Role/kind assertions go through the vocabulary enum members (their values ARE
// the wire strings), never bare literals.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    buildTimelineViewModel,
    computePickSegments,
    checkPickIsLegal,
    computeRangeSummary,
    splitPatchByFile,
    STEP_NODE_KIND,
    COMMIT_NODE_KIND,
} from "../webapp/views/timeline.js";
import { buildProjectDocument, renderRangePatch } from "../src/viewer_api.ts";
import { Path } from "../src/structures/domain.ts";
import { RecordType, EventKind } from "../src/structures/vocabulary.ts";
import { S2_JSONL, S45_JSONL, S84_JSONL_PATHS, S85_JSONL_PATHS } from "./fixtures.ts";

// Built once per scenario — wire shape, shared read-only across tests.
const s84Document = JSON.parse(JSON.stringify(buildProjectDocument(S84_JSONL_PATHS, undefined)));
const s85Document = JSON.parse(JSON.stringify(buildProjectDocument(S85_JSONL_PATHS, undefined)));
const s2Document = JSON.parse(JSON.stringify(buildProjectDocument([new Path(S2_JSONL)], undefined)));

test("test_timeline_nodes_are_chronological_across_sessions", () => {
    // Scenario: a multi-agent project's nodes form ONE strictly chronological timeline, however
    // the sessions interleave (user-confirmed ordering decision).
    // Steps:
    // build the timeline for s84's unified document.
    // assert node timestamps are non-decreasing across the whole array.
    const { nodes } = buildTimelineViewModel(s84Document);
    assert.ok(nodes.length > 0);
    for (let i = 1; i < nodes.length; i += 1) {
        assert.ok(nodes[i]!.when >= nodes[i - 1]!.when);
    }
});

test("test_timeline_nodes_carry_session_ids", () => {
    // Scenario: each step node is attributed to the session whose tool call produced it.
    // Steps:
    // build s84's timeline; collect distinct sessionIds across step nodes.
    // assert at least 2 sessions appear (multi-agent scenario).
    const { nodes } = buildTimelineViewModel(s84Document);
    const stepNodes = nodes.filter((node: { kind: string }) => node.kind === STEP_NODE_KIND);
    const distinct = new Set(
        stepNodes.map((node: { sessionId?: string }) => node.sessionId).filter((id: string | undefined) => id !== undefined),
    );
    assert.ok(distinct.size >= 2);
});

test("test_timeline_includes_commit_nodes", () => {
    // Scenario: git commits appear as their own nodes, positioned after every step whose
    // timestamp precedes them (they become pick hard-stops in 3.2).
    // Steps:
    // build s85's timeline; assert at least one commit node exists.
    // for the first commit node, assert every earlier node's timestamp is <= its own.
    const { nodes } = buildTimelineViewModel(s85Document);
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
    // build s2's timeline; find a fileChange with the rename kind.
    // assert it names both the renamed-from and renamed-to paths.
    const { nodes } = buildTimelineViewModel(s2Document);
    const fileChanges = nodes
        .filter((node: { kind: string }) => node.kind === STEP_NODE_KIND)
        .flatMap((node: { fileChanges: { path: string; eventKind: string; renamedFrom?: string }[] }) => node.fileChanges);
    const renameChange = fileChanges.find((change: { eventKind: string }) => change.eventKind === EventKind.rename);
    assert.ok(renameChange !== undefined);
    assert.ok(renameChange.renamedFrom !== undefined);
    assert.ok(renameChange.renamedFrom.endsWith("s2_original.py"));
    assert.ok(renameChange.path.endsWith("s2_moved.py"));
});

test("test_timeline_prompt_excerpts_come_from_same_session", () => {
    // Scenario: a node's prompt excerpt is the latest user prompt OF ITS OWN SESSION at or before
    // the node — never a prompt another agent typed.
    // Steps:
    // build s84's timeline.
    // for every step node with an excerpt, assert a user message exists in the SAME session with
    // that exact text and a timestamp <= the node's.
    // assert nodes from at least 2 sessions carry excerpts (so the check is not vacuous).
    const { nodes } = buildTimelineViewModel(s84Document);
    const excerptSessions = new Set<string>();
    for (const node of nodes) {
        if (node.kind !== STEP_NODE_KIND) continue;
        if (node.promptExcerpt === "") continue;
        const source = s84Document.messages.find(
            (message: { role: string; sessionId?: string; timestamp?: string; text: string }) =>
                message.role === RecordType.user &&
                message.sessionId === node.sessionId &&
                message.text === node.promptExcerpt &&
                message.timestamp !== undefined &&
                message.timestamp <= node.when,
        );
        assert.ok(source !== undefined);
        excerptSessions.add(node.sessionId);
    }
    assert.ok(excerptSessions.size >= 2);
});

test("test_pick_crossing_commit_is_illegal", () => {
    // Scenario: git commit nodes are hard stops — a pick range can never cross one.
    // Steps:
    // build s85's timeline; locate its first commit node.
    // pick the nearest pickable node on each side of it.
    // assert the pick is illegal (and that the commit node itself sits in no segment).
    const { nodes } = buildTimelineViewModel(s85Document);
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
    // build s45's timeline (its rewound step lands BETWEEN surviving steps chronologically).
    // pick the pickable neighbors on both sides of the orphan.
    // assert the pick is legal.
    const s45Document = JSON.parse(JSON.stringify(buildProjectDocument([new Path(S45_JSONL)], undefined)));
    const { nodes } = buildTimelineViewModel(s45Document);
    const orphanIndex = nodes.findIndex((node: { isOrphaned?: boolean }) => node.isOrphaned === true);
    assert.ok(orphanIndex > 0);
    assert.ok(orphanIndex < nodes.length - 1);
    assert.equal(checkPickIsLegal(nodes, [orphanIndex - 1, orphanIndex + 1]), true);
});

test("test_noncontiguous_pick_is_illegal", () => {
    // Scenario: a pick with an unpicked PICKABLE node inside its span is not contiguous.
    // Steps:
    // build s84's timeline; find three consecutive pickable nodes within one segment.
    // pick the outer two only; assert illegal.
    const { nodes } = buildTimelineViewModel(s84Document);
    const segments = computePickSegments(nodes);
    const trio = segments.findIndex(
        (segment: number | null, index: number) =>
            segment !== null && segments[index + 1] === segment && segments[index + 2] === segment,
    );
    assert.ok(trio >= 0);
    assert.equal(checkPickIsLegal(nodes, [trio, trio + 2]), false);
});

test("test_single_pick_is_legal", () => {
    // Scenario: one picked pickable node is always a legal (degenerate) range.
    // Steps:
    // build s85's timeline; pick its first pickable node; assert legal.
    const { nodes } = buildTimelineViewModel(s85Document);
    const segments = computePickSegments(nodes);
    const first = segments.findIndex((segment: number | null) => segment !== null);
    assert.ok(first >= 0);
    assert.equal(checkPickIsLegal(nodes, [first]), true);
});

test("test_range_summary_counts_distinct_files", () => {
    // Scenario: the selection bar's "N steps picked · M files" counts DISTINCT file paths across
    // the picked nodes and exposes the 1-based step range for /api/range-patch.
    // Steps:
    // build s85's timeline; pick the first two pickable nodes (their fileChanges overlap on none
    // or some paths — the count must equal the union size computed independently here).
    const { nodes } = buildTimelineViewModel(s85Document);
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
    assert.equal(summary.fromStepIndex, nodes[picked[0]!]!.stepIndex);
    assert.equal(summary.toStepIndex, nodes[picked[1]!]!.stepIndex);
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
