// Tests for the webapp's pure view-model functions (webapp/views/*.js — plain ES modules,
// DOM-free). User directive 2026-07-02: scenarios are the client-test fixtures — every executed
// scenario carries ground truth (.step_states/ file states + the JSONL's conversational turns),
// so the view models are asserted against reality, not against hand-written expectations.
// The view models consume the JSON-serialized document exactly as the client receives it over
// HTTP, so every test feeds JSON.parse(JSON.stringify(document)).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildProjectDocument } from "../src/viewer_api.ts";
import { stripTrailingNewline } from "../src/reconstruction_steps.ts";
import { buildFileHistoryViewModel, computeAnchoredRevisionIndex, findRevisionForChangeId, splitDiffBlocks } from "../webapp/views/file-history.js";
import { computeSplitRows, DiffDisplayMode, resolveInitialDiffDisplayMode, SplitRowKind } from "../webapp/views/diff-vs-base.js";
import { findBackupTimeForBlob, findToolNavigationTargets } from "../webapp/inspector.js";
import { buildConversationViewModel } from "../webapp/views/conversation.js";
import { buildProjectViewModel } from "../webapp/views/project.js";
import { filterProjectsByName } from "../webapp/views/projects.js";
import { Path } from "../src/structures/domain.ts";
import { jsonlPathsForScenario, readNonEmptyLines } from "./utilities.ts";
import { S19_JSONL } from "./fixtures.ts";

const S19_STEP_STATES_DIR = "scenarios/executed/s19-user-edit-conv-rewind/.step_states";

// The s19 document as the CLIENT sees it: built once, JSON round-tripped (Path/Uuid/Date -> strings).
function buildS19ClientDocument(): any {
    return JSON.parse(JSON.stringify(buildProjectDocument([new Path(S19_JSONL)], undefined)));
}

// The scenario19.py target string in a client document.
function findScenario19Target(document: any): string {
    const history = document.filesTouched.find((entry: any) => entry.target.endsWith("scenario19.py"));
    assert.ok(history !== undefined, "s19 touches scenario19.py");
    return history.target;
}

// Ground-truth file states end in a trailing newline the engine's snapshots normalize away;
// compare both sides through the same stripTrailingNewline the coverage checker uses.
function readStrippedGroundTruth(stepName: string): string {
    return stripTrailingNewline(readFileSync(`${S19_STEP_STATES_DIR}/${stepName}/scenario19.py`, "utf8"));
}

test("test_file_state_viewmodel_matches_scenario_step_states", () => {
    // Scenario: the file-history view model's content at the FINAL revision of scenario19.py
    // equals the final state recorded in the scenario's .step_states/ ground truth (step-009).
    const document = buildS19ClientDocument();
    const target = findScenario19Target(document);
    const viewModel = buildFileHistoryViewModel(document, target);
    // s19's surviving branch carries this file's write -> overwrite -> edit (multiple revisions).
    assert.ok(viewModel.revisions.length >= 2, `2+ revisions, got ${viewModel.revisions.length}`);
    // assert the final revision's derived content equals the recorded final step state.
    const finalRevision = viewModel.revisions[viewModel.revisions.length - 1]!;
    assert.equal(stripTrailingNewline(finalRevision.content), readStrippedGroundTruth("step-009"));
});

test("test_file_state_viewmodel_matches_intermediate_step", () => {
    // Scenario: per-revision lookup is correct at INTERMEDIATE points, not just the endpoint —
    // some non-final revision's derived content equals the recorded step-003 state (the
    // pre-tweak, post-subtract state), which differs from the final state.
    const document = buildS19ClientDocument();
    const target = findScenario19Target(document);
    const viewModel = buildFileHistoryViewModel(document, target);
    const intermediateGroundTruth = readStrippedGroundTruth("step-003");
    assert.notEqual(intermediateGroundTruth, readStrippedGroundTruth("step-009"), "the intermediate state is genuinely different");
    const nonFinalContents = viewModel.revisions.slice(0, -1).map((revision: any) => stripTrailingNewline(revision.content));
    assert.ok(nonFinalContents.includes(intermediateGroundTruth), "a non-final revision carries the step-003 state");
});

