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
import { buildFileHistoryViewModel } from "../webapp/views/file-history.js";
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
