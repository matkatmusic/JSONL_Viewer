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
import { findConversationBranches, selectBranchRecords } from "./reconstruction_branch.ts";
import { fillRedirectContent, seedEditBaseFromBackup } from "./reconstruction_sidecar.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import { completeElidedBeacons, completeTruncatedBeacon } from "./reconstruction_beacons.ts";
import { injectScriptExecutions } from "./reconstruction_script_stage.ts";
import { seedStaleEditBases } from "./reconstruction_reseed.ts";
import { noteStage } from "./reconstruction_provenance.ts";
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
    const based = reader ? seedEditBaseFromBackup(records, filled, reader) : filled;
    const scripted = reader ? injectScriptExecutions(records, based, reader) : based;
    const unelided = reader ? completeElidedBeacons(records, scripted, reader) : scripted;
    const restaged = reader ? seedStaleEditBases(records, unelided, reader) : unelided;
    const completed = reader ? completeTruncatedBeacon(records, restaged, reader) : restaged;
    return replayEvents(completed);
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
    noteStage({ stage: "seedCopyEvents", target: event.to, changeId: event.changeId, detail: `seeded copy genesis from ${event.from}`, when: event.timestamp });
    return { ...event, seedLines: linesTextOf(atCopy) };
}

// The latest revision whose timestamp is at or before `when`, or undefined.
export function lastRevisionAtOrBefore(
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
export function linesTextOf(revision: FileRevision): string[] {
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

// The changeIds of every user edit that ACTUALLY changed a file, across all conversation branches. A
// user edit's revision survives replay only when its snapshot differs from the file's current content
// (reconstruction_replay.userEditChangesContent), so a redundant disk-echo snapshot — the IDE echoes an
// `edited_text_file` whenever a file is written or read — leaves no revision and is absent here. The
// graph views consult this to drop echo turns while keeping genuine user-edit turns, so every view
// agrees on which user edits are real changes. Branch-aware: a snapshot is judged against ITS OWN
// branch's content (s13's echo matches the read branch's restored content, not the cross-branch mix).
export function collectAcceptedUserEditIds(
    records: TranscriptRecord[],
    reader?: BackupReader,
): Set<string> {
    const accepted = new Set<string>();
    for (const branch of findConversationBranches(records)) {
        const branchRecords = selectBranchRecords(records, branch.tip);
        addBranchUserEditIds(reconstructFilesOver(branchRecords, reader), accepted);
    }
    return accepted;
}

// The changeIds of the surviving user-edit revisions in one branch's reconstructed histories.
function userEditIdsOf(history: FileHistory): string[] {
    return history.revisions
        .filter((revision) => revision.kind === EventKind.userEdit)
        .map((revision) => revision.changeId.toString());
}

// Add every branch history's surviving user-edit changeId into the accumulating accepted set.
function addBranchUserEditIds(histories: FileHistory[], accepted: Set<string>): void {
    for (const id of histories.flatMap(userEditIdsOf)) {
        accepted.add(id);
    }
}

// Whether a file event should appear in a rendered view: every non-user-edit event always does; a
// user-edit event does only when it actually changed content (its changeId is in the accepted set).
export function isRenderableEvent(event: FileEvent, accepted: Set<string>): boolean {
    if (event.kind !== EventKind.userEdit) {
        return true;
    }
    return accepted.has(event.changeId.toString());
}

// The transcript's file events filtered to those a view should render: drops redundant disk-echo user
// edits (an `edited_text_file` snapshot that changed nothing). `accepted` comes from
// collectAcceptedUserEditIds; pass undefined to keep every event (an unfiltered letter pass).
export function extractRenderableEvents(
    records: TranscriptRecord[],
    accepted?: Set<string>,
): FileEvent[] {
    const events = extractFileEvents(records);
    if (accepted === undefined) {
        return events;
    }
    return events.filter((event) => isRenderableEvent(event, accepted));
}
