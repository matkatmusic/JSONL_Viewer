import { test } from "node:test";
import assert from "node:assert/strict";
import {
    reconstructAll,
    reconstructBranches,
    type FileHistory,
} from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S11_JSONL } from "./fixtures.ts";

function scriptOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("scenario11.py"))!;
}
function testFileOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("tests/test_scenario11.py"))!;
}

// The surviving working tree is the post-restore REWRITE (multiply), recovered from the Write events on
// the rewrite branch — even though an earlier, abandoned turn wrote the same two filenames with `add`.
// Steps:
//   - Load the real S11 transcript and run the default (surviving-branch) reconstruction.
//   - scenario11.py has exactly one revision, of kind `write`, whose changeId is the multiply Write
//     tool_use id (proving the surviving file is the rewrite, not the abandoned add).
//   - tests/test_scenario11.py likewise has the multiply Write tool_use id, and its body contains
//     `multiply`, NOT `add` (the content disambiguator).
test("test_default_reconstruction_is_the_post_restore_rewrite", () => {
    const surviving = reconstructAll(loadRecords(S11_JSONL));
    const script = scriptOf(surviving);
    assert.equal(script.revisions.length, 1);
    assert.equal(script.revisions[0]!.kind, EventKind.write);
    assert.equal(script.revisions[0]!.changeId.toString(), "toolu_01U5g9RL95QevSrcB3QhXy75");
    assert.equal(
        testFileOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_01B97eyhHopDmhrabCRkEDqC",
    );
    // The multiply rewrite is the disambiguator: the surviving test imports/asserts multiply, not add.
    const lines = testFileOf(surviving).revisions[0]!.lines.map(
        (e) => e.values[e.values.length - 1]!.line,
    );
    assert.ok(lines.some((l) => l.includes("multiply")));
    assert.ok(!lines.some((l) => l.includes("add")));
});

// The abandoned pre-restore `add` turn is preserved as ONE rewound branch (it wrote files, so unlike
// S9/S10's read tangents it is NOT dropped); it forks at the root checkpoint.
// Steps:
//   - Load the real S11 transcript and enumerate its branches.
//   - The surviving tip is the multiply write-turn head d03f0078 (NOT the add head a7ceb7ae).
//   - The surviving reconstruction's scenario11.py carries the multiply Write changeId.
//   - There is exactly one rewound branch; it forks at the root checkpoint 742f44f2, is tipped at the
//     add head a7ceb7ae, and its scenario11.py is the add create (#01CMuVT4) — distinct from the
//     surviving multiply create.
test("test_reconstruct_branches_retains_the_code_rewound_add_branch", () => {
    const { survivingTip, surviving, rewound } = reconstructBranches(loadRecords(S11_JSONL));
    assert.equal(survivingTip!.toString(), "d03f0078-0b07-412e-bd37-f180a317c4c1");
    assert.equal(
        scriptOf(surviving).revisions[0]!.changeId.toString(),
        "toolu_01U5g9RL95QevSrcB3QhXy75",
    );
    assert.equal(rewound.length, 1);
    assert.equal(rewound[0]!.rewindPoint.toString(), "742f44f2-0be4-42bf-b729-73f9ed3879c6");
    assert.equal(rewound[0]!.tip.toString(), "a7ceb7ae-629d-4c91-97d8-9e5aae89a7d9");
    assert.equal(
        scriptOf(rewound[0]!.histories).revisions[0]!.changeId.toString(),
        "toolu_01CMuVT4wAkHq5BeAQZn8ozC",
    );
});
