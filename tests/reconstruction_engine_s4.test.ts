import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructFile, reconstructAll } from "../src/reconstruction_engine.ts";
import { extractFileEvents } from "../src/reconstruction_extract.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { Path } from "../src/structures/domain.ts";
import { loadRecords } from "./utilities.ts";
import { S4_JSONL } from "./fixtures.ts";
import type { TranscriptRecord } from "../src/structures/envelope.ts";

// --- s4-overwrite-file: overwrite (a second Write to a present file) ----------

// helper: the absolute path of the file the transcript overwrites.
function s4OverwritePath(records: TranscriptRecord[]): Path {
    return extractFileEvents(records)
        .filter((event) => event.kind === EventKind.write)
        .find((event) => event.target.toString().endsWith("/s4_overwrite.py"))!.target;
}

test("test_overwrite_file_history_is_create_then_overwrite", () => {
    // Reconstruct s4_overwrite.py by its path.
    const records = loadRecords(S4_JSONL);
    const revisions = reconstructFile(records, s4OverwritePath(records));
    // Two entries: the version1 create, then the version2 overwrite.
    assert.equal(revisions.length, 2);
    assert.equal(revisions[0]!.kind, EventKind.write);
    assert.equal(revisions[0]!.lines[0]!.values[0]!.line, "def version1():");
    assert.equal(revisions[1]!.kind, EventKind.overwrite);
    assert.equal(revisions[1]!.lines.length, 2);
    assert.equal(revisions[1]!.lines[0]!.values[0]!.line, "def version2():");
    // Every overwrite line is genesis (a wholesale replacement, not a splice).
    assert.ok(revisions[1]!.lines.every((entry) => entry.oldLineNum === -1));
});

test("test_reconstruct_all_returns_two_independent_s4_histories", () => {
    // Reconstruct every file S4 touches.
    const histories = reconstructAll(loadRecords(S4_JSONL));
    // Exactly two files, neither collapsed into the other.
    assert.equal(histories.length, 2);
    // Each history is a create followed by an overwrite.
    for (const history of histories) {
        assert.equal(history.revisions.length, 2);
        assert.equal(history.revisions[0]!.kind, EventKind.write);
        assert.equal(history.revisions[1]!.kind, EventKind.overwrite);
    }
    // The two files are the source and its test, by final path.
    const names = histories.map((history) => history.target.toString());
    assert.ok(names.some((name) => name.endsWith("/s4_overwrite.py")));
    assert.ok(names.some((name) => name.endsWith("/tests/test_s4_overwrite.py")));
});
