import { test } from "node:test";
import assert from "node:assert/strict";
import {
    renderVerbose,
    renderDiff,
    renderDiffWithContext,
} from "../src/reconstruction_render.ts";
import type { FileRevision, LineEntry } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { DOES_NOT_EXIST_YET } from "../src/structures/line-model.ts";
import { Path, Uuid } from "../src/structures/domain.ts";
import { beforeDiffHunkHeader } from "../src/regex_expressions.ts";

// A minimal two-revision history (create 2 lines, then delete) to render against,
// built from literals so these stay pure unit tests with no transcript.
function createThenDelete(): FileRevision[] {
    const created = new Date("2026-01-01T00:00:00Z");
    const deleted = new Date("2026-01-01T00:01:00Z");
    const lines = ["def hello():", '    print("hello")'].map((line) => ({
        oldLineNum: DOES_NOT_EXIST_YET,
        values: [{ line, timestamp: created }],
    }));
    return [
        { kind: EventKind.write, changeId: new Uuid("write-id"), timestamp: created, lines },
        { kind: EventKind.delete, changeId: new Uuid("rm-id"), timestamp: deleted, lines: [] },
    ];
}

// --verbose lists each line of the create revision and shows the delete as empty.
test("test_verbose_lists_lines_then_shows_zero", () => {
    const out = renderVerbose(createThenDelete());
    assert.ok(out.includes("def hello():"));
    assert.ok(out.includes('    print("hello")'));
    assert.ok(out.includes("0 lines"));
    assert.ok(out.includes("file absent"));
});

// --verbose numbers lines from 1.
test("test_verbose_numbers_lines_from_one", () => {
    const out = renderVerbose(createThenDelete());
    assert.ok(out.includes("1 | def hello():"));
    assert.ok(out.includes('2 |     print("hello")'));
});

// --diff shows the create as additions and the delete as removals.
test("test_diff_shows_additions_then_removals", () => {
    const out = renderDiff(createThenDelete());
    assert.ok(out.includes("+ def hello():"));
    assert.ok(out.includes("- def hello():"));
    assert.ok(out.includes("created"));
    assert.ok(out.includes("deleted"));
});

// A create of one line, then a `>>` append carrying that line and adding a tail.
function createThenAppendRevs(): FileRevision[] {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    return [
        { kind: EventKind.write, changeId: new Uuid("w1"), timestamp: t0, lines: [born("line one", t0)] },
        { kind: EventKind.append, changeId: new Uuid("a1"), timestamp: t1, lines: [carried(0, "line one", t0), born("line two", t1)] },
    ];
}

// The diff block headed `@@ appended …`, isolated from the full multi-block diff.
function appendedBlockOf(diff: string): string {
    const blocks = diff.split(beforeDiffHunkHeader);
    return blocks.find((block) => block.startsWith("@@ appended"))!;
}

// --diff heads an append "appended" and shows only the new tail line (prefix unchanged).
test("test_diff_shows_append_as_added_tail_only", () => {
    const block = appendedBlockOf(renderDiff(createThenAppendRevs()));
    assert.ok(block.includes("appended"));
    assert.ok(block.includes("+ line two"));
    // Within the append block the carried prefix is not re-emitted as an add or a remove.
    assert.ok(!block.includes("+ line one"));
    assert.ok(!block.includes("- line one"));
});

// --- s2-move-file: rename entry + oldLineNum-driven edit diffs ----------------

const FROM = new Path("/abs/s2_original.py");
const TO = new Path("/abs/s2_moved.py");

// A line carried forward unchanged from index i of the previous revision.
function carried(i: number, line: string, when: Date): LineEntry {
    return { oldLineNum: i, values: [{ line, timestamp: when }] };
}

// A line born here (no predecessor).
function born(line: string, when: Date): LineEntry {
    return { oldLineNum: DOES_NOT_EXIST_YET, values: [{ line, timestamp: when }] };
}

// A create -> rename -> edit(add goodbye) history for the moved file, from
// literals so these stay pure unit tests.
function createRenameEdit(): FileRevision[] {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    const t2 = new Date("2026-01-01T00:02:00Z");
    const create: FileRevision = {
        kind: EventKind.write,
        changeId: new Uuid("w"),
        timestamp: t0,
        lines: [born("def hello():", t0), born('    print("hello")', t0)],
    };
    const rename: FileRevision = {
        kind: EventKind.rename,
        changeId: new Uuid("m"),
        timestamp: t1,
        lines: [carried(0, "def hello():", t0), carried(1, '    print("hello")', t0)],
        rename: { from: FROM, to: TO },
    };
    const edit: FileRevision = {
        kind: EventKind.edit,
        changeId: new Uuid("e"),
        timestamp: t2,
        lines: [
            carried(0, "def hello():", t0),
            carried(1, '    print("hello")', t0),
            born("", t2),
            born("", t2),
            born("def goodbye():", t2),
            born('    print("goodbye")', t2),
        ],
    };
    return [create, rename, edit];
}

