// Branch-aware reconstruction. The branch-agnostic CORE (`reconstructFileOver` /
// `reconstructFilesOver`) reconstructs over EXACTLY the records it is given — no branch selection —
// so any one conversation branch can be reconstructed in isolation. The public surviving-branch API
// (`reconstructFile` / `reconstructAll` in reconstruction_engine.ts) pre-selects the surviving
// branch and calls this core. (Split out of reconstruction_engine.ts to keep both files within the
// 250-line cap — split, never condense.) Design: plans/s7/s7-reconstruction-plan.md.

import type { TranscriptRecord } from "./structures/envelope.ts";
import type { Path } from "./structures/domain.ts";
import { EventKind } from "./structures/vocabulary.ts";
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
import type {
    CopyEvent,
    FileEvent,
    FileHistory,
    FileRevision,
} from "./reconstruction_engine.ts";

// The branch-agnostic core: reconstruct one file's history over EXACTLY the records given (no branch
// selection here) — follow any rename to its final path, keep only that lineage's events, seed any
// copy from its source, then replay. resolving holds the destination paths currently being seeded,
// so a copy cycle (cp a b; cp b a) breaks instead of recursing forever. reader fills bash-redirect
// content from the file-history sidecar before replay (undefined for S1-S4).
export function reconstructFileOver(
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
    const sourceRevisions = reconstructFileOver(records, event.from, next, reader);
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

// The branch-agnostic core: reconstruct every file touched by EXACTLY the records given (no branch
// selection here) — each with its own history, keyed by the path it ends life at (a renamed file is
// one history, not two).
export function reconstructFilesOver(
    records: TranscriptRecord[],
    reader?: BackupReader,
): FileHistory[] {
    const events = extractFileEvents(records);
    const renameChain = buildRenameChain(events);
    return distinctFinalPaths(events, renameChain).map((target) => ({
        target,
        revisions: reconstructFileOver(records, target, new Set<string>(), reader),
    }));
}