test("test_conversation_viewmodel_shows_scenario_turns", () => {
    // Scenario: the conversation view model's turns are exactly document.messages (genuine user
    // prompts + text-bearing assistant replies), in order — and the first user prompt's text
    // matches the raw JSONL line, so the view model can't silently drop or reorder turns.
    const document = buildS19ClientDocument();
    const viewModel = buildConversationViewModel(document);
    const turns = viewModel.entries.filter((entry: any) => entry.kind === "message");
    // same count, same uuids, same texts, same order as the document's messages.
    assert.deepEqual(
        turns.map((entry: any) => ({ uuid: entry.message.uuid, text: entry.message.text })),
        document.messages.map((message: any) => ({ uuid: message.uuid, text: message.text })),
    );
    // spot-check the first user prompt's text against the raw JSONL line carrying its uuid.
    const firstUserMessage = document.messages.find((message: any) => message.role === "user");
    assert.ok(firstUserMessage !== undefined);
    const rawLines = readNonEmptyLines(S19_JSONL).map((line) => JSON.parse(line));
    const rawRecord = rawLines.find((record: any) => record.uuid === firstUserMessage.uuid);
    assert.ok(rawRecord !== undefined, "the first user prompt exists as a raw JSONL line");
    const rawText = typeof rawRecord.message.content === "string"
        ? rawRecord.message.content
        : rawRecord.message.content.filter((block: any) => block.type === "text").map((block: any) => block.text).join("\n");
    assert.equal(firstUserMessage.text, rawText);
});

test("test_conversation_viewmodel_interleaves_collapsed_stubs", () => {
    // Scenario: between two adjacent turns, the view model lists stub entries whose uuids are
    // exactly the lineVerdicts uuids between those messages' lines.
    const document = buildS19ClientDocument();
    const viewModel = buildConversationViewModel(document);
    // find the first pair of adjacent message entries with at least one stub between them.
    const entries = viewModel.entries;
    let firstMessageIndex = -1;
    for (let index = 0; index < entries.length - 1; index += 1) {
        if (entries[index]!.kind === "message" && entries[index + 1]!.kind === "stub") {
            firstMessageIndex = index;
            break;
        }
    }
    assert.ok(firstMessageIndex >= 0, "s19 has a message followed by collapsed records");
    // collect the view model's stub run and the next message after it.
    const stubUuids: string[] = [];
    let nextMessageEntry: any;
    for (let index = firstMessageIndex + 1; index < entries.length; index += 1) {
        if (entries[index]!.kind === "message") { nextMessageEntry = entries[index]; break; }
        stubUuids.push(entries[index]!.uuid);
    }
    assert.ok(nextMessageEntry !== undefined, "a following message bounds the stub run");
    // ground truth: the lineVerdicts strictly between the two messages' lines.
    const lineOf = (uuid: string) => document.lineVerdicts.find((verdict: any) => verdict.uuid === uuid)!.line;
    const startLine = lineOf(entries[firstMessageIndex]!.message.uuid);
    const endLine = lineOf(nextMessageEntry.message.uuid);
    const expectedUuids = document.lineVerdicts
        .filter((verdict: any) => verdict.line > startLine && verdict.line < endLine)
        .map((verdict: any) => verdict.uuid);
    assert.deepEqual(stubUuids, expectedUuids);
});

test("test_filterProjectsByName_matches_case_insensitive_substring", () => {
    // Scenario: filtering a project listing by a mixed-case fragment keeps exactly
    // the projects whose name contains that fragment, ignoring case.
    // Steps:
    // a listing holds three projects with distinct names.
    const projectListing = [{ name: "alpha-app" }, { name: "Beta-Tool" }, { name: "gamma-app" }];
    // filter with a fragment that case-insensitively matches only the second project.
    const filteredProjects = filterProjectsByName(projectListing, "beta");
    // only that project survives the filter.
    assert.deepEqual(filteredProjects.map((project: any) => project.name), ["Beta-Tool"]);
});

