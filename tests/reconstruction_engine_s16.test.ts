import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructAll, reconstructBranches } from "../src/reconstruction_engine.ts";
import { findConversationBranches } from "../src/reconstruction_branch.ts";
import type { FileHistory, FileRevision } from "../src/reconstruction_engine.ts";
import { loadRecords } from "./utilities.ts";
import { S16_JSONL } from "./fixtures.ts";

// The believed final text of a revision (each line's latest value, newline-joined).
function finalTextOf(revision: FileRevision): string {
    return revision.lines.map((entry) => entry.values[entry.values.length - 1]!.line).join("\n");
}

// The final text of a history (its last revision's final text).
function historyFinalText(history: FileHistory): string {
    return finalTextOf(history.revisions[history.revisions.length - 1]!);
}

// The history whose target path ends with `suffix`.
function historyEndingWith(histories: FileHistory[], suffix: string): FileHistory {
    return histories.find((history) => history.target.toString().endsWith(suffix))!;
}

// The abandoned `farewell` edit is a rewound branch discovered STRUCTURALLY: its tip 24093c68 is named
// by no last-prompt head (the code rewind re-prompted from the fork), so branch enumeration must find it
// from the parentUuid fork at the system record 9ab7b6e0. The surviving branch keeps the final head.
// Steps:
//   - Load the real S16 transcript and enumerate its branches.
//   - The surviving branch's tip is the final head a4ec5565.
//   - A non-surviving branch has tip 24093c68, forked at the rewind point 9ab7b6e0.
test("test_S16_findConversationBranches_includes_the_structural_rewound_branch", () => {
    const branches = findConversationBranches(loadRecords(S16_JSONL));
    const surviving = branches.find((branch) => branch.isSurviving)!;
    assert.equal(surviving.tip.toString().slice(0, 8), "a4ec5565");
    const rewound = branches.find((branch) => branch.tip.toString().slice(0, 8) === "24093c68")!;
    assert.ok(rewound !== undefined);
    assert.equal(rewound.isSurviving, false);
    assert.equal(rewound.rewindPoint!.toString().slice(0, 8), "9ab7b6e0");
});

// Exactly one rewound branch, and it touches scenario16.py only (the test file was never edited
// off-trunk). Enumeration is clean — no degenerate head-based branch to filter (unlike S14).
// Steps:
//   - Reconstruct the branch-aware history.
//   - There is exactly one rewound branch.
//   - Its histories cover only scenario16.py.
test("test_S16_reconstructBranches_yields_one_rewound_branch_touching_only_scenario16", () => {
    const branched = reconstructBranches(loadRecords(S16_JSONL));
    assert.equal(branched.rewound.length, 1);
    const targets = branched.rewound[0]!.histories.map((history) => history.target.toString());
    assert.equal(targets.length, 1);
    assert.ok(targets[0]!.endsWith("scenario16.py"));
});

// Reconstructing the rewound branch replays the trunk greet Write then the abandoned `farewell` Edit, so
// its scenario16.py final text holds farewell and NOT shout.
// Steps:
//   - Reconstruct the branch-aware history and take the rewound branch's scenario16.py.
//   - Its final text contains `def farewell(name):` and not `def shout(name):`.
test("test_S16_rewound_branch_content_is_the_abandoned_farewell_edit", () => {
    const branched = reconstructBranches(loadRecords(S16_JSONL));
    const scenario = historyEndingWith(branched.rewound[0]!.histories, "scenario16.py");
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def farewell(name):"));
    assert.ok(!finalText.includes("def shout(name):"));
});

// The surviving working tree is greet + shout: the shout re-edit replays against the restored greet-only
// base (NOT greet+farewell), so scenario16.py has two revisions (the greet Write, then the shout Edit)
// and its final text holds shout and NOT farewell.
// Steps:
//   - Run the default (surviving-branch) reconstruction and take scenario16.py.
//   - It has exactly two revisions.
//   - Its final text contains `def shout(name):` and not `def farewell(name):`.
test("test_S16_surviving_branch_content_is_the_shout_re_edit", () => {
    const surviving = reconstructAll(loadRecords(S16_JSONL));
    const scenario = historyEndingWith(surviving, "scenario16.py");
    assert.equal(scenario.revisions.length, 2);
    const finalText = historyFinalText(scenario);
    assert.ok(finalText.includes("def shout(name):"));
    assert.ok(!finalText.includes("def farewell(name):"));
});
