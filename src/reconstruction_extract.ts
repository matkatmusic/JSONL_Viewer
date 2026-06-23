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
import { resolveAgainstCwd } from "./structures/path-resolve.ts";
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

// Parse `mv <src> <dst>` or `git mv <src> <dst>` (two space-separated paths, no flags).
// s2 used plain `mv` with absolute paths; s6 uses `git mv` with cwd-relative paths.
function parseMvPaths(command: string): RenameInfo | undefined {
    const match = command.trim().match(/^(?:git\s+)?mv\s+(\S+)\s+(\S+)$/);
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

// A parsed bash output redirection: the target file and whether it appends (`>>`)
// rather than overwrites (`>`).
type ParsedRedirect = {
    target: Path;
    appends: boolean;
};

// Parse a bash output redirection target: `>>` appends, `>` overwrites/creates. Returns the
// target and whether it appends, or undefined when there is no redirect. The content is NOT
// parsed from the command — it is recovered from the file-history sidecar (locked decision 3).
function parseRedirect(command: string): ParsedRedirect | undefined {
    const appended = command.match(/>>\s*(\S+)\s*$/);
    if (appended) {
        return { target: new Path(appended[1]!), appends: true };
    }
    const overwritten = command.match(/(?<!>)>\s*(\S+)\s*$/);
    if (overwritten) {
        return { target: new Path(overwritten[1]!), appends: false };
    }
    return undefined;
}

// Turn a Bash tool_use into a file event: `rm` -> delete, `mv`/`git mv` -> rename, `cp` ->
// copy, else undefined (s1 uses rm; s2 uses mv; s3 uses cp; s6 uses git mv). The rename's
// relative paths are resolved against `cwd` so they match the absolute Write/Edit targets.
function bashEventFrom(
    block: ToolUseBlock,
    timestamp: Date,
    cwd: Path | undefined,
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
            from: new Path(resolveAgainstCwd(cwd, moved.from)),
            to: new Path(resolveAgainstCwd(cwd, moved.to)),
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
    const redirected = parseRedirect(input.command);
    if (redirected) {
        const kind = redirected.appends ? EventKind.append : EventKind.overwrite;
        return { kind, changeId: block.id, target: redirected.target, content: "", timestamp };
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

// Map a tool_use block to a file event (Write -> create, Bash rm/mv/git mv -> delete/
// rename, Edit -> in-place splice). `cwd` is the record's working directory, used to resolve
// a rename's relative paths to absolute.
function toFileEvent(
    block: ToolUseBlock,
    timestamp: Date,
    hunksById: Map<string, StructuredPatchHunk[]>,
    cwd: Path | undefined,
): FileEvent | undefined {
    if (block.name === ToolName.Write) {
        return writeEventFrom(block, timestamp);
    }
    if (block.name === ToolName.Bash) {
        return bashEventFrom(block, timestamp, cwd);
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
    const cwd = (record as { cwd?: Path }).cwd;
    for (const block of getContentBlocks(record)) {
        if (block.type !== BlockType.tool_use) {
            continue;
        }
        const event = toFileEvent(block, timestamp, hunksById, cwd);
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
