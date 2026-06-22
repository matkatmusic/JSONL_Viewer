import { test } from "node:test";
import assert from "node:assert/strict";
import {
    indexToolUseNamesById,
    getToolResultForUserRecord,
    type BashResult,
    type WriteResult,
} from "../src/structures/tool-results.ts";
import { ToolName } from "../src/structures/vocabulary.ts";
import { Path } from "../src/structures/domain.ts";
import { loadRecords } from "./utilities.ts";
import { S1_JSONL } from "./fixtures.ts";

test("test_write_result_carries_originalFile_and_empty_structuredPatch", () => {
    // Scenario: the Write tool's structured result is typed with its s1 fields,
    // including a null originalFile (a create) and an empty structuredPatch.
    // Steps:
    // load all s1 records and index tool_use ids to their tool names.
    const records = loadRecords(S1_JSONL);
    const nameById = indexToolUseNamesById(records);
    // find the Write tool result attached to a user record.
    let writeResult: WriteResult | undefined;
    for (const record of records) {
        const resolved = getToolResultForUserRecord(record, nameById);
        if (resolved?.toolName === ToolName.Write) {
            writeResult = resolved.result;
        }
    }
    // s1 must contain a Write result.
    if (!writeResult) {
        assert.fail("expected a Write tool result in s1");
    }
    // it is a create (originalFile null) with no diff hunks.
    assert.equal(writeResult.type, "create");
    assert.equal(writeResult.originalFile, null);
    assert.deepEqual(writeResult.structuredPatch, []);
    assert.equal(typeof writeResult.content, "string");
    // its filePath is a Path domain object, not a primitive.
    assert.ok(writeResult.filePath instanceof Path);
});

test("test_bash_result_carries_stdout_and_stderr", () => {
    // Scenario: the Bash tool's structured result is typed with its s1 fields.
    // Steps:
    // load records and index tool names.
    const records = loadRecords(S1_JSONL);
    const nameById = indexToolUseNamesById(records);
    // find a Bash tool result.
    let bashResult: BashResult | undefined;
    for (const record of records) {
        const resolved = getToolResultForUserRecord(record, nameById);
        if (resolved?.toolName === ToolName.Bash) {
            bashResult = resolved.result;
        }
    }
    // s1 must contain a Bash result.
    if (!bashResult) {
        assert.fail("expected a Bash tool result in s1");
    }
    // stdout and stderr are strings; interrupted is a boolean.
    assert.equal(typeof bashResult.stdout, "string");
    assert.equal(typeof bashResult.stderr, "string");
    assert.equal(typeof bashResult.interrupted, "boolean");
});
