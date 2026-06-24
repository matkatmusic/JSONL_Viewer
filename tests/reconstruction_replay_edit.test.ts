import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdit } from "../src/reconstruction_replay_edit.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { DOES_NOT_EXIST_YET } from "../src/structures/line-model.ts";
import { Path, Uuid } from "../src/structures/domain.ts";
import type { EditEvent, FileRevision } from "../src/reconstruction_engine.ts";
import type { StructuredPatchHunk } from "../src/structures/tool-results.ts";

// An Edit whose hunk carries a single context line (' ') and a single addition ('+'). Replaying it
// against an EMPTY base is the conversation-only-rewind-then-edit case (S12): the creating Write lives
// on an abandoned branch, so the surviving branch's first event for the file is this Edit.
function buildContextThenAddEdit(): EditEvent {
    const hunk: StructuredPatchHunk = {
        oldStart: 1, oldLines: 1, newStart: 1, newLines: 2,
        lines: [" def add(a, b):", "+def multiply(a, b):"],
    };
    return {
        kind: EventKind.edit, changeId: new Uuid("toolu_edit"),
        target: new Path("/work/dir/scenario12.py"), hunks: [hunk],
        timestamp: new Date("2026-01-01T16:10:31Z"),
    };
}

// Scenario: applyEdit must not crash when the base is empty — a context line that has no working line
// to carry is materialised as a genesis line (born here) rather than indexing past the empty base.
// Steps:
//   - Build an Edit whose hunk has one context line then one added line.
//   - Apply it against an empty revisions array (no prior Write on this branch).
//   - It must not throw (the pre-fix engine threw reading `undefined.values`).
//   - One addition revision is emitted holding both the context line and the added line, each genesis.
test("test_apply_edit_on_empty_base_materialises_context_lines_as_genesis", () => {
    const revisions: FileRevision[] = [];
    // Replaying against the empty base must not throw.
    assert.doesNotThrow(() => applyEdit(buildContextThenAddEdit(), revisions));
    // Exactly one revision results (the addition; there was no removal).
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0]!.kind, EventKind.edit);
    // Both the carried-context line and the added line are present, materialised as genesis (-1).
    assert.equal(revisions[0]!.lines.length, 2);
    assert.equal(revisions[0]!.lines[0]!.values[0]!.line, "def add(a, b):");
    assert.equal(revisions[0]!.lines[0]!.oldLineNum, DOES_NOT_EXIST_YET);
    assert.equal(revisions[0]!.lines[1]!.values[0]!.line, "def multiply(a, b):");
    assert.equal(revisions[0]!.lines[1]!.oldLineNum, DOES_NOT_EXIST_YET);
});