test("test_filterProjectsByName_returns_all_projects_for_empty_filter", () => {
    // Scenario: an empty filter string keeps the whole listing, in order.
    // Steps:
    // a listing holds two projects.
    const projectListing = [{ name: "alpha-app" }, { name: "Beta-Tool" }];
    // filter with the empty string (the input's initial state).
    const filteredProjects = filterProjectsByName(projectListing, "");
    // every project survives, order unchanged.
    assert.deepEqual(filteredProjects, projectListing);
});

test("test_computeAnchoredRevisionIndex_returns_zero_based_index_for_in_range_rev", () => {
    // Scenario: a route's 1-based /rev/2 segment against a 3-revision history.
    // Action: compute the anchored index.
    const anchoredIndex = computeAnchoredRevisionIndex("2", 3);
    // Assertion: it names the 0-based second revision.
    assert.equal(anchoredIndex, 1);
});

test("test_computeAnchoredRevisionIndex_returns_undefined_for_missing_rev", () => {
    // Scenario: the route carries no /rev/ segment at all.
    // Action: compute the anchored index with an undefined segment.
    const anchoredIndex = computeAnchoredRevisionIndex(undefined, 3);
    // Assertion: no revision is anchored.
    assert.equal(anchoredIndex, undefined);
});

test("test_computeAnchoredRevisionIndex_returns_undefined_for_non_numeric_rev", () => {
    // Scenario: a hand-mangled route names /rev/abc.
    // Action: compute the anchored index for the non-numeric segment.
    const anchoredIndex = computeAnchoredRevisionIndex("abc", 3);
    // Assertion: no revision is anchored.
    assert.equal(anchoredIndex, undefined);
});

test("test_computeAnchoredRevisionIndex_returns_undefined_for_out_of_range_rev", () => {
    // Scenario: routes name revision 0 (below the 1-based floor) and 4 (past a 3-revision list).
    // Action: compute both anchored indexes.
    const belowRange = computeAnchoredRevisionIndex("0", 3);
    const aboveRange = computeAnchoredRevisionIndex("4", 3);
    // Assertion: neither anchors a revision.
    assert.equal(belowRange, undefined);
    assert.equal(aboveRange, undefined);
});

test("test_findRevisionForChangeId_returns_target_and_one_based_revision_number", () => {
    // Scenario: an inspector string value equals a revision's changeId (a toolu id or a
    // backup blob name) — the click needs the file target and the 1-based /rev/<n> number.
    const document = buildS19ClientDocument();
    const history = document.filesTouched.find((entry: any) => entry.revisions.length >= 2);
    assert.ok(history !== undefined, "s19 has a file with 2+ revisions");
    // look up the changeId of that history's SECOND revision.
    const found = findRevisionForChangeId(document.filesTouched, history.revisions[1].changeId);
    // the lookup names the same file and the 1-based revision number 2.
    assert.deepEqual(found, { target: history.target, revisionNumber: 2 });
});

test("test_findRevisionForChangeId_falls_back_to_file_match_for_other_backup_version", () => {
    // Scenario: a snapshot names backup blob version @v2, but the document's revision carries
    // the SAME blob at @v3 — the file is identifiable by the blob prefix, the revision is not.
    const filesTouched = [{ target: "/tmp/a.py", revisions: [{ changeId: "5436e8e9f917cd04@v3" }] }];
    // look up the other version of the same blob.
    const found = findRevisionForChangeId(filesTouched, "5436e8e9f917cd04@v2");
    // the file matches; no revision number is named.
    assert.deepEqual(found, { target: "/tmp/a.py", revisionNumber: undefined });
});

test("test_findRevisionForChangeId_does_not_prefix_match_non_blob_values", () => {
    // Scenario: only @vN-shaped blob names may fall back to a prefix match — an ordinary value
    // sharing a changeId's leading characters must not.
    const filesTouched = [{ target: "/tmp/a.py", revisions: [{ changeId: "toolu_015cK8abc" }] }];
    // look up a plain prefix of that changeId.
    const found = findRevisionForChangeId(filesTouched, "toolu_015cK8");
    // no link.
    assert.equal(found, undefined);
});

