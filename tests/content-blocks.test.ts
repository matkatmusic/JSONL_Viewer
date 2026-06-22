import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecord } from "../src/parse/parseRecord.ts";
import {
    getContentBlocks,
    UnknownContentBlockTypeError,
    type ToolUseBlock,
} from "../src/structures/content-blocks.ts";
import { BlockType, RecordType, ToolName } from "../src/structures/vocabulary.ts";
import { Uuid } from "../src/structures/domain.ts";
import { readNonEmptyLines } from "./utilities.ts";
import { S1_JSONL } from "./fixtures.ts";

function findWriteToolUseBlockInLine(line: string): ToolUseBlock | undefined {
    const record = parseRecord(line);
    if (record.type !== RecordType.assistant) {
        return undefined;
    }
    for (const block of getContentBlocks(record)) {
        if (block.type === BlockType.tool_use && block.name === ToolName.Write) {
            return block;
        }
    }
    return undefined;
}

test("test_assistant_record_exposes_write_tool_use_block", () => {
    // Scenario: the assistant turn that creates the file exposes a typed
    // `tool_use` block for the Write tool.
    // Steps:
    // scan every assistant record's content blocks for a Write tool_use.
    let writeBlock: ToolUseBlock | undefined;
    for (const line of readNonEmptyLines(S1_JSONL)) {
        writeBlock = writeBlock ?? findWriteToolUseBlockInLine(line);
    }
    // s1 must contain exactly such a block.
    if (!writeBlock) {
        assert.fail("expected a Write tool_use block in s1");
    }
    // the block carries a Uuid id and an input object with file_path + content.
    assert.ok(writeBlock.id instanceof Uuid);
    assert.equal(writeBlock.caller.type, "direct");
    assert.ok("file_path" in writeBlock.input);
    assert.ok("content" in writeBlock.input);
});

test("test_getContentBlocks_throws_on_unknown_block_type", () => {
    // Scenario: a content block whose `type` is outside the s1 vocabulary is
    // rejected loudly (fog-of-war guard at the block level).
    // Steps:
    // build a fake assistant record carrying an unmodeled block type.
    const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "image", source: {} }] },
    });
    const record = parseRecord(line);
    // extracting its blocks throws.
    assert.throws(
        () => getContentBlocks(record),
        UnknownContentBlockTypeError,
    );
});
