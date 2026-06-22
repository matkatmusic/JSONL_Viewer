import { test } from "node:test";
import assert from "node:assert/strict";
import {
    RecordType,
    BlockType,
    ToolName,
    AttachmentPayloadType,
    ENVELOPE_ID_KEYS,
    ENVELOPE_KEYS,
} from "../src/structures/vocabulary.ts";

test("test_record_type_enum_holds_the_s1_wire_strings", () => {
    // Scenario: RecordType's member values are exactly the 10 record-type wire
    // strings of s1 (recon/06-s1-vocabulary.md).
    assert.deepEqual(Object.values(RecordType).sort(), [
        "ai-title",
        "assistant",
        "attachment",
        "bridge-session",
        "file-history-snapshot",
        "last-prompt",
        "mode",
        "permission-mode",
        "system",
        "user",
    ]);
});

test("test_block_type_enum_holds_the_s1_wire_strings", () => {
    // Scenario: BlockType's member values are the 4 content-block wire strings.
    assert.deepEqual(Object.values(BlockType).sort(), [
        "text",
        "thinking",
        "tool_result",
        "tool_use",
    ]);
});

test("test_tool_name_enum_holds_the_s1_wire_strings", () => {
    // Scenario: ToolName's member values are the 2 tool names used in s1.
    assert.deepEqual(Object.values(ToolName).sort(), ["Bash", "Write"]);
});

test("test_attachment_payload_type_enum_holds_the_s1_wire_strings", () => {
    // Scenario: AttachmentPayloadType's member values are the 6 payload kinds.
    assert.deepEqual(Object.values(AttachmentPayloadType).sort(), [
        "agent_listing_delta",
        "deferred_tools_delta",
        "hook_additional_context",
        "hook_success",
        "hook_system_message",
        "skill_listing",
    ]);
});

test("test_envelope_key_groups_mirror_the_envelope_field_names", () => {
    // Scenario: the shared envelope field-key groups are the runtime mirror of
    // EnvelopeBase — the id subset and the full envelope field set.
    assert.deepEqual([...ENVELOPE_ID_KEYS], ["uuid", "parentUuid", "sessionId"]);
    assert.deepEqual([...ENVELOPE_KEYS], [
        "type",
        "uuid",
        "parentUuid",
        "sessionId",
        "isSidechain",
        "cwd",
        "gitBranch",
        "version",
        "timestamp",
        "userType",
        "entrypoint",
    ]);
});
