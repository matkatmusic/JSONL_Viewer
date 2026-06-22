import type { TranscriptRecord } from "./envelope.ts";
import { BlockType, KNOWN_CONTENT_BLOCK_TYPES } from "./vocabulary.ts";
import { Uuid } from "./domain.ts";

export type TextBlock = {
    type: BlockType.text;
    text: string;
};

export type ThinkingBlock = {
    type: BlockType.thinking;
    thinking: string;
    signature: string;
};

// `input` is an object whose per-tool key shape is typed in tool-results.
// `caller` is `{ type: "direct" }` in s1; modeled as the present field only.
export type ToolUseBlock = {
    type: BlockType.tool_use;
    id: Uuid;
    name: string;
    input: Record<string, unknown>;
    caller: { type: string };
};

export type ToolResultBlock = {
    type: BlockType.tool_result;
    tool_use_id: Uuid;
    content: string;
    is_error: boolean;
};

export type ContentBlock =
    | TextBlock
    | ThinkingBlock
    | ToolUseBlock
    | ToolResultBlock;

// Thrown when a content block carries a `type` outside the s1 vocabulary, so an
// unmodeled block shape cannot pass silently (fog-of-war guard).
export class UnknownContentBlockTypeError extends Error {
    readonly blockType: string;

    constructor(blockType: string) {
        super(`Unknown content block type: ${blockType}`);
        this.name = "UnknownContentBlockTypeError";
        this.blockType = blockType;
    }
}

const KNOWN_BLOCK_TYPE_SET = new Set<string>(KNOWN_CONTENT_BLOCK_TYPES);

function isKnownContentBlockType(value: unknown): value is BlockType {
    if (typeof value !== "string") {
        return false;
    }
    return KNOWN_BLOCK_TYPE_SET.has(value);
}

// Hydrate the id fields of a block from their wire strings into Uuid objects, so
// tool-use and tool-result ids are domain objects, not primitives. Returns a
// fresh object so the underlying raw record is never mutated — getContentBlocks
// runs repeatedly over the same record, and in-place mutation would re-wrap an
// already-hydrated id.
function hydrateBlockIds(block: Record<string, unknown>): ContentBlock {
    if (block.type === BlockType.tool_use) {
        return { ...block, id: new Uuid(String(block.id)) } as ContentBlock;
    }
    if (block.type === BlockType.tool_result) {
        return {
            ...block,
            tool_use_id: new Uuid(String(block.tool_use_id)),
        } as ContentBlock;
    }
    return block as ContentBlock;
}

function toContentBlock(raw: unknown): ContentBlock {
    const block = raw as Record<string, unknown> & { type?: unknown };
    if (!isKnownContentBlockType(block.type)) {
        throw new UnknownContentBlockTypeError(String(block.type));
    }
    return hydrateBlockIds(block);
}

// Return the typed content blocks of a record's message, or [] when the record
// carries no message.content array (e.g. session-meta records). Throws on any
// block whose type is outside the s1 vocabulary.
export function getContentBlocks(record: TranscriptRecord): ContentBlock[] {
    const message = record.message as { content?: unknown } | undefined;
    if (!message || !Array.isArray(message.content)) {
        return [];
    }
    return message.content.map(toContentBlock);
}
