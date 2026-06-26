// Backup-driven event-list transforms for the STALE-EDIT-BASE family: rewrite a file's reconstructed
// event list using content recovered from the file-history sidecar, BEFORE replay. Reader-only (the
// caller guards on `reader`, so reader-free reconstruction is byte-for-byte untouched):
//   - seedStaleEditBases: splice a synthetic Write before a MID-stream Edit whose reconstructed base
//     drifted from the disk it was computed against. Two disjoint triggers:
//       * a STALE hunk-context base (spec 39 generalised to s19/s23/m6) — the edit's hunk context no
//         longer matches the reconstructed base, so it would splice onto wrong lines; or
//       * an OUT-OF-WINDOW uncaptured manual change (s34) — the hunk context still matches, but the real
//         pre-edit disk carried a trailing append (NO beacon, NO tool_use) outside the hunk window,
//         recovered by content from the at/before backup and forward-validated (never fabricated).
// The beacon-completion family (completeTruncatedBeacon / completeElidedBeacons, s27/s28) lives in
// reconstruction_beacons.ts — split, never condense, to keep both files within the 250-line cap.
// Design: plans/s27/…, plans/s28/…, plans/s34/s34-reconstruction-plan.md §"The fix".

import type { TranscriptRecord } from "./structures/envelope.ts";
import type { Path } from "./structures/domain.ts";
import { EventKind } from "./structures/vocabulary.ts";
import { replayEvents } from "./reconstruction_replay.ts";
import { lastLinesOf, splitLines } from "./reconstruction_replay_edit.ts";
import { backupSeedWriteFor } from "./reconstruction_sidecar.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import { noteStage } from "./reconstruction_provenance.ts";
import type { EditEvent, FileEvent, WriteEvent } from "./reconstruction_engine.ts";

// --- stale mid-stream edit bases (s19 / s23) -------------------------------------------------------

// The reconstructed base text (each line's latest value) the events before an edit produce.
function reconstructedBaseText(priorEvents: FileEvent[]): string[] {
    return lastLinesOf(replayEvents(priorEvents)).map(
        (entry) => entry.values[entry.values.length - 1]!.line,
    );
}

// Whether an edit's first hunk splices cleanly onto `base`: each context/removed line must equal the base
// line at its position; a mismatch — or a position past the base — means it lands on wrong lines. Shared
// by editBaseIsStale (the hunk-context staleness test) and outOfWindowEditSeed (forward-validation that a
// candidate backup is the real pre-edit disk state, not a poison/wrong blob).
function firstHunkMatchesBase(event: EditEvent, base: string[]): boolean {
    const firstHunk = event.hunks[0];
    if (firstHunk === undefined) {
        return true;
    }
    let index = firstHunk.oldStart - 1;
    for (const line of firstHunk.lines) {
        if (line.startsWith("+")) {
            continue;
        }
        if (index >= base.length || base[index] !== line.slice(1)) {
            return false;
        }
        index += 1;
    }
    return true;
}

// Whether an edit's first hunk references base content the events before it did NOT reconstruct: the hunk
// splices onto wrong lines, so the base is reseeded from the backup. Generalises s19 (base too SHORT) to
// s23 (a user edit absorbed only into the post-code-rewind backup; same length).
function editBaseIsStale(event: EditEvent, priorEvents: FileEvent[]): boolean {
    return !firstHunkMatchesBase(event, reconstructedBaseText(priorEvents));
}

// The latest timestamp among `priorEvents` that touch `target` — the moment of the last state the engine
// already captured for the file. undefined when the file has no prior event on this lineage.
function lastPriorTimeFor(target: Path, priorEvents: FileEvent[]): Date | undefined {
    let latest: Date | undefined;
    for (const event of priorEvents) {
        if (!("target" in event) || event.target.toString() !== target.toString()) {
            continue;
        }
        if (latest === undefined || event.timestamp.getTime() > latest.getTime()) {
            latest = event.timestamp;
        }
    }
    return latest;
}

// s34: an Edit whose hunk context matches the reconstructed base (so editBaseIsStale is FALSE) but whose
// real pre-edit disk state carried an UNCAPTURED manual change OUTSIDE the hunk window (a trailing append
// left no `edited_text_file` beacon and no tool_use). The drift is invisible to the hunk-context test, so
// detect it by content: a file-history backup taken AFTER the last captured event yet AT/BEFORE the edit,
// whose content differs from the reconstructed base AND onto which the hunk still splices cleanly
// (forward-validation — a wrong/poison backup is rejected, never fabricated). Returns that backup as the
// synthetic reseed Write, else undefined.
function outOfWindowEditSeed(
    records: TranscriptRecord[],
    event: EditEvent,
    priorEvents: FileEvent[],
    reader: BackupReader,
): WriteEvent | undefined {
    const seed = backupSeedWriteFor(records, event.target, event.timestamp, reader);
    if (seed === undefined) {
        return undefined;
    }
    const lastPrior = lastPriorTimeFor(event.target, priorEvents);
    if (lastPrior !== undefined && seed.timestamp.getTime() <= lastPrior.getTime()) {
        return undefined;
    }
    const seedLines = splitLines(seed.content);
    const base = reconstructedBaseText(priorEvents);
    const unchanged = seedLines.length === base.length && seedLines.every((line, index) => line === base[index]);
    if (unchanged || !firstHunkMatchesBase(event, seedLines)) {
        return undefined;
    }
    return seed;
}

// The synthetic backup-seed Write to splice before `event`, or undefined when its base is intact (the
// common case — every edit whose reconstructed base already matches the disk it was computed against). Two
// disjoint triggers: a stale hunk-context base (s19/s23/m6 — reseed from the at/before-or-after backup), or
// an out-of-window uncaptured manual change with a clean hunk context (s34 — reseed from the at/before
// backup, content-validated).
function staleEditSeedFor(
    records: TranscriptRecord[],
    event: FileEvent,
    priorEvents: FileEvent[],
    reader: BackupReader,
): WriteEvent | undefined {
    if (event.kind !== EventKind.edit) {
        return undefined;
    }
    if (editBaseIsStale(event, priorEvents)) {
        return backupSeedWriteFor(records, event.target, event.timestamp, reader, true); // s19/s23/m6
    }
    return outOfWindowEditSeed(records, event, priorEvents, reader); // s34
}

// Record that a stale-edit-base reseed fired, tagging the edit it seeds (its changeId is the producing
// record) and the backup time used.
function noteStaleSeed(event: FileEvent, seed: WriteEvent): void {
    noteStage({
        stage: "seedStaleEditBases",
        target: seed.target,
        changeId: event.kind === EventKind.edit ? event.changeId : seed.changeId,
        detail: "reseeded a stale mid-stream edit base from the file-history backup",
        when: seed.timestamp,
    });
}

// Generalises spec 39's edit-base seeding to MID-stream edits: walk the lineage and, before each edit
// whose base is stale (off-branch changes persisted across a rewind — s19), splice the synthetic
// backup-seed Write so the hunk's context lands on the real pre-edit disk content. Edits whose base is
// intact pass through unchanged, so every pre-s19 scenario is byte-for-byte unaffected.
export function seedStaleEditBases(
    records: TranscriptRecord[],
    lineage: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const result: FileEvent[] = [];
    for (const event of lineage) {
        const seed = staleEditSeedFor(records, event, result, reader);
        if (seed) {
            noteStaleSeed(event, seed);
            result.push(seed);
        }
        result.push(event);
    }
    return result;
}
