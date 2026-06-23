// Replay: turn a file's ordered events into its revisions. Each event appends one
// or more revisions and may read the previous one (an Edit emits a removal then
// an addition). The event/revision model lives in reconstruction_engine.ts;
// extraction (records -> events) lives there too. Design: reconstruction_engine.ts.

import { EventKind } from "./structures/vocabulary.ts";
import {
    splitLines,
    genesisLine,
    carryAt,
    lastLinesOf,
    fileIsPresent,
    applyEdit,
    appendRevision,
} from "./reconstruction_replay_edit.ts";
import type {
    CopyEvent,
    DeleteEvent,
    FileEvent,
    FileRevision,
    OverwriteEvent,
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

// A write produces a create when the file is absent, or an overwrite when it is
// already present. Either way the new content is genesis (every line born here):
// an overwrite replaces all content, it does not splice (locked decision 1). A
// bash `>` redirect routes here too as an OverwriteEvent (both carry content).
function writeRevision(event: WriteEvent | OverwriteEvent, replacesPresent: boolean): FileRevision {
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

function deleteRevision(event: DeleteEvent): FileRevision {
    return {
        kind: EventKind.delete,
        changeId: event.changeId,
        timestamp: event.timestamp,
        lines: [],
    };
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
// as of the copy (seedLines), every line genesis (oldLineNum DOES_NOT_EXIST_YET) stamped at the
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
    if (event.kind === EventKind.overwrite) {
        revisions.push(writeRevision(event, fileIsPresent(revisions)));
        return;
    }
    if (event.kind === EventKind.append) {
        revisions.push(appendRevision(event, revisions, fileIsPresent(revisions)));
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
