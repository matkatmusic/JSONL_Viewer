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
import { buildFileHistoryViewModel, computeAnchoredRevisionIndex, findRevisionForChangeId, splitDiffBlocks } from "../webapp/views/file-history.ts";
import { computeInlineRows, computeSplitRows, DiffDisplayMode, resolveInitialDiffDisplayMode, SplitRowKind } from "../webapp/views/diff-vs-base.ts";
import { findBackupTimeForBlob, findToolNavigationTargets } from "../webapp/inspector.ts";
import { buildConversationViewModel } from "../webapp/views/conversation.ts";
import { buildProjectViewModel } from "../webapp/views/project.ts";
import { filterProjectsByName } from "../webapp/views/projects.ts";
import { checkConsentScriptOverflowsPreview, clampConsentSelectionStep, ConsentBlockKind, findDefaultConsentSelectionIndex, formatConsentSourceToken, groupConsentScriptsIntoBlocks, splitInlineInterpreterCode } from "../webapp/app.ts";
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
    assert.equal(stripTrailingNewline(finalRevision.content!), readStrippedGroundTruth("step-009"));
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
        stubUuids.push(entries[index]!.uuid!);
    }
    assert.ok(nextMessageEntry !== undefined, "a following message bounds the stub run");
    // ground truth: the lineVerdicts strictly between the two messages' lines.
    const lineOf = (uuid: string) => document.lineVerdicts.find((verdict: any) => verdict.uuid === uuid)!.line;
    const startLine = lineOf(entries[firstMessageIndex]!.message!.uuid);
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

test("test_computeSplitRows_seeds_counters_from_gits_short_form_header_with_function_context", () => {
    // Scenario: real git omits ",count" when a side's count is 1 and appends function context
    // ("@@ -5 +5,2 @@ def reorder():") — the header must still render as a full-width hunk row
    // and seed both line counters from 5 (item 51).
    // Steps:
    // split a one-hunk diff headed by the git short form: one context line, one addition.
    const rows = computeSplitRows("@@ -5 +5,2 @@ def reorder():\n keep\n+born");
    // the git-shaped header is a full-width hunk row.
    assert.deepEqual(rows[0], { kind: SplitRowKind.full, text: "@@ -5 +5,2 @@ def reorder():", lineClass: "diff-line-hunk" });
    // the context line is numbered from the header's seeds: old 5 / new 5.
    assert.deepEqual(rows[1], {
        kind: SplitRowKind.pair,
        left: { text: "keep", lineClass: "", lineNumber: 5 },
        right: { text: "keep", lineClass: "", lineNumber: 5 },
    });
    // the addition consumes new 6 beside an empty left cell.
    assert.deepEqual(rows[2], {
        kind: SplitRowKind.pair,
        left: undefined,
        right: { text: "born", lineClass: "diff-line-add", lineNumber: 6 },
    });
});

// -------------------- inline diff rows (item 40) --------------------

test("test_computeInlineRows_numbers_context_lines_on_both_sides", () => {
    // Scenario: inside a hunk, a context line carries a line number from BOTH files, each
    // seeded by the "@@ -a,b +c,d @@" header (old side from a, new side from c).
    // Steps:
    // compute inline rows for a one-hunk diff holding a single context line.
    const rows = computeInlineRows("@@ -3,2 +7,2 @@\n keep");
    // the context line keeps its raw unified " " prefix and is numbered old 3 / new 7.
    assert.deepEqual(rows[1], { text: " keep", lineClass: "", oldLineNumber: 3, newLineNumber: 7 });
});

test("test_computeInlineRows_numbers_deletions_on_old_side_only", () => {
    // Scenario: a deletion line exists only in the old file — it gets an old number and no new
    // number, and advances only the old counter.
    // Steps:
    // compute inline rows for a hunk holding one deletion then one context line.
    const rows = computeInlineRows("@@ -1,2 +1,1 @@\n-gone\n keep");
    // the deletion is numbered old 1 only.
    assert.deepEqual(rows[1], { text: "-gone", lineClass: "diff-line-del", oldLineNumber: 1 });
    // the following context line shows the deletion advanced only the old counter: old 2 / new 1.
    assert.deepEqual(rows[2], { text: " keep", lineClass: "", oldLineNumber: 2, newLineNumber: 1 });
});

test("test_computeInlineRows_numbers_additions_on_new_side_only", () => {
    // Scenario: an addition line exists only in the new file — it gets a new number and no old
    // number, and advances only the new counter.
    // Steps:
    // compute inline rows for a hunk holding one addition then one context line.
    const rows = computeInlineRows("@@ -1,1 +1,2 @@\n+born\n keep");
    // the addition is numbered new 1 only.
    assert.deepEqual(rows[1], { text: "+born", lineClass: "diff-line-add", newLineNumber: 1 });
    // the following context line shows the addition advanced only the new counter: old 1 / new 2.
    assert.deepEqual(rows[2], { text: " keep", lineClass: "", oldLineNumber: 1, newLineNumber: 2 });
});