// --diff shows the rename as its own block naming both paths, with no churn.
test("test_diff_shows_rename_entry_as_first_class_block", () => {
    const [create, rename] = createRenameEdit();
    const out = renderDiff([create!, rename!]);
    assert.ok(out.includes("renamed"));
    assert.ok(out.includes(FROM.toString()));
    assert.ok(out.includes(TO.toString()));
    // The rename block churns no content lines.
    assert.ok(!out.includes("- def hello():"));
});

// --diff for an edit shows only the inserted lines, not a remove-all/add-all.
test("test_diff_shows_only_inserted_lines_for_an_edit", () => {
    const [, rename, edit] = createRenameEdit();
    const out = renderDiff([rename!, edit!]);
    assert.ok(out.includes("+ def goodbye():"));
    // The two unchanged context lines are not removed.
    assert.ok(!out.includes("- def hello():"));
    assert.ok(!out.includes('-     print("hello")'));
});

// --verbose labels the rename entry by kind and shows its from -> to.
test("test_verbose_labels_rename_entry", () => {
    const [create, rename] = createRenameEdit();
    const out = renderVerbose([create!, rename!]);
    assert.ok(out.includes("rename"));
    assert.ok(out.includes("→"));
});

// --- s3-copy-file: copy entry rendering --------------------------------------

// A copy genesis revision for s3_copy.py (two lines, copy provenance).
const copyRevisionFixture: FileRevision = {
    kind: EventKind.copy,
    changeId: new Uuid("toolu_01JD5DoUCPtnnQrnJpSDmHwf"),
    timestamp: new Date("2026-06-18T16:16:27.224Z"),
    lines: [
        { oldLineNum: DOES_NOT_EXIST_YET, values: [{ line: "def hello():", timestamp: new Date("2026-06-18T16:16:27.224Z") }] },
        { oldLineNum: DOES_NOT_EXIST_YET, values: [{ line: '    print("hello")', timestamp: new Date("2026-06-18T16:16:27.224Z") }] },
    ],
    copy: { from: new Path("/x/s3_source.py"), to: new Path("/x/s3_copy.py") },
};

// The list view's copy-entry test lives in reconstruction_render_list.test.ts.

// The diff view shows a copy as its own block with its lines as additions.
test("test_diff_shows_copy_as_its_own_block_with_added_lines", () => {
    // Render the diff for a lone copy revision.
    const output = renderDiff([copyRevisionFixture]);
    // It is a copied block naming both paths.
    assert.ok(output.includes("copied"));
    assert.ok(output.includes("s3_source.py"));
    assert.ok(output.includes("s3_copy.py"));
    // Its genesis lines appear as additions.
    assert.ok(output.includes("+ def hello():"));
});

// The verbose view labels the copy entry, shows the arrow, and lists its body.
test("test_verbose_labels_copy_entry_with_arrow_and_body", () => {
    // Render the verbose state for a lone copy revision.
    const output = renderVerbose([copyRevisionFixture]);
    // It is labelled copy, shows the arrow, and lists the body lines.
    assert.ok(output.includes("copy"));
    assert.ok(output.includes("→"));
    assert.ok(output.includes("def hello():"));
});

// --- s4-overwrite-file: overwrite entry rendering ----------------------------

// A create then overwrite, from literals (local to this file's diff/verbose tests).
function createThenOverwriteRevs(): FileRevision[] {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    const v1 = ["def version1():", "    return 1"].map((line) => born(line, t0));
    const v2 = ["def version2():", "    return 2"].map((line) => born(line, t1));
    return [
        { kind: EventKind.write, changeId: new Uuid("w1"), timestamp: t0, lines: v1 },
        { kind: EventKind.overwrite, changeId: new Uuid("w2"), timestamp: t1, lines: v2 },
    ];
}

// --diff heads an overwrite "overwritten" and shows a full replace (all out, all in).
test("test_diff_shows_overwrite_as_full_replace", () => {
    const out = renderDiff(createThenOverwriteRevs());
    assert.ok(out.includes("overwritten"));
    // Every old line is removed and every new line added (a wholesale rewrite).
    assert.ok(out.includes("- def version1():"));
    assert.ok(out.includes("+ def version2():"));
});

// --verbose shows the overwrite's full new line state (default full-state body).
test("test_verbose_shows_overwrite_full_state", () => {
    const out = renderVerbose(createThenOverwriteRevs());
    assert.ok(out.includes("def version2():"));
    assert.ok(out.includes("    return 2"));
});

// --- renderDiffWithContext: the webapp diff text (unified hunks + context) ----

