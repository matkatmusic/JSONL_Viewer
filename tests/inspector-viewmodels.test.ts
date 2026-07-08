// Pure view-model tests for the JSON inspector's formatted-text mode (webapp/inspector.js).
// Records arrive exactly as the inspector sees them: JSON.parse of one raw JSONL line, or the
// raw string itself when the line is not JSON.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRevisionLinkRoute, extractReadableText } from "../webapp/inspector.js";

test("test_extract_readable_text_returns_string_message_content_verbatim", () => {
    // Scenario: a user record whose message.content is a plain string — the prompt text IS
    // the readable content.
    const record = { type: "user", message: { role: "user", content: "fix the bug" } };
    assert.equal(extractReadableText(record), "fix the bug");
});

test("test_extract_readable_text_joins_text_blocks_with_blank_lines", () => {
    // Scenario: an assistant record with two text blocks reads as two paragraphs.
    const record = { type: "assistant", message: { content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
    ] } };
    assert.equal(extractReadableText(record), "first\n\nsecond");
});

test("test_extract_readable_text_unwraps_tool_result_content", () => {
    // Scenario: a tool_result block carries the file/tool output — string form and nested
    // text-block form both read as their text.
    const stringForm = { message: { content: [{ type: "tool_result", content: "line a\nline b" }] } };
    assert.equal(extractReadableText(stringForm), "line a\nline b");
    const nestedForm = { message: { content: [{ type: "tool_result", content: [{ type: "text", text: "inner" }] }] } };
    assert.equal(extractReadableText(nestedForm), "inner");
});

test("test_extract_readable_text_renders_tool_use_string_inputs_verbatim", () => {
    // Scenario: a tool_use block (e.g. a Write) holds the real payload in its string input
    // fields — show them with real newlines under a per-field divider, not JSON-escaped.
    const record = { message: { content: [
        { type: "tool_use", name: "Write", input: { file_path: "a.py", content: "x = 1\ny = 2", count: 3 } },
    ] } };
    assert.equal(
        extractReadableText(record),
        "[tool_use: Write]\n--- file_path ---\na.py\n--- content ---\nx = 1\ny = 2",
    );
});

test("test_extract_readable_text_marks_unknown_blocks_instead_of_dropping_them", () => {
    // Scenario: a block kind the extractor does not model becomes a one-line placeholder so
    // nothing silently vanishes.
    const record = { message: { content: [{ type: "thinking", thinking: "hmm" }] } };
    assert.equal(extractReadableText(record), "[thinking]");
});

test("test_extract_readable_text_returns_undefined_without_message_content", () => {
    // Scenario: a file-history snapshot record has no message — the inspector hides the
    // formatted-text toggle for it.
    assert.equal(extractReadableText({ type: "file-history-snapshot", snapshot: {} }), undefined);
});

test("test_extract_readable_text_returns_non_json_lines_verbatim", () => {
    // Scenario: the inspector falls back to the raw string when a line fails JSON.parse;
    // that string is already the readable content.
    assert.equal(extractReadableText("not json at all"), "not json at all");
});

test("test_revision_link_route_carries_revision_anchor", () => {
    // Scenario: a revision link with a revision number routes to the file-history view
    // anchored at that revision — the same /rev/<n> shape routeToFileHistory-based routes use.
    // Steps:
    // compute the route for a resolved link with revisionNumber 3.
    const route = computeRevisionLinkRoute("proj-a", { target: "/tmp/app.py", revisionNumber: 3 });
    // assert the file-history route with the /rev/3 anchor.
    assert.equal(route, "#/project/proj-a/file/%2Ftmp%2Fapp.py/rev/3");
});

test("test_revision_link_route_without_revision_number_omits_anchor", () => {
    // Scenario: a link that resolved to a file but no single revision routes to the plain
    // file-history view (no /rev segment).
    // Steps:
    // compute the route for a link with no revisionNumber.
    const route = computeRevisionLinkRoute("proj-a", { target: "/tmp/app.py", revisionNumber: undefined });
    // assert the bare file-history route.
    assert.equal(route, "#/project/proj-a/file/%2Ftmp%2Fapp.py");
});
