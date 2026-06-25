import { test } from "node:test";
import assert from "node:assert/strict";
import {
    loadTranscript,
    parseTranscriptLine,
    UnmodeledFieldError,
} from "../src/parse/loadTranscript.ts";
import { S1_JSONL, S2_JSONL, S19_JSONL, S32_JSONL } from "./fixtures.ts";

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

test("test_s32_jsonl_parses_with_mcp_attribution_keys", () => {
    // Scenario: the s32 transcript runs its rename script through the context-mode MCP
    // sandbox. The MCP-invoking assistant records carry two novel top-level keys
    // (attributionMcpServer / attributionMcpTool). The field-gate must model them, not throw.
    // Steps:
    // load every record of the s32 JSONL through the gate (throws UnmodeledFieldError at HEAD).
    const records = loadTranscript(S32_JSONL);
    // s32 has exactly 206 records.
    assert.equal(records.length, 206);
    // the assistant turns that issued an MCP tool call carry the two attribution keys.
    const withAttribution = records.filter(
        (record) => "attributionMcpServer" in record || "attributionMcpTool" in record,
    );
    // all 19 MCP-invoking assistant turns carry both keys.
    assert.equal(withAttribution.length, 19);
    // each carries the exact context-mode server + ctx_execute tool values.
    for (const record of withAttribution) {
        assert.equal(
            (record as { attributionMcpServer?: string }).attributionMcpServer,
            "plugin:context-mode:context-mode",
        );
        assert.equal(
            (record as { attributionMcpTool?: string }).attributionMcpTool,
            "ctx_execute",
        );
    }
});

test("test_s19_rerun_jsonl_parses_with_attribution_plugin_and_skill_keys", () => {
    // Scenario: the re-run s19 transcript was produced by a newer Claude Code that emits two novel
    // top-level keys on assistant turns issued under an active skill (attributionPlugin /
    // attributionSkill, same `attribution*` family as the MCP keys). The field-gate must model them.
    // Steps:
    // load every record of the re-run s19 JSONL through the gate (throws UnmodeledFieldError at HEAD).
    const records = loadTranscript(S19_JSONL);
    // the re-run transcript has exactly 103 records.
    assert.equal(records.length, 103);
    // the assistant turns issued under a skill carry both attribution keys.
    const withAttribution = records.filter(
        (record) => "attributionSkill" in record || "attributionPlugin" in record,
    );
    // both such assistant turns were issued under the ponytail skill/plugin.
    assert.equal(withAttribution.length, 2);
    for (const record of withAttribution) {
        assert.equal(
            (record as { attributionSkill?: string }).attributionSkill,
            "ponytail:ponytail",
        );
        assert.equal(
            (record as { attributionPlugin?: string }).attributionPlugin,
            "ponytail",
        );
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
