import { test } from "node:test";
import assert from "node:assert/strict";
import {
    reconstructAll,
    reconstructBranches,
    type FileHistory,
} from "../src/reconstruction_engine.ts";
import { EventKind } from "../src/structures/vocabulary.ts";
import { loadRecords } from "./utilities.ts";
import { S8_JSONL } from "./fixtures.ts";

function scriptOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("scenario8.py"))!;
}
function testFileOf(histories: FileHistory[]): FileHistory {
    return histories.find((h) => h.target.toString().endsWith("tests/test_scenario8.py"))!;
}

// The surviving working tree is v_c (the last code written), because step 11 was a conversation-only
// rewind that left v_c's files on disk — even though the final conversation head wrote nothing.
test("test_default_reconstruction_is_the_last_written_code_after_conversation_rewind", () => {
    const surviving = reconstructAll(loadRecords(S8_JSONL));
    const script = scriptOf(surviving);
    assert.equal(script.revisions.length, 1);
    assert.equal(script.revisions[0]!.kind, EventKind.write);
    assert.equal(script.revisions[0]!.changeId.toString(), "toolu_01WWP6tDqo6z9fBrcPm9PR9H");
    // v_c's test is the disambiguator: test_celsius_to_fahrenheit_zero, not test_freezing_point.
    const lines = testFileOf(surviving).revisions[0]!.lines.map(
        (e) => e.values[e.values.length - 1]!.line,
    );
    assert.ok(lines.some((l) => l.includes("test_celsius_to_fahrenheit_zero")));
    assert.ok(!lines.some((l) => l.includes("test_freezing_point")));
});

// The two code-rewound versions (v_a, v_b) are preserved as rewound branches; the file-less step-12
// Hello head is NOT a branch (no diverging file change).
test("test_reconstruct_branches_retains_two_code_rewound_branches", () => {
    const { survivingTip, surviving, rewound } = reconstructBranches(loadRecords(S8_JSONL));
    assert.equal(survivingTip!.toString(), "2988ac8f-78f8-49eb-a992-5f4b705eac04");
    assert.equal(scriptOf(surviving).revisions[0]!.changeId.toString(), "toolu_01WWP6tDqo6z9fBrcPm9PR9H");
    assert.equal(rewound.length, 2);
    // Every rewound branch forked at the root checkpoint.
    assert.ok(rewound.every((b) => b.rewindPoint.toString() === "04c69f8b-47ae-4821-964c-bf30bcefd911"));
    const tips = rewound.map((b) => b.tip.toString()).sort();
    assert.deepEqual(tips, [
        "546718c1-d296-4574-9fae-be9f2bcbd30d", // v_a
        "84d669da-d5f2-4513-bc1b-953da432e5ff", // v_b
    ]);
    // v_a's scenario8.py is its own create (#014hpZNH), distinct from the surviving v_c (#01WWP6tD).
    const va = rewound.find((b) => b.tip.toString().startsWith("546718c1"))!;
    assert.equal(scriptOf(va.histories).revisions[0]!.changeId.toString(), "toolu_014hpZNHr2bFtwmSCznHkcyg");
});
