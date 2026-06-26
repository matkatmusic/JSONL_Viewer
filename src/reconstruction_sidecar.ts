// Sidecar: recover a bash redirect's resulting file content from the file-history backups
// beside the transcript. A `>`/`>>` leaves no content in the JSONL, but Claude Code snapshots
// each tracked file just after a turn; the snapshot taken next after the redirect names the
// backup blob holding the file's full new content. Blobs live at
// <root>/<sessionId>/<backupFileName>; backupFileName already embeds hash@vN, so no hashing.
// The reader is injected so the engine stays pure and tests use an in-memory map.
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { getFileHistorySnapshot } from "./structures/file-history.ts";
import { Path, Uuid } from "./structures/domain.ts";
import { EventKind } from "./structures/vocabulary.ts";
import { resolveAgainstCwd } from "./structures/path-resolve.ts";
import { noteStage } from "./reconstruction_provenance.ts";
import type { FileEvent, WriteEvent } from "./reconstruction_engine.ts";

export type BackupReader = (backupFileName: Path) => string;

type BackupPoint = { backupTime: Date; backupFileName: Path | null };

// The transcript's working directory, used to make the snapshots' cwd-relative paths
// absolute. file-history-snapshot records carry none, so scan for the first record that
// has a cwd (the envelope records do).
function findCwd(records: TranscriptRecord[]): Path | undefined {
    for (const record of records) {
        const cwd = (record as { cwd?: Path }).cwd;
        if (cwd) {
            return cwd;
        }
    }
    return undefined;
}

// Per absolute path, the time-ordered backup points across every file-history snapshot.
function buildBackupTimeline(
    records: TranscriptRecord[],
    cwd: Path | undefined,
): Map<string, BackupPoint[]> {
    const timeline = new Map<string, BackupPoint[]>();
    for (const record of records) {
        const message = getFileHistorySnapshot(record);
        if (!message) {
            continue;
        }
        for (const [path, backup] of message.snapshot.trackedFileBackups.entries()) {
            const key = resolveAgainstCwd(cwd, path);
            const points = timeline.get(key) ?? [];
            points.push({ backupTime: backup.backupTime, backupFileName: backup.backupFileName });
            timeline.set(key, points);
        }
    }
    for (const points of timeline.values()) {
        points.sort((a, b) => a.backupTime.getTime() - b.backupTime.getTime());
    }
    return timeline;
}

// The blob name of the first snapshot of `target` taken strictly after `when` whose
// backup is non-null (a null backup is version 1, which holds no blob).
function findBackupAfter(
    timeline: Map<string, BackupPoint[]>,
    cwd: Path | undefined,
    target: Path,
    when: Date,
): Path | undefined {
    const points = timeline.get(resolveAgainstCwd(cwd, target)) ?? [];
    const next = points.find(
        (point) => point.backupFileName !== null && point.backupTime.getTime() > when.getTime(),
    );
    return next?.backupFileName ?? undefined;
}

// The latest backup point of `target` whose backup is non-null and whose snapshot was taken at or
// before `when` — the pre-edit on-disk content for an Edit-first file. Returns the BackupPoint (the
// seed needs its backupTime), or undefined when none precedes the edit.
function findBackupAtOrBefore(
    timeline: Map<string, BackupPoint[]>,
    cwd: Path | undefined,
    target: Path,
    when: Date,
): BackupPoint | undefined {
    const points = timeline.get(resolveAgainstCwd(cwd, target)) ?? [];
    let chosen: BackupPoint | undefined;
    for (const point of points) {
        if (point.backupFileName !== null && point.backupTime.getTime() <= when.getTime()) {
            chosen = point;
        }
    }
    return chosen;
}

// The first non-null backup point of `target` taken strictly after `when` — the pre-edit content when
// the file-history snapshot capturing it was timestamped just AFTER the edit's tool-use time (m6: a
// user edit and the edit that follows it land in the same turn, so the pre-edit snapshot lands 22ms
// after the edit record). The BackupPoint variant of findBackupAfter (the seed needs its backupTime).
function findBackupPointAfter(
    timeline: Map<string, BackupPoint[]>,
    cwd: Path | undefined,
    target: Path,
    when: Date,
): BackupPoint | undefined {
    const points = timeline.get(resolveAgainstCwd(cwd, target)) ?? [];
    return points.find(
        (point) => point.backupFileName !== null && point.backupTime.getTime() > when.getTime(),
    );
}

// When a file's first event on this branch is an Edit (its creating Write lives on an abandoned
// conversation branch and a conversation-only rewind left the file on disk — spec 39), recover the
// pre-edit on-disk content from the file-history backup taken at or before the edit and prepend a
// synthetic Write so the edit splices onto real lines. A file whose first event already creates it
// (write/overwrite/copy/append) is returned unchanged.
export function seedEditBaseFromBackup(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const first = events[0];
    if (first === undefined || first.kind !== EventKind.edit) {
        return events;
    }
    const seed = backupSeedWriteFor(records, first.target, first.timestamp, reader);
    if (seed) {
        noteStage({ stage: "seedEditBaseFromBackup", target: first.target, changeId: first.changeId, detail: "seeded an edit-first file's pre-edit content from backup", when: seed.timestamp });
    }
    return seed ? [seed, ...events] : events;
}

