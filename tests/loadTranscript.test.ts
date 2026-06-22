import { test } from "node:test";
import assert from "node:assert/strict";
import {
    loadTranscript,
    parseTranscriptLine,
    UnmodeledFieldError,
} from "../src/parse/loadTranscript.ts";
import { S1_JSONL, S2_JSONL } from "./fixtures.ts";

test("test_s1_jsonl_parses_into_known_typed_records", () => {
    // Scenario: loading the whole s1 transcript yields only typed records — no
    // unknown record type and no unmodeled top-level key falls through.
    // Steps:
    // load every record of the s1 JSONL through the gate.
    const records = loadTranscript(S1_JSONL);
    // s1 has exactly 80 records.
    assert.equal(records.length, 80);
    // every record carries a known record type string.
    for (const record of records) {
        assert.equal(typeof record.type, "string");
    }
});

test("test_s2_jsonl_parses_into_known_typed_records", () => {
    // Scenario: the whole s2-move-file transcript passes the field-level gate —
    // its new vocabulary (Read/Edit tools, 3 new attachment kinds, the user
    // isMeta key) is modeled, so nothing falls through as unknown/unmodeled.
    // Steps:
    // load every record of the s2 JSONL through the gate.
    const records = loadTranscript(S2_JSONL);
    // s2 has exactly 125 records.
    assert.equal(records.length, 125);
    // every record carries a known record type string.
    for (const record of records) {
        assert.equal(typeof record.type, "string");
    }
});

test("test_parseTranscriptLine_rejects_unmodeled_top_level_key", () => {
    // Scenario: a record carrying a top-level key absent from the s1 field
    // inventory is rejected loudly (field-level fog-of-war guard).
    // Steps:
    // build a valid mode record with one extra, unmodeled key.
    const line = JSON.stringify({
        type: "mode",
        sessionId: "s",
        mode: "normal",
        bogusKey: 1,
    });
    // parsing it through the gate throws.
    assert.throws(() => parseTranscriptLine(line), UnmodeledFieldError);
});