test("test_computeInlineRows_leaves_preamble_and_hunk_headers_unnumbered", () => {
    // Scenario: lines before the first "@@" (revision-block preamble) and the hunk headers
    // themselves carry no line numbers; headers keep the hunk color class.
    // Steps:
    // compute inline rows for a diff carrying a preamble line before its hunk.
    const rows = computeInlineRows("revision #2\n@@ -1,1 +1,1 @@\n same");
    // the preamble row is plain and unnumbered.
    assert.deepEqual(rows[0], { text: "revision #2", lineClass: "" });
    // the hunk header row is hunk-colored and unnumbered.
    assert.deepEqual(rows[1], { text: "@@ -1,1 +1,1 @@", lineClass: "diff-line-hunk" });
    // the context line after the header is numbered from both seeds.
    assert.deepEqual(rows[2], { text: " same", lineClass: "", oldLineNumber: 1, newLineNumber: 1 });
});

test("test_computeInlineRows_seeds_counters_from_gits_short_form_header_with_function_context", () => {
    // Scenario: the inline view meets the same git short-form header ("@@ -5 +5,2 @@
    // def reorder():") — it renders as a hunk row and seeds both counters from 5 (item 51).
    // Steps:
    // compute inline rows for a one-hunk diff headed by the git short form.
    const rows = computeInlineRows("@@ -5 +5,2 @@ def reorder():\n keep\n+born");
    // the git-shaped header row is hunk-colored and unnumbered.
    assert.deepEqual(rows[0], { text: "@@ -5 +5,2 @@ def reorder():", lineClass: "diff-line-hunk" });
    // the context line is numbered from the header's seeds: old 5 / new 5.
    assert.deepEqual(rows[1], { text: " keep", lineClass: "", oldLineNumber: 5, newLineNumber: 5 });
    // the addition consumes new 6 only.
    assert.deepEqual(rows[2], { text: "+born", lineClass: "diff-line-add", newLineNumber: 6 });
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

// -------------------- consent dialog display blocks (item 69) --------------------

// A minimal wire consent script for grouping tests; index makes each row distinguishable.
function makeConsentScript(index: number, readOnly: boolean): { timestamp: string; code: string; readOnly?: boolean } {
    return { timestamp: `2026-01-01T00:00:0${index}Z`, code: `print(${index})`, readOnly };
}

test("test_groupConsentScriptsIntoBlocks_collapses_contiguous_read_only_runs", () => {
    // Scenario: [ro, ro, mod, ro] yields [read-only run of 2, modifying, read-only run of 1],
    // preserving chronological order.
    const scripts = [makeConsentScript(1, true), makeConsentScript(2, true), makeConsentScript(3, false), makeConsentScript(4, true)];
    const blocks = groupConsentScriptsIntoBlocks(scripts);
    assert.equal(blocks.length, 3);
    assert.equal(blocks[0]!.kind, ConsentBlockKind.readOnlyRun);
    assert.equal(blocks[0]!.kind === ConsentBlockKind.readOnlyRun ? blocks[0]!.scripts.length : 0, 2);
    assert.equal(blocks[1]!.kind, ConsentBlockKind.modifying);
    assert.equal(blocks[2]!.kind, ConsentBlockKind.readOnlyRun);
});

test("test_groupConsentScriptsIntoBlocks_treats_missing_flag_as_modifying", () => {
    // Scenario: a script with no readOnly field (older server) renders as a full modifying
    // row — the dialog degrades to today's behavior, never hides anything untagged.
    const scripts = [{ timestamp: "2026-01-01T00:00:01Z", code: "x" }];
    const blocks = groupConsentScriptsIntoBlocks(scripts);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]!.kind, ConsentBlockKind.modifying);
});

test("test_groupConsentScriptsIntoBlocks_returns_no_blocks_for_no_scripts", () => {
    // Scenario: an empty script list yields an empty block list (no phantom summary line).
    assert.equal(groupConsentScriptsIntoBlocks([]).length, 0);
});

test("test_checkConsentScriptOverflowsPreview_returns_false_for_short_script", () => {
    // Scenario: a script that fits inside the 200px preview needs no Expand button.
    // Steps:
    // build a script whose line count is exactly the preview capacity (12 lines).
    const code = Array.from({ length: 12 }, (_, index) => `line ${index}`).join("\n");
    // the overflow check must say the preview does NOT overflow.
    assert.equal(checkConsentScriptOverflowsPreview(code), false);
});

test("test_checkConsentScriptOverflowsPreview_returns_true_for_script_longer_than_preview", () => {
    // Scenario: a script one line taller than the preview capacity gets an Expand button.
    // Steps:
    // build a script whose line count is one over the preview capacity (13 lines).
    const code = Array.from({ length: 13 }, (_, index) => `line ${index}`).join("\n");
    // the overflow check must say the preview DOES overflow.
    assert.equal(checkConsentScriptOverflowsPreview(code), true);
});