// A synthetic Write that seeds `target`'s pre-edit on-disk content from the file-history backup taken
// at or before `when` — the source of truth for content an off-branch edit left on disk. Returns
// undefined when no backup blob precedes `when` (version 1 holds no blob). The changeId is the backup
// blob name, so the synthetic seed stays out of the graphs (spec 40 attributes a file's base to the
// REAL Write turn).
export function backupSeedWriteFor(
    records: TranscriptRecord[],
    target: Path,
    when: Date,
    reader: BackupReader,
    includeAfter: boolean = false,
): WriteEvent | undefined {
    const cwd = findCwd(records);
    const timeline = buildBackupTimeline(records, cwd);
    const atOrBefore = findBackupAtOrBefore(timeline, cwd, target, when);
    const base =
        atOrBefore ?? (includeAfter ? findBackupPointAfter(timeline, cwd, target, when) : undefined);
    if (base === undefined || base.backupFileName === null) {
        return undefined;
    }
    return {
        kind: EventKind.write,
        changeId: new Uuid(base.backupFileName.toString()),
        target,
        content: reader(base.backupFileName),
        timestamp: base.backupTime,
    };
}

// Every non-null file-history backup of `target` as a synthetic Write, time-ascending. Used to find
// the backup version whose numbered content matches an ELIDED beacon (s28): the correct post-script
// version is NOT necessarily the latest (a later Edit produces a newer blob), so the caller must scan
// versions and validate by content. changeId = the blob name (out of the graphs, spec 40).
export function backupWritesFor(
    records: TranscriptRecord[],
    target: Path,
    reader: BackupReader,
): WriteEvent[] {
    const cwd = findCwd(records);
    const timeline = buildBackupTimeline(records, cwd);
    const points = timeline.get(resolveAgainstCwd(cwd, target)) ?? [];
    const writes: WriteEvent[] = [];
    for (const point of points) {
        if (point.backupFileName === null) {
            continue;
        }
        writes.push({
            kind: EventKind.write,
            changeId: new Uuid(point.backupFileName.toString()),
            target,
            content: reader(point.backupFileName),
            timestamp: point.backupTime,
        });
    }
    return writes;
}

// A synthetic Write seeding `target`'s FINAL on-disk content from its LATEST file-history backup blob
// (the highest version — a post-script snapshot can land a few ms after the beacon, m6). Used to
// complete a TERMINAL user-edit beacon the harness truncated (s27). Selecting the newest non-null
// point — rather than a timestamp-relative one — robustly picks the complete post-script version and
// sidesteps the m6-style ms-timing fragility. The changeId is the blob name, keeping the synthetic
// seed out of the graphs (spec 40). Returns undefined when the file has no backup blob.
export function latestBackupWriteFor(
    records: TranscriptRecord[],
    target: Path,
    reader: BackupReader,
): WriteEvent | undefined {
    const writes = backupWritesFor(records, target, reader); // time-ascending; newest is last
    return writes[writes.length - 1];
}

// Fill each append/overwrite event's content from the sidecar; pass others through. A
// redirect with no resolvable backup keeps its empty content (defensive — should not happen
// for a tracked file).
export function fillRedirectContent(
    records: TranscriptRecord[],
    events: FileEvent[],
    reader: BackupReader,
): FileEvent[] {
    const cwd = findCwd(records);
    const timeline = buildBackupTimeline(records, cwd);
    return events.map((event) => {
        if (event.kind !== EventKind.append && event.kind !== EventKind.overwrite) {
            return event;
        }
        const backupFileName = findBackupAfter(timeline, cwd, event.target, event.timestamp);
        if (!backupFileName) {
            return event;
        }
        noteStage({ stage: "fillRedirectContent", target: event.target, changeId: event.changeId, detail: `filled ${event.kind} content from the file-history backup` });
        return { ...event, content: reader(backupFileName) };
    });
}

// The default on-disk reader: <root>/<sessionId>/<backupFileName>.
export function createSidecarReader(sessionId: Uuid, root: Path): BackupReader {
    return (backupFileName) =>
        readFileSync(join(root.toString(), sessionId.toString(), backupFileName.toString()), "utf8");
}

// Claude Code's default file-history root: ~/.claude/file-history.
export function getDefaultFileHistoryRoot(): Path {
    return new Path(join(homedir(), ".claude", "file-history"));
}

// The session id from the transcript's envelope records (the file-history dir is named for
// it). file-history-snapshot records carry none, so scan for the first that has one.
export function findSessionId(records: TranscriptRecord[]): Uuid | undefined {
    for (const record of records) {
        const sessionId = (record as { sessionId?: Uuid }).sessionId;
        if (sessionId) {
            return sessionId;
        }
    }
    return undefined;
}
