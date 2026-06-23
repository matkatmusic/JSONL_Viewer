import { test } from "node:test";
import assert from "node:assert/strict";
import {
    findConversationBranches,
    selectBranchRecords,
    selectLiveBranch,
} from "../src/reconstruction_branch.ts";
import { RecordType } from "../src/structures/vocabulary.ts";
import { Uuid } from "../src/structures/domain.ts";
import type { TranscriptRecord } from "../src/structures/envelope.ts";

function rec(type: RecordType, uuid: string, parent: string | null): TranscriptRecord {
    return { type, uuid: new Uuid(uuid), parentUuid: parent === null ? null : new Uuid(parent) } as TranscriptRecord;
}
function lastPrompt(leaf: string): TranscriptRecord {
    return { type: RecordType.lastPrompt, leafUuid: leaf } as unknown as TranscriptRecord;
}
// B = rewind checkpoint; C = abandoned child; D->E = surviving; plus a uuid-less meta record.
function buildRewindRecords(): TranscriptRecord[] {
    return [
        rec(RecordType.user, "B", null),
        rec(RecordType.assistant, "C", "B"),     // abandoned branch tip
        lastPrompt("C"),                          // earlier head (abandoned)
        rec(RecordType.user, "D", "B"),
        rec(RecordType.assistant, "E", "D"),     // surviving branch tip
        { type: RecordType.mode } as TranscriptRecord, // uuid-less meta — always kept
        lastPrompt("E"),                          // final head (surviving)
    ];
}

// findConversationBranches names the surviving branch (tip E) and the rewound branch (tip C,
// rewindPoint B), and does not invent others.
test("test_find_conversation_branches_identifies_surviving_and_rewound", () => {
    const branches = findConversationBranches(buildRewindRecords());
    const surviving = branches.find((b) => b.isSurviving)!;
    assert.equal(surviving.tip.toString(), "E");
    assert.equal(surviving.rewindPoint, undefined);
    const rewound = branches.filter((b) => !b.isSurviving);
    assert.equal(rewound.length, 1);
    assert.equal(rewound[0]!.tip.toString(), "C");
    assert.equal(rewound[0]!.rewindPoint!.toString(), "B");
});

// selectBranchRecords keeps the tip's ancestor chain plus uuid-less meta, dropping the sibling
// branch (selecting tip C keeps B,C + meta and drops D,E).
test("test_select_branch_records_keeps_tip_chain_and_meta", () => {
    const kept = selectBranchRecords(buildRewindRecords(), new Uuid("C"));
    const uuids = kept.filter((r) => r.uuid).map((r) => r.uuid!.toString()).sort();
    assert.deepEqual(uuids, ["B", "C"]);
    assert.ok(kept.some((r) => r.type === RecordType.mode));
});

// selectLiveBranch is selectBranchRecords for the surviving head (keeps B,D,E + meta).
test("test_select_live_branch_keeps_surviving_chain", () => {
    const kept = selectLiveBranch(buildRewindRecords());
    const uuids = kept.filter((r) => r.uuid).map((r) => r.uuid!.toString()).sort();
    assert.deepEqual(uuids, ["B", "D", "E"]);
});

// With no last-prompt head, selectLiveBranch returns all records unchanged (the fallback).
test("test_select_live_branch_returns_all_when_no_head", () => {
    const records = buildRewindRecords().filter((r) => r.type !== RecordType.lastPrompt);
    assert.equal(selectLiveBranch(records).length, records.length);
});

// A file-history-snapshot record in parsed/wire shape; getFileHistorySnapshot hydrates messageId and
// backupTime. `backups` gives a non-null backupFileName per path (default null = a refresh snapshot).
function snapshotRec(
    messageId: string,
    tracked: Record<string, number>,
    backups: Record<string, string> = {},
): TranscriptRecord {
    const trackedFileBackups: Record<string, unknown> = {};
    for (const [path, version] of Object.entries(tracked)) {
        trackedFileBackups[path] = {
            backupFileName: backups[path] ?? null,
            version,
            backupTime: "2026-01-01T00:00:00.000Z",
        };
    }
    return {
        type: RecordType.fileHistorySnapshot,
        messageId,
        snapshot: { messageId, timestamp: "2026-01-01T00:00:00.000Z", trackedFileBackups },
        isSnapshotUpdate: true,
    } as unknown as TranscriptRecord;
}

