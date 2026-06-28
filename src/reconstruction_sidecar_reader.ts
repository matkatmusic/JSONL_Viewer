// The on-disk side of the file-history sidecar: the default blob reader, the default history root, and
// the session-id scan. Split out of reconstruction_sidecar.ts (split, never condense) to keep that module
// — the pure backup→event transforms — within the 250-line cap. The `BackupReader` type itself stays in
// reconstruction_sidecar.ts (the transforms own it); this module imports it one-way.

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { TranscriptRecord } from "./structures/envelope.ts";
import { Path, Uuid } from "./structures/domain.ts";
import type { BackupReader } from "./reconstruction_sidecar.ts";

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
