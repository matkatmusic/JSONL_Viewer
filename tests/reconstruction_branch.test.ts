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
