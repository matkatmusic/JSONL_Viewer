// Backup-driven event-list transforms: rewrite a file's reconstructed event list using content
// recovered from the file-history sidecar, BEFORE replay. Two families live here, both reader-only
// (the caller guards on `reader`, so reader-free reconstruction is byte-for-byte untouched):
//   - seedStaleEditBases: splice a synthetic Write before a MID-stream Edit whose reconstructed base
//     drifted from the disk it was computed against (spec 39 generalised to s19/s23).
//   - completeTruncatedBeacon: append a synthetic Write completing a TERMINAL user-edit beacon the
//     harness truncated (s27 — a script rewrote the file and the post-script edited_text_file snippet
//     is only a prefix of the new content, with NO later Edit to reseed against).
// (Split out of reconstruction_branches.ts to keep both files within the 250-line cap — split, never
// condense.) Design: plans/s27/s27-reconstruction-plan.md §3.

import type { TranscriptRecord } from "./structures/envelope.ts";
import { EventKind } from "./structures/vocabulary.ts";
import { replayEvents } from "./reconstruction_replay.ts";
import { lastLinesOf, splitLines } from "./reconstruction_replay_edit.ts";
import { backupSeedWriteFor, latestBackupWriteFor } from "./reconstruction_sidecar.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import type { EditEvent, FileEvent, UserEditEvent, WriteEvent } from "./reconstruction_engine.ts";

// --- stale mid-stream edit bases (s19 / s23) -------------------------------------------------------

// The reconstructed base text (each line's latest value) the events before an edit produce.
function reconstructedBaseText(priorEvents: FileEvent[]): string[] {
    return lastLinesOf(replayEvents(priorEvents)).map(
        (entry) => entry.values[entry.values.length - 1]!.line,
    );
}

// Whether an edit's first hunk references base content the events before it did NOT reconstruct: each
// context/removed line must equal the base line at its position; a mismatch — or a position past the
// base — means the hunk splices onto wrong lines, so the base is reseeded from the backup. Generalises
// s19 (base too SHORT) to s23 (a user edit absorbed only into the post-code-rewind backup; same length).
function editBaseIsStale(event: EditEvent, priorEvents: FileEvent[]): boolean {
    const firstHunk = event.hunks[0];
    if (firstHunk === undefined) {
        return false;
    }
    const base = reconstructedBaseText(priorEvents);
    let index = firstHunk.oldStart - 1;
    for (const line of firstHunk.lines) {
        if (line.startsWith("+")) {
            continue;
        }
        if (index >= base.length || base[index] !== line.slice(1)) {
            return true;
        }
        index += 1;
    }
    return false;
}

// The synthetic backup-seed Write to splice before `event`, or undefined when its base is intact (the
// common case — every edit whose reconstructed base already matches the disk it was computed against).
function staleEditSeedFor(
    records: TranscriptRecord[],
    event: FileEvent,
    priorEvents: FileEvent[],
    reader: BackupReader,
): WriteEvent | undefined {
    if (event.kind !== EventKind.edit || !editBaseIsStale(event, priorEvents)) {
        return undefined;
    }
    return backupSeedWriteFor(records, event.target, event.timestamp, reader, true);
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
            result.push(seed);
        }
        result.push(event);
    }
    return result;
}

// --- terminal truncated beacons (s27) --------------------------------------------------------------

// A terminal user-edit beacon is TRUNCATED when its snippet is a byte-prefix of the file's final
// backup AND the backup has strictly more lines. The line-count test (splitLines drops a single
// trailing newline) means a backup that differs from the beacon only by a trailing newline — the
// common COMPLETE-beacon case — is NOT treated as truncated, so complete beacons pass through
// untouched. The `startsWith` half also makes a poison/garbage backup a no-op.
function beaconIsTruncated(beacon: UserEditEvent, backupContent: string): boolean {
    return (
        backupContent.startsWith(beacon.content) &&
        splitLines(backupContent).length > splitLines(beacon.content).length
    );
}

// When a file's LAST event is a user-edit beacon the harness truncated (s27: a script rewrote the
// file and the post-script `edited_text_file` snippet is only a prefix of the new content, with NO
// later Edit to reseed against), append a synthetic Write from the latest file-history backup so
// replay's terminal revision is the COMPLETE file (an overwrite), not the truncated snippet. Files
// whose last event is not a user-edit, or whose beacon is already complete, are returned unchanged.
// Reader-only — without a backup the file stays truncated (reader-dependent, like s25's geo_report).
export function completeTruncatedBeacon(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const last = events[events.length - 1];
    if (last === undefined || last.kind !== EventKind.userEdit) {
        return events;
    }
    const seed = latestBackupWriteFor(records, last.target, reader);
    if (seed === undefined || !beaconIsTruncated(last, seed.content)) {
        return events;
    }
    return [...events, seed];
}
