// Which working-tree state survived a session. The harness re-snapshots tracked files after every
// turn; the LAST file-history-snapshot whose `{path → version}` set differs from the previous one
// marks the last time the working tree actually changed. Its `messageId` (the working-tree owner)
// names the conversation record that produced the surviving files. A conversation-only rewind
// appends trailing snapshots with an unchanged set, so it is correctly ignored. See
// plans/s8/s8-reconstruction-plan.md.

import type { TranscriptRecord } from "./structures/envelope.ts";
import { getFileHistorySnapshot, type FileHistorySnapshotMessage } from "./structures/file-history.ts";
import { Uuid } from "./structures/domain.ts";

// A stable key for a snapshot's tracked set: each tracked file as "<path>@<version>", sorted. Two
// snapshots with the same key represent the same working-tree state (versions are monotonic, so any
// write/delete changes the key); an empty set is "".
function trackedVersionKey(snapshot: FileHistorySnapshotMessage): string {
    return snapshot.snapshot.trackedFileBackups
        .entries()
        .map(([path, backup]) => `${path.toString()}@${backup.version}`)
        .sort()
        .join("|");
}

// The messageId of the last file-history-snapshot whose tracked set changed vs. the previous
// snapshot — the record that produced the surviving working tree. undefined when there is no
// snapshot or the tracked set never changes (the caller then falls back to the final head).
export function findWorkingTreeOwner(
    records: TranscriptRecord[],
): Uuid | undefined {
    let owner: Uuid | undefined;
    let previousKey = "";
    for (const record of records) {
        const snapshot = getFileHistorySnapshot(record);
        if (snapshot === undefined) {
            continue;
        }
        const key = trackedVersionKey(snapshot);
        if (key !== previousKey) {
            owner = snapshot.messageId;
        }
        previousKey = key;
    }
    return owner;
}
