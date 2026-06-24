import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S13_JSONL } from "./fixtures.ts";

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

// The abandoned branch edited a file but its tip is named by NO last-prompt head; branch enumeration
// must still discover it structurally, so findConversationBranches returns BOTH branches.
test("test_S13_findConversationBranches_includes_the_structural_rewound_branch", () => {
    // Load the real S13 transcript and enumerate its branches.
    const branches = findConversationBranches(loadRecords(S13_JSONL));
    // Two branches: the surviving Read branch and the structurally-discovered rewound edit branch.
    assert.equal(branches.length, 2);
    // The surviving branch's tip is the surviving head 9641c49c.
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "9641c49c");
    // The rewound branch's tip is the abandoned "Thanks!" assistant 45cf4bf8, forked at 8faab841.
    const rewound = branches.find((branch) => !branch.isSurviving)!;
    assert.equal(rewound.tip.toString().slice(0, 8), "45cf4bf8");
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "8faab841");
});

// The rewound branch's only file change is the `farewell` Edit to scenario13.py — exactly one rewound
// branch, and its histories cover scenario13.py only (the test file was never touched off-trunk).
test("test_S13_reconstructBranches_yields_one_rewound_branch_touching_only_scenario13", () => {
    // Reconstruct the branch-aware history (no backup reader: the Edit replays over the trunk Write).
    const branched = reconstructBranches(loadRecords(S13_JSONL));
    // Exactly one rewound branch.
    assert.equal(branched.rewound.length, 1);
    // Its histories cover only scenario13.py.
    const targets = branched.rewound[0]!.histories.map((history) => history.target.toString());
    assert.equal(targets.length, 1);
    assert.ok(targets[0]!.endsWith("scenario13.py"));
});

// Reconstructing the rewound branch replays the trunk `greet` Write then the abandoned `farewell`
// Edit, so its scenario13.py final text carries BOTH functions.
test("test_S13_rewound_branch_content_is_greet_plus_farewell", () => {
    // Reconstruct the branch-aware history and take the rewound branch's scenario13.py.
    const branched = reconstructBranches(loadRecords(S13_JSONL));
    const scenario = historyEndingWith(branched.rewound[0]!.histories, "scenario13.py");
    // Its final text holds both the trunk `greet` and the abandoned-edit `farewell`.
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def greet(name):"));
    assert.ok(finalText.includes("def farewell(name):"));
});

// The surviving branch only Read; disk was restored to the `greet`-only content, so the surviving
// scenario13.py is the 2-line greet function and must NOT contain the abandoned `farewell` Edit.
test("test_S13_surviving_content_is_greet_only_unchanged", () => {
    // Reconstruct the surviving branch's files.
    const surviving = reconstructAll(loadRecords(S13_JSONL));
    const scenario = historyEndingWith(surviving, "scenario13.py");
    // The surviving content holds `greet` and does NOT hold `farewell`.
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def greet(name):"));
    assert.ok(!finalText.includes("farewell"));
});
