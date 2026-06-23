import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S7_JSONL } from "./fixtures.ts";

// Default reconstruction follows the surviving branch only: each file is one v2 create, not a
// v1 create + v2 overwrite (the rewound v1 writes are not on the surviving branch).
test("test_default_reconstruction_follows_surviving_branch_only", () => {
    const histories = reconstructAll(loadRecords(S7_JSONL));
    const script = histories.find((h) => h.target.toString().endsWith("scenario7.py"))!;
    assert.equal(script.revisions.length, 1);
    assert.equal(script.revisions[0]!.kind, EventKind.write);
    assert.equal(script.revisions[0]!.changeId.toString(), "toolu_01JWycFrizHxePBLhz35UrhG");
    const lines = script.revisions[0]!.lines.map((e) => e.values[e.values.length - 1]!.line);
    assert.ok(lines.some((l) => l.includes("def fahrenheit_to_celsius")));
});

// A rewound branch is retained as its own set of histories, forked at the rewind point, holding the
// v1 (celsius-only) writes — not merged into the surviving branch.
test("test_reconstruct_branches_retains_rewound_v1_branch", () => {
    const { surviving, rewound } = reconstructBranches(loadRecords(S7_JSONL));
    // Surviving is unchanged: two v2 single-create histories.
    assert.equal(surviving.find((h) => h.target.toString().endsWith("scenario7.py"))!.revisions.length, 1);
    // Exactly one rewound branch (the #72 tangent carries no file change and is excluded).
    assert.equal(rewound.length, 1);
    assert.equal(rewound[0]!.rewindPoint.toString(), "2e47efbe-fc3a-4ac7-80d2-178e27c61cda");
    // Its scenario7.py is the v1 create: one revision, 2 lines, celsius-only.
    const v1 = rewound[0]!.histories.find((h) => h.target.toString().endsWith("scenario7.py"))!;
    assert.equal(v1.revisions.length, 1);
    assert.equal(v1.revisions[0]!.kind, EventKind.write);
    assert.equal(v1.revisions[0]!.changeId.toString(), "toolu_012jN7F9LdRn7f8dawUAqdUR");
    const lines = v1.revisions[0]!.lines.map((e) => e.values[e.values.length - 1]!.line);
    assert.ok(lines.some((l) => l.includes("celsius_to_fahrenheit")));
    assert.ok(!lines.some((l) => l.includes("fahrenheit_to_celsius")));
    // The rewound test file is retained too.
    assert.ok(rewound[0]!.histories.some((h) => h.target.toString().endsWith("tests/test_scenario7.py")));
});
