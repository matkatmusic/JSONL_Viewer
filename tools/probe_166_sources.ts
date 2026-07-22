// tools/probe_166_sources.ts — task 167 (spec S1a): probe the REAL jot sources for
// cross-source file overlaps and disagreements. READ-ONLY everywhere except the
// generated findings file plans/166-source-probe-notes.md (section 5 of which is
// hand-maintained — re-running regenerates sections 1-4 and 6 around it).
// Run from the RevEng root: npx tsx tools/probe_166_sources.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scanConversationRoots } from "./probe_166_scan.ts";
import type { ScanResult } from "./probe_166_scan.ts";
import { buildReplicationRows, crossReferenceFileHistory, dedupeEvents, findConflictCandidates, findOverlapGroups } from "./probe_166_analyze.ts";
import type { FileHistoryCrossReference } from "./probe_166_analyze.ts";
import { buildNotesMarkdown, HAND_SECTION_HEADER } from "./probe_166_report.ts";
import type { ProbeFindings } from "./probe_166_report.ts";

const NOTES_FILE = join(import.meta.dirname, "../plans/166-source-probe-notes.md");

// The task's stated premise: ≥4 conversation-log sources and ≥2 file-history
// locations hold jot evidence. Fail loudly if the real data refutes it.
function assertProbePremise(scanResult: ScanResult, fileHistory: FileHistoryCrossReference): void {
    const qualifyingFolders = new Set(scanResult.allEvents.map((editEvent) => editEvent.projectFolder));
    if (qualifyingFolders.size < 4) {
        throw new Error(`premise violated: only ${qualifyingFolders.size} conversation-log project folders contain jot edits (expected >= 4)`);
    }
    if (fileHistory.locationsWithJotSessions < 2) {
        throw new Error(`premise violated: only ${fileHistory.locationsWithJotSessions} file-history locations hold jot sessions (expected >= 2)`);
    }
}

// Keep the hand-written section 5 from a previous run, if the notes file has one.
function preserveHandSection(): string {
    const placeholder = `${HAND_SECTION_HEADER}\n\n(hand-written — fill in after reviewing sections 1-4)\n`;
    if (!existsSync(NOTES_FILE)) {
        return placeholder;
    }
    const previousNotes = readFileSync(NOTES_FILE, "utf8");
    const sectionStart = previousNotes.indexOf(HAND_SECTION_HEADER);
    if (sectionStart < 0) {
        return placeholder;
    }
    const nextSectionStart = previousNotes.indexOf("\n## ", sectionStart + 1);
    if (nextSectionStart < 0) {
        return previousNotes.slice(sectionStart);
    }
    return previousNotes.slice(sectionStart, nextSectionStart + 1);
}

async function runProbe(): Promise<void> {
    const scanResult = await scanConversationRoots();
    const dedupeResult = dedupeEvents(scanResult.allEvents);
    const overlapGroups = findOverlapGroups(dedupeResult.dedupedEvents);
    const qualifyingSessionIds = new Set(scanResult.allEvents.map((editEvent) => editEvent.sessionId.value));
    const findings: ProbeFindings = {
        scanResult,
        dedupeResult,
        replicationRows: buildReplicationRows(scanResult),
        overlapGroups,
        conflictCandidates: findConflictCandidates(overlapGroups),
        fileHistory: crossReferenceFileHistory(qualifyingSessionIds),
        handSection: preserveHandSection(),
        generatedAt: new Date(),
    };
    assertProbePremise(scanResult, findings.fileHistory);
    writeFileSync(NOTES_FILE, buildNotesMarkdown(findings));
    process.stderr.write(`\nwrote ${NOTES_FILE}\n`);
    const folderCount = new Set(scanResult.allEvents.map((editEvent) => editEvent.projectFolder)).size;
    process.stderr.write(`sources=${folderCount} folders, events=${scanResult.allEvents.length} (${dedupeResult.dedupedEvents.length} deduped), overlaps=${overlapGroups.length}, conflicts=${findings.conflictCandidates.length}\n`);
}

await runProbe();
