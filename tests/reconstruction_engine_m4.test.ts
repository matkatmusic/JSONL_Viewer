import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { DOES_NOT_EXIST_YET } from "../src/structures/line-model.ts";
import { loadRecords } from "./utilities.ts";
import { M4_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The single history whose target path ends with `suffix`. m4 touches TWO files
// (source m4_lifecycle.py and tests/test_m4_lifecycle.py); a leading-slash suffix
// disambiguates them ("/m4_lifecycle.py" does not match "/test_m4_lifecycle.py").
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// m4's source file lives a full lifecycle: written (v1), edited (v1_helper appended),
// DELETED via `rm`, then RE-CREATED at the same path (v2). That is FOUR revisions in
// order [write, edit, delete, write], ending at the 2-line v2 ground truth.
test("test_m4_source_history_is_write_edit_delete_write_four_revisions", () => {
    const source = historyEndingWith(reconstructAll(loadRecords(M4_JSONL)), "/m4_lifecycle.py");
    assert.equal(source.revisions.length, 4);
    assert.deepEqual(
        source.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.delete, EventKind.write],
    );
    assert.equal(finalTextOf(source.revisions[3]!), "def v2():\n    return 2");
});

// Property 1 (non-terminal delete): the `rm` is NOT the last event on the path (the file is
// recreated afterwards), yet it still produces an EMPTY revision — revision 2 carries zero
// lines and kind delete. (S1's delete is terminal; m4's is mid-lifecycle.)
test("test_m4_delete_revision_between_edit_and_recreate_is_empty", () => {
    const source = historyEndingWith(reconstructAll(loadRecords(M4_JSONL)), "/m4_lifecycle.py");
    assert.equal(source.revisions[2]!.kind, EventKind.delete);
    assert.equal(source.revisions[2]!.lines.length, 0);
    assert.equal(finalTextOf(source.revisions[2]!), "");
});

// THE CRUX (property 2 — recreate born fresh): the Write after the delete is a FRESH create,
// not an overwrite. Its revision kind is `write` (NOT `overwrite`) and EVERY line is genesis
// (oldLineNum === DOES_NOT_EXIST_YET) — it carries NONE of the pre-delete lineage (no v1, no
// v1_helper), only v2. This proves fileIsPresent treated the trailing delete as absent.
test("test_m4_recreate_after_delete_is_born_fresh_write_not_overwrite", () => {
    const source = historyEndingWith(reconstructAll(loadRecords(M4_JSONL)), "/m4_lifecycle.py");
    const recreate = source.revisions[3]!;
    assert.equal(recreate.kind, EventKind.write); // a create — NOT EventKind.overwrite
    for (const entry of recreate.lines) {
        assert.equal(entry.oldLineNum, DOES_NOT_EXIST_YET); // every line born fresh, no back-pointer
    }
    assert.equal(finalTextOf(recreate), "def v2():\n    return 2"); // only v2, no carried lineage
});

// Property 3 (two-file accounting + Edit-pair on the surviving sibling): reconstructAll
// returns exactly TWO histories. The test file is written (v1 test) then edited (to v2) — the
// single Edit becomes the engine's standard removal+addition pair, so three revisions
// [write, edit, edit], with both edit halves sharing the ONE Edit's changeId, ending at v2.
test("test_m4_test_file_edit_is_paired_removal_then_addition", () => {
    const histories = reconstructAll(loadRecords(M4_JSONL));
    assert.equal(histories.length, 2);
    const testFile = historyEndingWith(histories, "/test_m4_lifecycle.py");
    assert.equal(testFile.revisions.length, 3);
    assert.deepEqual(
        testFile.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.edit],
    );
    assert.equal(
        testFile.revisions[1]!.changeId.toString(),
        testFile.revisions[2]!.changeId.toString(),
    );
    assert.equal(
        finalTextOf(testFile.revisions[2]!),
        "from m4_lifecycle import v2\n\n\ndef test_v2_returns_2():\n    assert v2() == 2",
    );
});
