// Per-line reconstruction engine (clean-room rebuild of "Engine B"): the model
// and the public reconstruction API that turns a transcript into each touched
// file's history. Extraction (records -> events) lives in reconstruction_extract.ts,
// replay (events -> revisions) in reconstruction_replay.ts, lineage (following a
// file across renames) in reconstruction_lineage.ts; rendering in
// reconstruction_render.ts; the runnable entry in reconstruction_cli.ts.
// Design: plans/reconstruction-engine-design.md.

import type { TranscriptRecord } from "./structures/envelope.ts";
import type { StructuredPatchHunk } from "./structures/tool-results.ts";
import { EventKind } from "./structures/vocabulary.ts";
import { Path, Uuid } from "./structures/domain.ts";
import { extractFileEvents } from "./reconstruction_extract.ts";
import { replayEvents } from "./reconstruction_replay.ts";
import { fillRedirectContent } from "./reconstruction_sidecar.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import {
    buildRenameChain,
    distinctFinalPaths,
    eventBelongsToLineage,
    resolveFinalPath,
} from "./reconstruction_lineage.ts";

// --- The per-line model ------------------------------------------------------

// A single sighting of a line's content at a point in time.
export type LineValue = { line: string; timestamp: Date };

// A line within a revision: its content history at this position, plus a
// back-pointer to the index it held in the previous revision (DOES_NOT_EXIST_YET = born here).
export type LineEntry = { oldLineNum: number; values: LineValue[] };

// The source and destination of a rename (the two paths an mv connects).
export type RenameInfo = { from: Path; to: Path };

// The source and destination of a copy (the two paths a cp connects). Same shape
// as RenameInfo but a distinct concept: a copy duplicates, a rename moves.
export type CopyInfo = { from: Path; to: Path };

// A whole-file snapshot at a timestamp. kind records which evidence kind produced
// it; changeId identifies the source operation (derived from its tool_use id).
// rename is set only on a rename revision (its from/to paths); copy is set only
// on a copy (genesis) revision.
export type FileRevision = {
    kind: EventKind;
    changeId: Uuid;
    timestamp: Date;
    lines: LineEntry[];
    rename?: RenameInfo;
    copy?: CopyInfo;
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

// An in-place Edit; its structuredPatch hunks drive the line splice.
export type EditEvent = {
    kind: EventKind.edit;
    changeId: Uuid;
    target: Path;
    hunks: StructuredPatchHunk[];
    timestamp: Date;
};

// A rename (Bash mv): the file's history continues at `to`, carrying its lines.
export type RenameEvent = {
    kind: EventKind.rename;
    changeId: Uuid;
    from: Path;
    to: Path;
    timestamp: Date;
};

// A copy (Bash cp): a NEW file whose genesis content is the source's content as
// of the copy. seedLines holds those source line texts; it is empty from
// extraction and filled during reconstruction (the cp result carries no
// content). The source file lives on as its own history — a copy is not a move.
export type CopyEvent = {
    kind: EventKind.copy;
    changeId: Uuid;
    from: Path;
    to: Path;
    seedLines: string[];
    timestamp: Date;
};

// A bash `>>` append: prior lines survive, the new tail is genesis. content is the
// file's full post-append text, recovered from the file-history sidecar (the redirect
// leaves no content in the JSONL); it is empty from extraction and filled during
// reconstruction. See plans/s5/s5-reconstruction-plan.md.
export type AppendEvent = {
    kind: EventKind.append;
    changeId: Uuid;
    target: Path;
    content: string;
    timestamp: Date;
};

// A bash `>` overwrite: a wholesale full-content revision (S4 overwrite, produced by a
// redirect). content is recovered from the sidecar like AppendEvent.
export type OverwriteEvent = {
    kind: EventKind.overwrite;
    changeId: Uuid;
    target: Path;
    content: string;
    timestamp: Date;
};

export type FileEvent =
    | WriteEvent
    | DeleteEvent
    | EditEvent
    | RenameEvent
    | CopyEvent
    | AppendEvent
    | OverwriteEvent;

// --- Reconstruction: the public API ------------------------------------------

// Reconstruct one file's history: follow any rename to its final path, keep only
// that lineage's events, seed any copy from its source, then replay. Generic over
// the target; supports whatever event kinds extraction and replay model.
export function reconstructFile(
    records: TranscriptRecord[],
    target: Path,
    reader?: BackupReader,
): FileRevision[] {
    return reconstructLineage(records, target, new Set<string>(), reader);
}

// resolving holds the destination paths currently being seeded, so a copy cycle
// (cp a b; cp b a) breaks instead of recursing forever. reader fills bash-redirect
// content from the file-history sidecar before replay (undefined for S1-S4).
function reconstructLineage(
    records: TranscriptRecord[],
    target: Path,
    resolving: Set<string>,
    reader?: BackupReader,
): FileRevision[] {
    const events = extractFileEvents(records);
    const renameChain = buildRenameChain(events);
    const finalTarget = resolveFinalPath(target, renameChain);
    const lineage = events.filter((event) =>
        eventBelongsToLineage(event, finalTarget, renameChain),
    );
    const seeded = seedCopyEvents(records, lineage, resolving, reader);
    const filled = reader ? fillRedirectContent(records, seeded, reader) : seeded;
    return replayEvents(filled);
}

// Fill each copy event's seedLines from its source; pass other events through.
function seedCopyEvents(
    records: TranscriptRecord[],
    lineage: FileEvent[],
    resolving: Set<string>,
    reader?: BackupReader,
): FileEvent[] {
    return lineage.map((event) => {
        if (event.kind === EventKind.copy) {
            return seedOneCopy(records, event, resolving, reader);
        }
        return event;
    });
}

// Seed one copy with the source file's content as of the copy timestamp.
function seedOneCopy(
    records: TranscriptRecord[],
    event: CopyEvent,
    resolving: Set<string>,
    reader?: BackupReader,
): CopyEvent {
    const destination = event.to.toString();
    if (resolving.has(destination)) {
        return { ...event, seedLines: [] };
    }
    const next = new Set(resolving);
    next.add(destination);
    const sourceRevisions = reconstructLineage(records, event.from, next, reader);
    const atCopy = lastRevisionAtOrBefore(sourceRevisions, event.timestamp);
    if (!atCopy) {
        return { ...event, seedLines: [] };
    }
    return { ...event, seedLines: linesTextOf(atCopy) };
}

// The latest revision whose timestamp is at or before `when`, or undefined.
function lastRevisionAtOrBefore(
    revisions: FileRevision[],
    when: Date,
): FileRevision | undefined {
    let chosen: FileRevision | undefined;
    for (const revision of revisions) {
        if (revision.timestamp.getTime() <= when.getTime()) {
            chosen = revision;
        }
    }
    return chosen;
}

// The believed text of each line in a revision (its latest value).
function linesTextOf(revision: FileRevision): string[] {
    return revision.lines.map(
        (entry) => entry.values[entry.values.length - 1]!.line,
    );
}

// Reconstruct every file the transcript touches — each with its own history,
// keyed by the path it ends life at (a renamed file is one history, not two).
export function reconstructAll(
    records: TranscriptRecord[],
    reader?: BackupReader,
): FileHistory[] {
    const events = extractFileEvents(records);
    const renameChain = buildRenameChain(events);
    return distinctFinalPaths(events, renameChain).map((target) => ({
        target,
        revisions: reconstructFile(records, target, reader),
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
    return deletion?.kind === EventKind.delete ? deletion.target : undefined;
}
