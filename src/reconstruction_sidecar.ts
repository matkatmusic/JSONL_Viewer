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
import type { FileEvent } from "./reconstruction_engine.ts";

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
