// Per-line reconstruction engine (clean-room rebuild of "Engine B"): the core
// logic that turns a transcript into each touched file's history. Rendering lives
// in reconstruction_render.ts; the runnable entry in reconstruction_cli.ts.
// Design: plans/reconstruction-engine-design.md.

import { getContentBlocks } from "./structures/content-blocks.ts";
import type { ToolUseBlock } from "./structures/content-blocks.ts";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { BlockType, EventKind, ToolName } from "./structures/vocabulary.ts";
import { Path, Uuid } from "./structures/domain.ts";

// --- The per-line model ------------------------------------------------------

// A single sighting of a line's content at a point in time.
export type LineValue = { line: string; timestamp: Date };

// A line within a revision: its content history at this position, plus a
// back-pointer to the index it held in the previous revision (-1 = born here).
export type LineEntry = { oldLineNum: number; values: LineValue[] };

// A whole-file snapshot at a timestamp. changeId identifies the source operation
// that produced it (derived from that operation's tool_use id).
export type FileRevision = {
    changeId: Uuid;
    timestamp: Date;
    lines: LineEntry[];
};

// One file's reconstructed history.
export type FileHistory = { target: Path; revisions: FileRevision[] };

// --- Events: one per piece of evidence ---------------------------------------

export type WriteEvent = {
    kind: EventKind.write;
    changeId: Uuid;
    target: Path;
    content: string;
    timestamp: Date;
};

export type DeleteEvent = {
    kind: EventKind.delete;
    changeId: Uuid;
    target: Path;
    timestamp: Date;
};

export type FileEvent = WriteEvent | DeleteEvent;

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

// Turn a Bash `rm` tool_use into a delete event, or undefined for other commands.
function deleteEventFrom(
    block: ToolUseBlock,
    timestamp: Date,
): DeleteEvent | undefined {
    const input = block.input as { command: string };
    const target = parseRmTarget(input.command);
    if (!target) {
        return undefined;
    }
    return { kind: EventKind.delete, changeId: block.id, target, timestamp };
}

// Map a tool_use block to a file event (Write -> create, Bash rm -> delete).
function toFileEvent(
    block: ToolUseBlock,
    timestamp: Date,
): FileEvent | undefined {
    if (block.name === ToolName.Write) {
        return writeEventFrom(block, timestamp);
    }
    if (block.name === ToolName.Bash) {
        return deleteEventFrom(block, timestamp);
    }
    return undefined;
}

function collectEventsFromRecord(
    record: TranscriptRecord,
    events: FileEvent[],
): void {
    const timestamp = record.timestamp;
    if (!(timestamp instanceof Date)) {
        return;
    }
    for (const block of getContentBlocks(record)) {
        if (block.type !== BlockType.tool_use) {
            continue;
        }
        const event = toFileEvent(block, timestamp);
        if (event) {
            events.push(event);
        }
    }
}

// Extract every file event across the transcript, ordered by timestamp.
export function extractFileEvents(records: TranscriptRecord[]): FileEvent[] {
    const events: FileEvent[] = [];
    for (const record of records) {
        collectEventsFromRecord(record, events);
    }
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

// --- Replay: events -> revisions ---------------------------------------------

// Split file content into lines; a single trailing newline is not a phantom line.
export function splitLines(content: string): string[] {
    const parts = content.split("\n");
    if (parts.length > 0 && parts[parts.length - 1] === "") {
        parts.pop();
    }
    return parts;
}

// A genesis line: born at this revision (no predecessor), one authored value.
function genesisLine(line: string, timestamp: Date): LineEntry {
    return { oldLineNum: -1, values: [{ line, timestamp }] };
}

function writeRevision(event: WriteEvent): FileRevision {
    const lines = splitLines(event.content).map((line) =>
        genesisLine(line, event.timestamp),
    );
    return { changeId: event.changeId, timestamp: event.timestamp, lines };
}

function deleteRevision(event: DeleteEvent): FileRevision {
    return { changeId: event.changeId, timestamp: event.timestamp, lines: [] };
}

function toRevision(event: FileEvent): FileRevision {
    if (event.kind === EventKind.write) {
        return writeRevision(event);
    }
    return deleteRevision(event);
}

// Reconstruct one file's history: keep only its events and replay them into
// revisions. Generic over the target; supports whatever event kinds are modeled.
export function reconstructFile(
    records: TranscriptRecord[],
    target: Path,
): FileRevision[] {
    return extractFileEvents(records)
        .filter((event) => event.target.equals(target))
        .map(toRevision);
}

// The distinct file paths touched by a set of events (deduped by path value).
function distinctTargets(events: FileEvent[]): Path[] {
    const byValue = new Map<string, Path>();
    for (const event of events) {
        byValue.set(event.target.toString(), event.target);
    }
    return [...byValue.values()];
}

// Reconstruct every file the transcript touches — each with its own history.
export function reconstructAll(records: TranscriptRecord[]): FileHistory[] {
    return distinctTargets(extractFileEvents(records)).map((target) => ({
        target,
        revisions: reconstructFile(records, target),
    }));
}

// Find a file the transcript deletes (its rm target), if any — lets a caller
// default the target when one isn't named explicitly.
export function findDeletedTarget(
    records: TranscriptRecord[],
): Path | undefined {
    const deletion = extractFileEvents(records).find(
        (event) => event.kind === EventKind.delete,
    );
    return deletion?.target;
}