test("test_findRevisionForChangeId_resolves_backup_version_by_backup_time", () => {
    // Scenario: the snapshot's blob version matches no revision changeId, but the snapshot
    // records WHEN that backup was taken — the revision in effect at that moment is the state
    // the backup captured.
    const filesTouched = [{
        target: "/tmp/a.py",
        revisions: [
            { changeId: "toolu_1", timestamp: "2026-06-27T04:23:36.784Z" },
            { changeId: "toolu_2", timestamp: "2026-06-27T04:28:29.007Z" },
            { changeId: "5436e8e9f917cd04@v3", timestamp: "2026-06-27T04:31:35.020Z" },
        ],
    }];
    // look up blob @v2 with a backupTime between the second and third revisions.
    const found = findRevisionForChangeId(filesTouched, "5436e8e9f917cd04@v2", "2026-06-27T04:29:36.586Z");
    // the revision in effect at backupTime is #2.
    assert.deepEqual(found, { target: "/tmp/a.py", revisionNumber: 2 });
});

test("test_findRevisionForChangeId_leaves_revision_unresolved_for_backup_time_before_all_revisions", () => {
    // Scenario: a backupTime earlier than every revision names no state the document knows.
    const filesTouched = [{
        target: "/tmp/a.py",
        revisions: [{ changeId: "abc@v3", timestamp: "2026-06-27T04:31:35.020Z" }],
    }];
    // look up blob @v1 with a backupTime before the only revision.
    const found = findRevisionForChangeId(filesTouched, "abc@v1", "2026-06-27T04:00:00.000Z");
    // the file matches; no revision is named.
    assert.deepEqual(found, { target: "/tmp/a.py", revisionNumber: undefined });
});

test("test_findBackupTimeForBlob_returns_the_snapshot_entrys_backup_time", () => {
    // Scenario: a file-history-snapshot record maps tracked files to backup blobs with times.
    const record = {
        type: "file-history-snapshot",
        snapshot: {
            trackedFileBackups: {
                "inventory.py": { backupFileName: "5436e8e9f917cd04@v2", version: 2, backupTime: "2026-06-27T04:29:36.586Z" },
                "rename_inv.py": { backupFileName: null, version: 1, backupTime: "2026-06-27T04:29:44.173Z" },
            },
        },
    };
    // look up the blob's entry.
    const backupTime = findBackupTimeForBlob(record, "5436e8e9f917cd04@v2");
    // its backupTime comes back.
    assert.equal(backupTime, "2026-06-27T04:29:36.586Z");
});

test("test_findBackupTimeForBlob_returns_undefined_for_records_without_that_blob", () => {
    // Scenario: ordinary records carry no trackedFileBackups (and null backup names never match).
    // Steps: look the blob up in a plain message record and in a snapshot without it.
    assert.equal(findBackupTimeForBlob({ type: "user", message: {} }, "abc@v2"), undefined);
    assert.equal(findBackupTimeForBlob({ snapshot: { trackedFileBackups: { "a.py": { backupFileName: null } } } }, "abc@v2"), undefined);
});

test("test_findRevisionForChangeId_returns_undefined_for_unknown_changeId", () => {
    // Scenario: an ordinary string value that is no revision's changeId.
    const document = buildS19ClientDocument();
    // look up a value that matches nothing.
    const found = findRevisionForChangeId(document.filesTouched, "not-a-change-id");
    // no revision link.
    assert.equal(found, undefined);
});

test("test_file_state_viewmodel_unifies_multi_jsonl", () => {
    // Scenario: s53 (two concurrent-agent transcripts) — the project view model's files-touched
    // list covers files originating from BOTH JSONLs.
    const paths = jsonlPathsForScenario("s53");
    const perTranscriptTargets = paths.map((path) =>
        JSON.parse(JSON.stringify(buildProjectDocument([path], undefined)))
            .filesTouched.map((history: any) => history.target),
    );
    const unifiedDocument = JSON.parse(JSON.stringify(buildProjectDocument(paths, undefined)));
    const viewModel = buildProjectViewModel(unifiedDocument);
    for (const targets of perTranscriptTargets) {
        for (const target of targets) {
            assert.ok(viewModel.fileTargets.includes(target), `project view model covers ${target}`);
        }
    }
});

