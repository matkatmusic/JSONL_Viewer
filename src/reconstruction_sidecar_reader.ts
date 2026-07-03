// The on-disk side of the file-history sidecar: the default blob reader, the default history root, and
// the session-id scan. Split out of reconstruction_sidecar.ts (split, never condense) to keep that module
// — the pure backup→event transforms — within the 250-line cap. The `BackupReader` type itself stays in
// reconstruction_sidecar.ts (the transforms own it); this module imports it one-way.

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
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

// The distinct session ids across the records, in first-seen order. A merged multi-session
// transcript carries several; each session's backups live under its OWN file-history dir,
// so the reader must know all of them.
function sessionIdsOf(records: TranscriptRecord[]): Uuid[] {
    const seen = new Set<string>();
    const ids: Uuid[] = [];
    for (const record of records) {
        const sessionId = (record as { sessionId?: Uuid }).sessionId;
        if (sessionId && !seen.has(sessionId.toString())) {
            seen.add(sessionId.toString());
            ids.push(sessionId);
        }
    }
    return ids;
}

// The on-disk file-history reader spanning every session dir the records reference: a referenced
// backup lives under whichever session took it, so read the owner's copy when the engine names one,
// else try each session in order and read the first that exists (falling back to the first session's
// path so a genuinely-missing backup throws the same ENOENT as a single-session reader). undefined
// when the records carry no session id (no backups to read). For single-session records this is
// exactly the old single-session reader. Shared by the CLI, the coverage checker, and the viewer.
export function buildSidecarReader(records: TranscriptRecord[]): BackupReader | undefined {
    const sessionIds = sessionIdsOf(records);
    if (sessionIds.length === 0) {
        return undefined;
    }
    const root = getDefaultFileHistoryRoot().toString();
    return (backupFileName, sessionId) => {
        const name = backupFileName.toString();
        // The engine passes the snapshot's OWNING session: across merged sessions the same `@vN` blob
        // name recurs with different content, so we MUST read the owner's copy. Fall back to a
        // first-existing search only when the owner is unknown (a pre-sessionId caller).
        const owner = sessionId ?? sessionIds.find((id) => existsSync(join(root, id.toString(), name)));
        return readFileSync(join(root, (owner ?? sessionIds[0]!).toString(), name), "utf8");
    };
}
