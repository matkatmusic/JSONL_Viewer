// Replay: turn a file's ordered events into its revisions. Each event appends one
// or more revisions and may read the previous one (an Edit emits a removal then
// an addition). The event/revision model lives in reconstruction_engine.ts;
// extraction (records -> events) lives there too. Design: reconstruction_engine.ts.

import type { StructuredPatchHunk } from "./structures/tool-results.ts";
import { EventKind } from "./structures/vocabulary.ts";
import type {
    CopyEvent,
    DeleteEvent,
    EditEvent,
    FileEvent,
    FileRevision,
    LineEntry,
    RenameEvent,
    WriteEvent,
} from "./reconstruction_engine.ts";

// Thrown when replay meets an event kind it cannot apply, so an unmodeled kind
// cannot pass silently (fog-of-war guard; mirrors UnknownToolNameError).
export class UnsupportedEventKindError extends Error {
    readonly kind: string;

    constructor(kind: string) {
        super(`Unsupported event kind in replay: ${kind}`);
        this.name = "UnsupportedEventKindError";
        this.kind = kind;
    }
}

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

// A write produces a create when the file is absent, or an overwrite when it is
// already present. Either way the new content is genesis (every line born here):
// an overwrite replaces all content, it does not splice (locked decision 1).
function writeRevision(event: WriteEvent, replacesPresent: boolean): FileRevision {
    const lines = splitLines(event.content).map((line) =>
        genesisLine(line, event.timestamp),
    );
    return {
        kind: replacesPresent ? EventKind.overwrite : EventKind.write,
        changeId: event.changeId,
        timestamp: event.timestamp,
        lines,
    };
}

// The file is present when the latest revision exists and is not a deletion — so a
// write after a delete is a fresh create, not an overwrite (locked decision 3).
function fileIsPresent(revisions: FileRevision[]): boolean {
    const last = revisions[revisions.length - 1];
    return last !== undefined && last.kind !== EventKind.delete;
}

function deleteRevision(event: DeleteEvent): FileRevision {
    return {
        kind: EventKind.delete,
        changeId: event.changeId,
        timestamp: event.timestamp,
        lines: [],
    };
}

// The lines of the latest revision, or [] when there is none yet.
function lastLinesOf(revisions: FileRevision[]): LineEntry[] {
    const last = revisions[revisions.length - 1];
    return last ? last.lines : [];
}

function editRevision(event: EditEvent, lines: LineEntry[]): FileRevision {
    return {
        kind: EventKind.edit,
        changeId: event.changeId,
        timestamp: event.timestamp,
        lines,
    };
}

// The old-line indices (into the previous revision) that this hunk deletes. Walk
// the hunk: ' ' and '-' each consume one old line starting at oldStart-1; '-' is
// deleted.
function removedOldIndicesOf(hunk: StructuredPatchHunk): Set<number> {
    const removed = new Set<number>();
    let oldIndex = hunk.oldStart - 1;
    for (const line of hunk.lines) {
        if (line.startsWith("-")) {
            removed.add(oldIndex);
            oldIndex += 1;
        } else if (line.startsWith("+")) {
            // an inserted line consumes no old line
        } else {
            oldIndex += 1;
        }
    }
    return removed;
}

// Previous lines minus the removed indices; each survivor keeps its previous
// index as its oldLineNum back-pointer.
function keepSurvivingLines(
    previousLines: LineEntry[],
    removed: Set<number>,
): LineEntry[] {
    const survivors: LineEntry[] = [];
    for (let index = 0; index < previousLines.length; index++) {
        if (removed.has(index)) {
            continue;
        }
        survivors.push({ oldLineNum: index, values: previousLines[index]!.values });
    }
    return survivors;
}

// Carry a working line forward unchanged, recording its current index as oldLineNum.
function carryAt(entry: LineEntry, index: number): LineEntry {
    return { oldLineNum: index, values: entry.values };
}

