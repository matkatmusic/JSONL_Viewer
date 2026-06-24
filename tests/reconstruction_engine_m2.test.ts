import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { M2_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The history whose final path ends with `suffix` (and, when excludeTest, is not the test file).
function historyEndingWith(histories: FileHistory[], suffix: string, excludeTest: boolean): FileHistory {
    return histories.find((history) => {
        const path = history.target.toString();
        const matches = path.endsWith(suffix);
        return excludeTest ? matches && !path.includes("test_") : matches;
    })!;
}

const OLD_AT_RENAME =
    "def process():\n    return \"processing\"\n\n\ndef validate():\n    return \"valid\"";
const MERGED_FINAL =
    "def process():\n    return \"processing\"\n\n\ndef validate():\n    return \"valid\"\n\n\ndef finalize():\n    return \"done\"";
const TEST_FINAL =
    "from m2_old_name import process\n\n\ndef test_process_returns_processing():\n    assert process() == \"processing\"";

// m2's renamed file is ONE history that spans write -> edit -> rename -> edit (four
// revisions). The pre-rename write+edit and the post-rename edit are merged into the
// single m2_new_name.py lineage, ending at the 10-line process+validate+finalize file.
test("test_m2_renamed_file_history_is_write_edit_rename_edit_four_revisions", () => {
    const histories = reconstructAll(loadRecords(M2_JSONL));
    const renamed = historyEndingWith(histories, "m2_new_name.py", false);
    assert.equal(renamed.revisions.length, 4);
    assert.deepEqual(
        renamed.revisions.map((r) => r.kind),
        [EventKind.write, EventKind.edit, EventKind.rename, EventKind.edit],
    );
    assert.equal(finalTextOf(renamed.revisions[renamed.revisions.length - 1]!), MERGED_FINAL);
});

// THE CRUX (property 1 — history continuity across the rename): the PRE-rename edit
// (validate, revision 1) is carried into the new file's lineage, the rename (revision
// 2) is a first-class revision linking old -> new, and the post-rename edit composes
// finalize on top of the carried process+validate content.
test("test_m2_pre_rename_edit_is_carried_across_rename_and_post_edit_composes_on_it", () => {
    const histories = reconstructAll(loadRecords(M2_JSONL));
    const renamed = historyEndingWith(histories, "m2_new_name.py", false);
    // revision 1 is the pre-rename edit (validate) — its content is what the rename carries forward
    assert.equal(renamed.revisions[1]!.kind, EventKind.edit);
    assert.equal(finalTextOf(renamed.revisions[1]!), OLD_AT_RENAME);
    // revision 2 is the rename itself, linking the old path to the new path
    assert.equal(renamed.revisions[2]!.kind, EventKind.rename);
    assert.ok(renamed.revisions[2]!.rename!.from.toString().endsWith("/m2_old_name.py"));
    assert.ok(renamed.revisions[2]!.rename!.to.toString().endsWith("/m2_new_name.py"));
    // the final (revision 3) adds finalize on top of the carried process+validate
    assert.equal(finalTextOf(renamed.revisions[3]!), MERGED_FINAL);
    assert.ok(finalTextOf(renamed.revisions[3]!).includes("def validate():"));
});

// Property 2 (old path collapses): the rename source is never its own surviving
// history. reconstructAll returns exactly TWO histories (renamed file + test file),
// and none is keyed by the old path m2_old_name.py.
test("test_m2_old_path_collapses_into_new_and_two_total_histories", () => {
    const histories = reconstructAll(loadRecords(M2_JSONL));
    assert.equal(histories.length, 2);
    assert.ok(histories.every((h) => !h.target.toString().endsWith("/m2_old_name.py")));
    const renamed = historyEndingWith(histories, "m2_new_name.py", false);
    assert.ok(finalTextOf(renamed.revisions[renamed.revisions.length - 1]!).includes("def finalize():"));
});

// The test file is a single write, NOT renamed (it keeps its m2_old_name.py-derived
// name) and untouched by the rename of the module under test.
test("test_m2_test_file_single_write_and_not_renamed", () => {
    const histories = reconstructAll(loadRecords(M2_JSONL));
    const testFile = historyEndingWith(histories, "test_m2_old_name.py", false);
    assert.equal(testFile.revisions.length, 1);
    assert.equal(testFile.revisions[0]!.kind, EventKind.write);
    assert.equal(finalTextOf(testFile.revisions[0]!), TEST_FINAL);
});
