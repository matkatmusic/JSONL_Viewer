// Backup-driven beacon-completion transforms: rewrite a file's reconstructed event list using content
// recovered from the file-history sidecar, BEFORE replay, to COMPLETE a user-edit beacon the harness only
// partially echoed. Both families are reader-only (the caller guards on `reader`, so reader-free
// reconstruction is byte-for-byte untouched):
//   - completeTruncatedBeacon: append a synthetic Write completing a TERMINAL user-edit beacon the
//     harness truncated (s27 — a script rewrote the file and the post-script edited_text_file snippet
//     is only a prefix of the new content, with NO later Edit to reseed against).
//   - completeElidedBeacons: splice a synthetic Write after EACH ELIDED user-edit beacon (s28 — a
//     scoped script rename whose post-script edited_text_file snippet is only a WINDOW onto the new
//     content: head/tail/interior lines omitted, detected from the snippet's line numbers). The backup
//     version is chosen by CONTENT (forward-validation), not recency. Disjoint from completeTruncated-
//     Beacon: a pure terminal tail-truncation (contiguous-from-1 prefix) is NOT elided.
// (Split out of reconstruction_reseed.ts to keep both files within the 250-line cap — split, never
// condense; the stale-edit-base family stays in reconstruction_reseed.ts.) Design:
// plans/s27/s27-reconstruction-plan.md §3, plans/s28/s28-reconstruction-plan.md §3.

import type { TranscriptRecord } from "./structures/envelope.ts";
import { EventKind } from "./structures/vocabulary.ts";
import { splitLines } from "./reconstruction_replay_edit.ts";
import { backupWritesFor, latestBackupWriteFor } from "./reconstruction_sidecar.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";
import { beaconSnippetFor } from "./reconstruction_user_edit.ts";
import type { BeaconSnippet } from "./reconstruction_user_edit.ts";
import type { FileEvent, UserEditEvent, WriteEvent } from "./reconstruction_engine.ts";

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

// --- elided beacons (s28) --------------------------------------------------------------------------

// A user-edit beacon is ELIDED (a WINDOWED `edited_text_file` view — s28's scoped script rename) when
// its `cat -n` snippet omits lines: it starts past line 1 (head elided), has a gap between consecutive
// line numbers (interior elided), or carries a literal `...` separator. A snippet that starts at line 1
// with contiguous numbers and no `...` is NOT elided here — a pure terminal tail-truncation is left to
// completeTruncatedBeacon (s27), keeping the two triggers disjoint.
function beaconIsElided(snippet: BeaconSnippet): boolean {
    const first = snippet.lines[0];
    if (first === undefined) {
        return false;
    }
    if (snippet.hasEllipsis || first.lineNo > 1) {
        return true;
    }
    for (let index = 1; index < snippet.lines.length; index += 1) {
        if (snippet.lines[index]!.lineNo !== snippet.lines[index - 1]!.lineNo + 1) {
            return true;
        }
    }
    return false;
}

// Forward-validation: whether `backupContent` reproduces EVERY visible line of an elided beacon at its
// own line number, and holds more lines than the beacon showed. A backup that fails any visible line is
// rejected (never fabricate) — this is how the right post-script version is picked among all backups
// and how a poison/wrong backup is made a no-op.
function backupMatchesBeacon(snippet: BeaconSnippet, backupContent: string): boolean {
    const lines = splitLines(backupContent);
    if (lines.length <= snippet.lines.length) {
        return false;
    }
    for (const { lineNo, text } of snippet.lines) {
        if (lineNo - 1 >= lines.length || lines[lineNo - 1] !== text) {
            return false;
        }
    }
    return true;
}

// The synthetic Write completing an ELIDED beacon: the latest file-history backup whose numbered
// content matches every visible beacon line. undefined when the beacon is not elided or no backup
// matches (reader-only; never fabricated).
function elidedBeaconSeed(
    records: TranscriptRecord[],
    beacon: UserEditEvent,
    reader: BackupReader,
): WriteEvent | undefined {
    const snippet = beaconSnippetFor(records, beacon.changeId);
    if (snippet === undefined || !beaconIsElided(snippet)) {
        return undefined;
    }
    let match: WriteEvent | undefined;
    for (const candidate of backupWritesFor(records, beacon.target, reader)) {
        if (backupMatchesBeacon(snippet, candidate.content)) {
            match = candidate; // time-ascending; keep the latest version consistent with the window
        }
    }
    return match;
}

// For each ELIDED user-edit beacon (s28: a script rewrote the file and the post-script
// `edited_text_file` snippet is only a WINDOW onto the new content — omitting head/tail/interior
// lines), splice a synthetic Write of the matching file-history backup immediately AFTER the beacon, so
// replay's revision there is the COMPLETE post-script file and any later Edits splice onto the real
// content rather than the window. Reader-only; a beacon with no matching backup is left unchanged.
export function completeElidedBeacons(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const result: FileEvent[] = [];
    for (const event of events) {
        result.push(event);
        if (event.kind !== EventKind.userEdit) {
            continue;
        }
        const seed = elidedBeaconSeed(records, event, reader);
        if (seed) {
            result.push(seed);
        }
    }
    return result;
}