// -------------------- inspector tool-flow navigation --------------------

// A minimal transcript mirroring s40 lines 59-62: a Bash tool_use, its PreToolUse hook
// attachment (twice — the first is the jump target), and the tool_result linking back via
// sourceToolAssistantUUID.
const TOOL_FLOW_RAW_LINES = [
    JSON.stringify({ type: "assistant", uuid: "record-59", message: { content: [{ type: "tool_use", id: "toolu_x", name: "Bash", input: {} }] } }),
    JSON.stringify({ type: "attachment", uuid: "record-60", attachment: { type: "hook_success", hookName: "PreToolUse:Bash", toolUseID: "toolu_x" } }),
    JSON.stringify({ type: "attachment", uuid: "record-61", attachment: { type: "hook_success", hookName: "PreToolUse:Bash", toolUseID: "toolu_x" } }),
    JSON.stringify({ type: "user", uuid: "record-62", sourceToolAssistantUUID: "record-59", message: { content: [{ type: "tool_result", tool_use_id: "toolu_x" }] } }),
];

test("test_findToolNavigationTargets_resolves_hook_and_result_lines", () => {
    // Scenario: an inspected assistant tool_use record offers jumps to its PreToolUse hook line
    // (the FIRST record whose toolUseID names the tool_use id) and to its tool-result line (the
    // record whose sourceToolAssistantUUID names the assistant record).
    // Steps:
    // resolve navigation targets for the tool_use record.
    const targets = findToolNavigationTargets(TOOL_FLOW_RAW_LINES, JSON.parse(TOOL_FLOW_RAW_LINES[0]!));
    assert.ok(targets !== undefined);
    // the hook jump lands on the first hook line, not the duplicate after it.
    assert.equal(targets!.hookLine, 1);
    // the result jump lands on the sourceToolAssistantUUID line.
    assert.equal(targets!.resultLine, 3);
});

test("test_findToolNavigationTargets_ignores_non_tool_records", () => {
    // Scenario: records that call no tool (prompts, hooks, results themselves) offer no tool-flow
    // navigation.
    // Steps:
    // resolve targets for the user tool_result record; assert none.
    const targets = findToolNavigationTargets(TOOL_FLOW_RAW_LINES, JSON.parse(TOOL_FLOW_RAW_LINES[3]!));
    assert.equal(targets, undefined);
});

test("test_findToolNavigationTargets_falls_back_to_tool_use_id_for_results", () => {
    // Scenario: a tool_result record without sourceToolAssistantUUID (older transcripts) is still
    // found through its tool_result block's tool_use_id.
    // Steps:
    // rebuild the transcript without the sourceToolAssistantUUID property and resolve again.
    const rawLines = [...TOOL_FLOW_RAW_LINES];
    rawLines[3] = JSON.stringify({ type: "user", uuid: "record-62", message: { content: [{ type: "tool_result", tool_use_id: "toolu_x" }] } });
    const targets = findToolNavigationTargets(rawLines, JSON.parse(rawLines[0]!));
    assert.equal(targets!.resultLine, 3);
});

// -------------------- per-revision block slicing --------------------

test("test_splitDiffBlocks_keeps_numeric_hunk_headers_inside_their_revision_block", () => {
    // Scenario: renderDiffWithContext emits revision-kind headers (block delimiters) with
    // standard numeric "@@ -a,b +c,d @@" hunk headers INSIDE each block; slicing must split
    // only on the revision headers.
    // Steps:
    // slice a two-revision diff whose second block carries two numeric hunks.
    const blocks = splitDiffBlocks([
        "@@ created @ 2026-01-01T00:00:00.000Z @@",
        "@@ -0,0 +1,1 @@",
        "+line one",
        "@@ changed @ 2026-01-01T00:01:00.000Z @@",
        "@@ -1,2 +1,2 @@",
        "-old",
        "+new",
        "@@ -9,1 +9,1 @@",
        "-tail old",
        "+tail new",
    ].join("\n"));
    // exactly one block per revision.
    assert.equal(blocks.length, 2);
    // each numeric hunk stays inside its revision's block.
    assert.ok(blocks[0]!.includes("@@ -0,0 +1,1 @@"));
    assert.ok(blocks[1]!.includes("@@ -1,2 +1,2 @@"));
    assert.ok(blocks[1]!.includes("@@ -9,1 +9,1 @@"));
});

