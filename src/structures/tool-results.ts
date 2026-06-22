import type { TranscriptRecord } from "./envelope.ts";
import { getContentBlocks } from "./content-blocks.ts";
import { BlockType, ToolName } from "./vocabulary.ts";
import { Path } from "./domain.ts";

// tool_use.input shapes (recon/08, recon/09). file_path is a Path; input
// hydration has no consumer yet, so the type is declared but not constructed.
export type BashInput = { command: string; description: string };
export type WriteInput = { content: string; file_path: Path };

// toolUseResult shapes (recon/07, recon/09).
export type BashResult = {
    interrupted: boolean;
    isImage: boolean;
    noOutputExpected: boolean;
    stderr: string;
    stdout: string;
};

// No structuredPatch hunk is produced in s1 (a create has no diff). The hunk
// element shape is deferred to a scenario with a real diff; until then a hunk is
// modeled as an empty object so the array type is exact for s1.
export type StructuredPatchHunk = Record<string, never>;

export type WriteResult = {
    content: string;
    filePath: Path;
    originalFile: string | null;
    structuredPatch: StructuredPatchHunk[];
    type: string;
    userModified: boolean;
};

export type ResolvedToolResult =
    | { toolName: ToolName.Bash; result: BashResult }
    | { toolName: ToolName.Write; result: WriteResult };

// Thrown when a tool result resolves to a tool name outside the s1 vocabulary,
// so an unmodeled tool's result cannot pass silently (fog-of-war guard).
export class UnknownToolNameError extends Error {
    readonly toolName: string;

    constructor(toolName: string) {
        super(`Unknown tool name: ${toolName}`);
        this.name = "UnknownToolNameError";
        this.toolName = toolName;
    }
}

function addToolUseNames(
    record: TranscriptRecord,
    nameById: Map<string, string>,
): void {
    for (const block of getContentBlocks(record)) {
        if (block.type === BlockType.tool_use) {
            nameById.set(block.id.toString(), block.name);
        }
    }
}

// Build a map from tool_use id -> tool name across all assistant records, so a
// tool result (which references a tool_use_id) can be attributed to its tool.
export function indexToolUseNamesById(
    records: TranscriptRecord[],
): Map<string, string> {
    const nameById = new Map<string, string>();
    for (const record of records) {
        addToolUseNames(record, nameById);
    }
    return nameById;
}

function resolveToolNameForRecord(
    record: TranscriptRecord,
    nameById: Map<string, string>,
): string | undefined {
    for (const block of getContentBlocks(record)) {
        if (block.type === BlockType.tool_result) {
            return nameById.get(block.tool_use_id.toString());
        }
    }
    return undefined;
}

// Hydrate a Write result's filePath from its wire string into a Path; the rest
// of the fields are content/flags with no narrower domain type.
function hydrateWriteResult(raw: unknown): WriteResult {
    const result = raw as WriteResult & { filePath: string };
    return { ...result, filePath: new Path(result.filePath) };
}

function resolveToolResult(toolName: string, raw: unknown): ResolvedToolResult {
    if (toolName === ToolName.Bash) {
        return { toolName: ToolName.Bash, result: raw as BashResult };
    }
    if (toolName === ToolName.Write) {
        return { toolName: ToolName.Write, result: hydrateWriteResult(raw) };
    }
    throw new UnknownToolNameError(toolName);
}

// Resolve and type the tool result attached to a user record, or undefined when
// the record carries no toolUseResult or no resolvable tool name.
export function getToolResultForUserRecord(
    record: TranscriptRecord,
    nameById: Map<string, string>,
): ResolvedToolResult | undefined {
    const raw = record.toolUseResult;
    if (!raw) {
        return undefined;
    }
    const toolName = resolveToolNameForRecord(record, nameById);
    if (toolName === undefined) {
        return undefined;
    }
    return resolveToolResult(toolName, raw);
}
