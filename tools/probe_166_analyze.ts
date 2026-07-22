// tools/probe_166_analyze.ts — task 167 (spec S1a): analysis over the scanned jot
// edit events — replication dedupe, cross-source overlaps, conflict candidates, and
// the file-history cross-reference. READ-ONLY (file hashing + dir listings only).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CONVERSATION_ROOTS, FILE_HISTORY_ROOTS } from "./probe_166_scan.ts";
import type { EditEvent, ScanResult, SourceRoot } from "./probe_166_scan.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DedupeResult {
    dedupedEvents: EditEvent[];
    duplicateCountByRootPair: Map<string, number>;
}

// Cross-root copies of the same session record are REPLICATION, not independent
// evidence: collapse by (sessionId, recordUuid), keeping the first occurrence.
export function dedupeEvents(allEvents: EditEvent[]): DedupeResult {
    const dedupedEvents: EditEvent[] = [];
    const firstEventByKey = new Map<string, EditEvent>();
    const duplicateCountByRootPair = new Map<string, number>();
    for (const editEvent of allEvents) {
        const eventKey = `${editEvent.sessionId.value}:${editEvent.recordUuid.value}`;
        const firstEvent = firstEventByKey.get(eventKey);
        if (firstEvent === undefined) {
            firstEventByKey.set(eventKey, editEvent);
            dedupedEvents.push(editEvent);
            continue;
        }
        const rootPair = [firstEvent.rootLabel, editEvent.rootLabel].sort().join(" + ");
        duplicateCountByRootPair.set(rootPair, (duplicateCountByRootPair.get(rootPair) ?? 0) + 1);
    }
    return { dedupedEvents, duplicateCountByRootPair };
}

export interface ReplicationRow {
    projectFolder: string;
    rootLabels: string[];
    sharedJsonlCount: number;
    byteIdenticalCount: number;
    divergedCount: number;
    divergedExamples: string[];
}

function hashFileBytes(filePath: string): string {
    return createHash("sha256").update(readFileSync(filePath)).digest("hex").slice(0, 12);
}

function countFileLines(filePath: string): number {
    return readFileSync(filePath, "utf8").split("\n").length;
}

function locateJsonlAcrossRoots(projectFolder: string, jsonlName: string, rootLabels: string[], jsonlsByRoot: Map<string, string[]>): { rootLabel: string; file: string }[] {
    const locations: { rootLabel: string; file: string }[] = [];
    for (const rootLabel of rootLabels) {
        if (!jsonlsByRoot.get(rootLabel)!.includes(jsonlName)) {
            continue;
        }
        const rootDir = CONVERSATION_ROOTS.find((candidate) => candidate.label === rootLabel)!.dir;
        locations.push({ rootLabel, file: join(rootDir, projectFolder, jsonlName) });
    }
    return locations;
}

