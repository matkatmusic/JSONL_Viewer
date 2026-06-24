import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S14_JSONL } from "./fixtures.ts";

// S14 is the conversation-only-rewind twin of S13: identical write→edit→rewind→read shape, but the
// rewind is conv-only so disk keeps the abandoned `farewell` Edit. The correct reconstruction is
// byte-identical to S13's, so these tests mirror reconstruction_engine_s13.test.ts line-for-line.

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The final text of a history (the last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}

// The history whose target path ends with `suffix`.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// The abandoned branch edited a file, but a conv-only rewind left that edit on disk, misrouting
// findSurvivingHead; once fixed, branch enumeration must name the Read branch surviving AND discover
// the rewound edit branch structurally. (Enumeration also yields a degenerate head-based branch for
// the abandoned prompt fadbe55d — itself a last-prompt head — which carries no diverging file change
// and is filtered out by reconstructBranches; see the rewound.length === 1 test below. So this test
// asserts the two MEANINGFUL branches are present rather than a raw count.)
test("test_S14_findConversationBranches_includes_the_structural_rewound_branch", () => {
    // Load the real S14 transcript and enumerate its branches.
    const branches = findConversationBranches(loadRecords(S14_JSONL));
    // The surviving branch's tip is the Read branch's head de63b23a (proves Bug 1 fixed: the override
    // no longer redirects to the abandoned prompt).
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "de63b23a");
    // The structurally-discovered rewound branch's tip is the abandoned "Thanks!" assistant 68f74356,
    // forked at acc07a57 (proves Bug 2 fixed: the dedup guard no longer skips the real tip).
    const rewound = branches.find(
        (branch) => branch.tip.toString().slice(0, 8) === "68f74356",
    )!;
    assert.ok(rewound !== undefined);
    assert.equal(rewound.isSurviving, false);
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "acc07a57");
});

// The rewound branch's only file change is the `farewell` Edit to scenario14.py — exactly one rewound
// branch, and its histories cover scenario14.py only (the test file was never touched off-trunk).
test("test_S14_reconstructBranches_yields_one_rewound_branch_touching_only_scenario14", () => {
    // Reconstruct the branch-aware history (no backup reader: the Edit replays over the trunk Write).
    const branched = reconstructBranches(loadRecords(S14_JSONL));
    // Exactly one rewound branch.
    assert.equal(branched.rewound.length, 1);
    // Its histories cover only scenario14.py.
    const targets = branched.rewound[0]!.histories.map((history) => history.target.toString());
    assert.equal(targets.length, 1);
    assert.ok(targets[0]!.endsWith("scenario14.py"));
});

// Reconstructing the rewound branch replays the trunk `greet` Write then the abandoned `farewell`
// Edit, so its scenario14.py final text carries BOTH functions.
test("test_S14_rewound_branch_content_is_greet_plus_farewell", () => {
    // Reconstruct the branch-aware history and take the rewound branch's scenario14.py.
    const branched = reconstructBranches(loadRecords(S14_JSONL));
    const scenario = historyEndingWith(branched.rewound[0]!.histories, "scenario14.py");
    // Its final text holds both the trunk `greet` and the abandoned-edit `farewell`.
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def greet(name):"));
    assert.ok(finalText.includes("def farewell(name):"));
});

// The surviving branch only Read; it carries no file events of its own, so its scenario14.py is the
// trunk 2-line greet — and even though disk physically kept `farewell`, the surviving branch's
// reconstruction must NOT contain it.
test("test_S14_surviving_content_is_greet_only", () => {
    // Reconstruct the surviving branch's files.
    const surviving = reconstructAll(loadRecords(S14_JSONL));
    const scenario = historyEndingWith(surviving, "scenario14.py");
    // The surviving content holds `greet` and does NOT hold `farewell`.
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def greet(name):"));
    assert.ok(!finalText.includes("farewell"));
});
