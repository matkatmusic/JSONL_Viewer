import { readFileSync } from "node:fs";
import { parseRecord } from "./parseRecord.ts";
import type { TranscriptRecord } from "../structures/envelope.ts";
import { ENVELOPE_KEYS, RecordType } from "../structures/vocabulary.ts";

// The keys every session-meta record carries (file-history-snapshot excepted —
// it has `type` but no `sessionId`). ENVELOPE_KEYS (the conversational-record
// field list) is imported from envelope.ts as the single source.
const META_KEYS = ["type", "sessionId"] as const;

// Union a base key group with a record's extra keys into an allow-set.
function keys(
    base: readonly string[],
    ...extra: string[]
): ReadonlySet<string> {
    return new Set([...base, ...extra]);
}

// The exact set of top-level keys each record type carries in s1
// (recon/07-s1-field-inventory.md, union across per-record variants). This is
// the runtime expression of the field-level fog-of-war boundary: a record may
// carry a subset of these keys, but never a key outside its set.
export const ALLOWED_TOP_LEVEL_KEYS: Record<RecordType, ReadonlySet<string>> = {
    [RecordType.aiTitle]: keys(META_KEYS, "aiTitle"),
    [RecordType.assistant]: keys(ENVELOPE_KEYS, "message", "requestId"),
    [RecordType.attachment]: keys(ENVELOPE_KEYS, "attachment"),
    [RecordType.bridgeSession]: keys(META_KEYS, "bridgeSessionId", "lastSequenceNum"),
    [RecordType.fileHistorySnapshot]: keys(
        ["type"], "messageId", "snapshot", "isSnapshotUpdate",
    ),
    [RecordType.lastPrompt]: keys(META_KEYS, "leafUuid", "lastPrompt"),
    [RecordType.mode]: keys(META_KEYS, "mode"),
    [RecordType.permissionMode]: keys(META_KEYS, "permissionMode"),
    [RecordType.system]: keys(
        ENVELOPE_KEYS,
        "subtype", "level", "content", "isMeta", "durationMs", "messageCount",
        "hasOutput", "hookAdditionalContext", "hookCount", "hookErrors",
        "hookInfos", "preventedContinuation", "stopReason", "toolUseID",
    ),
    [RecordType.user]: keys(
        ENVELOPE_KEYS,
        "message", "promptId", "origin", "permissionMode", "promptSource",
        "sourceToolAssistantUUID", "toolUseResult", "isMeta",
    ),
};

// Thrown when a record carries a top-level key not modeled for its type, so a
// fog-of-war violation (a field we have not accounted for) cannot pass silently.
export class UnmodeledFieldError extends Error {
    readonly recordType: string;
    readonly fieldName: string;

    constructor(recordType: string, fieldName: string) {
        super(`Unmodeled top-level key "${fieldName}" on ${recordType} record`);
        this.name = "UnmodeledFieldError";
        this.recordType = recordType;
        this.fieldName = fieldName;
    }
}

function assertOnlyKnownTopLevelKeys(record: TranscriptRecord): void {
    const allowed = ALLOWED_TOP_LEVEL_KEYS[record.type];
    for (const key of Object.keys(record)) {
        if (!allowed.has(key)) {
            throw new UnmodeledFieldError(record.type, key);
        }
    }
}

// Parse one JSONL line into a typed record, validating both that its `type` is
// known (parseRecord) and that all its top-level keys are modeled for that type.
export function parseTranscriptLine(line: string): TranscriptRecord {
    const record = parseRecord(line);
    assertOnlyKnownTopLevelKeys(record);
    return record;
}

// Load a whole transcript file into typed records. Throws on the first unknown
// record type or unmodeled top-level key.
export function loadTranscript(filePath: string): TranscriptRecord[] {
    return readFileSync(filePath, "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map(parseTranscriptLine);
}
