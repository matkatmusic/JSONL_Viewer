// Generic conversation-tree walkers over the `parentUuid` forest and the `last-prompt` heads. The
// canonical home for ancestor-chain and head lookups; reconstruction_branch.ts and the
// surviving-head decision both build on these. See plans/s8/s8-reconstruction-plan.md.

import type { TranscriptRecord } from "./structures/envelope.ts";
import { getLastPromptEntry } from "./structures/session-meta.ts";
import { Uuid } from "./structures/domain.ts";

// Index the records that carry a uuid by that uuid string, for ancestor-chain walks.
export function indexRecordsByUuid(
    records: TranscriptRecord[],
): Map<string, TranscriptRecord> {
    const byUuid = new Map<string, TranscriptRecord>();
    for (const record of records) {
        if (record.uuid !== undefined) {
            byUuid.set(record.uuid.toString(), record);
        }
    }
    return byUuid;
}

// In file order, the leafUuid of each last-prompt record — the conversation heads.
export function collectHeadUuids(records: TranscriptRecord[]): Uuid[] {
    const heads: Uuid[] = [];
    for (const record of records) {
        const entry = getLastPromptEntry(record);
        if (entry !== undefined) {
            heads.push(entry.leafUuid);
        }
    }
    return heads;
}

// The uuid strings on `tip`'s parentUuid ancestor chain, including the tip itself. Empty when the
// tip resolves to no record (the caller reads that as "cannot identify"). Stops at a null or
// unresolvable parent, or when a uuid repeats (cycle guard).
export function collectAncestorUuids(
    records: TranscriptRecord[],
    tip: Uuid,
): Set<string> {
    const byUuid = indexRecordsByUuid(records);
    const ancestors = new Set<string>();
    let current = byUuid.get(tip.toString());
    while (current !== undefined) {
        const key = current.uuid!.toString();
        if (ancestors.has(key)) {
            break;
        }
        ancestors.add(key);
        const parent = current.parentUuid;
        if (parent === undefined) {
            break;
        }
        if (parent === null) {
            break;
        }
        current = byUuid.get(parent.toString());
    }
    return ancestors;
}

// The first last-prompt head at or above `start` — walk start -> root by parentUuid and return the
// first uuid that is itself a conversation head. undefined when none is found (cycle/eof guarded).
// Used to map a working-tree owner record up to the conversation head that owns that working tree.
export function findHeadAtOrAbove(
    records: TranscriptRecord[],
    start: Uuid,
): Uuid | undefined {
    const headKeys = new Set(collectHeadUuids(records).map((head) => head.toString()));
    const byUuid = indexRecordsByUuid(records);
    const visited = new Set<string>();
    let current = byUuid.get(start.toString());
    while (current !== undefined) {
        const key = current.uuid!.toString();
        if (visited.has(key)) {
            break;
        }
        visited.add(key);
        if (headKeys.has(key)) {
            return current.uuid;
        }
        const parent = current.parentUuid;
        if (parent === undefined) {
            break;
        }
        if (parent === null) {
            break;
        }
        current = byUuid.get(parent.toString());
    }
    return undefined;
}
