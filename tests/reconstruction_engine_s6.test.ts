import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S6_JSONL } from "./fixtures.ts";

// The real s6 transcript reconstructs to the renamed file's create->rename->edit lineage plus
// the test file's own create — not a crash (the git mv links s6_git.py into s6_git_renamed.py).
test("test_git_mv_links_rename_lineage_and_applies_later_edit", () => {
    // Reconstruct every history from the real s6 transcript (no BackupReader — s6 has no redirect).
    const histories = reconstructAll(loadRecords(S6_JSONL));
    // The renamed file is one history with three revisions.
    const renamed = histories.find((history) => history.target.toString().endsWith("s6_git_renamed.py"))!;
    const revisions = renamed.revisions;
    assert.equal(revisions.length, 3);
    // Revision 0 is the create, two genesis lines.
    assert.equal(revisions[0]!.kind, EventKind.write);
    assert.equal(revisions[0]!.lines[0]!.values[0]!.line, "def hello():");
    // Revision 1 is the rename, both lines carried (oldLineNum 0 and 1).
    assert.equal(revisions[1]!.kind, EventKind.rename);
    assert.equal(revisions[1]!.lines[0]!.oldLineNum, 0);
    assert.equal(revisions[1]!.lines[1]!.oldLineNum, 1);
    // Revision 2 is the edit: goodbye() appended as genesis lines after the two carried lines.
    assert.equal(revisions[2]!.kind, EventKind.edit);
    assert.equal(revisions[2]!.lines.length, 6);
    assert.equal(revisions[2]!.lines[4]!.values[0]!.line, "def goodbye():");
    // The test file is its own untouched history.
    assert.ok(histories.some((history) => history.target.toString().endsWith("tests/test_s6_git.py")));
});
