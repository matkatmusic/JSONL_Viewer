// tests/probe_166_report.test.ts — smoke check that the task-167 probe report
// renders every section and preserves the hand-maintained section 5 verbatim.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Uuid } from "../jfred/src/structures/domain.ts";
import { dedupeEvents, findConflictCandidates, findOverlapGroups } from "../tools/probe_166_analyze.ts";
import { buildNotesMarkdown, HAND_SECTION_HEADER } from "../tools/probe_166_report.ts";
import type { ProbeFindings } from "../tools/probe_166_report.ts";
import { buildProbeEditEvent } from "./probe_166_fixtures.ts";

function buildSyntheticFindings(): ProbeFindings {
    const jotFolderEvent = buildProbeEditEvent({ recordUuid: new Uuid("record-1") });
    const revEngFolderEvent = buildProbeEditEvent({
        recordUuid: new Uuid("record-2"),
        rootLabel: "claude-data",
        projectFolder: "-Users-matkatmusicllc-Desktop-claude-code-src-RevEng",
        timestamp: new Date("2026-01-01T05:00:00Z"),
        contentHash: "hash-b",
    });
    const allEvents = [jotFolderEvent, revEngFolderEvent];
    const dedupeResult = dedupeEvents(allEvents);
    const overlapGroups = findOverlapGroups(dedupeResult.dedupedEvents);
    return {
        scanResult: { allEvents, parseFailuresByRoot: new Map([["live", 3]]), scannedJsonlsByFolder: new Map() },
        dedupeResult,
        replicationRows: [],
        overlapGroups,
        conflictCandidates: findConflictCandidates(overlapGroups),
        fileHistory: {
            rows: [{ root: { label: "live", dir: "/tmp/none" }, sessionDirCount: null, jotMatchCount: 0 }],
            multiLocationSessionCount: 0,
            locationsWithJotSessions: 0,
        },
        handSection: `${HAND_SECTION_HEADER}\n\nHAND-WRITTEN VERDICT LINE\n`,
        generatedAt: new Date("2026-07-21T00:00:00Z"),
    };
}

test("buildNotesMarkdown renders every numbered section", () => {
    const notesMarkdown = buildNotesMarkdown(buildSyntheticFindings());
    assert.ok(notesMarkdown.includes("## 1. Source inventory"));
    assert.ok(notesMarkdown.includes("## 2. Replication map"));
    assert.ok(notesMarkdown.includes("## 3. Cross-source overlaps"));
    assert.ok(notesMarkdown.includes("## 4. Conflict candidates"));
    assert.ok(notesMarkdown.includes(HAND_SECTION_HEADER));
    assert.ok(notesMarkdown.includes("## 6. Parse-failure tally"));
});

test("buildNotesMarkdown preserves the hand-maintained section verbatim", () => {
    const notesMarkdown = buildNotesMarkdown(buildSyntheticFindings());
    assert.ok(notesMarkdown.includes("HAND-WRITTEN VERDICT LINE"));
});

test("buildNotesMarkdown reports the overlap and conflict counts", () => {
    const notesMarkdown = buildNotesMarkdown(buildSyntheticFindings());
    assert.ok(notesMarkdown.includes("1 rel-paths edited from >1 project folder"));
    assert.ok(notesMarkdown.includes("1 cross-folder event pairs <24h apart"));
});
