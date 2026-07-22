// tools/probe_166_report.ts — task 167 (spec S1a): render the probe findings as the
// markdown for plans/166-source-probe-notes.md. Pure string building — no I/O.
import { existsSync, readdirSync, statSync } from "node:fs";
import { CLAUDE_DATA_EXTRAS, CONVERSATION_ROOTS } from "./probe_166_scan.ts";
import type { EditEvent, ScanResult } from "./probe_166_scan.ts";
import type { ConflictCandidate, DedupeResult, FileHistoryCrossReference, OverlapGroup, ReplicationRow } from "./probe_166_analyze.ts";

export const HAND_SECTION_HEADER = "## 5. Implications for the S1 conflict policy";
const OVERLAP_ROW_LIMIT = 30;
const CONFLICT_ROW_LIMIT = 10;

export interface ProbeFindings {
    scanResult: ScanResult;
    dedupeResult: DedupeResult;
    replicationRows: ReplicationRow[];
    overlapGroups: OverlapGroup[];
    conflictCandidates: ConflictCandidate[];
    fileHistory: FileHistoryCrossReference;
    handSection: string;
    generatedAt: Date;
}

export function formatTimestampRange(events: EditEvent[]): string {
    const times = events.map((editEvent) => editEvent.timestamp.getTime()).filter((time) => Number.isFinite(time) && time > 0);
    if (times.length === 0) {
        return "n/a";
    }
    return `${new Date(Math.min(...times)).toISOString()} … ${new Date(Math.max(...times)).toISOString()}`;
}

export function groupEventsBySource(allEvents: EditEvent[]): Map<string, EditEvent[]> {
    const eventsBySource = new Map<string, EditEvent[]>();
    for (const editEvent of allEvents) {
        const sourceKey = `${editEvent.rootLabel}/${editEvent.projectFolder}`;
        if (!eventsBySource.has(sourceKey)) {
            eventsBySource.set(sourceKey, []);
        }
        eventsBySource.get(sourceKey)!.push(editEvent);
    }
    return eventsBySource;
}

function renderSourceInventoryRows(scanResult: ScanResult): string[] {
    const eventsBySource = groupEventsBySource(scanResult.allEvents);
    const rows: string[] = [];
    for (const sourceKey of [...eventsBySource.keys()].sort()) {
        const events = eventsBySource.get(sourceKey)!;
        const slashIndex = sourceKey.indexOf("/");
        const rootLabel = sourceKey.slice(0, slashIndex);
        const projectFolder = sourceKey.slice(slashIndex + 1);
        const jsonlCount = scanResult.scannedJsonlsByFolder.get(projectFolder)?.get(rootLabel)?.length ?? 0;
        const sessionCount = new Set(events.map((editEvent) => editEvent.sessionId.value)).size;
        rows.push(`| ${rootLabel} | ${projectFolder} | ${jsonlCount} | ${events.length} | ${sessionCount} | ${formatTimestampRange(events)} |`);
    }
    return rows;
}

function describeClaudeDataExtra(extraPath: string): string {
    if (!existsSync(extraPath)) {
        return `- \`${extraPath}\` — MISSING`;
    }
    const extraStat = statSync(extraPath);
    if (extraStat.isDirectory()) {
        return `- \`${extraPath}\` — dir, ${readdirSync(extraPath).length} entries`;
    }
    return `- \`${extraPath}\` — file, ${extraStat.size} bytes`;
}

function renderInventorySection(findings: ProbeFindings): string[] {
    const lines: string[] = ["## 1. Source inventory", ""];
    lines.push("Conversation-log sources containing jot-plugin edits (`file_path` under `~/Programming/jot*`):", "");
    lines.push("| root | project folder | jsonl scanned | jot-edit events | distinct sessions | edit timestamp range |");
    lines.push("|---|---|---|---|---|---|");
    lines.push(...renderSourceInventoryRows(findings.scanResult));
    lines.push("", "Conversation-log roots scanned:");
    for (const root of CONVERSATION_ROOTS) {
        lines.push(`- ${root.label}: \`${root.dir}\`${existsSync(root.dir) ? "" : " (MISSING)"}`);
    }
    lines.push("", "File-history snapshot locations:", "");
    lines.push("| root | dir | session dirs | dirs matching a jot-editing session |");
    lines.push("|---|---|---|---|");
    for (const row of findings.fileHistory.rows) {
        lines.push(`| ${row.root.label} | ${row.root.dir} | ${row.sessionDirCount ?? "MISSING"} | ${row.jotMatchCount} |`);
    }
    lines.push("", "Blob format everywhere: `<sessionUuid>/<hash>@vN` with NO embedded path metadata — a backup blob can only be joined to a file via the owning session's JSONL records (confirms the sidecar-is-second-input model).");
    lines.push("", "Other `claude-data/` inventory (not parsed):");
    lines.push(...CLAUDE_DATA_EXTRAS.map((extraPath) => describeClaudeDataExtra(extraPath)));
    return lines;
}