// R = root checkpoint; Wa = the write turn's head (working tree changes to file@2 here);
// Hc = a conversation-only rewind back to R that writes nothing (working tree stays file@2).
function buildConversationRewindRecords(): TranscriptRecord[] {
    return [
        rec(RecordType.user, "R", null),
        rec(RecordType.assistant, "Wa", "R"),       // the write turn's tail
        lastPrompt("Wa"),                            // head: the code branch
        snapshotRec("Wa", { "file.py": 2 }),         // working tree changed -> file@2
        rec(RecordType.user, "Hc", "R"),             // conversation-only rewind to root: a new Hello
        lastPrompt("Hc"),                            // final head, but it wrote nothing
        snapshotRec("Hc", { "file.py": 2 }),         // working tree UNCHANGED (still file@2)
    ];
}

// The surviving branch is the one that produced the on-disk files (Wa), even though Hc is the final
// conversation head — because the final rewind was conversation-only (the snapshot is unchanged).
test("test_find_conversation_branches_survives_working_tree_not_final_head", () => {
    const branches = findConversationBranches(buildConversationRewindRecords());
    const surviving = branches.find((b) => b.isSurviving)!;
    assert.equal(surviving.tip.toString(), "Wa");
    // Hc is not surviving (it is the file-less conversation head).
    assert.ok(!branches.some((b) => b.isSurviving && b.tip.toString() === "Hc"));
});

// selectLiveBranch follows the same decision: it keeps Wa's chain (R, Wa), not Hc.
test("test_select_live_branch_follows_working_tree_after_conversation_rewind", () => {
    const kept = selectLiveBranch(buildConversationRewindRecords());
    const uuids = kept.filter((r) => r.uuid).map((r) => r.uuid!.toString()).sort();
    assert.deepEqual(uuids, ["R", "Wa"]);
});

// R = root checkpoint; Wb = the write turn's head (working tree gets a real backup: file@2 with a
// backupFileName); Hr = a `code` rewind back to R that only reads — its refresh snapshot re-versions
// the SAME on-disk content (file@3) with a NULL backupFileName.
function buildCodeRestoreNoPostEditRecords(): TranscriptRecord[] {
    return [
        rec(RecordType.user, "R", null),
        rec(RecordType.assistant, "Wb", "R"),                          // the write turn's tail
        lastPrompt("Wb"),                                              // head: the code (write) branch
        snapshotRec("Wb", { "file.py": 2 }, { "file.py": "backup-A@v2" }), // real content backup
        rec(RecordType.user, "Hr", "R"),                              // code rewind to root: a read-only turn
        lastPrompt("Hr"),                                              // final head, but it wrote nothing
        snapshotRec("Hr", { "file.py": 3 }),                          // refresh: version bumped, content unchanged (null bfn)
    ];
}

// The surviving branch is the one that produced the on-disk files (Wb), even though Hr is the final
// conversation head — a code restore with no post-edit re-versions the SAME content with a null
// backupFileName, so the version bump must NOT move the working-tree owner.
test("test_find_conversation_branches_survives_restored_code_not_final_refresh", () => {
    const branches = findConversationBranches(buildCodeRestoreNoPostEditRecords());
    const surviving = branches.find((b) => b.isSurviving)!;
    assert.equal(surviving.tip.toString(), "Wb");
    assert.ok(!branches.some((b) => b.isSurviving && b.tip.toString() === "Hr"));
});

// selectLiveBranch follows the same decision: it keeps Wb's chain (R, Wb), not Hr.
test("test_select_live_branch_follows_restored_code_after_code_rewind", () => {
    const kept = selectLiveBranch(buildCodeRestoreNoPostEditRecords());
    const uuids = kept.filter((r) => r.uuid).map((r) => r.uuid!.toString()).sort();
    assert.deepEqual(uuids, ["R", "Wb"]);
});
