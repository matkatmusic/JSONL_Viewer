import { test } from "node:test";
import assert from "node:assert/strict";
import {
    reconstructAll,
    reconstructBranches,
    type FileHistory,
} from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S9_JSONL } from "./fixtures.ts";

function scriptOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("scenario9.py"))!;
}
function testFileOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("tests/test_scenario9.py"))!;
}

// The surviving working tree is the restored code (the only write version), recovered from the Write
// events on f1b8dede's branch — even though the final conversation head is a later read-only branch
// that wrote nothing. The code restore re-versioned the same content with a null backupFileName, so
// those refresh snapshots must not be treated as a working-tree change.
test("test_default_reconstruction_is_the_restored_code_after_code_rewind", () => {
    const surviving = reconstructAll(loadRecords(S9_JSONL));
    const script = scriptOf(surviving);
    assert.equal(script.revisions.length, 1);
    assert.equal(script.revisions[0]!.kind, EventKind.write);
    assert.equal(script.revisions[0]!.changeId.toString(), "toolu_01PZ3yAwBcZT3utNNCFEEMLn");
    assert.equal(
        testFileOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_012EzSkdGv9PA1K2NBwrwDot",
    );
});

// A code restore with no post-edit leaves no rewound branch: the read-only head touched no files, so
// it is a file-less tangent (dropped), and the restored write turn IS the surviving branch.
test("test_code_restore_with_no_post_edit_has_no_rewound_branches", () => {
    const { survivingTip, surviving, rewound } = reconstructBranches(loadRecords(S9_JSONL));
    assert.equal(survivingTip!.toString(), "f1b8dede-2b85-4f15-9e92-37005a262e6f");
    assert.equal(
        scriptOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_01PZ3yAwBcZT3utNNCFEEMLn",
    );
    assert.equal(rewound.length, 0);
});
