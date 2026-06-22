import { test } from "node:test";
import assert from "node:assert/strict";
import { renderVerbose, renderDiff } from "../src/reconstruction_render.ts";
import type { FileRevision } from "../src/reconstruction_engine.ts";
import { Uuid } from "../src/structures/domain.ts";

// A minimal two-revision history (create 2 lines, then delete) to render against,
// built from literals so these stay pure unit tests with no transcript.
function createThenDelete(): FileRevision[] {
    const created = new Date("2026-01-01T00:00:00Z");
    const deleted = new Date("2026-01-01T00:01:00Z");
    const lines = ["def hello():", '    print("hello")'].map((line) => ({
        oldLineNum: -1,
        values: [{ line, timestamp: created }],
    }));
    return [
        { changeId: new Uuid("write-id"), timestamp: created, lines },
        { changeId: new Uuid("rm-id"), timestamp: deleted, lines: [] },
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
