// Extraction: turn a transcript's records into ordered file events (records ->
// events). Each tool_use becomes at most one event (Write -> create, Bash rm ->
// delete, Bash mv -> rename, Edit -> splice). The event model and replay live in
// reconstruction_engine.ts / reconstruction_replay.ts. Design: the engine file.

import { getContentBlocks } from "./structures/content-blocks.ts";
import type { ToolUseBlock } from "./structures/content-blocks.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import {
    indexToolUseNamesById,
    type EditResult,
    type StructuredPatchHunk,
} from "./structures/tool-results.ts";
import { BlockType, EventKind, ToolName } from "./structures/vocabulary.ts";
import { Path } from "./structures/domain.ts";
import type {
    CopyInfo,
    EditEvent,
    FileEvent,
    RenameInfo,
    WriteEvent,
} from "./reconstruction_engine.ts";

// Turn a Write tool_use into a write event (file_path/content live in its input).
function writeEventFrom(block: ToolUseBlock, timestamp: Date): WriteEvent {
    const input = block.input as { file_path: string; content: string };
    return {
        kind: EventKind.write,
        changeId: block.id,
        target: new Path(input.file_path),
        content: input.content,
        timestamp,
    };
}

// Parse the target path out of an `rm <path>` Bash command (s1 has no flags).
function parseRmTarget(command: string): Path | undefined {
    const match = command.trim().match(/^rm\s+(.+)$/);
    if (!match) {
        return undefined;
    }
    return new Path(match[1]!.trim());
}

// Parse `mv <src> <dst>` (two space-separated paths, no flags — the s2 form).
function parseMvPaths(command: string): RenameInfo | undefined {
    const match = command.trim().match(/^mv\s+(\S+)\s+(\S+)$/);
    if (!match) {
        return undefined;
    }
    return { from: new Path(match[1]!), to: new Path(match[2]!) };
}

// Parse `cp <src> <dst>` (two space-separated paths, no flags — the s3 form).
function parseCpPaths(command: string): CopyInfo | undefined {
    const match = command.trim().match(/^cp\s+(\S+)\s+(\S+)$/);
    if (!match) {
        return undefined;
    }
    return { from: new Path(match[1]!), to: new Path(match[2]!) };
}

// Turn a Bash tool_use into a file event: `rm` -> delete, `mv` -> rename, `cp` ->
// copy, else undefined (s1 uses rm; s2 uses mv; s3 uses cp).
function bashEventFrom(
    block: ToolUseBlock,
    timestamp: Date,
): FileEvent | undefined {
    const input = block.input as { command: string };
    const removed = parseRmTarget(input.command);
    if (removed) {
        return { kind: EventKind.delete, changeId: block.id, target: removed, timestamp };
    }
    const moved = parseMvPaths(input.command);
    if (moved) {
        return {
            kind: EventKind.rename,
            changeId: block.id,
            from: moved.from,
            to: moved.to,
            timestamp,
        };
    }
    const copied = parseCpPaths(input.command);
    if (copied) {
        return {
            kind: EventKind.copy,
            changeId: block.id,
            from: copied.from,
            to: copied.to,
            seedLines: [],
            timestamp,
        };
    }
    return undefined;
}

// Turn an Edit tool_use into an edit event, attaching the structuredPatch hunks
// reported for it (looked up by tool_use id), or undefined when none are found.
function editEventFrom(
    block: ToolUseBlock,
    timestamp: Date,
    hunksById: Map<string, StructuredPatchHunk[]>,
): EditEvent | undefined {
    const input = block.input as { file_path: string };
    const hunks = hunksById.get(block.id.toString());
    if (!hunks) {
        return undefined;
    }
    return {
        kind: EventKind.edit,
        changeId: block.id,
        target: new Path(input.file_path),
        hunks,
        timestamp,
    };
}

// Map a tool_use block to a file event (Write -> create, Bash rm/mv -> delete/
// rename, Edit -> in-place splice).
function toFileEvent(
    block: ToolUseBlock,
    timestamp: Date,
    hunksById: Map<string, StructuredPatchHunk[]>,
): FileEvent | undefined {
    if (block.name === ToolName.Write) {
        return writeEventFrom(block, timestamp);
    }
    if (block.name === ToolName.Bash) {
        return bashEventFrom(block, timestamp);
    }
    if (block.name === ToolName.Edit) {
        return editEventFrom(block, timestamp, hunksById);
    }
    return undefined;
}

function collectEventsFromRecord(
    record: TranscriptRecord,
    events: FileEvent[],
    hunksById: Map<string, StructuredPatchHunk[]>,
): void {
    const timestamp = record.timestamp;
    if (!(timestamp instanceof Date)) {
        return;
    }
    for (const block of getContentBlocks(record)) {
        if (block.type !== BlockType.tool_use) {
            continue;
        }
        const event = toFileEvent(block, timestamp, hunksById);
        if (event) {
            events.push(event);
        }
    }
}

// Map each Edit's tool_use id -> its structuredPatch hunks, read from the user
// record that reports the result (toolUseResult), keyed back via tool_use_id.
function indexEditHunksByToolUseId(
    records: TranscriptRecord[],
): Map<string, StructuredPatchHunk[]> {
    const nameById = indexToolUseNamesById(records);
    const hunksById = new Map<string, StructuredPatchHunk[]>();
    for (const record of records) {
        collectEditHunksFromRecord(record, nameById, hunksById);
    }
    return hunksById;
}

function collectEditHunksFromRecord(
    record: TranscriptRecord,
    nameById: Map<string, string>,
    hunksById: Map<string, StructuredPatchHunk[]>,
): void {
    for (const block of getContentBlocks(record)) {
        if (block.type !== BlockType.tool_result) {
            continue;
        }
        const toolName = nameById.get(block.tool_use_id.toString());
        if (toolName !== ToolName.Edit) {
            continue;
        }
        const result = record.toolUseResult as EditResult | undefined;
        if (result) {
            hunksById.set(block.tool_use_id.toString(), result.structuredPatch);
        }
    }
}

// Extract every file event across the transcript, ordered by timestamp.
export function extractFileEvents(records: TranscriptRecord[]): FileEvent[] {
    const hunksById = indexEditHunksByToolUseId(records);
    const events: FileEvent[] = [];
    for (const record of records) {
        collectEventsFromRecord(record, events, hunksById);
    }
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