// A 10-line create, then an edit replacing only line 5 — enough surrounding lines
// that the 3-line context window excludes the file's head and tail.
function createLongFileThenEditMiddle(): FileRevision[] {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    const originalLines = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`);
    const create: FileRevision = {
        kind: EventKind.write,
        changeId: new Uuid("w1"),
        timestamp: t0,
        lines: originalLines.map((line) => born(line, t0)),
    };
    const editedLines = [
        ...originalLines.slice(0, 4).map((line, index) => carried(index, line, t0)),
        born("line 5 REPLACED", t1),
        ...originalLines.slice(5).map((line, index) => carried(index + 5, line, t0)),
    ];
    const edit: FileRevision = { kind: EventKind.edit, changeId: new Uuid("e1"), timestamp: t1, lines: editedLines };
    return [create, edit];
}

test("test_context_diff_keeps_revision_kind_header_per_block", () => {
    // Scenario: each revision still opens with its human-oriented kind header (the client's
    // per-revision block delimiter), before any numeric hunks.
    const out = renderDiffWithContext(createLongFileThenEditMiddle());
    assert.ok(out.includes("@@ created @ 2026-01-01T00:00:00.000Z @@"));
    assert.ok(out.includes("@@ changed @ 2026-01-01T00:01:00.000Z @@"));
});

test("test_context_diff_surrounds_a_middle_change_with_three_context_lines", () => {
    // Scenario: a change in the middle of a 10-line file gets a standard unified hunk with
    // 3 unchanged lines above and below, 1-based line numbers in the header.
    const out = renderDiffWithContext(createLongFileThenEditMiddle());
    // the hunk spans old lines 2-8 (context 2,3,4 + change at 5 + context 6,7,8).
    assert.ok(out.includes("@@ -2,7 +2,7 @@"));
    // context lines carry a leading space.
    assert.ok(out.includes(" line 4"));
    assert.ok(out.includes(" line 6"));
    // the change itself: deletion before addition.
    assert.ok(out.indexOf("-line 5") < out.indexOf("+line 5 REPLACED"));
    // lines beyond the context window are absent from the changed block.
    const changedBlock = out.slice(out.indexOf("@@ changed"));
    // assert.ok(!changedBlock.includes("line 1\n"));  // item 51: git's hunk header now carries "line 1" as function context
    assert.ok(!changedBlock.includes("\n line 1\n"), "line 1 is not a context body line");
    assert.ok(!changedBlock.includes(" line 10"));
});

test("test_context_diff_renders_a_creation_as_one_all_addition_hunk", () => {
    // Scenario: a created file has no old side: hunk header -0,0 and every line a "+".
    const out = renderDiffWithContext(createThenAppendRevs());
    // assert.ok(out.includes("@@ -0,0 +1,1 @@"));  // item 51: git omits ",count" when a side's count is 1
    assert.ok(out.includes("@@ -0,0 +1 @@"));
    assert.ok(out.includes("+line one"));
});

test("test_context_diff_splits_far_apart_changes_into_separate_hunks", () => {
    // Scenario: two changes more than 2*3 lines apart in a 20-line file produce two numeric
    // hunks under one revision header.
    const t0 = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-01T00:01:00Z");
    const originalLines = Array.from({ length: 20 }, (_, index) => `row ${index + 1}`);
    const create: FileRevision = {
        kind: EventKind.write,
        changeId: new Uuid("w1"),
        timestamp: t0,
        lines: originalLines.map((line) => born(line, t0)),
    };
    // replace row 2 (old index 1) and row 19 (old index 18).
    const editedLines = originalLines.map((line, index) => carried(index, line, t0));
    editedLines[1] = born("row 2 REPLACED", t1);
    editedLines[18] = born("row 19 REPLACED", t1);
    const edit: FileRevision = { kind: EventKind.edit, changeId: new Uuid("e1"), timestamp: t1, lines: editedLines };
    const out = renderDiffWithContext([create, edit]);
    const changedBlock = out.slice(out.indexOf("@@ changed"));
    const hunkHeaderCount = changedBlock.split("\n").filter((line) => line.startsWith("@@ -")).length;
    assert.equal(hunkHeaderCount, 2);
    // the middle of the file (far from both changes) appears in neither hunk.
    assert.ok(!changedBlock.includes(" row 10"));
});

test("test_context_diff_renders_a_rename_as_header_only", () => {
    // Scenario: a rename churns no lines: its block is the rename header with no numeric hunk.
    const [create, rename] = createRenameEdit();
    const out = renderDiffWithContext([create!, rename!]);
    const renameBlock = out.slice(out.indexOf("@@ renamed"));
    assert.ok(!renameBlock.includes("@@ -"));
});

test("test_context_diff_renders_a_deletion_as_one_all_removal_hunk", () => {
    // Scenario: a deleted file has no new side: hunk header +0,0 and every line a "-".
    const out = renderDiffWithContext(createThenDelete());
    const deletedBlock = out.slice(out.indexOf("@@ deleted"));
    assert.ok(deletedBlock.includes("@@ -1,2 +0,0 @@"));
    assert.ok(deletedBlock.includes("-def hello():"));
});
