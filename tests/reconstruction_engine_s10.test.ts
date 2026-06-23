import { test } from "node:test";
import assert from "node:assert/strict";
import {
    reconstructAll,
    reconstructBranches,
    type FileHistory,
} from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S10_JSONL } from "./fixtures.ts";

function scriptOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("scenario10.py"))!;
}
function testFileOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("tests/test_scenario10.py"))!;
}

// Scenario: the default reconstruction of S10 is the two files kept on disk by a conversation-only
// rewind, recovered from the Write events on the write-turn branch — even though the final
// conversation head is a later read-only branch that wrote nothing.
// Steps:
//   - Load the real S10 transcript and run the default (surviving-branch) reconstruction.
//   - scenario10.py has exactly one revision, of kind `write`, whose changeId is the real Write
//     tool_use id (proving it was recovered from the Write event, not synthesised).
//   - tests/test_scenario10.py likewise has the real Write tool_use id.
test("test_default_reconstruction_is_the_files_kept_by_a_conversation_only_rewind", () => {
    const surviving = reconstructAll(loadRecords(S10_JSONL));
    const script = scriptOf(surviving);
    assert.equal(script.revisions.length, 1);
    assert.equal(script.revisions[0]!.kind, EventKind.write);
    assert.equal(script.revisions[0]!.changeId.toString(), "toolu_01CmDQPdzdqgZhMLUQz3fe7t");
    assert.equal(
        testFileOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_0134iGZzirN3ZPRTyUUx6Eyb",
    );
});

// Scenario: a conversation-only rewind with no post-edit leaves no rewound branch — the read-only
// head touched no files, so it is a file-less tangent (dropped), and the write turn IS the surviving
// branch.
// Steps:
//   - Load the real S10 transcript and enumerate its branches.
//   - The surviving tip is the write-turn head bfd9d428 (NOT the final read head 67d05ad4).
//   - The surviving reconstruction still contains scenario10.py with its real Write changeId.
//   - There are zero rewound branches (the read tangent changed no file).
test("test_conversation_only_rewind_with_no_post_edit_has_no_rewound_branches", () => {
    const { survivingTip, surviving, rewound } = reconstructBranches(loadRecords(S10_JSONL));
    assert.equal(survivingTip!.toString(), "bfd9d428-86da-4480-b30a-abf27f2c4ff1");
    assert.equal(
        scriptOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_01CmDQPdzdqgZhMLUQz3fe7t",
    );
    assert.equal(rewound.length, 0);
});
