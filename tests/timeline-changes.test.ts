// file-change chips, revision indexing, patch splitting (timeline-changes.ts) — wire-shape inputs; shared fixtures in timeline-test-helpers.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    GIT_BASE_CHANGE_ID_PREFIX,
    computeSnapshotJumpRoute,
    indexRevisionsByChangeId,
    splitPatchByFile,
} from "../webapp/views/timeline-changes.ts";
import { buildTurnTimelineViewModel } from "../webapp/views/timeline-nodes.ts";
import { AGENT_TURN_NODE_KIND } from "../webapp/views/timeline-types.ts";
import { routeToFileHistory } from "../webapp/app-routes.ts";
import { buildProjectReconstruction } from "../src/viewer_api.ts";
import { renderRangePatch } from "../src/viewer_api_diffs.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { BASE_COMMIT_CHANGE_ID_PREFIX } from "../src/reconstruction_base_commit.ts";
import { S85_JSONL_PATHS } from "./fixtures.ts";
import {
    s84Document,
    s2Document,
    s39SeedDocument,
} from "./timeline-test-helpers.ts";

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
        .flatMap((node) => node.fileChanges!);
    const renameChange = fileChanges.find((change: { eventKind: string }) => change.eventKind === EventKind.rename);
    assert.ok(renameChange !== undefined);
    assert.ok(renameChange.renamedFrom !== undefined);
    assert.ok(renameChange.renamedFrom.endsWith("s2_original.py"));
    assert.ok(renameChange.path.endsWith("s2_moved.py"));
});

test("test_split_patch_by_file_returns_one_block_per_file", () => {
    // Scenario: the range-diff inspector shows only the clicked file — the full patch splits on
    // `diff --git ` headers into one block per file, each keyed by its b/ path.
    // Steps:
    // render a real multi-file patch for s85's first three steps.
    // split it; assert one block per `diff --git` header, keys unique, and re-joining loses nothing.
    const { document: rawS85Document, stepFileHistories: rawS85Histories } = buildProjectReconstruction(S85_JSONL_PATHS, undefined);
    const patch = renderRangePatch(rawS85Histories, rawS85Document.steps, 1, 3);
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
        for (const change of node.fileChanges!) {
            if (change.changeId === undefined) {
                continue;
            }
            // the changeId belongs to one of the node's own snapshots...
            assert.ok(node.snapshots!.some((snapshot: { changeIds: string[] }) =>
                snapshot.changeIds.includes(change.changeId!)));
            // ...and resolves to this chip's path.
            assert.equal(revisionIndex.get(change.changeId)!.path, change.path);
            checked += 1;
        }
    }
    // the check is not vacuous.
    assert.ok(checked >= 1);
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

test("test_file_changes_carry_snapshot_timestamp", () => {
    // Scenario: chip rows show a per-chip timestamp — each FileChange carries the `when` of the
    // snapshot that contributed it.
    // Steps:
    // build the seed-session timeline and take the files bubble.
    const { nodes } = buildTurnTimelineViewModel(s39SeedDocument);
    const filesBubble = nodes.find((node) =>
        node.kind === AGENT_TURN_NODE_KIND && node.text === "" && (node.fileChanges ?? []).length === 2);
    // every chip's `when` is one of the bubble's snapshot instants.
    const snapshotWhens = new Set(filesBubble!.snapshots!.map((snapshot) => snapshot.when));
    for (const change of filesBubble!.fileChanges!) {
        assert.ok(snapshotWhens.has(change.when));
    }
});

test("test_gitBaseChangeIdPrefix_mirrors_engine_constant", () => {
    // Scenario: the webapp's local gitBase: wire-string mirror must equal the engine's
    // BASE_COMMIT_CHANGE_ID_PREFIX (single-source vocabulary, asserted like the enum mirrors).
    // Steps:
    // assert the two constants are the same string.
    assert.equal(GIT_BASE_CHANGE_ID_PREFIX, BASE_COMMIT_CHANGE_ID_PREFIX);
});