// Insert the hunk's '+' lines among the (post-removal) working lines. Context
// lines carry their working index as oldLineNum and keep their existing values;
// '+' lines are born (-1) with the hunk text (its prefix char stripped) at the
// edit timestamp.
function insertHunkAdditions(
    workingLines: LineEntry[],
    hunk: StructuredPatchHunk,
    timestamp: Date,
): { lines: LineEntry[]; added: boolean } {
    const result: LineEntry[] = workingLines.slice(0, hunk.oldStart - 1).map(carryAt);
    let workingIndex = hunk.oldStart - 1;
    let added = false;
    for (const line of hunk.lines) {
        if (line.startsWith("-")) {
            continue;
        }
        if (line.startsWith("+")) {
            result.push({ oldLineNum: -1, values: [{ line: line.slice(1), timestamp }] });
            added = true;
        } else {
            result.push({ oldLineNum: workingIndex, values: workingLines[workingIndex]!.values });
            workingIndex += 1;
        }
    }
    for (let index = workingIndex; index < workingLines.length; index++) {
        result.push({ oldLineNum: index, values: workingLines[index]!.values });
    }
    return { lines: result, added };
}

// Splice one Edit's hunks against the latest revision. A hunk with any '-' emits
// a removal revision; a hunk with any '+' emits an addition revision; both carry
// the Edit's changeId. Context lines keep identity; inserted lines are born (-1).
function applyEdit(event: EditEvent, revisions: FileRevision[]): void {
    for (const hunk of event.hunks) {
        const previousLines = lastLinesOf(revisions);
        const removed = removedOldIndicesOf(hunk);
        if (removed.size > 0) {
            const removalLines = keepSurvivingLines(previousLines, removed);
            revisions.push(editRevision(event, removalLines));
        }
        const additionLines = insertHunkAdditions(lastLinesOf(revisions), hunk, event.timestamp);
        if (additionLines.added) {
            revisions.push(editRevision(event, additionLines.lines));
        }
    }
}

// A rename is a first-class entry: it carries the prior lines forward unchanged
// (identity back-pointers) and records the from/to paths. It mints no line change.
function renameRevision(
    event: RenameEvent,
    revisions: FileRevision[],
): FileRevision {
    const lines = lastLinesOf(revisions).map(carryAt);
    return {
        kind: EventKind.rename,
        changeId: event.changeId,
        timestamp: event.timestamp,
        lines,
        rename: { from: event.from, to: event.to },
    };
}

// A copy is a first-class genesis entry: a NEW file born with the source's content
// as of the copy (seedLines), every line genesis (oldLineNum -1) stamped at the
// copy timestamp, recording the from/to provenance. The source file is untouched.
function copyRevision(event: CopyEvent): FileRevision {
    const lines = event.seedLines.map((line) =>
        genesisLine(line, event.timestamp),
    );
    return {
        kind: EventKind.copy,
        changeId: event.changeId,
        timestamp: event.timestamp,
        lines,
        copy: { from: event.from, to: event.to },
    };
}

function appendRevisionsForEvent(
    event: FileEvent,
    revisions: FileRevision[],
): void {
    if (event.kind === EventKind.write) {
        revisions.push(writeRevision(event, fileIsPresent(revisions)));
        return;
    }
    if (event.kind === EventKind.delete) {
        revisions.push(deleteRevision(event));
        return;
    }
    if (event.kind === EventKind.edit) {
        applyEdit(event, revisions);
        return;
    }
    if (event.kind === EventKind.rename) {
        revisions.push(renameRevision(event, revisions));
        return;
    }
    if (event.kind === EventKind.copy) {
        revisions.push(copyRevision(event));
        return;
    }
    throw new UnsupportedEventKindError((event as { kind: string }).kind);
}

// Replay events in order into revisions; an event may append more than one
// (an Edit emits a removal then an addition) and may read the previous one.
export function replayEvents(events: FileEvent[]): FileRevision[] {
    const revisions: FileRevision[] = [];
    for (const event of events) {
        appendRevisionsForEvent(event, revisions);
    }
    return revisions;
}