test("test_splitInlineInterpreterCode_splits_python_dash_c_wrapper_from_inline_body", () => {
    // Scenario: a recorded run stored as a full shell line (`python3 -c "…" 2>&1`) is split
    // into wrapper + inline Python so the body can be highlighted in its real language.
    // Steps:
    // build a shell line whose quoted body is real Python (single quotes inside are fine).
    const body = "\nimport json\npath = '/tmp/x.jsonl'\nprint(f'{path}')\n";
    const code = `python3 -c "${body}" 2>&1`;
    const split = splitInlineInterpreterCode(code);
    // the splitter must recognize the wrapper and hand back all three segments.
    assert.ok(split !== undefined);
    assert.equal(split.prefix, 'python3 -c "');
    assert.equal(split.body, body);
    assert.equal(split.suffix, '" 2>&1');
    // a python interpreter highlights the body as Python.
    assert.equal(split.languagePath, "__script__.py");
});

test("test_splitInlineInterpreterCode_returns_undefined_for_plain_python_script", () => {
    // Scenario: a normal recorded run is pure Python source, not a shell wrapper — the
    // splitter must decline so the whole preview keeps highlighting as Python.
    const code = "import json\nprint(json.dumps({'a': 1}))\n";
    assert.equal(splitInlineInterpreterCode(code), undefined);
});

// -------------------- consent header script navigation (item 73) --------------------

test("test_findDefaultConsentSelectionIndex_picks_first_modifying_script", () => {
    // Scenario: the consent header's default selection is the first modifying script.
    // Steps:
    // a script list holds two read-only scripts followed by a modifying one.
    const scripts = [makeConsentScript(1, true), makeConsentScript(2, true), makeConsentScript(3, false)];
    // the default selection index is the modifying script's position in the full list.
    assert.equal(findDefaultConsentSelectionIndex(scripts), 2);
});

test("test_findDefaultConsentSelectionIndex_treats_missing_flag_as_modifying", () => {
    // Scenario: a script without a readOnly flag counts as modifying (same rule as
    // groupConsentScriptsIntoBlocks).
    // Steps:
    // a script list holds one read-only script followed by one with no flag at all.
    const scripts = [makeConsentScript(1, true), { timestamp: "2026-01-01T00:00:02Z", code: "print(2)" }];
    // the unflagged script is the default selection.
    assert.equal(findDefaultConsentSelectionIndex(scripts), 1);
});

test("test_findDefaultConsentSelectionIndex_returns_undefined_when_all_read_only", () => {
    // Scenario: with no modifying script there is no default selection — every row starts
    // hidden inside a closed read-only <details> block, so nothing is selectable on load.
    // Steps:
    // a script list holds only read-only scripts.
    const scripts = [makeConsentScript(1, true), makeConsentScript(2, true)];
    // no index is returned.
    assert.equal(findDefaultConsentSelectionIndex(scripts), undefined);
});

test("test_clampConsentSelectionStep_advances_within_bounds", () => {
    // Scenario: stepping forward from the middle of three visible scripts selects the next one.
    assert.equal(clampConsentSelectionStep(1, 1, 3), 2);
});

test("test_clampConsentSelectionStep_clamps_at_last_script", () => {
    // Scenario: stepping forward from the last visible script stays on the last script (no wrap).
    assert.equal(clampConsentSelectionStep(2, 1, 3), 2);
});

test("test_clampConsentSelectionStep_clamps_at_first_script", () => {
    // Scenario: stepping backward from the first visible script stays on the first script (no wrap).
    assert.equal(clampConsentSelectionStep(0, -1, 3), 0);
});

test("test_clampConsentSelectionStep_enters_list_from_no_selection", () => {
    // Scenario: with no current selection (index -1, e.g. every row was hidden until a
    // read-only block opened), stepping forward lands on the first visible script.
    assert.equal(clampConsentSelectionStep(-1, 1, 3), 0);
});

// -------------------- consent script source token (task 97) --------------------

test("test_formatConsentSourceToken_formats_basename_and_line", () => {
    // Scenario: a script extracted from a known JSONL file + line renders as the same
    // " [file.jsonl:123]" token the server's formatRecordSourceToken emits for console labels.
    // Steps:
    // a source records the full transcript path and its 1-based line number.
    const source = { filePath: "/Users/x/.claude/projects/p/session.jsonl", lineNumber: 42 };
    // the token holds only the basename, with a leading space and brackets.
    assert.equal(formatConsentSourceToken(source), " [session.jsonl:42]");
});

test("test_formatConsentSourceToken_returns_empty_string_without_source", () => {
    // Scenario: a script whose record source was never captured contributes nothing to the
    // muted header line — no empty brackets, no stray space.
    assert.equal(formatConsentSourceToken(undefined), "");
});

test("test_formatConsentSourceToken_keeps_bare_filename_unchanged", () => {
    // Scenario: a path with no directory separators is already a basename — extraction must
    // pass it through untouched.
    assert.equal(formatConsentSourceToken({ filePath: "session.jsonl", lineNumber: 7 }), " [session.jsonl:7]");
});
