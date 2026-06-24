import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S15_JSONL } from "./fixtures.ts";

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

// S15 is the structural (S13) case: the abandoned branch carries the user's out-of-band edit but its
// tip is named by NO last-prompt head, so branch enumeration must discover it structurally. The
// surviving Read branch keeps the final head; the rewound branch's tip is the abandoned-prompt subtree
// tip, forked at the rewind point.
test("test_S15_findConversationBranches_includes_the_structural_rewound_branch", () => {
    // Load the real S15 transcript and enumerate its branches.
    const branches = findConversationBranches(loadRecords(S15_JSONL));
    // The surviving branch's tip is the final Read-branch head 4eb82c06.
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "4eb82c06");
    // A structurally-discovered rewound branch has tip 56da61e5, forked at the rewind point a94b7090.
    const rewound = branches.find(
        (branch) => branch.tip.toString().slice(0, 8) === "56da61e5",
    )!;
    assert.ok(rewound !== undefined);
    assert.equal(rewound.isSurviving, false);
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "a94b7090");
});

// The rewound branch's only file change is the user edit to scenario15.py — exactly one rewound
// branch, and its histories cover scenario15.py only (the test file was never touched off-trunk).
test("test_S15_reconstructBranches_yields_one_rewound_branch_touching_only_scenario15", () => {
    // Reconstruct the branch-aware history.
    const branched = reconstructBranches(loadRecords(S15_JSONL));
    // Exactly one rewound branch.
    assert.equal(branched.rewound.length, 1);
    // Its histories cover only scenario15.py.
    const targets = branched.rewound[0]!.histories.map((history) => history.target.toString());
    assert.equal(targets.length, 1);
    assert.ok(targets[0]!.endsWith("scenario15.py"));
});

// Reconstructing the rewound branch replays the trunk `hello` Write then the user's out-of-band edit,
// so its scenario15.py final text carries the `# user edit` comment on top of the hello function.
test("test_S15_rewound_branch_content_is_user_edit", () => {
    // Reconstruct the branch-aware history and take the rewound branch's scenario15.py.
    const branched = reconstructBranches(loadRecords(S15_JSONL));
    const scenario = historyEndingWith(branched.rewound[0]!.histories, "scenario15.py");
    // Its final text holds both the user edit's comment and the original hello function.
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("# user edit"));
    assert.ok(finalText.includes("def hello():"));
});

// The surviving branch only Read; disk was NOT rolled back, but the surviving branch records no file
// event of its own, so its scenario15.py is the trunk `hello` (the user edit is on the abandoned
// branch and shows on the rewound branch / fileDAG, not here).
test("test_S15_surviving_content_is_hello_only", () => {
    // Reconstruct the surviving branch's files.
    const surviving = reconstructAll(loadRecords(S15_JSONL));
    const scenario = historyEndingWith(surviving, "scenario15.py");
    // The surviving content holds `hello` and does NOT hold the user edit's `# user edit` comment.
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def hello():"));
    assert.ok(!finalText.includes("# user edit"));
});