function buildReplicationRow(projectFolder: string, jsonlsByRoot: Map<string, string[]>): ReplicationRow {
    const rootLabels = [...jsonlsByRoot.keys()];
    const nameOccurrences = new Map<string, number>();
    for (const jsonlName of rootLabels.flatMap((rootLabel) => jsonlsByRoot.get(rootLabel)!)) {
        nameOccurrences.set(jsonlName, (nameOccurrences.get(jsonlName) ?? 0) + 1);
    }
    const sharedNames = [...nameOccurrences.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    const row: ReplicationRow = { projectFolder, rootLabels, sharedJsonlCount: sharedNames.length, byteIdenticalCount: 0, divergedCount: 0, divergedExamples: [] };
    for (const jsonlName of sharedNames) {
        const locations = locateJsonlAcrossRoots(projectFolder, jsonlName, rootLabels, jsonlsByRoot);
        const distinctHashes = new Set(locations.map((location) => hashFileBytes(location.file)));
        if (distinctHashes.size === 1) {
            row.byteIdenticalCount += 1;
            continue;
        }
        row.divergedCount += 1;
        if (row.divergedExamples.length < 3) {
            const lineCounts = locations.map((location) => `${location.rootLabel}=${countFileLines(location.file)}L`).join(", ");
            row.divergedExamples.push(`${jsonlName} (${lineCounts})`);
        }
    }
    return row;
}

// Compare the copies of each JSONL that exists under >1 conversation-log root,
// restricted to project folders that produced jot edit events.
export function buildReplicationRows(scanResult: ScanResult): ReplicationRow[] {
    const jotFolders = new Set(scanResult.allEvents.map((editEvent) => editEvent.projectFolder));
    const replicationRows: ReplicationRow[] = [];
    for (const projectFolder of [...jotFolders].sort()) {
        const jsonlsByRoot = scanResult.scannedJsonlsByFolder.get(projectFolder);
        if (jsonlsByRoot === undefined) {
            continue;
        }
        if (jsonlsByRoot.size < 2) {
            continue;
        }
        replicationRows.push(buildReplicationRow(projectFolder, jsonlsByRoot));
    }
    return replicationRows;
}

export interface OverlapGroup {
    relPath: string;
    events: EditEvent[];
    projectFolders: Set<string>;
    jotRoots: Set<string>;
    absPaths: Set<string>;
}

// Group deduped events by jot-root-relative path; keep rel-paths edited from more
// than one project folder (the genuine cross-source overlap set).
export function findOverlapGroups(dedupedEvents: EditEvent[]): OverlapGroup[] {
    const eventsByRelPath = new Map<string, EditEvent[]>();
    for (const editEvent of dedupedEvents) {
        if (editEvent.relPath === "") {
            continue;
        }
        if (!eventsByRelPath.has(editEvent.relPath)) {
            eventsByRelPath.set(editEvent.relPath, []);
        }
        eventsByRelPath.get(editEvent.relPath)!.push(editEvent);
    }
    const overlapGroups: OverlapGroup[] = [];
    for (const [relPath, events] of eventsByRelPath) {
        const projectFolders = new Set(events.map((editEvent) => editEvent.projectFolder));
        if (projectFolders.size < 2) {
            continue;
        }
        const jotRoots = new Set(events.map((editEvent) => editEvent.jotRoot));
        const absPaths = new Set(events.map((editEvent) => editEvent.absPath.value));
        overlapGroups.push({ relPath, events, projectFolders, jotRoots, absPaths });
    }
    overlapGroups.sort((a, b) => b.events.length - a.events.length);
    return overlapGroups;
}

export interface ConflictCandidate {
    relPath: string;
    earlier: EditEvent;
    later: EditEvent;
    gapHours: number;
}

function buildConflictCandidate(relPath: string, earlier: EditEvent, later: EditEvent): ConflictCandidate | null {
    if (earlier.projectFolder === later.projectFolder) {
        return null;
    }
    const gapMs = later.timestamp.getTime() - earlier.timestamp.getTime();
    if (!Number.isFinite(gapMs)) {
        return null;
    }
    if (gapMs >= DAY_MS) {
        return null;
    }
    if (earlier.contentHash === later.contentHash) {
        return null;
    }
    return { relPath, earlier, later, gapHours: gapMs / 3_600_000 };
}

function collectConflictsFromGroup(overlapGroup: OverlapGroup): ConflictCandidate[] {
    const sortedEvents = [...overlapGroup.events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const conflictCandidates: ConflictCandidate[] = [];
    for (let index = 1; index < sortedEvents.length; index += 1) {
        const conflictCandidate = buildConflictCandidate(overlapGroup.relPath, sortedEvents[index - 1]!, sortedEvents[index]!);
        if (conflictCandidate === null) {
            continue;
        }
        conflictCandidates.push(conflictCandidate);
    }
    return conflictCandidates;
}

// Adjacent edits to the same rel-path from DIFFERENT project folders within 24h
// whose content evidence differs — candidates for manual inspection.
export function findConflictCandidates(overlapGroups: OverlapGroup[]): ConflictCandidate[] {
    return overlapGroups.flatMap((overlapGroup) => collectConflictsFromGroup(overlapGroup));
}

export interface FileHistoryCrossReference {
    // one row per file-history root: [label, dir, sessionDirCount|"MISSING", jotMatchCount]
    rows: { root: SourceRoot; sessionDirCount: number | null; jotMatchCount: number }[];
    multiLocationSessionCount: number;
    locationsWithJotSessions: number;
}

function countJotSessionDirs(root: SourceRoot, qualifyingSessionIds: Set<string>, locationsBySession: Map<string, string[]>): { sessionDirCount: number; jotMatchCount: number } {
    const sessionDirNames = readdirSync(root.dir).filter((name) => statSync(join(root.dir, name)).isDirectory());
    const jotMatches = sessionDirNames.filter((name) => qualifyingSessionIds.has(name));
    for (const sessionDirName of jotMatches) {
        if (!locationsBySession.has(sessionDirName)) {
            locationsBySession.set(sessionDirName, []);
        }
        locationsBySession.get(sessionDirName)!.push(root.label);
    }
    return { sessionDirCount: sessionDirNames.length, jotMatchCount: jotMatches.length };
}

// Which file-history locations hold snapshots for the jot-editing sessions, and
// how many of those sessions are replicated across locations.
export function crossReferenceFileHistory(qualifyingSessionIds: Set<string>): FileHistoryCrossReference {
    const crossReference: FileHistoryCrossReference = { rows: [], multiLocationSessionCount: 0, locationsWithJotSessions: 0 };
    const locationsBySession = new Map<string, string[]>();
    for (const root of FILE_HISTORY_ROOTS) {
        if (!existsSync(root.dir)) {
            crossReference.rows.push({ root, sessionDirCount: null, jotMatchCount: 0 });
            continue;
        }
        const counts = countJotSessionDirs(root, qualifyingSessionIds, locationsBySession);
        crossReference.rows.push({ root, sessionDirCount: counts.sessionDirCount, jotMatchCount: counts.jotMatchCount });
        if (counts.jotMatchCount > 0) {
            crossReference.locationsWithJotSessions += 1;
        }
    }
    crossReference.multiLocationSessionCount = [...locationsBySession.values()].filter((labels) => labels.length > 1).length;
    return crossReference;
}