// -------------------- split (side-by-side) diff rows --------------------

test("test_computeSplitRows_renders_context_line_in_both_columns", () => {
    // Scenario: inside a hunk, a context line shows the same text on the left and right, uncolored.
    // Steps:
    // split a one-hunk diff holding a single context line.
    const rows = computeSplitRows("@@ -1,3 +1,3 @@\n unchanged");
    // the hunk header is a full-width row with the hunk color class.
    assert.deepEqual(rows[0], { kind: SplitRowKind.full, text: "@@ -1,3 +1,3 @@", lineClass: "diff-line-hunk" });
    // the context line pairs identical uncolored cells (unified " " prefix stripped), each
    // numbered from its side of the "@@ -1,3 +1,3 @@" header.
    assert.deepEqual(rows[1], {
        kind: SplitRowKind.pair,
        left: { text: "unchanged", lineClass: "", lineNumber: 1 },
        right: { text: "unchanged", lineClass: "", lineNumber: 1 },
    });
});

test("test_computeSplitRows_zips_equal_deletion_and_addition_runs", () => {
    // Scenario: a run of "-" lines followed by a run of "+" lines pairs row-by-row: deletion i on
    // the left (red), addition i on the right (green).
    // Steps:
    // split a hunk holding two deletions then two additions.
    const rows = computeSplitRows("@@ -1,2 +1,2 @@\n-old1\n-old2\n+new1\n+new2");
    // row 1 pairs the first deletion with the first addition, numbered per side.
    assert.deepEqual(rows[1], {
        kind: SplitRowKind.pair,
        left: { text: "old1", lineClass: "diff-line-del", lineNumber: 1 },
        right: { text: "new1", lineClass: "diff-line-add", lineNumber: 1 },
    });
    // row 2 pairs the second deletion with the second addition.
    assert.deepEqual(rows[2], {
        kind: SplitRowKind.pair,
        left: { text: "old2", lineClass: "diff-line-del", lineNumber: 2 },
        right: { text: "new2", lineClass: "diff-line-add", lineNumber: 2 },
    });
    assert.equal(rows.length, 3);
});

test("test_computeSplitRows_leaves_short_side_empty_for_unequal_runs", () => {
    // Scenario: when the addition run outnumbers the deletion run, the surplus addition sits
    // beside an empty left cell.
    // Steps:
    // split a hunk holding one deletion then two additions.
    const rows = computeSplitRows("@@ -1,1 +1,2 @@\n-old1\n+new1\n+new2");
    // row 1 pairs the lone deletion with the first addition.
    assert.deepEqual(rows[1], {
        kind: SplitRowKind.pair,
        left: { text: "old1", lineClass: "diff-line-del", lineNumber: 1 },
        right: { text: "new1", lineClass: "diff-line-add", lineNumber: 1 },
    });
    // row 2 carries only the surplus addition; the left cell is absent.
    assert.deepEqual(rows[2], {
        kind: SplitRowKind.pair,
        left: undefined,
        right: { text: "new2", lineClass: "diff-line-add", lineNumber: 2 },
    });
});

test("test_computeSplitRows_keeps_preamble_lines_full_width", () => {
    // Scenario: file-header lines before the first "@@" span both columns, keeping today's
    // inline color classes ("---" reads as del, "+++" as add — rendering parity).
    // Steps:
    // split a diff carrying a two-line preamble before its hunk.
    const rows = computeSplitRows("--- a/f\n+++ b/f\n@@ -1,1 +1,1 @@\n-x\n+y");
    assert.deepEqual(rows[0], { kind: SplitRowKind.full, text: "--- a/f", lineClass: "diff-line-del" });
    assert.deepEqual(rows[1], { kind: SplitRowKind.full, text: "+++ b/f", lineClass: "diff-line-add" });
    assert.deepEqual(rows[2], { kind: SplitRowKind.full, text: "@@ -1,1 +1,1 @@", lineClass: "diff-line-hunk" });
    // the hunk's change lines still zip into one pair row.
    assert.deepEqual(rows[3], {
        kind: SplitRowKind.pair,
        left: { text: "x", lineClass: "diff-line-del", lineNumber: 1 },
        right: { text: "y", lineClass: "diff-line-add", lineNumber: 1 },
    });
});

