// tests/probe_166_analyze.test.ts — unit checks for the task-167 probe analysis:
// replication dedupe, cross-source overlap grouping, and conflict candidates.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Uuid } from "../jfred/src/structures/domain.ts";
import { dedupeEvents, findConflictCandidates, findOverlapGroups } from "../tools/probe_166_analyze.ts";
import { buildProbeEditEvent } from "./probe_166_fixtures.ts";

test("dedupeEvents collapses the same record replicated across roots", () => {
    const liveEvent = buildProbeEditEvent({ rootLabel: "live" });
    const copiedEvent = buildProbeEditEvent({ rootLabel: "claude-data" });
    const dedupeResult = dedupeEvents([liveEvent, copiedEvent]);
    assert.equal(dedupeResult.dedupedEvents.length, 1);
    assert.equal(dedupeResult.duplicateCountByRootPair.get("claude-data + live"), 1);
});

test("dedupeEvents keeps distinct records apart", () => {
    const firstEvent = buildProbeEditEvent({ recordUuid: new Uuid("record-1") });
    const secondEvent = buildProbeEditEvent({ recordUuid: new Uuid("record-2") });
    assert.equal(dedupeEvents([firstEvent, secondEvent]).dedupedEvents.length, 2);
});

test("findOverlapGroups keeps only rel-paths edited from more than one project folder", () => {
    const jotFolderEvent = buildProbeEditEvent({ recordUuid: new Uuid("record-1") });
    const revEngFolderEvent = buildProbeEditEvent({
        recordUuid: new Uuid("record-2"),
        projectFolder: "-Users-matkatmusicllc-Desktop-claude-code-src-RevEng",
    });
    const loneEvent = buildProbeEditEvent({ recordUuid: new Uuid("record-3"), relPath: "other/file.py" });
    const overlapGroups = findOverlapGroups([jotFolderEvent, revEngFolderEvent, loneEvent]);
    assert.equal(overlapGroups.length, 1);
    assert.equal(overlapGroups[0]!.relPath, "skills/jot/SKILL.md");
    assert.equal(overlapGroups[0]!.projectFolders.size, 2);
});

test("findConflictCandidates flags cross-folder edits under 24h with differing content", () => {
    const earlierEvent = buildProbeEditEvent({ recordUuid: new Uuid("record-1"), contentHash: "hash-a" });
    const laterEvent = buildProbeEditEvent({
        recordUuid: new Uuid("record-2"),
        projectFolder: "-Users-matkatmusicllc-Desktop-claude-code-src-RevEng",
        timestamp: new Date("2026-01-01T05:00:00Z"),
        contentHash: "hash-b",
    });
    const overlapGroups = findOverlapGroups([earlierEvent, laterEvent]);
    const conflictCandidates = findConflictCandidates(overlapGroups);
    assert.equal(conflictCandidates.length, 1);
    assert.equal(conflictCandidates[0]!.gapHours, 5);
});

test("findConflictCandidates ignores pairs with identical content evidence", () => {
    const earlierEvent = buildProbeEditEvent({ recordUuid: new Uuid("record-1") });
    const laterEvent = buildProbeEditEvent({
        recordUuid: new Uuid("record-2"),
        projectFolder: "-Users-matkatmusicllc-Desktop-claude-code-src-RevEng",
        timestamp: new Date("2026-01-01T05:00:00Z"),
    });
    const overlapGroups = findOverlapGroups([earlierEvent, laterEvent]);
    assert.equal(findConflictCandidates(overlapGroups).length, 0);
});