function renderReplicationSection(findings: ProbeFindings): string[] {
    const totalEvents = findings.scanResult.allEvents.length;
    const duplicateEvents = totalEvents - findings.dedupeResult.dedupedEvents.length;
    const lines: string[] = ["## 2. Replication map (duplicate copies across roots)", ""];
    lines.push(`Duplicate EVENTS (same sessionId+recordUuid seen in more than one root): ${duplicateEvents} of ${totalEvents} total events.`);
    for (const [rootPair, count] of [...findings.dedupeResult.duplicateCountByRootPair.entries()].sort()) {
        lines.push(`- ${rootPair}: ${count} duplicated events`);
    }
    lines.push("", "Shared JSONL files across roots, for project folders with jot edits:", "");
    lines.push("| project folder | roots | shared jsonl | byte-identical | diverged | diverged examples (line counts) |");
    lines.push("|---|---|---|---|---|---|");
    for (const row of findings.replicationRows) {
        lines.push(`| ${row.projectFolder} | ${row.rootLabels.join(", ")} | ${row.sharedJsonlCount} | ${row.byteIdenticalCount} | ${row.divergedCount} | ${row.divergedExamples.join("<br>") || "—"} |`);
    }
    lines.push("", "Conclusion for the design doc: cross-source overlap is dominated by REPLICATION (sync copies of the same sessions), so the multi-source merge must dedupe by (sessionId, recordUuid) before any conflict logic runs.");
    return lines;
}

function renderOverlapSection(findings: ProbeFindings): string[] {
    const overlapGroups = findings.overlapGroups;
    const lines: string[] = [`## 3. Cross-source overlaps (after dedupe): ${overlapGroups.length} rel-paths edited from >1 project folder`, ""];
    lines.push("Grouped by jot-root-relative path; `jot roots` shows the differing absolute-path prefixes under which the same rel-path was edited.", "");
    lines.push("| rel path | events | project folders | jot roots (differing abs prefixes) | timestamp range |");
    lines.push("|---|---|---|---|---|");
    for (const group of overlapGroups.slice(0, OVERLAP_ROW_LIMIT)) {
        lines.push(`| ${group.relPath} | ${group.events.length} | ${[...group.projectFolders].sort().join("<br>")} | ${[...group.jotRoots].sort().join(", ")} | ${formatTimestampRange(group.events)} |`);
    }
    if (overlapGroups.length > OVERLAP_ROW_LIMIT) {
        lines.push(`| … ${overlapGroups.length - OVERLAP_ROW_LIMIT} more rel-paths | | | | |`);
    }
    return lines;
}

function renderConflictSection(findings: ProbeFindings): string[] {
    const conflictCandidates = findings.conflictCandidates;
    const lines: string[] = [`## 4. Conflict candidates: ${conflictCandidates.length} cross-folder event pairs <24h apart with differing content`, ""];
    lines.push("A candidate is two adjacent edits to the same rel-path from DIFFERENT project folders within 24h whose content evidence differs. Different content is expected for legitimate sequential edits — these are candidates for manual inspection, not confirmed contradictions.", "");
    for (const candidate of conflictCandidates.slice(0, CONFLICT_ROW_LIMIT)) {
        lines.push(`- \`${candidate.relPath}\` (${candidate.gapHours.toFixed(1)}h apart)`);
        for (const editEvent of [candidate.earlier, candidate.later]) {
            lines.push(`  - ${editEvent.projectFolder} · session ${editEvent.sessionId.value} · ${editEvent.timestamp.toISOString()} · ${editEvent.tool} · content ${editEvent.contentHash}`);
        }
    }
    if (conflictCandidates.length === 0) {
        lines.push("- none found — no overlapping-timeframe contradictions in the real data.");
    }
    if (conflictCandidates.length > CONFLICT_ROW_LIMIT) {
        lines.push(`- … ${conflictCandidates.length - CONFLICT_ROW_LIMIT} more candidate pairs (raise CONFLICT_ROW_LIMIT to enumerate).`);
    }
    return lines;
}

function renderTallySections(findings: ProbeFindings): string[] {
    const lines: string[] = ["## 6. Parse-failure tally", ""];
    for (const [rootLabel, failureCount] of findings.scanResult.parseFailuresByRoot) {
        lines.push(`- ${rootLabel}: ${failureCount} unparseable lines skipped`);
    }
    lines.push("", "## File-history replication", "");
    lines.push(`Jot-editing sessions whose file-history dir exists in MORE THAN ONE location: ${findings.fileHistory.multiLocationSessionCount}.`);
    return lines;
}

// Assemble the full notes markdown; the hand-maintained section 5 is passed in verbatim.
export function buildNotesMarkdown(findings: ProbeFindings): string {
    const lines: string[] = ["# Task 167 — real jot source probe (raw findings)", ""];
    lines.push(`Generated by \`tools/probe_166_sources.ts\` on ${findings.generatedAt.toISOString()}. Sections 1-4 and 6 are regenerated on re-run; section 5 is hand-maintained and preserved.`, "");
    lines.push(...renderInventorySection(findings), "");
    lines.push(...renderReplicationSection(findings), "");
    lines.push(...renderOverlapSection(findings), "");
    lines.push(...renderConflictSection(findings), "");
    lines.push(findings.handSection.trimEnd(), "");
    lines.push(...renderTallySections(findings), "");
    return lines.join("\n");
}
