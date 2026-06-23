import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll } from "../src/reconstruction_engine.ts";
import type { BackupReader } from "../src/reconstruction_sidecar.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { DOES_NOT_EXIST_YET } from "../src/structures/line-model.ts";
import { loadRecords } from "./utilities.ts";
import { S5_JSONL } from "./fixtures.ts";

// The real backup blobs, keyed by the backupFileName the snapshots name (an in-memory sidecar).
const S5_BACKUPS: Record<string, string> = {
    "acf7bffbb9d6cc7f@v2": "line one\n",
    "acf7bffbb9d6cc7f@v3": "line one\nline two\n",
    "acf7bffbb9d6cc7f@v4": "replaced content\n",
};
const s5Reader: BackupReader = (name) => S5_BACKUPS[name.toString()] ?? "";

// The S5 bash-redirect transcript reconstructs to one file: create -> append -> overwrite.
test("test_redirect_file_history_is_create_then_append_then_overwrite", () => {
    const histories = reconstructAll(loadRecords(S5_JSONL), s5Reader);
    // One file, three entries.
    assert.equal(histories.length, 1);
    const revisions = histories[0]!.revisions;
    assert.equal(revisions.length, 3);
    // create: one genesis line.
    assert.equal(revisions[0]!.kind, EventKind.write);
    assert.equal(revisions[0]!.lines[0]!.values[0]!.line, "line one");
    // append: line one carried (oldLineNum 0), line two genesis.
    assert.equal(revisions[1]!.kind, EventKind.append);
    assert.equal(revisions[1]!.lines[0]!.oldLineNum, 0);
    assert.equal(revisions[1]!.lines[1]!.values[0]!.line, "line two");
    // overwrite: one genesis line, wholesale replace.
    assert.equal(revisions[2]!.kind, EventKind.overwrite);
    assert.ok(revisions[2]!.lines.every((entry) => entry.oldLineNum === DOES_NOT_EXIST_YET));
    assert.equal(revisions[2]!.lines[0]!.values[0]!.line, "replaced content");
});
