import { test } from "node:test";
import assert from "node:assert/strict";
import {
    extractFileEvents,
    reconstructFile,
    reconstructAll,
    findDeletedTarget,
    splitLines,
    type FileRevision,
} from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { Uuid } from "../src/structures/domain.ts";
import { loadRecords } from "./utilities.ts";
import { S1_JSONL } from "./fixtures.ts";

// Reconstruct a transcript's deleted file end-to-end (the s1 shape): detect the
// rm target, then reconstruct that file generically.
function reconstructDeleted(file: string): FileRevision[] {
    const records = loadRecords(file);
    return reconstructFile(records, findDeletedTarget(records)!);
}

// Spec 1 — extraction finds the file events, time-ordered, with one delete.
test("test_extract_finds_writes_and_one_time_ordered_delete", () => {
    const events = extractFileEvents(loadRecords(S1_JSONL));
    const deletes = events.filter((event) => event.kind === EventKind.delete);
    // s1 deletes exactly one file, named s1_delete.py.
    assert.equal(deletes.length, 1);
    assert.ok(deletes[0]!.target.toString().endsWith("s1_delete.py"));
    // events come out in timestamp order.
    for (let i = 1; i < events.length; i++) {
        const prev = events[i - 1]!.timestamp.getTime();
        assert.ok(events[i]!.timestamp.getTime() >= prev);
    }
});

// Spec 2 + 3 — target auto-detection yields exactly two revisions for that file
// (the sibling tests/test_s1_delete.py write is excluded).
test("test_finds_deleted_target_and_reconstructs_two_revisions", () => {
    const records = loadRecords(S1_JSONL);
    // the target is auto-detected as the rm'd file.
    const target = findDeletedTarget(records);
    assert.ok(target?.toString().endsWith("s1_delete.py"));
    const revisions = reconstructFile(records, target!);
    assert.equal(revisions.length, 2);
    // the create revision carries s1_delete.py's 2 lines, not the test's 7.
    assert.equal(revisions[0]!.lines.length, 2);
});

// reconstructAll accounts for EVERY touched file, not just the deleted one:
// s1_delete.py (create + delete) and tests/test_s1_delete.py (create only).
test("test_reconstruct_all_accounts_for_every_touched_file", () => {
    const histories = reconstructAll(loadRecords(S1_JSONL));
    assert.equal(histories.length, 2);
    const source = histories.find((h) => h.target.toString().endsWith("/s1_delete.py"));
    const testFile = histories.find((h) => h.target.toString().includes("test_s1_delete.py"));
    // the source file is created then deleted; the test file is only created.
    assert.equal(source?.revisions.length, 2);
    assert.equal(testFile?.revisions.length, 1);
    assert.equal(testFile?.revisions[0]!.lines[0]!.values[0]!.line, "from s1_delete import hello");
});

// Spec 4 — the create revision's genesis lines, content, and timestamp.
test("test_create_revision_has_genesis_lines", () => {
    const events = extractFileEvents(loadRecords(S1_JSONL));
    const write = events.find((event) => event.kind === EventKind.write)!;
    const create = reconstructDeleted(S1_JSONL)[0]!;
    assert.equal(create.lines[0]!.values[0]!.line, "def hello():");
    assert.equal(create.lines[1]!.values[0]!.line, '    print("hello")');
    assert.equal(create.timestamp.getTime(), write.timestamp.getTime());
    for (const entry of create.lines) {
        assert.equal(entry.oldLineNum, -1);
        assert.equal(entry.values.length, 1);
    }
});

// Spec 5 — the delete revision is empty, stamped at the rm time.
test("test_delete_revision_is_empty_at_rm_time", () => {
    const events = extractFileEvents(loadRecords(S1_JSONL));
    const rm = events.find((event) => event.kind === EventKind.delete)!;
    const del = reconstructDeleted(S1_JSONL)[1]!;
    assert.equal(del.lines.length, 0);
    assert.equal(del.timestamp.getTime(), rm.timestamp.getTime());
});

// Spec 6 — both revisions carry a Uuid changeId, distinct across operations.
test("test_revisions_carry_distinct_change_ids", () => {
    const [create, del] = reconstructDeleted(S1_JSONL);
    assert.ok(create!.changeId instanceof Uuid);
    assert.ok(del!.changeId instanceof Uuid);
    assert.ok(!create!.changeId.equals(del!.changeId));
});

// Spec 7 — a trailing newline does not add a phantom empty line.
test("test_trailing_newline_does_not_add_phantom_line", () => {
    assert.deepEqual(splitLines("a\nb\n"), ["a", "b"]);
    assert.deepEqual(splitLines("a\nb"), ["a", "b"]);
    assert.deepEqual(splitLines(""), []);
});

// Rendering specs live in reconstruction_render.test.ts; CLI specs in
// reconstruction_cli.test.ts.