test("test_computeSplitRows_renders_non_diff_text_as_plain_full_rows", () => {
    // Scenario: the timeline surfaces feed fallback strings (no "@@" anywhere) through the same
    // renderer; they must come out as plain full-width rows.
    // Steps:
    // split a non-diff fallback message.
    const rows = computeSplitRows("(file unchanged across the picked range)");
    assert.deepEqual(rows, [{ kind: SplitRowKind.full, text: "(file unchanged across the picked range)", lineClass: "" }]);
});

test("test_computeSplitRows_advances_line_numbers_from_the_hunk_header_seed", () => {
    // Scenario: a hunk starting mid-file ("@@ -5,4 +7,5 @@") numbers its cells from each
    // side's seed: context advances both counters, a deletion only the old, an addition only
    // the new — and a revision-kind header ("@@ changed @ … @@") is a full-width row that
    // carries no numbers itself.
    // Steps:
    // split a revision block whose hunk starts at old line 5 / new line 7.
    const rows = computeSplitRows("@@ changed @ 2026-01-01T00:01:00.000Z @@\n@@ -5,4 +7,5 @@\n ctx1\n-del1\n+add1\n+add2\n ctx2");
    assert.deepEqual(rows[0], { kind: SplitRowKind.full, text: "@@ changed @ 2026-01-01T00:01:00.000Z @@", lineClass: "diff-line-hunk" });
    assert.deepEqual(rows[1], { kind: SplitRowKind.full, text: "@@ -5,4 +7,5 @@", lineClass: "diff-line-hunk" });
    // context: old 5, new 7.
    assert.deepEqual(rows[2], {
        kind: SplitRowKind.pair,
        left: { text: "ctx1", lineClass: "", lineNumber: 5 },
        right: { text: "ctx1", lineClass: "", lineNumber: 7 },
    });
    // deletion consumes old 6; the paired addition consumes new 8.
    assert.deepEqual(rows[3], {
        kind: SplitRowKind.pair,
        left: { text: "del1", lineClass: "diff-line-del", lineNumber: 6 },
        right: { text: "add1", lineClass: "diff-line-add", lineNumber: 8 },
    });
    // the surplus addition consumes new 9.
    assert.deepEqual(rows[4], {
        kind: SplitRowKind.pair,
        left: undefined,
        right: { text: "add2", lineClass: "diff-line-add", lineNumber: 9 },
    });
    // the trailing context resumes both sides: old 7, new 10.
    assert.deepEqual(rows[5], {
        kind: SplitRowKind.pair,
        left: { text: "ctx2", lineClass: "", lineNumber: 7 },
        right: { text: "ctx2", lineClass: "", lineNumber: 10 },
    });
});

test("test_resolveInitialDiffDisplayMode_returns_stored_mode", () => {
    // Scenario: a previous visit stored "inline" in localStorage — the diff toggle comes back
    // in inline mode after a reload (item 10f).
    // Steps:
    // resolve the stored wire string "inline".
    // assert the result is the DiffDisplayMode.inline enum member.
    assert.equal(resolveInitialDiffDisplayMode("inline"), DiffDisplayMode.inline);
});

test("test_resolveInitialDiffDisplayMode_defaults_to_split", () => {
    // Scenario: nothing stored (localStorage.getItem returns null) or an unrecognized stored
    // value falls back to the split default.
    // Steps:
    // assert null (no stored value) resolves to DiffDisplayMode.split.
    assert.equal(resolveInitialDiffDisplayMode(null), DiffDisplayMode.split);
    // assert an unrecognized value resolves to DiffDisplayMode.split.
    assert.equal(resolveInitialDiffDisplayMode("weird"), DiffDisplayMode.split);
});
