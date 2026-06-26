// Multi-session file-history reader for the coverage checker. A single scenario can span several sessions
// — pre/post a /clear, baseline + scenario for a git-baseline, one per agent for a concurrent run — and the
// checker merges all of their JSONL into one record stream (scripts/coverage_scenarios.ts). The default
// engine reader (createSidecarReader) is scoped to ONE session's file-history dir, but a merged transcript
// references backups stored under EACH session's own dir, so reconstruction needs a reader that knows them
// all. This module builds that reader. It lives on the checker side (not in src/) because merging sessions
// is a coverage-checker concern; the engine and CLI still reconstruct one session at a time.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TranscriptRecord } from "../src/structures/envelope.ts";
import type { Uuid } from "../src/structures/domain.ts";
import { getDefaultFileHistoryRoot, type BackupReader } from "../src/reconstruction_sidecar.ts";

// The distinct session ids across the merged records, in first-seen order. A multi-session scenario carries
// several; each session's backups live under its OWN file-history dir, so the reader must know all of them.
export function sessionIdsOf(records: TranscriptRecord[]): Uuid[] {
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

// The on-disk file-history reader spanning every merged session's dir: a referenced backup lives under
// whichever session took it, so try each session in order and read the first that exists (falling back to
// the first session's path so a genuinely-missing backup throws the same ENOENT as the single-session
// reader). undefined when the records carry no session id (no backups to read).
export function buildSidecarReader(records: TranscriptRecord[]): BackupReader | undefined {
    const sessionIds = sessionIdsOf(records);
    if (sessionIds.length === 0) {
        return undefined;
    }
    const root = getDefaultFileHistoryRoot().toString();
    return (backupFileName) => {
        const name = backupFileName.toString();
        const owner = sessionIds.find((id) => existsSync(join(root, id.toString(), name)));
        return readFileSync(join(root, (owner ?? sessionIds[0]!).toString(), name), "utf8");
    };
}
